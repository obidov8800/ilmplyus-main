import type {
  PayrollSheet,
  SheetAction,
  SheetContract,
  SheetRow,
  SheetStatus,
  SheetType,
} from './types';

/**
 * Soliq stavkalari frontendda qotib qolmaydi: har bir vedomost o'z
 * snapshotini beradi (`income_tax_percent`, `pension_fund_percent`,
 * `social_tax_percent`), stavka keyin o'zgarsa eski vedomost qayta
 * hisoblanmaydi. Standartlar backend sozlamasida: 11.90 / 0.10 / 12.00.
 */

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

/** Vedomost turiga qarab naqdsiz ustuni. */
export function rowNonCash(row: SheetRow, type: SheetType): number {
  return type === 'advance' ? row.advance_cashless : row.salary_cashless;
}

/** Vedomost turiga qarab naqd ustuni. */
export function rowCash(row: SheetRow, type: SheetType): number {
  return type === 'advance' ? row.advance_cash : row.salary_cash;
}

/** Soliqlar yig'indisi — PDF dagi bitta «Soliqlar» ustuni. */
export function rowTaxTotal(row: SheetRow): number {
  return row.income_tax_amount + row.pension_fund_amount + row.social_tax_amount;
}

/** Ustunlar bo'yicha jami. `total_payout` ni backend hisoblaydi. */
export function sumRows(rows: SheetRow[], type: SheetType) {
  return rows.reduce(
    (acc, row) => ({
      oklad: acc.oklad + row.oklad,
      advance_non_cash: acc.advance_non_cash + row.advance_cashless,
      advance_cash: acc.advance_cash + row.advance_cash,
      non_cash: acc.non_cash + rowNonCash(row, type),
      cash: acc.cash + rowCash(row, type),
      adjustment: acc.adjustment + row.adjustment_amount,
      kpi: acc.kpi + row.kpi_amount,
      fines: acc.fines + row.fines_amount,
      income_tax: acc.income_tax + row.income_tax_amount,
      pension_fund: acc.pension_fund + row.pension_fund_amount,
      social_tax: acc.social_tax + row.social_tax_amount,
      tax_total: acc.tax_total + rowTaxTotal(row),
      total: acc.total + row.total_payout,
    }),
    {
      oklad: 0,
      advance_non_cash: 0,
      advance_cash: 0,
      non_cash: 0,
      cash: 0,
      adjustment: 0,
      kpi: 0,
      fines: 0,
      income_tax: 0,
      pension_fund: 0,
      social_tax: 0,
      tax_total: 0,
      total: 0,
    },
  );
}

/**
 * Tuzatish / KPI / Avans ustunlari faqat oylik vedomostida bo'ladi
 * (TZ: «Бошқа устунлар (фақат ойлик ведомостида)»).
 *
 * DIQQAT: Jarima bundan mustasno — u endi ikkala turda ham (Avans va Oylik)
 * ko'rsatiladi va ayriladi, backend ham shunga mos `fines_amount` qaytaradi.
 */
export const hasSalaryColumns = (type: SheetType) => type === 'salary';

/** Shartnomalarni ko'rish ruxsati — Oylik jadvalidagi shartnoma ustunlari/filtri uchun. */
export const CONTRACT_VIEW_PERMISSION = 'employee_contracts.view';

/** `2026-08-31…` yoki `31.08.2026` → `2026-08-31`; tanib bo'lmasa `''`. */
function toIsoDate(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(value);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/**
 * Har bir xodim uchun vedomost oyiga tegishli shartnoma — `employee_id` → shartnoma.
 *
 * «Shartnomasi bor» deb: `active` shartnoma YOKI davri shu oyni qamragan shartnoma
 * (oy o'rtasida tugagan/bekor qilingan xodim oylikdan tushib qolmasligi uchun)
 * hisoblanadi. Bir nechta bo'lsa — faol + oyni qamragani, keyin eng yangisi (id).
 */
export function contractsByEmployee(
  contracts: SheetContract[],
  year: number,
  month: number,
  branchId?: number | null,
): Map<number, SheetContract> {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  // `-31` — satr solishtirishda oyning har qanday kunidan katta yoki teng.
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-31`;
  const best = new Map<number, { contract: SheetContract; rank: number }>();

  for (const contract of contracts) {
    // Tanlangan filialdan boshqa filial shartnomasi — bu filial jadvalida chiqmaydi.
    if (branchId != null && contract.branch_id != null && contract.branch_id !== branchId) continue;
    const start = toIsoDate(contract.contract_start_date);
    const end = toIsoDate(contract.contract_end_date);
    const coversMonth = (!start || start <= monthEnd) && (!end || end >= monthStart);
    const isActive = contract.status === 'active';
    if (!isActive && !coversMonth) continue;

    const rank = (isActive ? 2 : 0) + (coversMonth ? 1 : 0);
    const prev = best.get(contract.employee_id);
    if (!prev || rank > prev.rank || (rank === prev.rank && contract.id > prev.contract.id)) {
      best.set(contract.employee_id, { contract, rank });
    }
  }

  return new Map([...best].map(([employeeId, { contract }]) => [employeeId, contract]));
}

/**
 * Shartnomasi bor, lekin vedomostda yo'q xodim uchun nol qator. Vedomost
 * generatsiya qilinmagan yoki xodim ish haqi hali taqsimlanmagan bo'lsa shunday
 * ko'rinadi: summalar 0, shartnoma ma'lumoti (ta'til maoshi) esa o'z joyida.
 */
export function placeholderRow(contract: SheetContract): SheetRow {
  return {
    id: -contract.employee_id,
    employee_id: contract.employee_id,
    employee_name: contract.employee_name,
    position_name: contract.position_name,
    department_name: contract.department_name,
    department_id: contract.department_id,
    is_pedagog: contract.salary_type === 'percent',
    oklad: 0,
    advance_cashless: 0,
    advance_cash: 0,
    salary_cashless: 0,
    salary_cash: 0,
    adjustment_amount: 0,
    kpi_amount: 0,
    fines_amount: 0,
    income_tax_amount: 0,
    pension_fund_amount: 0,
    social_tax_amount: 0,
    total_payout: 0,
    note: null,
    created_at: null,
    not_in_sheet: true,
  };
}

/**
 * Ta'til maoshi — shartnomadagi «Ta'til uchun maosh». Ta'til berilmasa 0,
 * shartnoma yo'q bo'lsa `null` (jadvalda «—»). Backend `total_payout`iga
 * KIRMAYDI — bu ustun ma'lumot uchun, frontend jamini qayta hisoblamaydi.
 */
export function contractVacationPay(contract: SheetContract | null | undefined): number | null {
  if (!contract) return null;
  return contract.vacation_type === 'berilmaydi' ? 0 : contract.vacation_payment;
}

/** Shartnoma davri: `01.09.2025 — 31.08.2026` yoki muddatsiz bo'lsa `01.09.2025 — …`. */
export function contractPeriodParts(contract: SheetContract): {
  start: string;
  end: string | null;
} {
  const fmt = (v: string | null) => {
    const iso = toIsoDate(v);
    return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
  };
  return { start: fmt(contract.contract_start_date), end: fmt(contract.contract_end_date) || null };
}

/**
 * Oylik jadvalidagi «Jami»: backend `total_payout` + ta'til maoshi.
 * Backend ta'til maoshini jamiga kiritmaydi, shuning uchun u shu yerda qo'shiladi
 * (PDF/chop etishda esa hamon backend jami chiqadi).
 */
export function rowGrandTotal(row: SheetRow, contract: SheetContract | null | undefined): number {
  return row.total_payout + (contractVacationPay(contract) ?? 0);
}

/** `staff_schedule|percent|academic_hours` → `contractsCreate.salaryTypeOptions.*` kaliti. */
export function salaryTypeI18nKey(salaryType: string | null | undefined): string | null {
  switch (salaryType) {
    case 'staff_schedule':
      return 'contractsCreate.salaryTypeOptions.shtat';
    case 'percent':
      return 'contractsCreate.salaryTypeOptions.foiz';
    case 'academic_hours':
    case 'hourly':
      return 'contractsCreate.salaryTypeOptions.soat';
    default:
      return null;
  }
}

/** Hujjat raqami: `AV-2026-08-B1` / `OY-2026-08-B1`. */
export function docNumber(
  type: SheetType,
  year: number,
  month: number,
  branchId: number | null | undefined,
): string {
  const prefix = type === 'advance' ? 'AV' : 'OY';
  return `${prefix}-${year}-${String(month).padStart(2, '0')}-B${branchId ?? 0}`;
}

/** Status → i18n kaliti. */
export function statusI18nKey(status: SheetStatus | string | undefined): string {
  return `payrollSheets.status.${status || 'draft'}`;
}

/** Status → CSS modifikatori (badge rangi). */
export function statusClass(status: SheetStatus | string | undefined): string {
  switch (status) {
    case 'approved':
      return 'ps-status--done';
    case 'rejected':
      return 'ps-status--rejected';
    case 'sent':
      return 'ps-status--sent';
    case 'prepared':
      return 'ps-status--progress';
    default:
      return 'ps-status--created';
  }
}

/** Amal shu statusda mumkinmi. Tasdiqlangan vedomost o'zgartirilmaydi. */
export function isActionAvailable(action: SheetAction, status: SheetStatus): boolean {
  switch (action) {
    case 'prepare':
      return status === 'draft' || status === 'rejected';
    case 'send':
      return status === 'prepared';
    case 'approve':
    case 'reject':
      return status === 'sent';
    default:
      return false;
  }
}

/** Amallarning ruxsat kodlari — `PayrollSheetPermissionSeeder`. */
export const ACTION_PERMISSION: Record<SheetAction, string> = {
  prepare: 'payroll_sheets.prepare',
  send: 'payroll_sheets.send',
  approve: 'payroll_sheets.approve',
  reject: 'payroll_sheets.reject',
};

export const SHEET_PERMISSIONS = {
  view: 'payroll_sheets.view',
  /** Vedomost qatorlari va tarixi (`/rows`, `/logs`) — backend `show` talab qiladi. */
  show: 'payroll_sheets.show',
  generate: 'payroll_sheets.generate',
  edit: 'payroll_sheets.edit',
  print: 'payroll_sheets.print',
} as const;

/** Stavkani sarlavhaga qo'shish uchun: `Daromad solig'i 11.9%`. */
export const rateSuffix = (rate: number | null | undefined) =>
  rate === null || rate === undefined ? '' : ` ${rate}%`;

/** Vedomost snapshotidan stavkalar. */
export function sheetRates(sheet: PayrollSheet | null | undefined) {
  return {
    income: sheet?.income_tax_percent ?? null,
    pension: sheet?.pension_fund_percent ?? null,
    social: sheet?.social_tax_percent ?? null,
  };
}

/** Oy selecti uchun i18n kalitlari — `payrollSheets.months.*`. */
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
  return `payrollSheets.months.${MONTH_KEYS[month - 1] ?? 'january'}`;
}

/**
 * Oy selecti variantlari — YANGIDAN ESKIGA: `ahead` oy oldinga, joriy oy va
 * `back` oy orqaga. Ish haqi o'tgan oy uchun ham hisoblanadi (masalan avgust
 * oyligi sentyabrda), taqsimlashlar ham o'tgan davrga yoziladi — ilgari ro'yxat
 * faqat joriy oydan OLDINGA yurardi, shu sabab o'tgan davr vedomostini (va uning
 * taqsimlangan summalarini) ochib bo'lmasdi.
 */
export function monthOptions(
  ahead = 3,
  back = 12,
  from = new Date(),
): { year: number; month: number }[] {
  const list: { year: number; month: number }[] = [];
  for (let i = ahead; i >= -back; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    list.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return list;
}

/** Joriy oy — selectlarning boshlang'ich qiymati (ro'yxat endi uning bilan boshlanmaydi). */
export function currentMonth(from = new Date()): { year: number; month: number } {
  return { year: from.getFullYear(), month: from.getMonth() + 1 };
}

export const monthValue = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

export function parseMonthValue(value: string): { year: number; month: number } {
  const [y, m] = value.split('-');
  return { year: Number(y), month: Number(m) };
}

/**
 * PDF sarlavhasi uchun: backend "2026-08" (`monthValue`) ko'rinishida beradi,
 * bosma hujjatda esa oy nomi bilan chiqishi kerak — masalan "Avgust 2026".
 */
export function formatPeriodLabel(period: string, t: (key: string) => string): string {
  const { year, month } = parseMonthValue(period);
  if (!year || !month) return period;
  return `${t(monthI18nKey(month))} ${year}`;
}
