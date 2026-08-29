import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCallerClosedBetaConfigured,
  isCallerClosedBetaEnabled,
  isCommercialHostingApproved,
  requireCallerClosedBetaEnabled,
} from '../services/api/src/lib/caller-beta.ts';

const keys = ['NODE_ENV', 'CALLER_CLOSED_BETA_ENABLED', 'COMMERCIAL_HOSTING_APPROVED'] as const;

function withEnv(values: Partial<Record<(typeof keys)[number], string>>, fn: () => void) {
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('production Caller remains disabled when beta is configured but hosting is not approved', () => {
  withEnv({ NODE_ENV: 'production', CALLER_CLOSED_BETA_ENABLED: 'true', COMMERCIAL_HOSTING_APPROVED: 'false' }, () => {
    assert.equal(isCallerClosedBetaConfigured(), true);
    assert.equal(isCommercialHostingApproved(), false);
    assert.equal(isCallerClosedBetaEnabled(), false);
    assert.throws(() => requireCallerClosedBetaEnabled(), (error: unknown) => {
      return error instanceof Error && error.message === 'commercial_hosting_not_approved';
    });
  });
});

test('production Caller becomes eligible only when both explicit switches are true', () => {
  withEnv({ NODE_ENV: 'production', CALLER_CLOSED_BETA_ENABLED: 'true', COMMERCIAL_HOSTING_APPROVED: 'true' }, () => {
    assert.equal(isCallerClosedBetaConfigured(), true);
    assert.equal(isCommercialHostingApproved(), true);
    assert.equal(isCallerClosedBetaEnabled(), true);
    assert.doesNotThrow(() => requireCallerClosedBetaEnabled());
  });
});

test('development beta does not require a commercial hosting approval', () => {
  withEnv({ NODE_ENV: 'development', CALLER_CLOSED_BETA_ENABLED: 'true', COMMERCIAL_HOSTING_APPROVED: 'false' }, () => {
    assert.equal(isCallerClosedBetaEnabled(), true);
    assert.doesNotThrow(() => requireCallerClosedBetaEnabled());
  });
});
