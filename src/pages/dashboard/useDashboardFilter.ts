import { create } from 'zustand';
import { useMemo } from 'react';

/**
 * Boshqaruv panelining GLOBAL filtri — davr + filial. Panel tepasidagi
 * `DashboardFilterBar` shu store'ni o'zgartiradi, har 5 tab shu yerdan o'qiydi.
 *
 * URL query o'rniga sodda zustand store ishlatildi: tarixni ifloslantirmaydi,
 * 5 tab orasida bir zumda ulashiladi. Saqlanmaydi — panelga qayta kirilganda
 * standart "shu oy + barcha filiallar" ga qaytadi (ataylab: eski filtr
 * kutilmaganda qolib ketmasin).
 */

export type DashPeriod = 'today' | 'week' | 'month' | 'year' | 'custom';

export const DASH_PERIODS: DashPeriod[] = ['today', 'week', 'month', 'year', 'custom'];

interface DashboardFilterState {
  period: DashPeriod;
  /** `null` = barcha filiallar. */
  branchId: number | null;
  /** `period === 'custom'` bo'lganda ishlatiladi (`YYYY-MM-DD`). */
  fromIso: string;
  toIso: string;
  setPeriod: (p: DashPeriod) => void;
  setBranch: (id: number | null) => void;
  setFrom: (iso: string) => void;
  setTo: (iso: string) => void;
  reset: () => void;
}

const DEFAULTS = { period: 'month' as DashPeriod, branchId: null, fromIso: '', toIso: '' };

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  ...DEFAULTS,
  setPeriod: (period) => set({ period }),
  setBranch: (branchId) => set({ branchId }),
  setFrom: (fromIso) => set({ fromIso }),
  setTo: (toIso) => set({ toIso }),
  reset: () => set({ ...DEFAULTS }),
}));

// ── Davr → sana oralig'i ────────────────────────────────────────────────────

export interface DateRange {
  /** Boshi (inclusive). `null` = pastki chegara yo'q ("Hammasi"). */
  start: Date | null;
  /** Oxiri (inclusive, kun oxirigacha). `null` = yuqori chegara yo'q. */
  end: Date | null;
  /** Oldingi teng uzunlikdagi oyna — o'sish/pasayishni solishtirish uchun. */
  prevStart: Date | null;
  prevEnd: Date | null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/**
 * Tanlangan davrni aniq sana oralig'iga (va oldingi teng oynaga) aylantiradi.
 * `today`/`week` — oxirgi N kun; `month`/`quarter`/`year` — kalendar davri;
 * `all` — chegarasiz (oldingi oyna yo'q); `custom` — `from`..`to`, oldingi oyna
 * xuddi shu uzunlikda darrov oldinda.
 */
export function computeRange(
  period: DashPeriod,
  fromIso: string,
  toIso: string,
  now: Date = new Date(),
): DateRange {
  const none: DateRange = { start: null, end: null, prevStart: null, prevEnd: null };

  if (period === 'today') {
    const start = startOfDay(now);
    const end = endOfDay(now);
    return { start, end, prevStart: startOfDay(addDays(now, -1)), prevEnd: endOfDay(addDays(now, -1)) };
  }

  if (period === 'week') {
    const start = startOfDay(addDays(now, -6));
    const end = endOfDay(now);
    return {
      start,
      end,
      prevStart: startOfDay(addDays(now, -13)),
      prevEnd: endOfDay(addDays(now, -7)),
    };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, prevStart, prevEnd };
  }

  if (period === 'year') {
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    const prevStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
    const prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    return { start, end, prevStart, prevEnd };
  }

  // custom
  if (!fromIso || !toIso) return none;
  const from = startOfDay(new Date(fromIso));
  const to = endOfDay(new Date(toIso));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return none;
  const spanMs = to.getTime() - from.getTime();
  const prevEnd = new Date(from.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { start: from, end: to, prevStart, prevEnd };
}

// ── Filtr yordamchilari (tablarda ishlatiladi) ─────────────────────────────

/** Absolyut vaqt tamg'asi (ms) oraliqqa tushadimi. */
export function tsInRange(ts: number | null | undefined, range: DateRange): boolean {
  if (!range.start && !range.end) return true;
  if (ts == null || Number.isNaN(ts)) return false;
  if (range.start && ts < range.start.getTime()) return false;
  if (range.end && ts > range.end.getTime()) return false;
  return true;
}

/** Sana matni oraliqqa tushadimi. Oraliq chegarasiz bo'lsa — har doim `true`. */
export function dateInRange(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!range.start && !range.end) return true;
  if (!dateStr) return false;
  return tsInRange(new Date(dateStr).getTime(), range);
}

/**
 * Oldingi davrga nisbatan foizli o'zgarish. Bazaviy qiymat 0 bo'lsa `NaN`
 * (cheksizlikka bo'linmaslik uchun) — `GrowthBadge` uni ko'rsatmaydi.
 */
export function pctChange(curr: number, prev: number): number {
  return prev === 0 ? NaN : ((curr - prev) / prev) * 100;
}

/** Oldingi oynaga tushadimi (o'sish solishtirish uchun). */
export function dateInPrevRange(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!range.prevStart || !range.prevEnd) return false;
  if (!dateStr) return false;
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return false;
  return ts >= range.prevStart.getTime() && ts <= range.prevEnd.getTime();
}

/** Yozuvdan filial id'sini turli mumkin bo'lgan maydonlardan qidiradi. */
export function pickBranchId(row: unknown): number | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const branch = r.branch as { id?: unknown } | null | undefined;
  const employee = r.employee as { branch_id?: unknown } | null | undefined;
  const raw = r.branch_id ?? branch?.id ?? employee?.branch_id ?? null;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Panelning global filtri: joriy davr oralig'i, oldingi oyna, tanlangan filial,
 * hamda tayyor `dateOk` / `branchOk` predikatlari.
 */
export function useDashFilter() {
  const period = useDashboardFilterStore((s) => s.period);
  const branchId = useDashboardFilterStore((s) => s.branchId);
  const fromIso = useDashboardFilterStore((s) => s.fromIso);
  const toIso = useDashboardFilterStore((s) => s.toIso);

  return useMemo(() => {
    const range = computeRange(period, fromIso, toIso);
    const hasDateFilter = !!(range.start || range.end);
    const hasPrev = !!(range.prevStart && range.prevEnd);
    const dateOk = (d: string | null | undefined) => dateInRange(d, range);
    const tsOk = (ts: number | null | undefined) => tsInRange(ts, range);
    const datePrevOk = (d: string | null | undefined) => dateInPrevRange(d, range);
    const branchOk = (row: unknown) => branchId == null || pickBranchId(row) === branchId;
    const branchIdOk = (id: number | null | undefined) =>
      branchId == null || (id != null && Number(id) === branchId);
    return {
      period,
      branchId,
      range,
      hasDateFilter,
      hasBranchFilter: branchId != null,
      hasPrev,
      dateOk,
      tsOk,
      datePrevOk,
      branchOk,
      branchIdOk,
    };
  }, [period, branchId, fromIso, toIso]);
}
