import { create } from 'zustand';
import type { ReactNode } from 'react';
import { toCsv, downloadCsv } from '@/utils/exportCsv';

export { downloadCsv };

/**
 * "Batafsil / Hammasini ko'rish" drill-down oynasi uchun umumiy store.
 *
 * Panelning har bir bo'limi (diagramma yoki qisqartirilgan jadval) yonida
 * "Batafsil" tugmasi bo'ladi — u `openDetail({ title, columns, rows })` chaqiradi.
 * Oyna `index.tsx` da BIR marta render qilinadi (`DashboardDetailModal`), ichida
 * qidiruv + saralanadigan jadval + mobil kartalar + CSV eksport + sahifalash.
 *
 * `rows` — oddiy obyektlar massivi (`Record<string, unknown>`); har bir chaqiruvchi
 * o'z ma'lumotini shu ko'rinishga keltiradi. `columns[].render` React tugun
 * qaytaradi (badge, rang va h.k.), `sortValue`/`csv` esa saralash va eksport
 * uchun toza qiymat beradi.
 */

export type DetailRow = Record<string, unknown>;
export type SortDir = 'asc' | 'desc';

export interface DetailColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  /** Katakcha ko'rinishi. Berilmasa — `String(row[key] ?? '')`. */
  render?: (row: DetailRow) => ReactNode;
  /** Saralash kaliti. Berilmasa — `row[key]` (raqam yoki matn sifatida). */
  sortValue?: (row: DetailRow) => string | number;
  /** CSV katakchasi. Berilmasa — `sortValue` yoki `row[key]`. */
  csv?: (row: DetailRow) => string | number;
  /** `false` bo'lsa ustun bo'yicha saralab bo'lmaydi. Default: `true`. */
  sortable?: boolean;
}

export interface DashboardDetailConfig {
  title: string;
  rows: DetailRow[];
  columns: DetailColumn[];
  /** Qidiruv shu matn ustidan (kichik harfda solishtiriladi). */
  searchText?: (row: DetailRow) => string;
  initialSort?: { key: string; dir: SortDir };
  /** CSV fayl nomi (`.csv` qo'shiladi). Default: `dashboard-detail`. */
  csvName?: string;
}

interface DashboardDetailState {
  config: DashboardDetailConfig | null;
  openDetail: (config: DashboardDetailConfig) => void;
  closeDetail: () => void;
}

export const useDashboardDetail = create<DashboardDetailState>((set) => ({
  config: null,
  openDetail: (config) => set({ config }),
  closeDetail: () => set({ config: null }),
}));

// ── CSV ────────────────────────────────────────────────────────────────────

/** Bir katakchaning CSV qiymati: `csv` → `sortValue` → `row[key]`. */
function cellValue(col: DetailColumn, row: DetailRow): string | number | null | undefined {
  if (col.csv) return col.csv(row);
  if (col.sortValue) return col.sortValue(row);
  return row[col.key] as string | number | null | undefined;
}

/** Ustunlar + qatorlardan CSV matni (umumiy `toCsv` yordamchisi ustidan). */
export function buildCsv(columns: DetailColumn[], rows: DetailRow[]): string {
  return toCsv(
    rows,
    columns.map((col) => ({ header: col.label, value: (row: DetailRow) => cellValue(col, row) })),
  );
}
