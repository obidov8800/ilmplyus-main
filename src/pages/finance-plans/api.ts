/* ------------------------------------------------------------------ *
 * Moliyaviy rejalar — API qatlami (react-query hooks).
 *
 * `/financial-plans`:
 *   GET    /financial-plans                    ?branch_id&status&year&month&distribution_mode
 *   GET    /financial-plans/prefill             ?branch_id&year&month  (oldingi oydan nusxa)
 *   POST   /financial-plans/calculate            (saqlamasdan hisoblash)
 *   POST|GET|PUT /financial-plans[/{id}]
 *   POST   /financial-plans/{id}/send            { distribution_mode }
 *   POST   /financial-plans/{id}/approve
 *   POST   /financial-plans/{id}/reject          { reason }
 *   POST   /financial-plans/{id}/cancel          { reason? }
 *   GET    /financial-plans/{id}/analysis
 *   GET    /financial-plans/{id}/logs            ?action
 *
 * baseURL `/api` bilan tugaydi.
 * ------------------------------------------------------------------ */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API } from '@/api/api';
import type {
  DistributionMode,
  FinancialPlan,
  PlanAction,
  PlanAnalysis,
  PlanAnalysisRow,
  PlanItem,
  PlanLog,
  PlanPayload,
  PlanStatus,
} from './types';
export type { PlanAction } from './types';
import { docNumber } from './helpers';

const BASE = '/financial-plans';

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

function toItem(raw: Raw): PlanItem {
  const jamgarma = raw.jamgarma ?? raw.jamgarma_name;
  return {
    id: numOrNull(raw.id) ?? undefined,
    jamgarma_id: num(raw.jamgarma_id ?? (raw.jamgarma as Raw)?.id),
    jamgarma_name: asText(jamgarma) || undefined,
    calculation_type: (raw.calculation_type as PlanItem['calculation_type']) ?? 'percent',
    percent: num(raw.percent),
    amount: num(raw.amount),
  };
}

function toPlan(raw: Raw): FinancialPlan {
  const branch = raw.branch ?? raw.branch_name;
  const items = Array.isArray(raw.items) ? (raw.items as Raw[]).map(toItem) : [];
  const totalPercent = raw.total_percent !== undefined
    ? num(raw.total_percent)
    : items.reduce((sum, i) => sum + i.percent, 0);
  const year = num(raw.year);
  const month = num(raw.month);

  return {
    id: num(raw.id),
    doc_number: asText(raw.doc_number ?? raw.code ?? raw.number) || docNumber(year, month),
    branch_id: num(raw.branch_id),
    branch_name: asText(branch) || null,
    year,
    month,
    planned_income: num(raw.planned_income),
    distribution_mode: (raw.distribution_mode as DistributionMode) ?? null,
    status: (raw.status as PlanStatus) ?? 'draft',
    total_percent: totalPercent,
    reject_reason: (raw.reject_reason ?? raw.reason ?? null) as string | null,
    created_by: asText(raw.created_by ?? raw.creator) || null,
    created_at: (raw.created_at as string) ?? null,
    copied_from_plan_id: numOrNull(raw.copied_from_plan_id),
    items,
  };
}

function toAnalysisRow(raw: Raw): PlanAnalysisRow {
  const jamgarma = raw.jamgarma ?? raw.jamgarma_name;
  return {
    jamgarma_id: num(raw.jamgarma_id ?? (raw.jamgarma as Raw)?.id),
    jamgarma_name: asText(jamgarma),
    planned_percent: num(raw.planned_percent),
    actual_percent: num(raw.actual_percent),
    planned_amount: num(raw.planned_amount),
    actual_allocated: num(raw.actual_allocated),
    spent: num(raw.spent),
    balance: num(raw.balance),
    diff_amount: num(raw.diff_amount),
    diff_percent: num(raw.diff_percent),
    fulfillment_percent: num(raw.fulfillment_percent),
  };
}

function toAnalysis(raw: Raw): PlanAnalysis {
  const plan = (raw.plan ?? raw) as Raw;
  const rows = Array.isArray(raw.rows ?? raw.items)
    ? ((raw.rows ?? raw.items) as Raw[]).map(toAnalysisRow)
    : [];
  return {
    plan: toPlan(plan),
    planned_income: num(raw.planned_income ?? plan.planned_income),
    actual_income: num(raw.actual_income),
    actual_spent: num(raw.actual_spent),
    net_result: num(raw.net_result ?? (num(raw.actual_income) - num(raw.actual_spent))),
    income_fulfillment_percent: num(raw.income_fulfillment_percent ?? raw.fulfillment_percent),
    bep_reached: raw.bep_reached === undefined || raw.bep_reached === null
      ? null
      : Boolean(raw.bep_reached),
    rows,
  };
}

export interface PlanFilters {
  branch_id?: string | number;
  status?: PlanStatus | '';
  year?: number;
  month?: number;
  distribution_mode?: DistributionMode | '';
}

export function usePlans(filters: PlanFilters, enabled = true) {
  return useQuery<FinancialPlan[]>({
    queryKey: ['financial-plans', filters],
    enabled,
    queryFn: async () => {
      const { data } = await API.get(BASE, { params: cleanParams({ ...filters }) });
      const list = unwrap(data);
      const rows: Raw[] = Array.isArray(list) ? (list as Raw[]) : [];
      return rows.map(toPlan);
    },
    staleTime: 30 * 1000,
  });
}

export function usePlan(id: number | null) {
  return useQuery<FinancialPlan | null>({
    queryKey: ['financial-plan', id],
    enabled: id != null,
    queryFn: async () => {
      const { data } = await API.get(`${BASE}/${id}`);
      const payload = unwrap(data);
      return payload ? toPlan(payload as Raw) : null;
    },
    staleTime: 30 * 1000,
  });
}

export function usePlanAnalysis(id: number | null, enabled = true) {
  return useQuery<PlanAnalysis | null>({
    queryKey: ['financial-plan-analysis', id],
    enabled: enabled && id != null,
    queryFn: async () => {
      const { data } = await API.get(`${BASE}/${id}/analysis`);
      const payload = unwrap(data);
      return payload ? toAnalysis(payload as Raw) : null;
    },
    staleTime: 30 * 1000,
  });
}

export function usePlanLogs(id: number | null, enabled: boolean) {
  return useQuery<PlanLog[]>({
    queryKey: ['financial-plan-logs', id],
    enabled: enabled && id != null,
    queryFn: async () => {
      const { data } = await API.get(`${BASE}/${id}/logs`);
      const list = unwrap(data);
      const rows: Raw[] = Array.isArray(list) ? (list as Raw[]) : [];
      return rows.map((log) => ({
        action: String(log.action ?? log.to_status ?? ''),
        field: (log.field as string) ?? null,
        old_value: (log.old_value as string) ?? null,
        new_value: (log.new_value as string) ?? null,
        user: asText(log.user ?? log.created_by) || null,
        created_at: String(log.created_at ?? ''),
        from_status: (log.from_status as string) ?? null,
        to_status: (log.to_status as string) ?? null,
      }));
    },
    staleTime: 30 * 1000,
  });
}

/** Oldingi oy rejasidan nusxa — jamg'arma va foizlarni oldindan to'ldirish. */
export function usePrefillPlan() {
  return useMutation({
    mutationFn: async (params: { branch_id: number; year: number; month: number }) => {
      const { data } = await API.get(`${BASE}/prefill`, { params });
      const payload = unwrap(data);
      return payload ? toPlan(payload as Raw) : null;
    },
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PlanPayload) => {
      const { data } = await API.post(BASE, body);
      return unwrap(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['financial-plans'] }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: PlanPayload }) => {
      const { data } = await API.put(`${BASE}/${id}`, body);
      return unwrap(data);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['financial-plans'] });
      qc.invalidateQueries({ queryKey: ['financial-plan', vars.id] });
    },
  });
}

export function usePlanAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
      distribution_mode,
    }: {
      id: number;
      action: PlanAction;
      reason?: string;
      distribution_mode?: DistributionMode;
    }) => {
      const body =
        action === 'send'
          ? { distribution_mode }
          : action === 'reject' || action === 'cancel'
            ? { reason }
            : undefined;
      const { data } = await API.post(`${BASE}/${id}/${action}`, body);
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['financial-plans'] });
      qc.invalidateQueries({ queryKey: ['financial-plan', vars.id] });
      qc.invalidateQueries({ queryKey: ['financial-plan-logs', vars.id] });
    },
  });
}
