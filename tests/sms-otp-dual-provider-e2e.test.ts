import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  SmsOtpInput,
  SmsOtpProvider,
  SmsOtpProviderName,
  SmsOtpSendResult,
} from '../services/api/src/providers/sms.ts';
import { SmsProviderError } from '../services/api/src/providers/sms.ts';

type RealProviderName = Exclude<SmsOtpProviderName, 'dev'>;
type ProviderMode = 'accept' | 'temporary_failure' | 'hard_failure';

class MockDeliveryProvider implements SmsOtpProvider {
  readonly templateIdentifier: string;
  mode: ProviderMode = 'accept';
  sends: SmsOtpInput[] = [];

  constructor(readonly provider: RealProviderName) {
    this.templateIdentifier = provider === 'smsir' ? '958161' : 'pattern_123';
  }

  async sendOtp(input: SmsOtpInput): Promise<SmsOtpSendResult> {
    this.sends.push({ ...input });
    if (this.mode === 'temporary_failure') {
      throw new SmsProviderError({
        provider: this.provider,
        kind: 'temporary_unavailable',
        retryable: true,
        statusCode: 503,
      });
    }
    if (this.mode === 'hard_failure') {
      throw new SmsProviderError({
        provider: this.provider,
        kind: 'request_rejected',
        retryable: false,
        statusCode: 400,
      });
    }
    return {
      provider: this.provider,
      templateIdentifier: this.templateIdentifier,
      providerReferenceId: `${this.provider}-ref-${this.sends.length}`,
    };
  }
}

interface Challenge {
  phone: string;
  ip: string;
  code: string;
  createdAtMs: number;
  expiresAtMs: number;
  attempts: number;
  consumed: boolean;
}

class MockOtpBackend {
  nowMs = 1_000_000;
  readonly ttlMs = 300_000;
  readonly cooldownMs = 60_000;
  readonly phoneLimit = 5;
  readonly ipLimit = 20;
  readonly attemptsLimit = 5;
  readonly requests: Challenge[] = [];

  constructor(readonly provider: MockDeliveryProvider) {}

  advance(ms: number): void {
    this.nowMs += ms;
  }

  async requestOtp(phone: string, ip: string, code: string): Promise<SmsOtpSendResult> {
    const windowStart = this.nowMs - 15 * 60_000;
    const recent = this.requests.filter((row) => row.createdAtMs > windowStart);
    if (recent.filter((row) => row.phone === phone).length >= this.phoneLimit) {
      throw new Error('otp_request_rate_limited');
    }
    if (recent.filter((row) => row.ip === ip).length >= this.ipLimit) {
      throw new Error('otp_request_rate_limited');
    }
    if (this.requests.some((row) => row.phone === phone && !row.consumed && row.createdAtMs > this.nowMs - this.cooldownMs)) {
      throw new Error('otp_request_rate_limited');
    }

    for (const row of this.requests) {
      if (row.phone === phone && !row.consumed) row.consumed = true;
    }

    const challenge: Challenge = {
      phone,
      ip,
      code,
      createdAtMs: this.nowMs,
      expiresAtMs: this.nowMs + this.ttlMs,
      attempts: 0,
      consumed: false,
    };
    this.requests.push(challenge);

    try {
      return await this.provider.sendOtp({ phoneE164: phone, code, ttlSeconds: this.ttlMs / 1000 });
    } catch (error) {
      challenge.consumed = true;
      throw error;
    }
  }

  verify(phone: string, code: string): boolean {
    const challenge = [...this.requests]
      .reverse()
      .find((row) => row.phone === phone && !row.consumed && row.expiresAtMs > this.nowMs);
    if (!challenge || challenge.attempts >= this.attemptsLimit) return false;
    if (challenge.code !== code) {
      challenge.attempts += 1;
      return false;
    }
    challenge.consumed = true;
    return true;
  }
}

for (const providerName of ['smsir', 'farazsms'] as const) {
  test(`${providerName}: mocked OTP E2E accepts request, enforces cooldown, and verifies once`, async () => {
    const provider = new MockDeliveryProvider(providerName);
    const backend = new MockOtpBackend(provider);
    const phone = '+989123456789';
    const ip = '203.0.113.10';

    const sent = await backend.requestOtp(phone, ip, '123456');
    assert.equal(sent.provider, providerName);
    assert.match(sent.providerReferenceId ?? '', /-ref-1$/);
    await assert.rejects(
      backend.requestOtp(phone, ip, '654321'),
      /otp_request_rate_limited/,
    );
    assert.equal(backend.verify(phone, '000000'), false);
    assert.equal(backend.verify(phone, '123456'), true);
    assert.equal(backend.verify(phone, '123456'), false, 'consumed OTP cannot be replayed');
  });

  test(`${providerName}: mocked OTP E2E rejects expired OTP`, async () => {
    const provider = new MockDeliveryProvider(providerName);
    const backend = new MockOtpBackend(provider);
    const phone = '+989123456789';

    await backend.requestOtp(phone, '203.0.113.11', '123456');
    backend.advance(300_001);
    assert.equal(backend.verify(phone, '123456'), false);
  });

  test(`${providerName}: mocked OTP E2E locks verification after excessive attempts`, async () => {
    const provider = new MockDeliveryProvider(providerName);
    const backend = new MockOtpBackend(provider);
    const phone = '+989123456789';

    await backend.requestOtp(phone, '203.0.113.12', '123456');
    for (let i = 0; i < 5; i += 1) assert.equal(backend.verify(phone, '000000'), false);
    assert.equal(backend.verify(phone, '123456'), false);
  });

  test(`${providerName}: mocked OTP E2E consumes failed delivery challenge and permits safe retry after cooldown state is cleared`, async () => {
    const provider = new MockDeliveryProvider(providerName);
    const backend = new MockOtpBackend(provider);
    const phone = '+989123456789';
    const ip = '203.0.113.13';

    provider.mode = 'temporary_failure';
    await assert.rejects(
      backend.requestOtp(phone, ip, '123456'),
      (error: unknown) => error instanceof SmsProviderError && error.retryable,
    );

    provider.mode = 'accept';
    const retry = await backend.requestOtp(phone, ip, '654321');
    assert.equal(retry.provider, providerName);
    assert.equal(backend.verify(phone, '654321'), true);
  });

  test(`${providerName}: mocked OTP E2E keeps hard provider failures permanent and sanitized`, async () => {
    const provider = new MockDeliveryProvider(providerName);
    const backend = new MockOtpBackend(provider);
    provider.mode = 'hard_failure';

    await assert.rejects(
      backend.requestOtp('+989123456789', '203.0.113.14', '123456'),
      (error: unknown) => error instanceof SmsProviderError
        && error.message === 'sms_delivery_failed'
        && !error.retryable
        && error.kind === 'request_rejected',
    );
  });

  test(`${providerName}: mocked OTP E2E enforces per-phone request rate limit`, async () => {
    const provider = new MockDeliveryProvider(providerName);
    const backend = new MockOtpBackend(provider);
    const phone = '+989123456789';

    for (let i = 0; i < backend.phoneLimit; i += 1) {
      await backend.requestOtp(phone, `203.0.113.${20 + i}`, '123456');
      const active = [...backend.requests].reverse().find((row) => row.phone === phone && !row.consumed);
      if (active) active.consumed = true;
    }
    await assert.rejects(
      backend.requestOtp(phone, '203.0.113.99', '123456'),
      /otp_request_rate_limited/,
    );
  });
}
