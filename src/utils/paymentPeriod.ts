/**
 * To'lov davri (`payments.payment_period`) — backend uni `YYYY-MM` ko'rinishida kutadi: maktabga tayyorlov (preschool)
 * davomat jurnalidagi oylik to'lov holati (`PreschoolPaymentStatusService`) to'lovni shu oyga yozadi. Davr
 * berilmasa yoki o'qib bo'lmasa — to'lov sanasi (`payment_date`) oyi olinadi.
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `2026-09`, `2026-09-15`, `2026-09-15T10:00:00Z` → `2026-09`. Mos kelmasa — `undefined`. */
export function normalizePaymentPeriod(value: string | null | undefined): string | undefined {
  const text = (value ?? '').trim();
  if (!text) return undefined;

  const iso = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?(?:[T\s].*)?$/);
  if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return `${iso[1]}-${iso[2]}`;

  // Eski yozuvlardagi «September 2026» kabi matn
  const parsed = new Date(`1 ${text}`);
  if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}`;

  return undefined;
}

/** To'lov sanasi (`YYYY-MM-DD`) oyi — davr tanlanmagan to'lovlar uchun. */
export function periodOfDate(date: string): string {
  return normalizePaymentPeriod(date) ?? currentPeriod();
}

/** Joriy oy, `YYYY-MM` (mahalliy vaqtda). */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

/** `YYYY-MM` ni `delta` oyga suradi (`2026-12`, +1 → `2027-01`). */
export function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

/** `from` dan `to` gacha (ikkalasi ham kiradi) barcha oylar, `YYYY-MM`. `from > to` bo'lsa bo'sh. */
export function periodsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  for (let period = from; period <= to && result.length < 60; period = shiftPeriod(period, 1)) result.push(period);
  return result;
}

const MONTH_KEYS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

/** `2026-10` → «Oktabr 2026» (oy nomi `attendance.months.*` tarjimasidan). */
export function periodLabel(period: string, t: (key: string) => string): string {
  const normalized = normalizePaymentPeriod(period);
  if (!normalized) return period;
  const [year, month] = normalized.split('-');
  return `${t(`attendance.months.${MONTH_KEYS[Number(month) - 1]}`)} ${year}`;
}
