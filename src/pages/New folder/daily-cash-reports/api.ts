/* ------------------------------------------------------------------ *
 * Kunlik kassa hisobotlari — API qatlami (react-query hooks).
 * baseURL allaqachon `/api` bilan tugaydi (api.ts), shuning uchun bu yerda
 * yo'llar `/daily-cash-reports` dan boshlanadi.
 * ------------------------------------------------------------------ */
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { API, type SilentForbiddenConfig } from '@/api/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { sortByNewest } from '@/utils/sortByNewest';
import type {
  CorrectPayload,
  DailyCashReport,
  FullReport,
  ReportDetails,
  ReportLog,
  ReportsPage,
  WorkflowAction,
} from './types';

/** Bo'sh (undefined/null/'') parametrlarni so'rovga qo'shmaymiz. */
const cleanParams = (obj: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );

export interface ReportsFilters {
  branch_id?: string;
  status?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  per_page?: string;
}

const FALLBACK_PER_PAGE = 20;

/** Hisobotlar ro'yxati — server tomonda sahifalanadi. */
export function useReports(filters: ReportsFilters, page: number) {
  return useQuery<ReportsPage>({
    queryKey: ['daily-cash-reports', filters, page],
    queryFn: async () => {
      const { data } = await API.get('/daily-cash-reports', {
        params: cleanParams({ ...filters, page }),
      });
      const rows: DailyCashReport[] = Array.isArray(data) ? data : (data?.data ?? []);
      const meta = data?.meta;
      return {
        rows: sortByNewest(Array.isArray(rows) ? rows : []),
        total: meta?.total ?? rows.length,
        perPage: meta?.per_page ?? (Number(filters.per_page) || FALLBACK_PER_PAGE),
        lastPage: meta?.last_page ?? 1,
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
}

/** To'liq bitta hisobot — mas'ul shaxslar (kassir/yordamchi/buxgalter) uchun. */
export function useReport(id: number | null) {
  return useQuery<FullReport>({
    queryKey: ['daily-cash-report', id],
    enabled: id != null,
    queryFn: async () => {
      const { data } = await API.get(`/daily-cash-reports/${id}`);
      return (data?.data ?? data) as FullReport;
    },
    staleTime: 60 * 1000,
  });
}

/** «Batafsil» — Баланс / Чиқим / Қолдиқ. */
export function useReportDetails(id: number | null) {
  return useQuery<ReportDetails>({
    queryKey: ['daily-cash-report-details', id],
    enabled: id != null,
    queryFn: async () => {
      const { data } = await API.get(`/daily-cash-reports/${id}/details`);
      return {
        balance: data?.balance ?? [],
        expenses: data?.expenses ?? [],
        remainder: data?.remainder ?? [],
        totals: data?.totals ?? {},
      } as ReportDetails;
    },
    staleTime: 60 * 1000,
  });
}

/** Audit jurnal (status o'zgarishlari). */
export function useReportLogs(id: number | null) {
  return useQuery<ReportLog[]>({
    queryKey: ['daily-cash-report-logs', id],
    enabled: id != null,
    queryFn: async () => {
      const { data } = await API.get(`/daily-cash-reports/${id}/logs`);
      return sortByNewest(Array.isArray(data) ? data : (data?.data ?? []));
    },
    staleTime: 60 * 1000,
  });
}

export interface CloseShiftBranch {
  id: number;
  label: string;
}

interface CloseShiftFailure {
  branch: string;
  message: string;
}

export interface CloseAllShiftsResult {
  /** Smenasi yopilgan filiallar. */
  closed: string[];
  /** Yopilmadi, lekin xato emas (422): masalan bugun to'lov yo'q yoki smena allaqachon yopilgan. */
  skipped: CloseShiftFailure[];
  /** Kutilmagan xato (ruxsat yo'q, server xatosi…). */
  failed: CloseShiftFailure[];
}

/**
 * Smenani yopish — foydalanuvchi ishlay oladigan HAMMA filial uchun (bugungi kun) birin-ketin; har biri uchun
 * backend alohida hisobot shakllantiradi. Bitta filialning xatosi qolganlarini to'xtatmaydi; natija umumiy
 * xulosa sifatida qaytadi (xato toastlari filial bo'yicha alohida chiqmaydi — `silentError`).
 */
export function useCloseAllShifts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branches: CloseShiftBranch[]): Promise<CloseAllShiftsResult> => {
      const result: CloseAllShiftsResult = { closed: [], skipped: [], failed: [] };
      for (const branch of branches) {
        try {
          await API.post(
            '/daily-cash-reports/close-shift',
            { branch_id: branch.id },
            { silentError: true } as SilentForbiddenConfig,
          );
          result.closed.push(branch.label);
        } catch (error) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          const item = { branch: branch.label, message: getApiErrorMessage(error, '') };
          (status === 422 ? result.skipped : result.failed).push(item);
        }
      }
      return result;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['daily-cash-reports'] }),
  });
}

/** Workflow amallari: send / accept / approve / return / correct. */
export function useWorkflowAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
      payload,
    }: {
      id: number;
      action: WorkflowAction;
      reason?: string;
      payload?: CorrectPayload;
    }) => {
      let body: unknown;
      if (action === 'return') body = { reason };
      else if (action === 'correct') body = payload;
      const { data } = await API.post(`/daily-cash-reports/${id}/${action}`, body);
      return data;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['daily-cash-reports'] });
      qc.invalidateQueries({ queryKey: ['daily-cash-report-details', id] });
      qc.invalidateQueries({ queryKey: ['daily-cash-report-logs', id] });
    },
  });
}
