import assert from 'node:assert/strict';
import test from 'node:test';
import { NextPayKycInquiryProvider } from '../services/api/src/providers/kyc-inquiry.ts';

const key = 'b11ee9c3-d23d-414e-8b6e-f2370baac97b';

async function withKey(fn: () => Promise<void>) {
  const before = process.env.NEXTPAY_INQUIRY_API;
  process.env.NEXTPAY_INQUIRY_API = key;
  try { await fn(); }
  finally {
    if (before === undefined) delete process.env.NEXTPAY_INQUIRY_API;
    else process.env.NEXTPAY_INQUIRY_API = before;
  }
}

function bodyWith(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({
    code: 200, error: null, data,
    fee: 1, fee_irr: 10, inq_balance: 20, inq_balance_irr: 200,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

const base = {
  inq: 'SABTAHVAL', inq_desc: 'ok', inq_id: 10,
  national_id: '1234567890', jalali_birth: '1371-01-01', match: true,
  first_name: 'A', last_name: 'B', father_name: 'C', is_alive: 1,
};

for (const field of ['inq_id', 'is_alive'] as const) {
  test(`SabtAhval rejects null ${field}`, async () => {
    await withKey(async () => {
      const provider = new NextPayKycInquiryProvider((async () => bodyWith({ ...base, [field]: null })) as typeof fetch);
      await assert.rejects(
        () => provider.sabtAhval({ nationalId: '1234567890', birthYear: '1371', birthMonth: '01', birthDay: '01' }),
        /kyc_inquiry_invalid_response/,
      );
    });
  });
}
