import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { isAdminBootstrapWindowOpen } from '../lib/admin-bootstrap.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import {
  emailHash,
  emailOtpHash,
  encryptPrivateText,
  generateOtp,
  ipHash,
  newOpaqueToken,
  safeEqualHex,
  tokenHash,
} from '../lib/security.ts';
import { getEmailProvider, normalizeEmailAddress } from '../providers/email.ts';

const purpose = 'login_email';

function integerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  return raw ? Number(raw) : fallback;
}

function requestIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return first?.trim() || req.socket.remoteAddress || 'unknown';
}

function normalizeEmailInput(value: unknown): string {
  const raw = requireString(value, 'email', 3, 254);
  try { return normalizeEmailAddress(raw); }
  catch { throw new HttpError(400, 'invalid_email'); }
}

async function maybeBootstrapFirstAdminByEmail(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  userId: string,
  verifiedEmail: string,
): Promise<void> {
  if (!isAdminBootstrapWindowOpen()) return;
  const configuredRaw = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  if (!configuredRaw) return;

  let configuredEmail: string;
  try { configuredEmail = normalizeEmailAddress(configuredRaw); }
  catch { return; }
  if (configuredEmail !== verifiedEmail) return;

  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:bootstrap_admin', 0))");
  const alreadyBootstrapped = await client.query(`
    SELECT 1 FROM app.audit_logs
    WHERE action='admin_bootstrap_completed'
    LIMIT 1
  `);
  if (alreadyBootstrapped.rowCount) return;

  const anyAdmin = await client.query('SELECT 1 FROM app.admin_users LIMIT 1');
  if (anyAdmin.rowCount) return;

  await client.query(`
    INSERT INTO app.admin_users(user_id, admin_role, is_active)
    VALUES ($1,'owner',true)
    ON CONFLICT (user_id) DO NOTHING
  `, [userId]);
  await client.query(`
    INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1,'admin_bootstrap_completed','admin_user',$1,
            jsonb_build_object('method','verified_email_otp'))
  `, [userId]);
}

export async function requestEmailOtp(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson<{ email?: unknown }>(req);
  const email = normalizeEmailInput(body.email);

  let emailProvider: ReturnType<typeof getEmailProvider>;
  try { emailProvider = getEmailProvider(); }
  catch { throw new HttpError(503, 'email_delivery_unavailable'); }

  const ttlSeconds = integerEnv('OTP_TTL_SECONDS', 300);
  const identityLimit = integerEnv('OTP_EMAIL_LIMIT_PER_15M', 5);
  const ipLimit = integerEnv('OTP_IP_LIMIT_PER_15M', 20);
  const globalLimit = integerEnv('OTP_GLOBAL_LIMIT_PER_15M', 1000);
  const eHash = emailHash(email);
  const rIpHash = ipHash(requestIp(req));
  const code = generateOtp();
  const codeHash = emailOtpHash(email, purpose, code);

  const challengeId = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:email_otp_request_rate_limit', 0))");
    const counts = await client.query<{ identity_count: string; ip_count: string; global_count: string }>(`
      SELECT
        count(*) FILTER (WHERE email_hash=$1 AND purpose=$2)::text AS identity_count,
        count(*) FILTER (WHERE request_ip_hash=$3)::text AS ip_count,
        count(*)::text AS global_count
      FROM private_data.email_otp_challenges
      WHERE created_at > now() - interval '15 minutes'
    `, [eHash, purpose, rIpHash]);
    const row = counts.rows[0];
    if (Number(row?.identity_count ?? 0) >= identityLimit) throw new HttpError(429, 'otp_request_rate_limited');
    if (Number(row?.ip_count ?? 0) >= ipLimit) throw new HttpError(429, 'otp_request_rate_limited');
    if (Number(row?.global_count ?? 0) >= globalLimit) throw new HttpError(429, 'otp_request_rate_limited');

    await client.query(`
      UPDATE private_data.email_otp_challenges
      SET consumed_at=now()
      WHERE email_hash=$1 AND purpose=$2 AND consumed_at IS NULL
    `, [eHash, purpose]);
    const inserted = await client.query<{ id: string }>(`
      INSERT INTO private_data.email_otp_challenges(
        email_hash, request_ip_hash, purpose, code_hash, expires_at
      )
      VALUES ($1,$2,$3,$4,now() + ($5::text || ' seconds')::interval)
      RETURNING id::text
    `, [eHash, rIpHash, purpose, codeHash, ttlSeconds]);
    return inserted.rows[0].id;
  });

  try {
    await emailProvider.sendLoginCode({ email, code, ttlSeconds });
  } catch {
    try {
      await query(`
        UPDATE private_data.email_otp_challenges
        SET consumed_at=now()
        WHERE id=$1 AND consumed_at IS NULL
      `, [challengeId]);
    } catch {
      console.error('otp_cleanup_after_email_failure_failed');
    }
    throw new HttpError(503, 'email_delivery_unavailable');
  }

  const devExpose = process.env.NODE_ENV === 'development' && process.env.DEV_EXPOSE_OTP === 'true';
  sendJson(res, 202, { ok: true, expiresInSeconds: ttlSeconds, ...(devExpose ? { devCode: code } : {}) });
}

type VerifyOutcome =
  | { kind: 'invalid' }
  | { kind: 'deletion_pending' }
  | { kind: 'ok'; userId: string };

export async function verifyEmailOtp(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson<{ email?: unknown; code?: unknown }>(req);
  const email = normalizeEmailInput(body.email);
  const code = requireString(body.code, 'code', 6, 6);
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'invalid_otp');

  const eHash = emailHash(email);
  const rawSessionToken = newOpaqueToken();
  const sessionHash = tokenHash(rawSessionToken);
  const ttlHours = integerEnv('SESSION_TTL_HOURS', 720);

  const outcome = await withTransaction<VerifyOutcome>(async (client) => {
    const challenge = await client.query<{ id: string; code_hash: string; attempt_count: number }>(`
      SELECT id::text, code_hash, attempt_count
      FROM private_data.email_otp_challenges
      WHERE email_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1
      FOR UPDATE
    `, [eHash, purpose]);
    const row = challenge.rows[0];
    if (!row || row.attempt_count >= 5) return { kind: 'invalid' };

    const expected = emailOtpHash(email, purpose, code);
    if (!safeEqualHex(expected, row.code_hash)) {
      await client.query(`
        UPDATE private_data.email_otp_challenges
        SET attempt_count=attempt_count+1
        WHERE id=$1
      `, [row.id]);
      return { kind: 'invalid' };
    }

    const consumed = await client.query(`
      UPDATE private_data.email_otp_challenges
      SET consumed_at=now()
      WHERE id=$1 AND consumed_at IS NULL
      RETURNING id
    `, [row.id]);
    if (!consumed.rowCount) return { kind: 'invalid' };

    const existing = await client.query<{ user_id: string }>(`
      SELECT user_id::text
      FROM private_data.user_emails
      WHERE email_hash=$1
    `, [eHash]);
    let userId = existing.rows[0]?.user_id;
    if (!userId) {
      const user = await client.query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text');
      userId = user.rows[0].id;
      await client.query(`
        INSERT INTO private_data.user_emails(
          user_id, email_ciphertext, email_hash, email_verified_at
        )
        VALUES ($1,$2,$3,now())
      `, [userId, encryptPrivateText(email, `user_emails:email:${userId}`), eHash]);
    } else {
      const activeUser = await client.query('SELECT 1 FROM app.users WHERE id=$1 AND status=\'active\'', [userId]);
      if (!activeUser.rowCount) return { kind: 'invalid' };
      await client.query(`
        UPDATE private_data.user_emails
        SET email_verified_at=COALESCE(email_verified_at, now()), updated_at=now()
        WHERE user_id=$1
      `, [userId]);

      const deletionPending = await client.query(`
        SELECT 1
        FROM app.audit_logs
        WHERE actor_user_id=$1
          AND action='account_deletion_requested'
          AND entity_type='user'
          AND entity_id=$1
          AND metadata->>'processingState'='pending'
        LIMIT 1
      `, [userId]);
      if (deletionPending.rowCount) return { kind: 'deletion_pending' };
    }

    await maybeBootstrapFirstAdminByEmail(client, userId, email);
    await client.query(`
      INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at)
      VALUES ($1,$2,now() + ($3::text || ' hours')::interval)
    `, [userId, sessionHash, ttlHours]);
    return { kind: 'ok', userId };
  });

  if (outcome.kind === 'deletion_pending') throw new HttpError(409, 'account_deletion_pending');
  if (outcome.kind !== 'ok') throw new HttpError(400, 'invalid_otp');
  sendJson(res, 200, {
    ok: true,
    userId: outcome.userId,
    token: rawSessionToken,
    expiresInHours: ttlHours,
    authMethod: 'email_otp',
  });
}
