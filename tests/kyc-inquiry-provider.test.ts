import assert from 'node:assert/strict';
import test from 'node:test';
import { NextPayKycInquiryProvider } from '../services/api/src/providers/kyc-inquiry.ts';

const key = 'b11ee9c3-d23d-414e-8b6e-f2370baac97b';

function withInquiryKey<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const before = process.env.NEXTPAY_INQUIRY_API;
  process.env.NEXTPAY_INQUIRY_API = key;
  const restore = () => {
    if (before === undefined) delete process.env.NEXTPAY_INQUIRY_API;
    else process.env.NEXTPAY_INQUIRY_API = before;
  };
  try {
    const result = fn();
    if (result instanceof Promise) return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function success(data: unknown): Response {
  return new Response(JSON.stringify({
    code: 200,
    error: null,
    data,
    fee: 100,
    fee_irr: 1000,
    inq_balance: 900,
    inq_balance_irr: 9000,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

const sabtData = {
  inq: 'SABTAHVAL',
  inq_desc: 'identity',
  inq_id: 11197,
  national_id: '1234567890',
  jalali_birth: '1371-07-19',
  match: true,
  first_name: 'Test',
  last_name: 'User',
  father_name: 'Father',
  is_alive: 1,
};

test('SabtAhval uses only documented request fields and parses documented response data', async () => {
  await withInquiryKey(async () => {
    let capturedUrl = '';
    let capturedBody = '';
    const provider = new NextPayKycInquiryProvider((async (input, init) => {
      capturedUrl = String(input);
      capturedBody = String(init?.body ?? '');
      return success(sabtData);
    }) as typeof fetch);

    const result = await provider.sabtAhval({ nationalId: '1234567890', birthYear: '1371', birthMonth: '07', birthDay: '19' });
    assert.equal(capturedUrl, 'https://nextpay.org/nx/inquiry/sabtahval');
    const form = new URLSearchParams(capturedBody);
    assert.deepEqual([...form.keys()].sort(), ['birth_day', 'birth_month', 'birth_year', 'inquiry_api', 'national_id']);
    assert.equal(form.get('inquiry_api'), key);
    assert.equal(result.data.match, true);
  });
});

test('SabtAhval accepts the same Jalali year range as the calendar domain', async () => {
  await withInquiryKey(async () => {
    for (const birthYear of ['1200', '1500', '1600']) {
      const provider = new NextPayKycInquiryProvider((async () => success(sabtData)) as typeof fetch);
      await assert.doesNotReject(() => provider.sabtAhval({ nationalId: '1234567890', birthYear, birthMonth: '01', birthDay: '01' }));
    }
    const provider = new NextPayKycInquiryProvider((async () => success(sabtData)) as typeof fetch);
    await assert.rejects(() => provider.sabtAhval({ nationalId: '1234567890', birthYear: '1199', birthMonth: '01', birthDay: '01' }), /invalid_jalali_birth_date/);
    await assert.rejects(() => provider.sabtAhval({ nationalId: '1234567890', birthYear: '1601', birthMonth: '01', birthDay: '01' }), /invalid_jalali_birth_date/);
  });
});

test('numeric envelope fields reject null instead of coercing null to zero', async () => {
  await withInquiryKey(async () => {
    const provider = new NextPayKycInquiryProvider((async () => new Response(JSON.stringify({
      code: 200,
      error: null,
      data: sabtData,
      fee: null,
      fee_irr: 1000,
      inq_balance: 900,
      inq_balance_irr: 9000,
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch);
    await assert.rejects(
      () => provider.sabtAhval({ nationalId: '1234567890', birthYear: '1371', birthMonth: '07', birthDay: '19' }),
      /kyc_inquiry_invalid_response/,
    );
  });
});

test('Shahkar response data stays opaque instead of guessing undocumented fields', async () => {
  await withInquiryKey(async () => {
    const provider = new NextPayKycInquiryProvider((async () => success({ provider_specific: true })) as typeof fetch);
    const result = await provider.shahkar({ nationalId: '1234567890', mobile: '09120000000' });
    assert.deepEqual(result.data, { provider_specific: true });
  });
});

test('Sheba strips IR because official request contract requires 24 digits', async () => {
  await withInquiryKey(async () => {
    let capturedBody = '';
    const provider = new NextPayKycInquiryProvider((async (_input, init) => {
      capturedBody = String(init?.body ?? '');
      return success({ provider_specific: true });
    }) as typeof fetch);
    await provider.sheba({ sheba: 'IR123412341234123412341234' });
    const form = new URLSearchParams(capturedBody);
    assert.equal(form.get('sheba'), '123412341234123412341234');
  });
});

test('provider fails closed without a valid inquiry key', () => {
  const before = process.env.NEXTPAY_INQUIRY_API;
  delete process.env.NEXTPAY_INQUIRY_API;
  try {
    assert.throws(() => new NextPayKycInquiryProvider(), /kyc_inquiry_not_configured/);
  } finally {
    if (before !== undefined) process.env.NEXTPAY_INQUIRY_API = before;
  }
});
