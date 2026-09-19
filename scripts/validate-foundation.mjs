import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../packages/db/migrations/0001_initial.sql', import.meta.url), 'utf8');
const internetVoiceSql = await readFile(new URL('../packages/db/migrations/0003_internet_voice_transport.sql', import.meta.url), 'utf8');
const config = await readFile(new URL('../packages/config/src/index.ts', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const server = await readFile(new URL('../services/api/src/server.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const authRoute = await readFile(new URL('../services/api/src/routes/auth.ts', import.meta.url), 'utf8');
const authLib = await readFile(new URL('../services/api/src/lib/auth.ts', import.meta.url), 'utf8');
const security = await readFile(new URL('../services/api/src/lib/security.ts', import.meta.url), 'utf8');
const listenerRoute = await readFile(new URL('../services/api/src/routes/listener.ts', import.meta.url), 'utf8');
const billing = await readFile(new URL('../packages/domain/src/billing.ts', import.meta.url), 'utf8');
const dbClient = await readFile(new URL('../packages/db/src/client.ts', import.meta.url), 'utf8');
const recordingSql = await readFile(new URL('../packages/db/migrations/0010_recording_core_foundation.sql', import.meta.url), 'utf8');
const recordingDomain = await readFile(new URL('../packages/domain/src/recording.ts', import.meta.url), 'utf8');
const recordingConfig = await readFile(new URL('../services/api/src/lib/recording-config.ts', import.meta.url), 'utf8');
const internetVoiceRoute = await readFile(new URL('../services/api/src/routes/internet-voice.ts', import.meta.url), 'utf8');
const internetVoiceLifecycle = await readFile(new URL('../services/api/src/services/internet-voice-lifecycle.ts', import.meta.url), 'utf8');
const callMediaSql = await readFile(new URL('../packages/db/migrations/0011_call_media_sessions.sql', import.meta.url), 'utf8');
const callMediaDomain = await readFile(new URL('../packages/domain/src/call-media.ts', import.meta.url), 'utf8');
const callMediaConfig = await readFile(new URL('../services/api/src/lib/call-media-config.ts', import.meta.url), 'utf8');
const callMediaSession = await readFile(new URL('../services/api/src/services/call-media-session.ts', import.meta.url), 'utf8');
const recordingRealtimeKit = await readFile(new URL('../services/api/src/providers/recording-realtimekit.ts', import.meta.url), 'utf8');
const internetVoiceMediaRoute = await readFile(new URL('../services/api/src/routes/internet-voice-media.ts', import.meta.url), 'utf8');
const migrateTs = await readFile(new URL('../packages/db/src/migrate.ts', import.meta.url), 'utf8');
const webCallerPage = await readFile(new URL('../apps/web/app/talk/page.tsx', import.meta.url), 'utf8');
const webListenerPage = await readFile(new URL('../apps/web/app/listener/work/page.tsx', import.meta.url), 'utf8');
const webRealtimeMedia = await readFile(new URL('../apps/web/app/realtime-media.ts', import.meta.url), 'utf8');
const webCallerProxy = await readFile(new URL('../apps/web/app/api/caller/[...path]/route.ts', import.meta.url), 'utf8');
const webListenerProxy = await readFile(new URL('../apps/web/app/api/listener/[...path]/route.ts', import.meta.url), 'utf8');
const webPackageJson = await readFile(new URL('../apps/web/package.json', import.meta.url), 'utf8');
const mobileEasJson = await readFile(new URL('../apps/mobile/eas.json', import.meta.url), 'utf8');
const mobileApiTs = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const verifyProductionDb = await readFile(new URL('../scripts/verify-production-db.mjs', import.meta.url), 'utf8');
const deployProductionApiYml = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');

const checks = [
  ['no IRR-hardcoded money column suffixes', !/_irr\b/.test(sql)],
  ['migration transaction owned by runner', !/^BEGIN;|^COMMIT;/m.test(sql)],
  ['pgcrypto extension not required', !/CREATE EXTENSION.*pgcrypto/i.test(sql)],
  ['waitlist product scoped', sql.includes('UNIQUE (user_id, product_id)')],
  ['presence market/product/service scoped', sql.includes('PRIMARY KEY (listener_user_id, product_id, service_id, market_id)')],
  ['presence updated_at trigger', sql.includes('CREATE TRIGGER listener_presence_set_updated_at')],
  ['final brand seed', sql.includes("VALUES ('yeki_hast', 'یکی هست', 'private_beta')")],
  ['human listening only seeded', sql.includes("VALUES ('human_listening', 'active')") && !sql.includes("VALUES ('language_conversation'")],
  ['initial migration retains its historical pricing seed', sql.includes('31000, 21000, 1')],
  ['active Iran pricing is 40,000/28,000/12,000 IRR with one-second billing',
    internetVoiceSql.includes('caller_rate_per_minute_minor=40000')
      && internetVoiceSql.includes('listener_rate_per_minute_minor=28000')
      && internetVoiceSql.includes('billing_increment_seconds=1')
      && config.includes('callerRatePerMinuteMinor: 40_000')
      && config.includes('listenerRatePerMinuteMinor: 28_000')
      && config.includes('platformGrossSpreadPerMinuteMinor: 12_000')],
  ['global markets table', sql.includes('CREATE TABLE app.markets')],
  ['service-specific listener profile', sql.includes('CREATE TABLE app.listener_service_profiles')],
  ['caller age assertion', sql.includes('CREATE TABLE app.caller_age_assertions')],
  ['auth session hashes', sql.includes('CREATE TABLE private_data.auth_sessions')],
  ['launch guarantee separated', sql.includes('CREATE TABLE app.listener_guarantee_programs')],
  ['subsidy payout source supported', sql.includes('guarantee_assignment_id uuid UNIQUE') && sql.includes("CHECK ((earning_id IS NULL) <> (guarantee_assignment_id IS NULL))")],
  ['wallet has reserved balance', sql.includes('reserved_minor bigint NOT NULL DEFAULT 0') && sql.includes('CHECK (reserved_minor <= balance_minor)')],
  ['call has authorization cap', sql.includes('authorized_minor bigint NOT NULL DEFAULT 0') && sql.includes('max_billable_seconds integer')],
  ['transactional tables carry market', ['app.call_sessions','app.reservations','app.listener_earnings','app.payment_attempts','app.payouts'].every((table) => {
    const start = sql.indexOf(`CREATE TABLE ${table}`); const end = sql.indexOf(');', start); return start >= 0 && sql.slice(start, end).includes('market_id uuid NOT NULL');
  })],
  ['wallet transaction currency is explicit', /CREATE TABLE app\.wallet_transactions[\s\S]*?currency_code char\(3\) NOT NULL/.test(sql)],
  ['composite wallet currency FK', sql.includes('FOREIGN KEY (wallet_id, currency_code) REFERENCES app.wallets(id, currency_code)')],
  ['call billing precondition checks', sql.includes('CHECK (billable_seconds = 0 OR billing_started_at IS NOT NULL)') && sql.includes('CHECK (billing_started_at IS NULL OR connected_at IS NOT NULL)')],
  ['call dial idempotency', sql.includes('UNIQUE (caller_user_id, client_request_id)')],
  ['provider leg dedupe', sql.includes('CREATE UNIQUE INDEX telephony_legs_provider_leg_uidx')],
  ['provider nonzero cost requires currency', sql.includes('CHECK (provider_cost_minor = 0 OR provider_currency_code IS NOT NULL)')],
  ['route handlers awaited', handler.includes("return await requestOtp(req, res)") && handler.includes("return await createListenerApplication(req, res)")],
  ['API errors do not expose message text', !handler.includes('message: error.message')],
  ['wrong OTP commits attempt increment path', authRoute.includes('SET attempt_count=attempt_count+1') && authRoute.includes("return { kind: 'invalid' }")],
  ['OTP request invalidates prior live challenge', authRoute.includes('SET consumed_at=now()') && authRoute.includes('request_ip_hash')],
  ['OTP has IP and global request limits', authRoute.includes('OTP_IP_LIMIT_PER_15M') && authRoute.includes('OTP_GLOBAL_LIMIT_PER_15M')],
  ['OTP request rate-limit section is concurrency serialized', authRoute.includes("pg_advisory_xact_lock(hashtextextended('yeki_hast:otp_request_rate_limit', 0))")],
  ['all stored money values use bigint', !/(?:balance|reserved|authorized|amount|charge|earning|spread|cost|rate)[a-z_]*_minor\s+(?:integer|int|smallint)\b/i.test(sql)],
  ['optional payout source FKs are safe under MATCH SIMPLE', /currency_code char\(3\) NOT NULL/.test(sql) && sql.includes("CHECK ((earning_id IS NULL) <> (guarantee_assignment_id IS NULL))") && !/FOREIGN KEY \(earning_id, currency_code\)[^;\n]*MATCH FULL/i.test(sql)],
  ['DEV OTP fails closed', authRoute.includes("process.env.NODE_ENV === 'development'")],
  ['auth rejects suspended users', authLib.includes("u.status='active'")],
  ['listener terminal applications locked', listenerRoute.includes("WHERE existing.status IN ('exploring','training','assessment')")],
  ['AES-GCM uses AAD', security.includes('cipher.setAAD') && security.includes('decipher.setAAD')],
  ['encryption payload carries key id', security.includes('ACTIVE_DATA_ENCRYPTION_KEY_ID') && security.includes('DATA_ENCRYPTION_KEYS')],
  ['billing consumes increment', billing.includes('billingIncrementSeconds') && billing.includes('roundBillableSeconds')],
  ['caller/listener rounding policy explicit', billing.includes("rounding === 'caller' ? Math.ceil(raw) : Math.floor(raw)")],
  ['payout binds listener+currency to payout', sql.includes('FOREIGN KEY (payout_id, listener_user_id, currency_code)') && sql.includes('REFERENCES app.payouts(id, listener_user_id, currency_code)')],
  ['payout earning source binds listener+currency', sql.includes('FOREIGN KEY (earning_id, listener_user_id, currency_code)') && sql.includes('REFERENCES app.listener_earnings(id, listener_user_id, currency_code)')],
  ['payout guarantee source binds listener+currency', sql.includes('FOREIGN KEY (guarantee_assignment_id, listener_user_id, currency_code)') && sql.includes('REFERENCES app.listener_guarantee_assignments(id, listener_user_id, currency_code)')],
  ['earning listener must match call listener', sql.includes('FOREIGN KEY (call_session_id, listener_user_id, currency_code)') && sql.includes('REFERENCES app.call_sessions(id, listener_user_id, currency_code)')],
  ['billable seconds cannot exceed authorization cap', sql.includes('CHECK (max_billable_seconds IS NULL OR billable_seconds <= max_billable_seconds)')],
  ['payout items immutable after processing starts', sql.includes('CREATE TRIGGER payout_items_guard_mutation') && sql.includes("target_status <> 'created'")],
  ['payout total validated before processing', sql.includes('CREATE TRIGGER payouts_validate_total_before_processing') && sql.includes('BEFORE INSERT OR UPDATE OF status, amount_minor ON app.payouts') && sql.includes('payout_amount_mismatch')],
  ['payout cannot revert to created after processing starts', sql.includes('CREATE TRIGGER payouts_guard_status_transition') && sql.includes("OLD.status <> 'created' AND NEW.status = 'created'") && sql.includes('payout_status_cannot_revert_to_created')],
  ['paid and cancelled payouts are terminal', sql.includes("OLD.status IN ('paid', 'cancelled')") && sql.includes('payout_status_terminal')],
  ['payout item guard preserves ON DELETE CASCADE', sql.includes("IF target_status IS NULL THEN") && sql.includes("IF TG_OP = 'DELETE' THEN") && sql.includes('RETURN OLD;')],
  ['remote DB forces verify-full TLS', dbClient.includes("url.searchParams.set('sslmode', 'verify-full')") && !dbClient.includes('rejectUnauthorized: false')],
  ['encryption key ids cannot contain delimiter', security.includes('keyIdPattern') && security.includes('/^[A-Za-z0-9_-]{1,64}$/')],
  ['config language mode disabled', config.includes('languageConversationEnabled: false')],
  ['README final name', readme.startsWith('# یکی هست')],

  // W58 recording core foundation
  ['recording state machine table is additive only (no ALTER of app.call_sessions or app.consents)',
    !/ALTER TABLE app\.call_sessions/.test(recordingSql) && !/ALTER TABLE app\.consents/.test(recordingSql)],
  ['recording consent is call-scoped, not just user-scoped', recordingSql.includes('CREATE TABLE IF NOT EXISTS app.call_recording_consents') && recordingSql.includes('UNIQUE (call_session_id, user_id)')],
  ['recording evidence metadata supports multiple segments per call', recordingSql.includes('CREATE TABLE IF NOT EXISTS private_data.call_recording_segments') && recordingSql.includes('recording_session_id uuid NOT NULL REFERENCES private_data.call_recording_sessions(id)')],
  ['legal hold requires a reason and a linked case', recordingSql.includes('CHECK (NOT legal_hold OR legal_hold_reason_code IS NOT NULL)') && recordingSql.includes('CHECK (NOT legal_hold OR (legal_hold_case_kind IS NOT NULL AND legal_hold_case_id IS NOT NULL))')],
  ['admin recording capability is a separate grant, not part of admin_role', recordingSql.includes('CREATE TABLE IF NOT EXISTS app.admin_capabilities')],
  ['every playback authorization is audited with an expiry', recordingSql.includes('CREATE TABLE IF NOT EXISTS app.recording_playback_grants') && recordingSql.includes('CHECK (expires_at > authorized_at)')],
  ['only a confirmed RECORDING state counts as billing-active, not merely "starting"',
    recordingDomain.includes("return state === 'recording';")],
  ['production recording policy requires an explicit true, not merely non-false', recordingConfig.includes('resolveRecordingRequirement') ],
  ['production cannot silently downgrade required recording to OFF', /if \(input\.recordingRequiredFlag !== true\)/.test(recordingDomain)],
  ['billing_started_at gate re-confirms recording state inside the media_connected transaction, not merely trusting the start call', internetVoiceRoute.includes('confirmRecordingActiveForBilling(client, rawCallId)')],
  ['settlement bills from billing_started_at, not merely connected_at, so unconfirmed recording cannot accrue charge', internetVoiceLifecycle.includes('WHEN billing_started_at IS NULL THEN 0')],

  // W60 RealtimeKit mobile media migration
  ['call_media_sessions is additive only (no ALTER of app.call_sessions)', !/ALTER TABLE app\.call_sessions/.test(callMediaSql)],
  ['call media session is one meeting per call, ever', callMediaSql.includes('call_session_id uuid PRIMARY KEY REFERENCES app.call_sessions(id)')],
  ['migrate.ts and the manifest actually register 0010 and 0011 (fixes a pre-existing W58 gap where 0010 was never wired into either)',
    migrateTs.includes("'0010_recording_core_foundation.sql'") && migrateTs.includes("'0011_call_media_sessions.sql'")],
  ['CALL_MEDIA_PROVIDER is fail-closed in Production: only an explicit realtimekit is accepted', /if \(normalized !== 'realtimekit'\)/.test(callMediaDomain)],
  ['CALL_MEDIA_PROVIDER has no implicit default outside Production either', callMediaDomain.includes("throw new Error('call_media_provider_not_configured')")],
  ['ensureCallReady() blocks legacy TURN validation once RealtimeKit is the active provider (Production is never blocked on unused legacy TURN infra)',
    handler.includes("mediaProvider === 'legacy_p2p'") && handler.includes('requireCloudflareRealtimeKitConfig()')],
  ['media-auth route derives participant role from the call row itself, never from client input', internetVoiceMediaRoute.includes('row.caller_user_id === userId') && internetVoiceMediaRoute.includes('row.listener_user_id === userId')],
  ['media-auth requires this participant\'s own recording consent when recording is required', internetVoiceMediaRoute.includes("row.recording_mode === 'all_with_consent'") && internetVoiceMediaRoute.includes('requireParticipantRecordingConsent(client, rawCallId, userId)')],
  ['RealtimeKit participant auth never returns the Cloudflare API token, only the short-lived participant token', !/apiToken/.test(internetVoiceMediaRoute) && recordingRealtimeKit.includes('return { participantId: data.id, token: data.token };')],
  ['recording start reuses the media session\'s meeting instead of creating a second Cloudflare meeting', callMediaSession.includes('providerImpl.prepareSession({ callSessionId })')],
  ['RealtimeKit path rejects legacy custom SDP offer/answer/ICE at the signaling endpoint (task section 10)', internetVoiceRoute.includes("throw new HttpError(409, 'legacy_signaling_disabled')")],
  ['media-provider readiness reuses the config module\'s exported guard rather than re-parsing Cloudflare env vars', callMediaConfig.includes("CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME")],

  // W63 Web RealtimeKit migration
  ['Web Caller and Listener join RealtimeKit via the official React SDK, never a hand-rolled client', webPackageJson.includes('"@cloudflare/realtimekit-react"') && webRealtimeMedia.includes("from '@cloudflare/realtimekit-react'")],
  ['Web voice pages read mediaProvider from the server, never choose a transport themselves', webCallerPage.includes("voice.mediaProvider === 'realtimekit'") && webListenerPage.includes("config.mediaProvider === 'realtimekit'")],
  ['Web RealtimeKit path never calls getUserMedia itself (the SDK acquires the microphone during join())',
    (() => {
      const callerRtkBlock = webCallerPage.slice(webCallerPage.indexOf('beginRealtimeKit = useCallback'), webCallerPage.indexOf('beginRealtimeKit = useCallback') + 800);
      const listenerRtkBlock = webListenerPage.slice(webListenerPage.indexOf('async function answerRealtimeKit'), webListenerPage.indexOf('async function answerRealtimeKit') + 800);
      return !callerRtkBlock.includes('getUserMedia') && !listenerRtkBlock.includes('getUserMedia');
    })()],
  ['Web media-ready never fires from a token, SDK init, or join() resolving alone -- only from useRealtimeVoiceCall\'s own connected state',
    webRealtimeMedia.includes("setState(remoteParticipantCount(meeting) > 0 ? 'connected' : 'waiting_for_other_participant')")
      && !webRealtimeMedia.includes("setState('connected')")],
  ['Web proxies allow-list voice/media-auth but no unrelated path', webCallerProxy.includes('media-auth') && webListenerProxy.includes('media-auth')],
  ['No Cloudflare RealtimeKit API secret is ever referenced from apps/web source', !/CLOUDFLARE_REALTIMEKIT_API_TOKEN/.test(webCallerPage) && !/CLOUDFLARE_REALTIMEKIT_API_TOKEN/.test(webListenerPage) && !/CLOUDFLARE_REALTIMEKIT_API_TOKEN/.test(webRealtimeMedia)],
  ['Web legacy P2P path is retained only behind the mediaProvider branch, never the implicit default', webCallerPage.includes("mediaProviderRef.current = 'legacy_p2p'") && webListenerPage.includes("mediaProviderRef.current = 'legacy_p2p'")],
  ['Web billing liveness (heartbeat) recognizes RealtimeKit connected state, not only a legacy RTCPeerConnection', webCallerPage.includes('realtimeCall.remoteParticipantPresent') && webListenerPage.includes('realtimeCall.remoteParticipantPresent')],
  ['Web cleanup releases the RealtimeKit meeting (and microphone) on every exit path', webCallerPage.includes('void realtimeCall.leave()') && webListenerPage.includes('void realtimeCall.leave()')],

  // W63 mobile Preview/Production API isolation fix (W61 P0-1 closure)
  ['mobile Preview build profile no longer embeds the Production API origin literal',
    (() => {
      const eas = JSON.parse(mobileEasJson);
      return eas.build.preview.env.EXPO_PUBLIC_API_BASE_URL === undefined
        && eas.build.production.env.EXPO_PUBLIC_API_BASE_URL === 'https://yeki-hast-unique-6ff0.vercel.app';
    })()],
  ['mobile API base URL resolution fails closed in preview_internal_beta and closed_test (missing or Production-pointing)',
    mobileApiTs.includes("env === 'preview_internal_beta' || env === 'closed_test'")
      && mobileApiTs.includes('EXPO_PUBLIC_API_BASE_URL is required in ${env}')
      && mobileApiTs.includes('EXPO_PUBLIC_API_BASE_URL must not point at the Production API origin in ${env}')],
  ['mobile Production API base URL behavior remains separately fail-closed',
    mobileApiTs.includes("env === 'production' && !rawBaseUrl")
      && mobileApiTs.includes('EXPO_PUBLIC_API_BASE_URL is required in production')
      && mobileApiTs.includes("env === 'production' && !isProductionApiOrigin(configuredApiBase)")
      && mobileApiTs.includes('Production builds must use the Production API origin')],
  ['mobile eas.json build profiles carry an explicit EXPO_PUBLIC_APP_ENV identity', mobileEasJson.includes('"EXPO_PUBLIC_APP_ENV": "preview_internal_beta"') && mobileEasJson.includes('"EXPO_PUBLIC_APP_ENV": "production"')],

  // W63 production release profile closure (W61 P0-2)
  ['deploy-production-api.yml requires an explicit release_profile choice, Internal Beta first', /release_profile:[\s\S]*?type: choice[\s\S]*?options:\n\s*- internal_beta\n\s*- public_release/.test(deployProductionApiYml)],
  ['deploy-production-api.yml wires the dispatch choice straight through and validates it before any deploy step runs', deployProductionApiYml.includes('PRODUCTION_RELEASE_PROFILE: ${{ github.event.inputs.release_profile }}') && deployProductionApiYml.includes('release_profile must be an explicit choice of internal_beta or public_release')],

  // W63 production DB verifier closure (W61 P0-3)
  ['production DB verifier checks W58 recording tables and W60 call_media_sessions, not only pre-W58 relations', ['app.call_recording_consents', 'private_data.call_recording_sessions', 'private_data.call_recording_segments', 'app.admin_capabilities', 'app.recording_playback_grants', 'app.call_media_sessions'].every((relation) => verifyProductionDb.includes(`'${relation}'`))],
  ['production DB verifier checks the recording_state enum and the media/recording updated_at triggers across both app and private_data schemas', verifyProductionDb.includes('app.recording_state') && verifyProductionDb.includes("nspname IN ('app', 'private_data')") && verifyProductionDb.includes('call_media_sessions_set_updated_at')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (failed) process.exitCode = 1;
