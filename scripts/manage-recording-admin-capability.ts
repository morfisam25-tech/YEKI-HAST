// W81A — operator CLI for provisioning the `recording_admin` admin capability
// (see packages/db/migrations/0010_recording_core_foundation.sql and
// services/api/src/lib/recording-admin-capability.ts for the authorization
// rules this enforces: acting admin must be an active 'owner'-role admin,
// self-grant is refused unless --allow-self is passed, every grant/revoke is
// audited in app.audit_logs, and grant/revoke are idempotent).
//
// Deliberately a release-time script, not an HTTP route: this repo's
// admin_role has no fine-grained permission model to gate a public endpoint
// on safely (see services/api/src/lib/admin.ts), so this reuses the same
// operator/DATABASE_URL trust boundary every other scripts/*.mjs release tool
// already operates at (see scripts/verify-production-db.mjs) instead of
// widening the HTTP admin surface.
//
// Usage:
//   node --experimental-strip-types scripts/manage-recording-admin-capability.ts list
//   node --experimental-strip-types scripts/manage-recording-admin-capability.ts grant --target <admin_user_id> --acting-admin <owner_admin_user_id> [--allow-self]
//   node --experimental-strip-types scripts/manage-recording-admin-capability.ts revoke --target <admin_user_id> --acting-admin <owner_admin_user_id>
//
// Requires DATABASE_URL (same variable every other scripts/*.mjs tool reads).
// Never prints DATABASE_URL or any other secret; only ids/timestamps/status.

import {
  grantAdminCapability,
  listAdminCapabilityAssignments,
  revokeAdminCapability,
  RECORDING_ADMIN_CAPABILITY,
  AdminCapabilityError,
} from '../services/api/src/lib/recording-admin-capability.ts';
import { closePool } from '../packages/db/src/client.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuidArg(value: string | undefined, flag: string): string {
  if (!value || !UUID_RE.test(value)) {
    throw new Error(`${flag} must be a valid admin user UUID`);
  }
  return value;
}

function parseArgs(argv: string[]): { command: string; flags: Map<string, string | true> } {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      i += 1;
    } else {
      flags.set(name, true);
    }
  }
  return { command: command ?? '', flags };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (same variable as scripts/verify-production-db.mjs)');
  }

  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === 'list') {
    const assignments = await listAdminCapabilityAssignments(RECORDING_ADMIN_CAPABILITY);
    console.log(JSON.stringify({ capability: RECORDING_ADMIN_CAPABILITY, assignments }, null, 2));
    return;
  }

  if (command === 'grant') {
    const target = requireUuidArg(flags.get('target') as string | undefined, '--target');
    const actingAdmin = requireUuidArg(flags.get('acting-admin') as string | undefined, '--acting-admin');
    const allowSelfGrant = flags.get('allow-self') === true;
    const result = await grantAdminCapability({
      capability: RECORDING_ADMIN_CAPABILITY,
      targetAdminUserId: target,
      actingAdminUserId: actingAdmin,
      allowSelfGrant,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'revoke') {
    const target = requireUuidArg(flags.get('target') as string | undefined, '--target');
    const actingAdmin = requireUuidArg(flags.get('acting-admin') as string | undefined, '--acting-admin');
    const result = await revokeAdminCapability({
      capability: RECORDING_ADMIN_CAPABILITY,
      targetAdminUserId: target,
      actingAdminUserId: actingAdmin,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command "${command}". Expected one of: list, grant, revoke.`);
}

try {
  await main();
} catch (error) {
  const code = error instanceof AdminCapabilityError ? error.code : error instanceof Error ? error.message : 'unknown_error';
  console.error(`FAIL: ${code}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
