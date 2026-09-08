import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const landing = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');

test('public landing does not advertise closed Caller or provider capabilities as active', () => {
  assert.match(landing, /نسخه عمومی فعلی روی ثبت‌نام و آماده‌سازی شنونده‌ها تمرکز دارد/);
  assert.match(landing, /مسیر عمومی Caller و تماس صوتی تا تکمیل زیرساخت production/);
  assert.match(landing, /پرداخت، KYC بیرونی و تسویه/);
  assert.doesNotMatch(landing, /Caller بعد از ورود می‌تواند شنونده آنلاین انتخاب کند و تماس صوتی را مستقیم از اینترنت/);
  assert.doesNotMatch(landing, /href="\/talk">می‌خواهم با یک شنونده حرف بزنم/);
});
