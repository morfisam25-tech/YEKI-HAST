const DAY_MS = 86_400_000;
const JALALI_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const GREGORIAN_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const persianFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  calendar: 'persian',
  numberingSystem: 'latn',
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export type JalaliParts = { year: number; month: number; day: number };

function jalaliPartsForDate(date: Date): JalaliParts {
  const parts = persianFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
}

export function parseJalaliDate(value: string): JalaliParts {
  const match = JALALI_RE.exec(value.trim());
  if (!match) throw new Error('invalid_jalali_date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1200 || year > 1600 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error('invalid_jalali_date');
  }
  return { year, month, day };
}

export function jalaliToGregorianIso(value: string): string {
  const target = parseJalaliDate(value);

  // Persian years begin around March in Gregorian year jy+621. Searching the
  // bounded civil-year window delegates leap-year/calendar correctness to ICU
  // instead of embedding another calendar algorithm in the payment/KYC path.
  const start = Date.UTC(target.year + 621, 1, 15, 12, 0, 0);
  const end = Date.UTC(target.year + 622, 3, 15, 12, 0, 0);
  for (let ts = start; ts <= end; ts += DAY_MS) {
    const date = new Date(ts);
    const parts = jalaliPartsForDate(date);
    if (parts.year === target.year && parts.month === target.month && parts.day === target.day) {
      return date.toISOString().slice(0, 10);
    }
  }
  throw new Error('invalid_jalali_date');
}

export function gregorianIsoToJalali(value: string): JalaliParts {
  const match = GREGORIAN_RE.exec(value.trim());
  if (!match) throw new Error('invalid_gregorian_date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('invalid_gregorian_date');
  }
  return jalaliPartsForDate(date);
}
