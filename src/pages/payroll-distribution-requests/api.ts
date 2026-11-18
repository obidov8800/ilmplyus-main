/* ------------------------------------------------------------------ *
 * Oylik taqsimlash so'rovlari — API qatlami.
 *
 * Xodimning oyligi `/payroll/distributions/{employee}` orqali taqsimlanganda
 * yozuv QORALAMA (`draft`) bo'lib saqlanadi. Tasdiqlangandan keyingina
 * (`approved`) u oylik vedomostga tushadi; tasdiq bekor qilinsa (`revert`)
 * yozuv yana qoralamaga qaytadi va vedomostdan chiqadi. Eski yozuvlar
 * migratsiyada avtomatik `approved` qilingan.
 *
 * Backend (Sanctum Bearer, baseURL `/api`):
 *   GET    /payroll/distributions              ?status&period_year&period_month&branch_id
 *                                               &department_id&last_name&page&per_page
 *   POST   /payroll/distributions/{id}/approve   ruxsat: payroll_distributions.approve  (draft → approved)
 *   POST   /payroll/distributions/{id}/revert    ruxsat: payroll_distributions.revert   (approved → draft)
 *   DELETE /payroll/distributions/{id}           ruxsat: payroll_distributions.delete
 *
 * approve/revert — tanasiz POST; javobi `{ message, data: SalaryDistributionResource }`.
 * Ruxsati yo'q foydalanuvchiga server 403 qaytaradi (xato xabarini global
 * interceptor ko'rsatadi). Har yozuvda `is_editable` bor: `false` bo'lsa
 * («Tahrirlash» va) «O'chirish» tugmalari yashiriladi.
 * ------------------------------------------------------------------ */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';
import { API } from '@/api/api';

export type DistributionStatus = 'draft' | 'approved';
export type DistributionAction = 'approve' | 'revert';

export interface DistributionRequest {
  id: number;
  employee_id: number | null;
  employee_name: string;
  department_name: string;
  position_name: string;
  branch_name: string;
  /** `advance` | `salary` | `combined` (oklad sxemasi — avans+oylik birga). */
  kind: string;
  period_year: number;
  period_month: number;
  status: DistributionStatus;
  /** Backend `is_editable`; `false` bo'lsa o'chirish/tahrirlash yopiq (tasdiqlangan yozuv). */
  is_editable: boolean;
  total_cashless: number;
  advance_cashless: number;
  advance_cash: number;
  payout_cashless: number;
  payout_cash: number;
  privileged_amount: number;
  income_tax_payer: string;
  cash_tax: string;
  note: string | null;
  created_by: string;
  created_at: string | null;
  approved_by: string;
  approved_at: string | null;
}

export interface RequestFilters {
  status: string;
  period_year: string;
  period_month: string;
  branch_id: string;
  department_id: string;
  last_name: string;
}

export interface RequestsPage {
  rows: DistributionRequest[];
  total: number;
  lastPage: number;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || Number.isNaN(n) ? 0 : n;
};

/** Matn ham, `{full_name}` / `{name_uz}` obyekti ham bo'lishi mumkin. */
function text(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const o = value as Raw;
    const v = o.full_name ?? o.name_uz ?? o.name ?? o.label;
    return typeof v === 'string' ? v.trim() : '';
  }
  return '';
}

const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Faqat `approved` kuchga kirgan; qolgan hamma holat (draft/pending/...) — qoralama. */
export function normalizeStatus(value: unknown): DistributionStatus {
  const s = String(value ?? '').toLowerCase();
  return s === 'approved' || s === 'confirmed' ? 'approved' : 'draft';
}

/**
 * `is_editable` — backend belgilaydi. Kelmasa (eski javob) holatdan olinadi:
 * qoralamani o'zgartirish/o'chirish mumkin, tasdiqlanganini — yo'q.
 */
function readEditable(value: unknown, status: DistributionStatus): boolean {
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  return status === 'draft';
}

function toRequest(raw: Raw): DistributionRequest {
  const employee = (raw.employee ?? {}) as Raw;
  const period = (raw.period ?? {}) as Raw;
  const status = normalizeStatus(raw.status);
  return {
    id: num(raw.id),
    employee_id: raw.employee_id != null ? num(raw.employee_id) : employee.id != null ? num(employee.id) : null,
    employee_name: text(raw.employee_name) || text(employee),
    department_name: text(raw.department_name ?? employee.department ?? raw.department),
    position_name: text(raw.position_name ?? employee.position ?? raw.position),
    branch_name: text(raw.branch_name ?? employee.branch ?? raw.branch),
    kind: String(raw.kind ?? ''),
    period_year: num(raw.period_year ?? period.year),
    period_month: num(raw.period_month ?? period.month),
    status,
    is_editable: readEditable(raw.is_editable, status),
    total_cashless: num(raw.total_cashless),
    advance_cashless: num(raw.advance_cashless),
    advance_cash: num(raw.advance_cash),
    payout_cashless: num(raw.payout_cashless),
    payout_cash: num(raw.payout_cash),
    privileged_amount: num(raw.privileged_amount),
    income_tax_payer: String(raw.income_tax_payer ?? ''),
    cash_tax: String(raw.cash_tax ?? ''),
    note: (raw.note as string) || null,
    created_by: text(raw.created_by),
    created_at: dateOrNull(raw.created_at),
    approved_by: text(raw.approved_by ?? raw.approver),
    approved_at: dateOrNull(raw.approved_at),
  };
}

const cleanParams = (obj: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );

/**
 * Ro'yxat xatosida (masalan 403) toast takrorlanmasin — sahifa o'zi xabar ko'rsatadi.
 * `skip403Toast` — user panel, `silentError` — admin panel interceptori.
 */
const QUIET = { skip403Toast: true, silentError: true } as unknown as AxiosRequestConfig;

export const PER_PAGE = 20;

export function useDistributionRequests(filters: RequestFilters, page: number) {
  return useQuery<RequestsPage>({
    queryKey: ['payroll-distribution-requests', filters, page],
    retry: false,
    queryFn: async () => {
      const { data } = await API.get('/payroll/distributions', {
        ...QUIET,
        params: cleanParams({ ...filters, page, per_page: PER_PAGE }),
      });
      const list = Array.isArray(data) ? data : ((data as Raw)?.data ?? []);
      const meta = (data as Raw)?.meta as Raw | undefined;
      const rows = (Array.isArray(list) ? (list as Raw[]) : []).map(toRequest);
      return {
        // Backend `status` filtrini bilmasa ham tab to'g'ri ko'rinsin.
        rows: filters.status ? rows.filter((r) => r.status === filters.status) : rows,
        total: num(meta?.total) || rows.length,
        lastPage: num(meta?.last_page) || 1,
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
}

/**
 * Davr + filial bo'yicha TASDIQLANGAN taqsimlashlar — vedomost sahifasi ularning
 * vedomostga kirganini tekshiradi. Backend taqsimlash tasdiqlanganda vedomostni
 * o'zi yangilamaydi: summalar faqat vedomost (qayta) generatsiya qilinganda tushadi.
 * Ruxsat `payroll_distributions.view`; yo'q bo'lsa (403) xabar chiqmaydi.
 */
export function useApprovedDistributions(
  params: { branch_id: number | null; year: number; month: number },
  enabled: boolean,
) {
  return useQuery<DistributionRequest[]>({
    // `payroll-distribution-requests` prefiksi — tasdiq/qaytarish/o'chirishdan keyin yangilanadi.
    queryKey: ['payroll-distribution-requests', 'approved-for-sheet', params],
    enabled: enabled && params.branch_id != null,
    retry: false,
    queryFn: async () => {
      const { data } = await API.get('/payroll/distributions', {
        ...QUIET,
        params: {
          status: 'approved',
          period_year: params.year,
          period_month: params.month,
          branch_id: params.branch_id,
          per_page: 200,
        },
      });
      const list = Array.isArray(data) ? data : ((data as Raw)?.data ?? []);
      return (Array.isArray(list) ? (list as Raw[]) : [])
        .map(toRequest)
        .filter((d) => d.status === 'approved');
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Shu xodim + davr + tur uchun saqlangan taqsimlash (bo'lsa). Taqsimlash formasi
 * uni qayta saqlay olmaydi — backend takrorni 422 («allaqachon mavjud») bilan
 * rad etadi, tahrirlash esa `PUT /payroll/distributions/{id}` orqali (bu panelda yopiq).
 * Forma shu orqali oldindan ogohlantiradi. Ruxsat `payroll_distributions.view`.
 * `kind`: foizli xodim — `advance`/`salary`, oklad — `combined`.
 */
export function useExistingDistribution(
  params: { employee_id: string | undefined; year: number; month: number; kind: string; branch_id?: number },
  enabled: boolean,
) {
  return useQuery<DistributionRequest | null>({
    queryKey: ['payroll-distribution-requests', 'existing', params],
    enabled: enabled && !!params.employee_id,
    retry: false,
    queryFn: async () => {
      const { data } = await API.get('/payroll/distributions', {
        ...QUIET,
        params: {
          employee_id: params.employee_id,
          period_year: params.year,
          period_month: params.month,
          kind: params.kind,
          branch_id: params.branch_id,
          per_page: 20,
        },
      });
      const list = Array.isArray(data) ? data : ((data as Raw)?.data ?? []);
      // Taqsimlash filial kesimida: boshqa filialdagi taqsimot bu filial formasini yopmasin.
      const sameBranch = (r: Raw) => {
        const b = (r.employee as Raw | undefined)?.branch_id ?? r.branch_id;
        return params.branch_id == null || b == null || Number(b) === Number(params.branch_id);
      };
      const rows = (Array.isArray(list) ? (list as Raw[]) : []).filter(sameBranch).map(toRequest);
      return rows[0] ?? null;
    },
    staleTime: 0,
  });
}

/** Tasdiq/qoralama o'zgarganda tegishli ro'yxatlar yangilanadi. */
function useRefreshAfterChange() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['payroll-distribution-requests'] });
    // Taqsimlash formasi (`/payroll/distributions/form/...`) va vedomost
    // (faqat tasdiqlangan taqsimot tushadi) ham o'zgargan bo'lishi mumkin.
    qc.invalidateQueries({ queryKey: ['payroll-distribution-form'] });
    qc.invalidateQueries({ queryKey: ['payroll-sheet'] });
    qc.invalidateQueries({ queryKey: ['payroll-sheet-rows'] });
  };
}

/** Tasdiqlash (draft → approved) yoki tasdiqdan qaytarish (approved → draft). */
export function useDistributionAction() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: DistributionAction }) => {
      const { data } = await API.post(`/payroll/distributions/${id}/${action}`);
      return data as { message?: string; data?: Raw };
    },
    onSuccess: refresh,
  });
}

/** Qoralama taqsimlashni o'chirish (faqat `is_editable` bo'lganda). */
export function useDeleteDistribution() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await API.delete(`/payroll/distributions/${id}`);
      return data as { message?: string };
    },
    onSuccess: refresh,
  });
}

/** Ro'yxat 404/405 qaytargan bo'lsa — backend endpointi yo'q. */
export function isBackendMissing(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 405;
}
