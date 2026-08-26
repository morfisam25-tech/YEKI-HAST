const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDecimalDigits(value: string): string {
  return [...value].map((char) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(char);
    if (persianIndex >= 0) return String(persianIndex);
    const arabicIndex = ARABIC_DIGITS.indexOf(char);
    if (arabicIndex >= 0) return String(arabicIndex);
    return char;
  }).join('');
}

export function normalizeIranNationalId(value: string): string {
  return normalizeDecimalDigits(value).replace(/[\s-]/g, '');
}

export function isValidIranNationalId(value: string): boolean {
  const nationalId = normalizeIranNationalId(value);
  if (!/^\d{10}$/.test(nationalId) || /^(\d)\1{9}$/.test(nationalId)) return false;
  const checkDigit = Number(nationalId[9]);
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(nationalId[index]) * (10 - index);
  }
  const remainder = sum % 11;
  const expected = remainder < 2 ? remainder : 11 - remainder;
  return checkDigit === expected;
}

export function normalizeIranIban(value: string): string {
  return normalizeDecimalDigits(value).replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIranIban(value: string): boolean {
  const iban = normalizeIranIban(value);
  if (!/^IR\d{24}$/.test(iban)) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const expanded = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function normalizeIsoDate(value: string): string | null {
  const normalized = normalizeDecimalDigits(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return normalized;
}
