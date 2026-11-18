/**
 * Raqamni minglik guruhlarga bo'lib yozadi: `1234567.5` → `1 234 567.5`.
 *
 * `toLocaleString('uz-UZ')` ko'p brauzerlarda (uz tili ma'lumoti bo'lmasa) `1,234,567` — VERGUL bilan chiqadi,
 * brauzer tiliga bog'liq bo'lmagan yagona ko'rinish uchun shu funksiyadan foydalaning. Guruhlar orasida uzilmas
 * bo'sh joy (NBSP) — narx jadval katagida ikki qatorga bo'linib qolmasin; PDF kabi joylarda `sep = ' '` bering.
 */
export function groupDigits(
  value: number | string | null | undefined,
  maxFraction = 2,
  sep = ' ',
): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);

  const [int, frac = ''] = Math.abs(n).toFixed(maxFraction).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const fraction = frac.replace(/0+$/, '');
  const sign = n < 0 && (Number(int) !== 0 || fraction) ? '-' : '';
  return `${sign}${grouped}${fraction ? `.${fraction}` : ''}`;
}
