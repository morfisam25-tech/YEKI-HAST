import assert from 'node:assert/strict';
import test from 'node:test';

// W81A — real runtime regression for admin_capability provisioning
// (services/api/src/lib/recording-admin-capability.ts, driven in production by
// scripts/manage-recording-admin-capability.ts) against an isolated
// PostgreSQL schema. Same pattern/rationale as tests/recording-runtime-db.test.ts:
// runs only when RECORDING_RUNTIME_DB_URL points at a disposable, non-production
// database (see scripts/run-recording-runtime-db-test.sh).

const dbUrl = process.env.RECORDING_RUNTIME_DB_URL;
const skip = dbUrl
  ? false
  : 'set RECORDING_RUNTIME_DB_URL to a disposable non-production database (see scripts/run-recording-runtime-db-test.sh)';

test('W81A recording admin capability provisioning', { skip }, async (t) => {
  process.env.DATABASE_URL = dbUrl;

  const { query, closePool } = await import('../packages/db/src/client.ts');
  const {
    grantAdminCapability,
    revokeAdminCapability,
    listAdminCapabilityAssignments,
    AdminCapabilityError,
    RECORDING_ADMIN_CAPABILITY,
  } = await import('../services/api/src/lib/recording-admin-capability.ts');

  t.after(async () => { await closePool(); });

  async function seedAdmin(adminRole: string, isActive = true): Promise<string> {
    const userId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    await query('INSERT INTO app.admin_users(user_id, admin_role, is_active) VALUES ($1,$2,$3)', [userId, adminRole, isActive]);
    return userId;
  }

  await t.test('a non-owner admin cannot grant the capability, even to someone else', async () => {
    const actingSafetyAdmin = await seedAdmin('safety');
    const target = await seedAdmin('safety');
    await assert.rejects(
      () => grantAdminCapability({ capability: RECORDING_ADMIN_CAPABILITY, targetAdminUserId: target, actingAdminUserId: actingSafetyAdmin }),
      (error) => { assert.ok(error instanceof AdminCapabilityError); assert.equal(error.code, 'admin_capability_actor_must_be_owner'); return true; },
    );
  });

  await t.test('a deactivated owner cannot grant the capability', async () => {
    const deactivatedOwner = await seedAdmin('owner', false);
    const target = await seedAdmin('safety');
    await assert.rejects(
      () => grantAdminCapability({ capability: RECORDING_ADMIN_CAPABILITY, targetAdminUserId: target, actingAdminUserId: deactivatedOwner }),
      /admin_capability_actor_not_active_admin/,
    );
  });

  await t.test('an owner cannot self-grant unless explicitly allowed', async () => {
    const owner = await seedAdmin('owner');
    await assert.rejects(
      () => grantAdminCapability({ capability: RECORDING_ADMIN_CAPABILITY, targetAdminUserId: owner, actingAdminUserId: owner }),
      /admin_capability_self_grant_not_allowed/,
    );
    const result = await grantAdminCapability({
      capability: RECORDING_ADMIN_CAPABILITY, targetAdminUserId: owner, actingAdminUserId: owner, allowSelfGrant: true,
    });
    assert.equal(result.status, 'granted');
  });

  await t.test('owner grants recording_admin to a target admin; it is idempotent and audited; listing and revoke round-trip', async () => {
    const owner = await seedAdmin('owner');
    const target = await seedAdmin('safety');

    const first = await grantAdminCapability({ capability: RECORDING_ADMIN_CAPABILITY, targetAdminUserId: target, actingAdminUserId: owner });
    assert.equal(first.status, 'granted');

    const second = await grantAdminCapability({ capability: RECORDING_ADMIN_CAPABILITY, targetAdminUserId: target, actingAdminUserId: owner });
    assert.equal(second.status, 'already_granted', 'granting twice must not error or duplicate the row');

    const rows = await query('SELECT count(*)::int AS n FROM app.admin_capabilities WHERE user_id=$1 AND capability=$2', [target, RECORDING_ADMIN_CAPABILITY]);
    assert.equal(rows.rows[0].n, 1, 'idempotent grant must not create a duplicate row');

    const grantAudit = await query(
      "SELECT count(*)::int AS n FROM app.audit_logs WHERE action='admin_capability_grant' AND entity_id=$1", [target],
    );
    assert.ok(grantAudit.rows[0].n >= 2, 'both the real grant and the idempotent no-op attempt must be audited');

    const assignments = await listAdminCapabilityAssignments(RECORDING_ADMIN_CAPABILITY);
    assert.ok(assignments.some((a) => a.userId === target && a.grantedBy === owner));

    const firstRevoke = await revokeAdminCapability({ capability: RECORDING_ADMIN_CAPABILITY, targetAdminUserId: target, actingAdminUserId: owner });
    assert.equal(firstRevoke.status, 'revoked');
    const secondRevoke = await revokeAdminCapability({ capability: RECORDING_ADMIN_CAPABILITY, targetAdminUserId: target, actingAdminUserId: owner });
    assert.equal(secondRevoke.status, 'already_absent', 'revoking twice must not error');

    const revokeAudit = await query(
      "SELECT count(*)::int AS n FROM app.audit_logs WHERE action='admin_capability_revoke' AND entity_id=$1", [target],
    );
    assert.ok(revokeAudit.rows[0].n >= 2, 'both the real revoke and the idempotent no-op attempt must be audited');

    const afterAssignments = await listAdminCapabilityAssignments(RECORDING_ADMIN_CAPABILITY);
    assert.ok(!afterAssignments.some((a) => a.userId === target), 'revoked target must no longer be listed');
  });

  await t.test('granting to a nonexistent or non-admin user id fails closed', async () => {
    const owner = await seedAdmin('owner');
    const notAnAdmin = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    await assert.rejects(
      () => grantAdminCapability({ capability: RECORDING_ADMIN_CAPABILITY, targetAdminUserId: notAnAdmin, actingAdminUserId: owner }),
      /admin_capability_target_not_admin/,
    );
  });
});
