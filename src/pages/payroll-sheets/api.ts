/* ------------------------------------------------------------------ *
 * Avans / Oylik vedomostlari — API qatlami (react-query hooks).
 *
 * TZ «АВАНС ВА ОЙЛИК ҲИСОБЛАШ» bo'yicha `/payroll/sheets`:
 *   GET  /payroll/sheets                    ?branch_id&year&month&type&status
 *   POST /payroll/sheets/generate           { branch_id, year, month, type }
 *   GET  /payroll/sheets/{id}
 *   GET  /payroll/sheets/{id}/rows          ?department_id&last_name&first_name&middle_name
 *   PUT  /payroll/sheets/{id}/rows/{rowId}  { kpi_amount, note }
 *   POST /payroll/sheets/{id}/prepare | send | approve | reject{reason}
 *   POST /payroll/sheets/{id}/revert        { reason }   (faqat admin panel)
 *   GET  /payroll/sheets/{id}/print         ?employee_ids[]&department_id
 *   GET  /payroll/sheets/{id}/logs
 *
 * baseURL `/api` bilan tugaydi.
 * ------------------------------------------------------------------ */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type SilentForbiddenConfig } from '@/api/api';
import type {
  FundCheck,
  GeneratePayload,
  PayrollSheet,
  PrintPayload,
  SheetAction,
  SheetContract,
  SheetLog,
  SheetPosting,
  SheetRow,
  SheetType,
} from './types';

const BASE = '/payroll/sheets';

const cleanParams = (obj: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);

/** Nom matn ham, ko'p tilli obyekt ham bo'lishi mumkin. */
function asText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const obj = value as Raw;
    const name = obj.name_uz ?? obj.name ?? obj.label ?? obj.full_name;
    return typeof name === 'string' ? name.trim() : '';
  }
  return '';
}

/** Laravel resurs javobini ochadi: `{data: ...}` yoki xom qiymat. */
function unwrap(data: unknown): unknown {
  if (data && typeof data === 'object' && 'data' in (data as Raw)) return (data as Raw).data;
  return data;
}

function toSheet(raw: Raw): PayrollSheet {
  const branch = raw.branch ?? raw.branch_name;
  return {
    id: num(raw.id),
    type: (raw.type as SheetType) ?? 'advance',
    branch_id: num(raw.branch_id),
    branch_name: asText(branch) || null,
    year: num(raw.year),
    month: num(raw.month),
    status: (raw.status as PayrollSheet['status']) ?? 'draft',
    income_tax_percent: numOrNull(raw.income_tax_percent),
    pension_fund_percent: numOrNull(raw.pension_fund_percent),
    social_tax_percent: numOrNull(raw.social_tax_percent),
    tax_on_cash: Boolean(raw.tax_on_cash),
    approved_at: (raw.approved_at as string) ?? null,
    generated_at: (raw.generated_at as string) ?? null,
    director_name: asText(raw.director_name ?? raw.approved_by) || null,
    // Backend ustuni `rejection_reason` (`reject_reason`/`reason` — eski taxminlar).
    reject_reason: (raw.rejection_reason ?? raw.reject_reason ?? raw.reason ?? null) as
      | string
      | null,
  };
}

function toRow(raw: Raw, index: number): SheetRow {
  const employee = (raw.employee ?? {}) as Raw;
  return {
    id: num(raw.id) || index + 1,
    employee_id: num(raw.employee_id ?? employee.id),
    employee_name: asText(raw.employee_name ?? employee.full_name ?? employee),
    position_name: asText(raw.position_name ?? raw.position ?? employee.position),
    department_name: asText(raw.department_name ?? raw.department ?? employee.department),
    department_id: numOrNull(raw.department_id ?? employee.department_id),
    // Pedagog belgisi bo'lmasa foizli sxema pedagogni bildiradi.
    is_pedagog:
      raw.is_pedagog !== undefined
        ? Boolean(raw.is_pedagog)
        : String(raw.scheme ?? '') === 'percent',
    oklad: num(raw.oklad),
    advance_cashless: num(raw.advance_cashless),
    advance_cash: num(raw.advance_cash),
    salary_cashless: num(raw.salary_cashless),
    salary_cash: num(raw.salary_cash),
    adjustment_amount: num(raw.adjustment_amount),
    kpi_amount: num(raw.kpi_amount),
    fines_amount: num(raw.fines_amount),
    income_tax_amount: num(raw.income_tax_amount),
    pension_fund_amount: num(raw.pension_fund_amount),
    social_tax_amount: num(raw.social_tax_amount),
    total_payout: num(raw.total_payout),
    note: (raw.note as string) ?? null,
    created_at: (raw.created_at as string) ?? null,
  };
}

export interface SheetFilters {
  type: SheetType;
  branch_id: number | null;
  year: number;
  month: number;
}

/**
 * Filial + oy + tur bo'yicha vedomost. Vedomost unique, shuning uchun
 * ro'yxatdan birinchi element olinadi; hali generatsiya qilinmagan bo'lsa `null`.
 */
export function useSheet(filters: SheetFilters, enabled = true) {
  return useQuery<PayrollSheet | null>({
    queryKey: ['payroll-sheet', filters],
    enabled: enabled && filters.branch_id != null,
    queryFn: async () => {
      const { data } = await API.get(BASE, { params: cleanParams({ ...filters }) });
      const payload = unwrap(data);
      const first = Array.isArray(payload) ? payload[0] : payload;
      return first ? toSheet(first as Raw) : null;
    },
    staleTime: 60 * 1000,
  });
}

export interface RowFilters {
  department_id?: string;
  /** Qidiruv (FISh) — backend familiya/ism/otasining ismi bo'yicha filtrlaydi. */
  last_name?: string;
}

/**
 * Vedomost qatorlari. Bo'lim va FISh filtrlari SERVERDA bajariladi
 * (`department_id`, `last_name`), `total` — xodimlar soni.
 */
export function useSheetRows(sheetId: number | null, filters: RowFilters, enabled = true) {
  return useQuery<{ rows: SheetRow[]; total: number }>({
    queryKey: ['payroll-sheet-rows', sheetId, filters],
    enabled: enabled && sheetId != null,
    queryFn: async () => {
      const { data } = await API.get(`${BASE}/${sheetId}/rows`, {
        params: cleanParams({ ...filters }),
      });
      const list = unwrap(data);
      const rows: Raw[] = Array.isArray(list) ? (list as Raw[]) : [];
      return {
        rows: rows.map(toRow),
        total: num((data as Raw)?.total) || rows.length,
      };
    },
    // Faqat SHU vedomost filtri o'zgarganda eski qatorlar tursin; boshqa filial/vedomost
    // qatorlari (masalan Eski shahar) boshqa filialda ko'rinib qolmasin.
    placeholderData: (prev, prevQuery) =>
      prevQuery && prevQuery.queryKey[1] === sheetId ? prev : undefined,
    staleTime: 60 * 1000,
  });
}

function toContract(raw: Raw): SheetContract {
  const employee = (raw.employee ?? {}) as Raw;
  const fullName =
    asText(employee.full_name) ||
    [employee.last_name, employee.first_name, employee.middle_name]
      .filter((v) => typeof v === 'string' && v)
      .join(' ');
  return {
    id: num(raw.id),
    employee_id: num(raw.employee_id ?? employee.id),
    contract_number: raw.contract_number == null ? '' : String(raw.contract_number),
    status: String(raw.status ?? ''),
    contract_start_date: (raw.contract_start_date as string) || null,
    contract_end_date: (raw.contract_end_date as string) || null,
    employee_name: fullName,
    position_name: asText(raw.position),
    department_name: asText(raw.department),
    department_id: numOrNull(raw.department_id ?? (raw.department as Raw | null)?.id),
    branch_id: numOrNull(raw.branch_id ?? employee.branch_id),
    salary_type: String(raw.salary_type ?? raw.monthly_salary_type ?? '') || null,
    working_hours_monthly: num(raw.working_hours_monthly),
    hourly_rate: num(raw.hourly_rate),
    base_salary: num(raw.base_salary),
    total_monthly_salary: num(raw.total_monthly_salary),
    probation_period: (raw.probation_period as string) || null,
    vacation_type: (raw.vacation_type as string) || null,
    vacation_days: num(raw.vacation_days),
    vacation_payment: num(raw.vacation_payment),
  };
}

/**
 * Xodimlar shartnomalari (`GET /contracts`) — Oylik jadvalida shartnomasi bor
 * xodimlarni ajratish va shartnoma ma'lumotini (ta'til maoshi va h.k.) chiqarish uchun.
 *
 * Ruxsat: `employee_contracts.view` — yo'q bo'lsa `enabled=false` beriladi.
 * `skip403Toast`: ruxsat bo'lmasa ham jadval ishlayveradi (shunchaki shartnoma
 * ustunlari bo'sh qoladi), shuning uchun "Ruxsat yo'q" xabari chiqmaydi.
 * Kalit `['contracts', …]` — shartnomalar sahifasi `['contracts']`ni invalidatsiya
 * qilganda bu ham yangilanadi.
 */
export function useEmployeeContracts(enabled: boolean) {
  return useQuery<SheetContract[]>({
    queryKey: ['contracts', 'payroll-sheet'],
    enabled,
    retry: false,
    queryFn: async () => {
      const config: SilentForbiddenConfig = { skip403Toast: true };
      const { data } = await API.get('/contracts', config);
      const list = unwrap(data);
      return (Array.isArray(list) ? (list as Raw[]) : []).map(toContract);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Harakatlar tarixi. */
export function useSheetLogs(sheetId: number | null, enabled: boolean) {
  return useQuery<SheetLog[]>({
    queryKey: ['payroll-sheet-logs', sheetId],
    enabled: enabled && sheetId != null,
    queryFn: async () => {
      const { data } = await API.get(`${BASE}/${sheetId}/logs`);
      const list = unwrap(data);
      const logs: Raw[] = Array.isArray(list) ? (list as Raw[]) : [];
      return logs.map((log) => ({
        action: String(log.action ?? log.to_status ?? ''),
        user: asText(log.user ?? log.created_by) || null,
        created_at: String(log.created_at ?? ''),
        from_status: (log.from_status as string) ?? null,
        to_status: (log.to_status as string) ?? null,
        note: (log.note as string) ?? null,
      }));
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Chop etish ma'lumoti — faqat tasdiqlangan vedomost uchun.
 * Bo'limlar backendda ajratilgan, sarlavhalar ham tayyor keladi.
 */
export function usePrintData(
  sheetId: number | null,
  params: { employee_ids?: number[]; department_id?: string },
  enabled: boolean,
) {
  return useQuery<PrintPayload>({
    queryKey: ['payroll-sheet-print', sheetId, params],
    enabled: enabled && sheetId != null,
    queryFn: async () => {
      const { data } = await API.get(`${BASE}/${sheetId}/print`, {
        params: cleanParams({
          // Laravel massivni `employee_ids[]` ko'rinishida kutadi.
          'employee_ids[]': params.employee_ids?.length ? params.employee_ids : undefined,
          department_id: params.department_id,
        }),
      });
      const payload = (unwrap(data) ?? {}) as Partial<PrintPayload>;
      return {
        sheet: payload.sheet ?? {
          type_label: '',
          period: '',
          branch_name: '',
          approved_at: null,
          director_name: null,
        },
        departments: payload.departments ?? [],
        grand_totals: payload.grand_totals ?? {},
      };
    },
    staleTime: 60 * 1000,
  });
}

function toFundCheck(raw: Raw | null | undefined): FundCheck | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    jamgarma_id: raw.jamgarma_id == null ? null : num(raw.jamgarma_id),
    jamgarma_name: asText(raw.jamgarma_name),
    need_cash: num(raw.need_cash),
    need_non_cash: num(raw.need_non_cash),
    have_cash: num(raw.have_cash),
    have_non_cash: num(raw.have_non_cash),
    shortfall_cash: num(raw.shortfall_cash),
    shortfall_non_cash: num(raw.shortfall_non_cash),
    sufficient: Boolean(raw.sufficient),
  };
}

export interface GenerateResult {
  sheet: unknown;
  fundCheck: FundCheck | null;
}

/**
 * Generatsiya — filial + oy + tur. Soliq stavkalari filial sozlamasidan olinadi.
 * Javobning `payroll_fund_check` bloki (ish haqi jamg'armasida pul yetarlimi)
 * `fundCheck` bo'lib qaytadi — `unwrap` `data` ichidagini oladi, `payroll_fund_check`
 * esa `data` yonida, shuning uchun alohida o'qiymiz.
 */
export function useGenerateSheet() {
  const qc = useQueryClient();
  return useMutation<GenerateResult, unknown, GeneratePayload>({
    mutationFn: async (body: GeneratePayload) => {
      const { data } = await API.post(`${BASE}/generate`, body);
      return {
        sheet: unwrap(data),
        fundCheck: toFundCheck((data as Raw)?.payroll_fund_check as Raw),
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-sheet'] }),
  });
}

function toPosting(raw: Raw): SheetPosting {
  const jamgarma = (raw.jamgarma ?? null) as Raw | null;
  const expense = (raw.expense ?? null) as Raw | null;
  return {
    direction: String(raw.direction ?? ''),
    cash_amount: num(raw.cash_amount),
    non_cash_amount: num(raw.non_cash_amount),
    status: String(raw.status ?? 'posted'),
    jamgarma: jamgarma ? { id: num(jamgarma.id), name: asText(jamgarma.name_uz ?? jamgarma.name) } : null,
    expense: expense ? { id: num(expense.id), total_amount: num(expense.total_amount) } : null,
  };
}

/**
 * `GET /payroll/sheets/{id}` › `is_posted` + `postings[]` — vedomost
 * tasdiqlanganda jamg'armaga yozilgan pul harakati. Faqat `enabled` bo'lganda
 * (odatda `status === 'approved'`) so'raladi.
 */
export function useSheetPostings(sheetId: number | null, enabled: boolean) {
  return useQuery<{ is_posted: boolean; postings: SheetPosting[] }>({
    queryKey: ['payroll-sheet-postings', sheetId],
    enabled: enabled && sheetId != null,
    queryFn: async () => {
      const { data } = await API.get(`${BASE}/${sheetId}`);
      const raw = (unwrap(data) ?? {}) as Raw;
      const list = Array.isArray(raw.postings) ? (raw.postings as Raw[]) : [];
      return { is_posted: Boolean(raw.is_posted), postings: list.map(toPosting) };
    },
    staleTime: 60 * 1000,
  });
}

/**
 * «Tasdiqni qaytarish» — `POST /payroll/sheets/{id}/revert` (sabab majburiy).
 * Jamg'arma balanslarini tiklaydi, «Ish haqi» chiqimini bekor qiladi, vedomost
 * `sent` holatiga tushadi. Ruxsat: `payroll_sheets.revert`.
 *
 * DIQQAT: bu foydalanuvchi (my.ilmplyus) panelida UI orqali CHAQIRILMAYDI —
 * tasdiqni qaytarish faqat admin panelda. API qatlami ikkala nusxada bir xil
 * turishi uchun shu yerda ham qoldirilgan.
 */
export function useRevertSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { data } = await API.post(`${BASE}/${id}/revert`, { reason });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-sheet'] });
      qc.invalidateQueries({ queryKey: ['payroll-sheet-rows'] });
      qc.invalidateQueries({ queryKey: ['payroll-sheet-logs'] });
      qc.invalidateQueries({ queryKey: ['payroll-sheet-postings'] });
    },
  });
}

/** Workflow: prepare / send / approve / reject. */
export function useSheetAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
    }: {
      id: number;
      action: SheetAction;
      reason?: string;
    }) => {
      const { data } = await API.post(
        `${BASE}/${id}/${action}`,
        action === 'reject' ? { reason } : undefined,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-sheet'] });
      qc.invalidateQueries({ queryKey: ['payroll-sheet-rows'] });
      qc.invalidateQueries({ queryKey: ['payroll-sheet-logs'] });
    },
  });
}

/** KPI va izohni tahrirlash — `payroll_sheets.edit`. */
export function useUpdateRow(sheetId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rowId,
      kpi_amount,
      note,
    }: {
      rowId: number;
      kpi_amount?: number;
      note?: string;
    }) => {
      const { data } = await API.put(`${BASE}/${sheetId}/rows/${rowId}`, { kpi_amount, note });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-sheet-rows', sheetId] }),
  });
}
