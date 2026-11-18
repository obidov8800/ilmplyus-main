import type { AxiosRequestConfig } from 'axios';
import { API } from './api';
import { isPriceInEffect } from './preschool';
import {
  PRESCHOOL_CONTRACT_TYPE,
  type PreschoolContract,
  type PreschoolContractForm,
} from '@/types/preschoolContract.types';

/** Xato toast'i chiqarmaydigan so'rov (Admin: `silentError`, User: `skip403Toast`) — ixtiyoriy yordamchi ma'lumot. */
type QuietConfig = AxiosRequestConfig & { silentError?: boolean; skip403Toast?: boolean };
const QUIET: QuietConfig = { silentError: true, skip403Toast: true };

/*
 * Maktabga tayyorlov shartnomasi. Mavjud `/student-contracts` endpointi ishlatiladi, `contract_type = 'preschool'`
 * (backend: `StudentContractController`, ruxsat `preschool_contracts.*`).
 * Admin va User ilovalarida bir xil fayl (telefon/sana yordamchilari shu faylning o'zida — ikki ilovada nomlari farq qiladi).
 */

const isFullPhone = (value: string) => /^\+998\d{9}$/.test(value);

/** `+998` yolg'iz turgan yoki to'liq bo'lmagan raqam — yuborilmaydi. */
export const apiPhone = (value: string): string => (isFullPhone(value.trim()) ? value.trim() : '');

export const isValidContractPhone = isFullPhone;

const numberOrUndefined = (value: string): number | undefined => (/^\d+$/.test(value.trim()) ? Number(value) : undefined);

const orUndefined = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

/** Forma → `POST /student-contracts` tanasi. Ariza (lid) yo'q — bola shartnomaning o'zi bilan yaratiladi. */
export function buildPreschoolContractPayload(form: PreschoolContractForm) {
  const representatives = form.representatives.map((r) => {
    const phones = r.phones.map(apiPhone).filter(Boolean);
    return {
      representative_type: r.representative_type,
      jshshir: orUndefined(r.jshshir),
      citizenship: r.citizenship,
      birth_date: orUndefined(r.birth_date),
      passport_series: orUndefined(r.passport_series),
      passport_number: orUndefined(r.passport_number),
      passport_given_date: orUndefined(r.passport_given_date),
      passport_expiry_date: orUndefined(r.passport_expiry_date),
      passport_given_by: orUndefined(r.passport_given_by),
      last_name: r.last_name.trim(),
      first_name: r.first_name.trim(),
      father_name: orUndefined(r.father_name),
      phone: phones[0] ?? '',
      extra_phones: phones.length > 1 ? phones.slice(1) : undefined,
      registered_address: orUndefined(r.registered_address),
      residential_address: orUndefined(r.residential_address),
    };
  });

  const student = {
    is_minor: true,
    citizenship: form.citizenship,
    last_name: form.last_name.trim(),
    first_name: form.first_name.trim(),
    father_name: form.father_name.trim(),
    birth_date: form.birth_date,
    birth_place: form.birth_place.trim(),
    gender: form.gender || undefined,
    birth_cert_series: form.birth_cert_series.trim(),
    birth_cert_number: form.birth_cert_number.trim(),
    birth_cert_given_date: orUndefined(form.birth_cert_given_date),
    phone: orUndefined(apiPhone(form.phone)),
    residential_address: form.residential_address.trim(),
    group_id: numberOrUndefined(form.group_id),
    course_start_date: form.study_start_date,
    course_end_date: form.end_date,
  };

  return {
    contract_type: PRESCHOOL_CONTRACT_TYPE,
    language: form.language,
    branch_id: numberOrUndefined(form.branch_id),
    academic_year_id: numberOrUndefined(form.academic_year_id),
    contract_date: form.contract_date,
    end_date: form.end_date,
    first_payment_date: form.first_payment_date,
    representatives,
    students: [student],
  };
}

export interface PreschoolContractCreated {
  message?: string;
  contract_id: number;
  contract_number?: string;
  hash_link?: string;
  short_link?: string;
}

export const createPreschoolContract = (form: PreschoolContractForm) =>
  API.post<PreschoolContractCreated>('/student-contracts', buildPreschoolContractPayload(form)).then((r) => r.data);

export interface ContractsPage {
  data: PreschoolContract[];
  total: number;
  last_page: number;
  current_page: number;
  per_page: number;
}

interface RawPage {
  data?: PreschoolContract[];
  total?: number;
  last_page?: number;
  current_page?: number;
  per_page?: number;
  meta?: { total?: number; last_page?: number; current_page?: number; per_page?: number };
}

/**
 * Maktabga tayyorlov shartnomalari ro'yxati (`contract_type=preschool` — faqat shu ruxsatli foydalanuvchi ham yuboradi).
 * Qatorlar klientda ham `preschool` bo'yicha saralanadi (eski backend noma'lum turni e'tiborsiz qoldirardi).
 */
export async function fetchPreschoolContracts(params: {
  page: number;
  perPage: number;
  /** Shartnoma raqami, o'quvchi yoki vakil F.I.Sh. bo'yicha (backend shunday qidiradi). */
  search?: string;
  academicYearId?: string;
  branchId?: string;
  status?: string;
}): Promise<ContractsPage> {
  const { data } = await API.get<RawPage | PreschoolContract[]>('/student-contracts', {
    params: {
      contract_type: PRESCHOOL_CONTRACT_TYPE,
      page: params.page,
      per_page: params.perPage,
      search: params.search || undefined,
      academic_year_id: params.academicYearId || undefined,
      branch_id: params.branchId || undefined,
      status: params.status || undefined,
    },
  });
  const raw: RawPage = Array.isArray(data) ? { data } : (data ?? {});
  const rows = (raw.data ?? []).filter((c) => c.contract_type === PRESCHOOL_CONTRACT_TYPE);
  const meta = raw.meta ?? {};
  return {
    data: rows,
    total: raw.total ?? meta.total ?? rows.length,
    last_page: raw.last_page ?? meta.last_page ?? 1,
    current_page: raw.current_page ?? meta.current_page ?? params.page,
    per_page: raw.per_page ?? meta.per_page ?? params.perPage,
  };
}

/** `GET /student-contracts/{id}` javobi o'ralgan: `{ contract, type_label, status_label, computed }`. */
export const fetchPreschoolContract = (id: number) =>
  API.get<{ contract?: PreschoolContract; data?: PreschoolContract } & Partial<PreschoolContract>>(
    `/student-contracts/${id}`,
  ).then((r) => (r.data.contract ?? r.data.data ?? r.data) as PreschoolContract);

export const deletePreschoolContract = (id: number) => API.delete(`/student-contracts/${id}`);

// ── Forma yordamchisi ────────────────────────────────────────────────────────

interface PriceRow {
  academic_year_id: number;
  branch_id: number | null;
  monthly_price: string | number;
  /** Faqat faol (`is_active`) va tasdiqlangan (`approved`) narx amalda. */
  is_active?: boolean | null;
  status?: string | null;
}

/**
 * O'quv yili + filial uchun oylik narx (filialniki, bo'lmasa umumiy). Faqat ma'lumot uchun ko'rsatiladi —
 * shartnoma narxini backend o'zi hisoblaydi. `preschool_prices.view` ruxsati bo'lmasa — `null`.
 */
export async function fetchContractMonthlyPrice(yearId: number, branchId: number | null): Promise<number | null> {
  try {
    const { data } = await API.get<{ data?: PriceRow[] } | PriceRow[]>('/preschool-prices', {
      params: { academic_year_id: yearId, per_page: 100, status: 'approved', is_active: 1 },
      ...QUIET,
    });
    const rows = (Array.isArray(data) ? data : (data?.data ?? []))
      .filter((p) => p.academic_year_id === yearId)
      .filter(isPriceInEffect);
    const own = rows.find((p) => branchId !== null && p.branch_id === branchId);
    const general = rows.find((p) => p.branch_id === null);
    const price = own ?? general;
    return price ? Number(price.monthly_price) : null;
  } catch {
    return null;
  }
}
