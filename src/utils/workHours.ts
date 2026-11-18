/**
 * Foydalanuvchi ish vaqti (tizimga yozish cheklovi) — backend `GET /me/work-hours`.
 *
 * Qoida (backend): foydalanuvchiga hafta kunlari bo'yicha vaqt belgilanadi. Shu kun va oraliqda hamma narsa
 * odatdagidek; oraliqdan tashqarida faqat ko'radi (`POST/PUT/PATCH/DELETE` → 403 `outside_work_hours`).
 * Haqiqiy tekshiruv backendda — bu fayl faqat interfeys uchun: tugmalar o'chadi, keraksiz so'rov ketmaydi.
 *
 * Holat `localStorage`ga ham yoziladi: axios interceptor uni sinxron o'qiydi (React'dan tashqarida), sahifa
 * yangilanganda esa birinchi javob kelguncha ham to'g'ri holat bilan boshlanadi.
 */
import type { InternalAxiosRequestConfig } from 'axios';

export interface WorkHoursStatus {
  restricted: boolean;
  can_write: boolean;
  reason?: string;
  message?: string;
  today?: { week_day?: number; week_day_name?: string; start_time?: string | null; end_time?: string | null } | null;
  next_window?: { date?: string; week_day?: number; week_day_name?: string; start_time?: string; end_time?: string; starts_at?: string } | null;
  /** Haftalik jadval: ro'yxatda yo'q kun — dam olish kuni. */
  schedules?: { week_day: number; week_day_name?: string; start_time: string; end_time: string }[];
  [key: string]: unknown;
}

type CachedStatus = WorkHoursStatus & { user_id?: number | string; checked_at?: number };

export const WORK_HOURS_CACHE_KEY = 'workHoursStatus';
/** Shundan eski saqlangan holatga ishonilmaydi (fon so'rovi har daqiqada yangilaydi). */
export const WORK_HOURS_CACHE_MAX_AGE = 3 * 60_000;

/** `code` bo'yicha tekshiriladi: oddiy ruxsat xatosi (403 permission) bilan adashmasin. */
export const OUTSIDE_WORK_HOURS_CODE = 'outside_work_hours';

export function readWorkHoursCache(userId: number | string | undefined | null): CachedStatus | null {
  if (userId == null) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(WORK_HOURS_CACHE_KEY) ?? 'null') as CachedStatus | null;
    if (
      !cached ||
      String(cached.user_id) !== String(userId) ||
      typeof cached.can_write !== 'boolean' ||
      typeof cached.checked_at !== 'number' ||
      Date.now() - cached.checked_at > WORK_HOURS_CACHE_MAX_AGE
    ) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

export function writeWorkHoursCache(userId: number | string | undefined | null, status: WorkHoursStatus): void {
  if (userId == null) return;
  try {
    localStorage.setItem(
      WORK_HOURS_CACHE_KEY,
      JSON.stringify({ ...status, user_id: userId, checked_at: Date.now() }),
    );
  } catch {
    /* xotira to'la yoki yopiq — muhim emas, keyingi so'rov yozadi */
  }
}

export function clearWorkHoursCache(): void {
  try {
    localStorage.removeItem(WORK_HOURS_CACHE_KEY);
  } catch {
    /* e'tiborsiz */
  }
}

/** Joriy foydalanuvchi hozir faqat ko'rishi mumkinmi (saqlangan holat bo'yicha, sinxron). */
export function getWorkHoursLock(userId: number | string | undefined | null): CachedStatus | null {
  const cached = readWorkHoursCache(userId);
  return cached && cached.can_write === false ? cached : null;
}

/** Ish vaqtidan qat'i nazar doim ochiq yozuvchi so'rovlar: chiqish, sessiyalar, axlat qutisi ko'rildi belgisi. */
export function isAlwaysOpenRequest(config: Pick<InternalAxiosRequestConfig, 'method' | 'url'>): boolean {
  const method = (config.method ?? 'get').toLowerCase();
  const path = `/${(config.url ?? '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '')}`;
  return (
    (method === 'post' && /\/logout\/?$/.test(path)) ||
    path.includes('/me/sessions') ||
    (method === 'post' && /\/trash\/mark-viewed\/?$/.test(path))
  );
}

export function isMutatingRequest(config: Pick<InternalAxiosRequestConfig, 'method'>): boolean {
  return ['post', 'put', 'patch', 'delete'].includes((config.method ?? 'get').toLowerCase());
}

/** Bugungi `HH:mm` (yoki `HH:mm:ss`) ni mahalliy `Date`ga aylantiradi. */
function todayAt(time: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

/**
 * Holat o'zgaradigan eng yaqin lahzagacha millisekund (ish vaqti boshlanishi yoki tugashi) — shu paytda holat
 * darhol qayta so'raladi, foydalanuvchi 12:00 da ham 1 daqiqa kutib o'tirmasin. Aniqlab bo'lmasa `null`.
 */
export function msUntilNextBoundary(status: WorkHoursStatus | null | undefined): number | null {
  if (!status || !status.restricted) return null;
  let target: Date | null = null;

  if (status.can_write === false) {
    const startsAt = status.next_window?.starts_at;
    if (typeof startsAt === 'string') {
      const parsed = new Date(startsAt);
      if (!Number.isNaN(parsed.getTime())) target = parsed;
    }
    if (!target && status.reason === 'before_start' && status.today?.start_time) {
      target = todayAt(status.today.start_time);
    }
  } else if (status.today?.end_time) {
    target = todayAt(status.today.end_time);
  }

  if (!target) return null;
  const delay = target.getTime() - Date.now();
  if (delay <= 0) return null;
  // setTimeout ~24.8 kundan ortiq qiymatni qabul qilmaydi; fon so'rovi baribir har daqiqada ishlaydi.
  return Math.min(delay + 1_000, 2_000_000_000);
}
