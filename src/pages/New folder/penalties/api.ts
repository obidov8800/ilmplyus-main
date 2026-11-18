/* ------------------------------------------------------------------ *
 * Jarimalar — API qatlami (react-query hooks). Mock yo'q.
 *
 *   GET    /fine-types                        fine_types.view
 *   POST   /fine-types                        .create
 *   PUT    /fine-types/{id}                   .edit
 *   DELETE /fine-types/{id}                   .delete
 *
 *   GET    /employee-fines                    employee_fines.view
 *          ?period_year&period_month&branch_id&department_id&employee_id
 *          &last_name&first_name&middle_name&status&fine_type_id
 *   POST   /employee-fines                    .create
 *   PUT    /employee-fines/{id}               .edit
 *   PATCH  /employee-fines/{id}/accept        .accept
 *   PATCH  /employee-fines/{id}/cancel        .cancel
 *   DELETE /employee-fines/{id}               .edit  (alohida delete ruxsati yo'q)
 *
 * baseURL `/api` bilan tugaydi.
 * ------------------------------------------------------------------ */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/hooks/usePermission';
import { fetchOptions } from '@/api/options';
import { API } from '@/api/api';
import type { EmployeeFine, FineFilters, FineForm, FineStatus, FineType } from './types';

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

const pick = (raw: Raw, ...keys: string[]): unknown => {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

function unwrapList(data: unknown): Raw[] {
  if (Array.isArray(data)) return data as Raw[];
  const inner = (data as Raw)?.data;
  return Array.isArray(inner) ? (inner as Raw[]) : [];
}

/* ------------------------------ Jarima turlari ------------------------------ */

function toFineType(raw: Raw): FineType {
  return {
    id: num(raw.id),
    // Backend nomni `name_uz` sifatida qaytaradi — `name`/`title` esa zaxira.
    name: asText(raw.name_uz ?? raw.name ?? raw.title),
    amount: num(pick(raw, 'amount', 'default_amount')),
  };
}

export function useFineTypes(enabled = true) {
  // «Bir sahifa — bir ruxsat»: jarima turlari sahifasiga ruxsat bo'lmasa — tanlov ro'yxatidan (`lookups.view`).
  const canViewTypes = usePermission('fine_types.view');
  return useQuery<FineType[]>({
    queryKey: ['fine-types', canViewTypes],
    enabled,
    queryFn: async () => {
      if (!canViewTypes) {
        const rows = await fetchOptions('fine-types', undefined, { skip403Toast: true });
        return rows.map((o) => toFineType({ id: o.id, name_uz: o.label, name_ru: o.label, name_en: o.label, amount: o.amount }));
      }
      const { data } = await API.get('/fine-types');
      return unwrapList(data).map(toFineType);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/*
 * Jarima turlarini yaratish/tahrirlash/o'chirish endi shu ilovada emas —
 * Ilmplyus Dashboard (admin panel) → Moliya → Jarima turlari sahifasida.
 * Shu sabab `useSaveFineType`/`useDeleteFineType` olib tashlandi; `useFineTypes`
 * (yuqorida) faqat o'qish uchun qoladi — ikkala ilova ham bitta backendga
 * ulanadi, shuning uchun u yerda qo'shilgan tur bu yerda darhol ko'rinadi.
 */

/* ---------------------------- Xodim jarimalari ---------------------------- */

function toFine(raw: Raw): EmployeeFine {
  const employee = (raw.employee ?? {}) as Raw;
  const fineType = (raw.fine_type ?? raw.fineType ?? {}) as Raw;
  return {
    id: num(raw.id),
    employee_id: num(raw.employee_id ?? employee.id),
    employee_code: String(pick(raw, 'employee_code') ?? employee.employee_code ?? ''),
    full_name: asText(raw.employee_name ?? employee.full_name ?? employee),
    position_name: asText(raw.position_name ?? raw.position ?? employee.position),
    department_name: asText(raw.department_name ?? raw.department ?? employee.department),
    branch_name: asText(raw.branch_name ?? raw.branch ?? employee.branch),
    fine_type_id: num(raw.fine_type_id ?? fineType.id),
    fine_type_name: asText(raw.fine_type_name ?? fineType.name ?? fineType),
    amount: num(pick(raw, 'amount')),
    status: (String(raw.status ?? 'new') as FineStatus) || 'new',
    note: (pick(raw, 'note', 'comment') as string) ?? null,
    // Sana maydoni nomi bir necha variantda bo'lishi mumkin.
    date: (pick(raw, 'date', 'fine_date', 'given_at') as string) ?? null,
  };
}

export interface FinesPage {
  rows: EmployeeFine[];
  total: number;
  lastPage: number;
}

/**
 * Jarimalar ro'yxati. «Qidiruv» maydoni familiya bo'yicha `last_name` ga
 * yuboriladi; sonli qiymat kiritilsa `employee_id` deb qabul qilinadi.
 */
export function useFines(filters: FineFilters, page: number) {
  return useQuery<FinesPage>({
    queryKey: ['employee-fines', filters, page],
    queryFn: async () => {
      const search = filters.search.trim();
      const isNumeric = search !== '' && /^\d+$/.test(search);
      const { data } = await API.get('/employee-fines', {
        params: cleanParams({
          period_year: filters.period_year,
          period_month: filters.period_month,
          branch_id: filters.branch_id,
          department_id: filters.department_id,
          status: filters.status,
          employee_id: isNumeric ? search : undefined,
          last_name: isNumeric ? undefined : search,
          page,
        }),
      });
      const rows = unwrapList(data).map(toFine);
      const meta = (data as Raw)?.meta as Raw | undefined;
      return {
        rows,
        total: num(meta?.total) || rows.length,
        lastPage: num(meta?.last_page) || 1,
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
}

/**
 * Jarima kiritish / tahrirlash.
 *
 * DIQQAT: backend sana maydonini `date` emas, `fine_date` deb kutadi
 * ("The fine date field is required" xatosi shundan kelib chiqqan edi).
 * `amount` bo'sh qoldirilsa yuborilmaydi va backend turdagi standart
 * summani qo'yadi.
 */
export function useSaveFine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, form }: { id: number | null; form: FineForm }) => {
      const body = cleanParams({
        employee_id: Number(form.employee_id),
        fine_type_id: Number(form.fine_type_id),
        fine_date: form.date,
        amount: form.amount === '' ? undefined : Number(form.amount),
        note: form.note.trim() || undefined,
        branch_id: form.branch_id ? Number(form.branch_id) : undefined,
      });
      const { data } = id
        ? await API.put(`/employee-fines/${id}`, body)
        : await API.post('/employee-fines', body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-fines'] }),
  });
}

/** Qabul qilish / bekor qilish. */
export function useFineDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'accept' | 'cancel' }) => {
      const { data } = await API.patch(`/employee-fines/${id}/${action}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-fines'] });
      // Qabul qilingan jarima oylik vedomostiga tushadi.
      qc.invalidateQueries({ queryKey: ['payroll-sheet-rows'] });
    },
  });
}

export function useDeleteFine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await API.delete(`/employee-fines/${id}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-fines'] }),
  });
}
