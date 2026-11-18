/**
 * Umumiy CSV eksport yordamchilari — har qanday obyekt massivini yuklab
 * olinadigan CSV faylga aylantiradi. Excel UTF-8 ni to'g'ri o'qishi uchun
 * matn boshiga BOM qo'yiladi; vergul / qo'shtirnoq / yangi qator bo'lgan
 * katakchalar qo'shtirnoqqa olinadi.
 *
 * Panelning "Batafsil" oynasi (`pages/dashboard/useDashboardDetail.ts`) ham
 * shu yerdan foydalanadi.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** UTF-8 BOM — Excel CSV ni to'g'ri kodlashda ochsin. */
const CSV_BOM = '﻿';

function escapeCell(raw: string | number | null | undefined): string {
  const s = raw == null ? '' : String(raw);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.value(row))).join(','))
    .join('\n');
  return `${CSV_BOM}${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
