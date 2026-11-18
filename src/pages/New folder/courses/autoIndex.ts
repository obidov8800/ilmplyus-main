/**
 * Kurs narxining avtomatik yillik indeksatsiyasi — ko'rsatish uchun yordamchilar.
 *
 * Narxni haqiqatda oshirish serverdagi cron ishi (`docs/course-price-auto-index.md`).
 * Bu yerdagi funksiyalar faqat "keyingi safar nima bo'ladi" ni ko'rsatadi:
 * backend `next_apply_date` / `next_price` ni qaytarsa — o'shalar, aks holda
 * `percentage` + `start_date` dan cron bilan bir xil formula bo'yicha hisoblanadi.
 */
import type { CoursePrice } from '@/types/course.types';
import { parseIsoDate, parseServerDate } from '@/utils/date';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Oyda mavjud bo'lmagan kun (29.02) o'sha oyning oxirgi kuniga siqiladi — cron ham shunday qiladi. */
function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, new Date(year, month, 0).getDate());
}

/**
 * `start_date` dan kun va oyni ajratadi.
 * Qabul qilinadigan ko'rinishlar: `DD.MM`, `DD-MM` (frontend shu formatda yuboradi)
 * va to'liq `YYYY-MM-DD` (eski yozuvlar).
 */
export function parseStartDay(
  value: string | null | undefined,
): { day: number; month: number } | null {
  if (!value) return null;

  const iso = parseIsoDate(value);
  if (iso) return { day: iso.day, month: iso.month };

  const short = /^(\d{1,2})[.\-/](\d{1,2})$/.exec(value.trim());
  if (!short) return null;

  const day = Number(short[1]);
  const month = Number(short[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month };
}

/** Yozuv uchun avtomatik oshirish kuchdami: tasdiqlangan, foizi bor va o'chirilmagan. */
export function isAutoIndexActive(row: CoursePrice): boolean {
  if (row.auto_apply === false) return false;
  if ((row.holat ?? row.status) !== 'approved') return false;
  return Number(row.percentage) !== 0 && !!parseStartDay(row.start_date);
}

/** Keyingi indeksatsiyadan keyingi narx (cron formulasi bilan bir xil). */
export function getNextPrice(row: CoursePrice): number {
  const fromBackend = Number(row.next_price);
  if (row.next_price != null && Number.isFinite(fromBackend) && fromBackend > 0) {
    return Math.round(fromBackend);
  }
  const current = Number(row.new_price) || 0;
  const percent = Number(row.percentage) || 0;
  if (!current || !percent) return 0;
  return Math.round(current * (1 + percent / 100));
}

/**
 * Keyingi indeksatsiya sanasi `Date` ko'rinishida.
 * Shu yilgi sana o'tib ketgan yoki shu yil allaqachon qo'llangan bo'lsa — keyingi yil.
 */
export function getNextApplyDate(row: CoursePrice, today: Date = new Date()): Date | null {
  const fromBackend = parseServerDate(row.next_apply_date);
  if (fromBackend) return fromBackend;

  const parts = parseStartDay(row.start_date);
  if (!parts) return null;

  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastApplied = parseServerDate(row.last_applied_at);

  let year = today.getFullYear();
  const thisYear = new Date(year, parts.month - 1, clampDay(year, parts.month, parts.day));
  if ((lastApplied && lastApplied.getFullYear() === year) || thisYear < todayMidnight) {
    year += 1;
  }
  return new Date(year, parts.month - 1, clampDay(year, parts.month, parts.day));
}

/** `01.09.2027` — jadvalda ko'rsatish uchun. */
export function formatApplyDate(date: Date | null): string {
  if (!date) return '';
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}
