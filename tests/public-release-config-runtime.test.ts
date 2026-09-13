import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicReleaseConfig } from '../services/api/src/lib/public-release.ts';

const keys = [
  'PRIVACY_POLICY_URL',
  'TERMS_OF_SERVICE_URL',
  'ACCOUNT_DELETION_URL',
  'CHILD_SAFETY_URL',
  'SUPPORT_EMAIL',
] as const;

function withEnvironment(values: Partial<Record<(typeof keys)[number], string>>, fn: () => void) {
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

test('public release config becomes ready only with complete public HTTPS surfaces and support email', () => {
  withEnvironment({
    PRIVACY_POLICY_URL: 'https://example.test/privacy',
    TERMS_OF_SERVICE_URL: 'https://example.test/terms',
    ACCOUNT_DELETION_URL: 'https://example.test/account/delete',
    CHILD_SAFETY_URL: 'https://example.test/safety/children',
    SUPPORT_EMAIL: 'support@example.test',
  }, () => {
    const config = getPublicReleaseConfig();
    assert.equal(config.ready, true);
    assert.equal(config.privacyPolicyUrl, 'https://example.test/privacy');
    assert.equal(config.termsOfServiceUrl, 'https://example.test/terms');
    assert.equal(config.accountDeletionUrl, 'https://example.test/account/delete');
    assert.equal(config.childSafetyUrl, 'https://example.test/safety/children');
    assert.equal(config.supportEmail, 'support@example.test');
  });
});

test('public release config fails closed for missing, local, insecure or credential-bearing URLs', () => {
  const cases = [
    {},
    {
      PRIVACY_POLICY_URL: 'http://example.test/privacy',
      TERMS_OF_SERVICE_URL: 'https://example.test/terms',
      ACCOUNT_DELETION_URL: 'https://example.test/account/delete',
      CHILD_SAFETY_URL: 'https://example.test/safety/children',
      SUPPORT_EMAIL: 'support@example.test',
    },
    {
      PRIVACY_POLICY_URL: 'https://localhost/privacy',
      TERMS_OF_SERVICE_URL: 'https://example.test/terms',
      ACCOUNT_DELETION_URL: 'https://example.test/account/delete',
      CHILD_SAFETY_URL: 'https://example.test/safety/children',
      SUPPORT_EMAIL: 'support@example.test',
    },
    {
      PRIVACY_POLICY_URL: 'https://user:pass@example.test/privacy',
      TERMS_OF_SERVICE_URL: 'https://example.test/terms',
      ACCOUNT_DELETION_URL: 'https://example.test/account/delete',
      CHILD_SAFETY_URL: 'https://example.test/safety/children',
      SUPPORT_EMAIL: 'support@example.test',
    },
  ];

  for (const values of cases) {
    withEnvironment(values, () => assert.equal(getPublicReleaseConfig().ready, false));
  }
});
