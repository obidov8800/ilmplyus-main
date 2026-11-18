import type { ReportStatus, WorkflowAction } from './types';

/** Pul string ("1000000.00") ni "1 000 000" ko'rinishida formatlaydi. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return String(value);
  // Kasr qismi 0 bo'lsa ko'rsatmaymiz.
  // Tiyinlar 2 xonagacha yaxlitlangach tekshiriladi: `66000000.004` «66 000 000,00» bo'lib chiqmasin.
  const hasFraction = Math.round(Math.abs(num) * 100) % 100 !== 0;
  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** Status → i18n kaliti (dailyCashReports.status.*). */
export function statusI18nKey(status: ReportStatus | string | undefined): string {
  return `dailyCashReports.status.${status || 'created'}`;
}

/** Status → CSS modifikatori. */
export function statusClass(status: ReportStatus | string | undefined): string {
  switch (status) {
    case 'accountant_approved':
    case 'finalized':
      return 'dcr-status--done';
    case 'returned':
      return 'dcr-status--returned';
    case 'sent':
    case 'assistant_accepted':
      return 'dcr-status--progress';
    default:
      return 'dcr-status--created';
  }
}

/** Berilgan amal berilgan statusda ruxsat etilganmi (backend qoidalari bilan mos). */
export function isActionAvailable(action: WorkflowAction, status: ReportStatus): boolean {
  switch (action) {
    case 'send':
      return status === 'created' || status === 'returned';
    case 'accept':
      return status === 'sent';
    case 'approve':
      return status === 'assistant_accepted';
    case 'return':
      return status === 'sent' || status === 'assistant_accepted';
    case 'correct':
      return status === 'returned';
    default:
      return false;
  }
}

/** Har bir workflow amali uchun kerakli ruxsat kodi. */
export const ACTION_PERMISSION: Record<WorkflowAction, string> = {
  send: 'daily_cash_reports.send',
  accept: 'daily_cash_reports.accept',
  approve: 'daily_cash_reports.approve',
  return: 'daily_cash_reports.return_for_correction',
  correct: 'daily_cash_reports.correct',
};
