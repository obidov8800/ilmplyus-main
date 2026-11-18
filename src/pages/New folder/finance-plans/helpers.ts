import type { TFunction } from 'i18next';
import type { DistributionMode, JamgarmaFundType, PlanAction, PlanItem, PlanStatus } from './types';

/** Pul qiymatini "1 000 000" ko'rinishida formatlaydi. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return String(value);
  // Tiyinlar 2 xonagacha yaxlitlangach tekshiriladi: `66000000.004` «66 000 000,00» bo'lib chiqmasin.
  const hasFraction = Math.round(Math.abs(num) * 100) % 100 !== 0;
  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** Foizni "42%" ko'rinishida — butun bo'lsa kasrsiz, aks holda 1 xonali. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0%';
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** Hujjat raqami — backendda alohida ustun bo'lmasa shu yasaladi. */
export function docNumber(year: number, month: number): string {
  return `PLN-${year}-${String(month).padStart(2, '0')}`;
}

export function statusI18nKey(status: PlanStatus | string | undefined): string {
  return `financePlans.status.${status || 'draft'}`;
}

export function statusClass(status: PlanStatus | string | undefined): string {
  switch (status) {
    case 'approved':
      return 'fp-status--done';
    case 'rejected':
      return 'fp-status--rejected';
    case 'sent':
      return 'fp-status--sent';
    case 'cancelled':
      return 'fp-status--cancelled';
    default:
      return 'fp-status--draft';
  }
}

export function distributionModeI18nKey(mode: DistributionMode | null | undefined): string {
  return mode ? `financePlans.distributionMode.${mode}` : 'financePlans.distributionMode.none';
}

/** Tarix qatoridagi maydon nomi — topilmasa xom nom ko'rsatiladi. */
export function logFieldLabel(field: string, t: TFunction): string {
  return t(`financePlans.log.field.${field}`, { defaultValue: field });
}

const MONEY_LOG_FIELDS = ['planned_income', 'amount'];

/** Tarix qatoridagi eski/yangi qiymat — status/taqsimlash usuli tarjima qilinadi, pul maydonlari formatlanadi. */
export function logValueLabel(field: string, value: string | null | undefined, t: TFunction): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'status') return t(statusI18nKey(value), { defaultValue: value });
  if (field === 'distribution_mode') return t(distributionModeI18nKey(value as DistributionMode), { defaultValue: value });
  if (MONEY_LOG_FIELDS.includes(field) && !Number.isNaN(Number(value))) return formatMoney(value);
  return value;
}

/** Amal shu statusda mumkinmi. Tasdiqlangan/bekor qilingan reja o'zgartirilmaydi. */
export function isActionAvailable(action: PlanAction, status: PlanStatus): boolean {
  switch (action) {
    case 'send':
      return status === 'draft' || status === 'rejected';
    case 'approve':
    case 'reject':
      return status === 'sent';
    case 'cancel':
      return status === 'draft' || status === 'sent' || status === 'rejected';
    default:
      return false;
  }
}

export const isEditable = (status: PlanStatus): boolean => status === 'draft' || status === 'rejected';

/** Amallarning ruxsat kodlari — `FinancialPlanPermissionSeeder`. */
export const ACTION_PERMISSION: Record<PlanAction, string> = {
  send: 'financial_plans.send',
  approve: 'financial_plans.approve',
  reject: 'financial_plans.approve',
  cancel: 'financial_plans.cancel',
};

export const PLAN_PERMISSIONS = {
  view: 'financial_plans.view',
  create: 'financial_plans.create',
  update: 'financial_plans.update',
  send: 'financial_plans.send',
  approve: 'financial_plans.approve',
  cancel: 'financial_plans.cancel',
  distribute: 'financial_plans.distribute',
  analysis: 'financial_plans.analysis',
} as const;

/** Bajarilish foiziga qarab progress-bar rangi. */
export function fulfillmentClass(percent: number): string {
  if (percent >= 90) return 'fp-fill--good';
  if (percent >= 60) return 'fp-fill--mid';
  return 'fp-fill--low';
}

export const MONTH_KEYS = [
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

export function monthI18nKey(month: number): string {
  return `financePlans.months.${MONTH_KEYS[month - 1] ?? 'january'}`;
}

/** `<input type="month">` qiymati (`YYYY-MM`) ↔ yil/oy. */
export const monthValue = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

export function parseMonthValue(value: string): { year: number; month: number } {
  const [y, m] = value.split('-');
  return { year: Number(y), month: Number(m) };
}

/** Joriy oyning `<input type="month">` qiymati — yangi reja odatda keyingi oy uchun. */
export function nextMonthValue(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  return monthValue(d.getFullYear(), d.getMonth() + 1);
}

/**
 * Qator qiymatini boshqa birlikka o'giradi — `calculation_type` ga qarab:
 *   percent → amount = planned_income * percent / 100
 *   amount  → percent = amount / planned_income * 100
 */
export function syncItemValue(item: PlanItem, plannedIncome: number): PlanItem {
  if (item.calculation_type === 'percent') {
    return { ...item, amount: plannedIncome > 0 ? (plannedIncome * item.percent) / 100 : 0 };
  }
  return { ...item, percent: plannedIncome > 0 ? (item.amount / plannedIncome) * 100 : 0 };
}

/** Reja formasidagi bo'limlar tartibi; `other` — bo'limi belgilanmagan jamg'armalar (oxirida). */
export type PlanSection = JamgarmaFundType | 'other';
export const PLAN_SECTIONS: PlanSection[] = ['harmless_point', 'marginal_income', 'adjusted_income', 'other'];

export const itemSection = (item: PlanItem): PlanSection => item.fund_type ?? 'other';

/** Qatorlar foizi yig'indisi. */
export function totalPercent(items: PlanItem[]): number {
  return items.reduce((sum, i) => sum + i.percent, 0);
}

/**
 * Har bir qator uchun — o'sha qatorgacha (o'zi bilan) kumulyativ foiz 100% dan oshganmi.
 * Ro'yxatda qaysi qatordan boshlab 100% chegara buzilganini belgilash uchun.
 */
export function overPercentFlags(items: PlanItem[]): boolean[] {
  let running = 0;
  return items.map((item) => {
    if (item.calculation_type === 'percent') running += item.percent;
    return running > 100;
  });
}

/**
 * Zararsiz ishlash nuqtasi (BEP):
 *   BEP = amount_based_total / (1 - percent_based_total / 100)
 * Foizga asoslangan qatorlar yig'indisi 100% dan oshsa yoki teng bo'lsa — aniqlanmaydi.
 */
export function calculateBep(items: PlanItem[]): number | null {
  const amountBasedTotal = items
    .filter((i) => i.calculation_type === 'amount')
    .reduce((sum, i) => sum + i.amount, 0);
  const percentBasedTotal = items
    .filter((i) => i.calculation_type === 'percent')
    .reduce((sum, i) => sum + i.percent, 0);
  if (percentBasedTotal >= 100) return null;
  return amountBasedTotal / (1 - percentBasedTotal / 100);
}
