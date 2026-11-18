import type { AxiosRequestConfig } from 'axios';
import { API } from './api';
import { fetchAllPages } from './fetchAllPages';

/** Xato toast'i chiqarmaydigan so'rov (Admin: `silentError`, User: `skip403Toast`) — arxiv ixtiyoriy ma'lumot. */
type QuietConfig = AxiosRequestConfig & { silentError?: boolean; skip403Toast?: boolean };

/*
 * Maktabga tayyorlov (`branches.type = preschool`) bo'limi: ta'lim narxi va kunlik davomat jurnali.
 * Backend: `PreschoolPriceController`, `PreschoolAttendanceController` (ruxsatlar `preschool_prices.*`,
 * `preschool_attendances.view|create|edit|delete`).
 * Admin va User ilovalarida bir xil fayl.
 */

// ── Ta'lim narxi ─────────────────────────────────────────────────────────────

export interface PreschoolPrice {
  id: number;
  academic_year_id: number;
  /** `null` — shu o'quv yilidagi BARCHA maktabga tayyorlov filiallar uchun umumiy narx. */
  branch_id: number | null;
  monthly_price: string | number;
  description: string | null;
  /** Faol / faol emas. Oddiy tahrirlash (`PUT`) bilan o'zgaradi va tasdiqlash holatidan MUSTAQIL. */
  is_active?: boolean | null;
  /** Tasdiqlash holati: `pending` | `approved` | `rejected` | `cancelled` (alohida `PATCH …/status` bilan o'zgaradi). */
  status?: string | null;
  status_label?: string | null;
  status_reason?: string | null;
  status_changed_at?: string | null;
  /** Holatni oxirgi o'zgartirgan shaxs (`pending` holatida `null`). */
  status_changer?: { id: number; full_name?: string | null } | null;
  academic_year?: { id: number; name: string; start_date?: string; end_date?: string; status?: string } | null;
  branch?: { id: number; name_uz?: string | null; name_ru?: string | null; name_en?: string | null } | null;
  creator?: { id: number; full_name?: string | null } | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface PreschoolPricePayload {
  academic_year_id: number;
  branch_id: number | null;
  monthly_price: number;
  description?: string | null;
  is_active?: boolean;
}

export const fetchPreschoolPrices = () => fetchAllPages<PreschoolPrice>('/preschool-prices');

export const createPreschoolPrice = (payload: PreschoolPricePayload) => API.post('/preschool-prices', payload);

export const updatePreschoolPrice = (id: number, payload: Partial<PreschoolPricePayload>) =>
  API.put(`/preschool-prices/${id}`, payload);

export const deletePreschoolPrice = (id: number) => API.delete(`/preschool-prices/${id}`);

export const restorePreschoolPrice = (id: number) => API.post(`/preschool-prices/${id}/restore`);

// ── Tasdiqlash / bekor qilish ────────────────────────────────────────────────

/*
 * Ikki MUSTAQIL holat: `is_active` (faol / faol emas) va `status` (tasdiqlash). Yangi narx doim `pending` bo'lib
 * yaratiladi; `PUT` da narx, o'quv yili yoki filial o'zgarsa u yana `pending` ga qaytadi (qayta tasdiqlash kerak),
 * faqat izoh/`is_active` o'zgarsa holat saqlanadi. Shartnoma va davomat jurnalida faqat faol + tasdiqlangan narx ishlatiladi.
 */
export const PRICE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type PreschoolPriceStatus = (typeof PRICE_STATUSES)[number];

/** Holatni o'zgartirish ruxsati (`PATCH /preschool-prices/{id}/status`). */
export const PRICE_STATUS_PERMISSION = 'preschool_prices.change_status';

/** Narx holati. `null` — backend holat bermaydi (eski javob): belgi va tugmalar ko'rsatilmaydi. */
export function priceStatus(price: { status?: string | null }): PreschoolPriceStatus | null {
  const raw = (price.status ?? '').toLowerCase();
  if (!raw) return null;
  if (raw === 'canceled') return 'cancelled';
  return (PRICE_STATUSES as readonly string[]).includes(raw) ? (raw as PreschoolPriceStatus) : 'pending';
}

/** `is_active` bo'lmasa (eski javob) narx faol hisoblanadi. */
export const isPriceActive = (price: { is_active?: boolean | number | null }): boolean =>
  price.is_active === undefined || price.is_active === null || Boolean(price.is_active);

/** Faol va tasdiqlangan (yoki holat oqimi yo'q bo'lgan) narxgina shartnoma va jurnalda ishlatiladi. */
export const isPriceInEffect = (price: { status?: string | null; is_active?: boolean | number | null }): boolean => {
  if (!isPriceActive(price)) return false;
  const status = priceStatus(price);
  return status === null || status === 'approved';
};

/** `PATCH /preschool-prices/{id}/status` — `{ status, reason? }`; `reason` ixtiyoriy izoh. */
export const changePreschoolPriceStatus = (id: number, status: PreschoolPriceStatus, reason?: string) =>
  API.patch(`/preschool-prices/${id}/status`, { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) });

interface TrashPage<T> {
  data?: { data?: T[]; last_page?: number };
}

/**
 * O'chirilgan narxlar. `GET /preschool-prices` o'chirilganlarni qaytarmaydi — ular umumiy arxivda
 * (`GET /trash?type=preschool_prices`, Laravel paginatori) turadi; tiklash esa narx endpointi orqali.
 */
export async function fetchTrashedPreschoolPrices(): Promise<PreschoolPrice[]> {
  const load = (page: number) =>
    API.get<TrashPage<PreschoolPrice>>('/trash', {
      params: { type: 'preschool_prices', per_page: 100, page },
      silentError: true,
      skip403Toast: true,
    } as QuietConfig).then((res) => res.data?.data);

  const first = await load(1);
  const lastPage = Math.min(first?.last_page ?? 1, 20);
  const rest = await Promise.all(Array.from({ length: Math.max(0, lastPage - 1) }, (_, i) => load(i + 2)));
  return [first, ...rest].flatMap((chunk) => chunk?.data ?? []);
}

// ── Davomat jurnali ──────────────────────────────────────────────────────────

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'reason'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface JournalMark {
  id: number;
  /** `YYYY-MM-DD` */
  date: string;
  status: AttendanceStatus;
  comment: string | null;
}

export type PaymentState = 'paid' | 'partial' | 'unpaid';

export interface JournalStudent {
  id: number;
  student_code?: string | null;
  full_name: string;
  joined_at?: string | null;
  left_at?: string | null;
  attendances: JournalMark[];
  summary: Record<AttendanceStatus | 'total', number>;
  /** Shu oy uchun to'lov: to'langan summa, kutilgan summa (narx kiritilmagan bo'lsa `null`) va holat. */
  payment: { period: string; paid_amount: number; expected_amount: number | null; status: PaymentState };
}

export interface Journal {
  group: {
    id: number;
    name: string;
    branch_id: number;
    academic_year?: { id: number; name: string; start_date?: string | null; end_date?: string | null } | null;
    /** Guruh filialining narxi, bo'lmasa o'quv yilining umumiy narxi; yo'q bo'lsa `null`. */
    price: { id: number; monthly_price: string | number; description: string | null; branch_id: number | null } | null;
  };
  /** `YYYY-MM` */
  period: string;
  students: JournalStudent[];
}

export const fetchJournal = (groupId: number, year: number, month: number, config?: QuietConfig) =>
  API.get<Journal>('/preschool-attendances', { params: { group_id: groupId, year, month }, ...config }).then((r) => r.data);

export interface DayItem {
  student_id: number;
  status: AttendanceStatus;
  comment?: string | null;
}

/** Bir kunlik davomatni belgilash (qayta yuborilsa yangilanadi). Kelajak sanaga belgilab bo'lmaydi. */
export const saveDay = (groupId: number, date: string, items: DayItem[]) =>
  API.post('/preschool-attendances', { group_id: groupId, date, items });

export const updateMark = (id: number, payload: { status?: AttendanceStatus; comment?: string | null }) =>
  API.put(`/preschool-attendances/${id}`, payload);

export const deleteMark = (id: number) => API.delete(`/preschool-attendances/${id}`);

// ── Yordamchilar ─────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

export interface MonthDay {
  /** `YYYY-MM-DD` */
  date: string;
  day: number;
  /** 0 = yakshanba … 6 = shanba */
  weekday: number;
  /** Bugundan keyingi kun — belgilab bo'lmaydi. */
  future: boolean;
}

/** Oyning barcha kunlari. `today` — `YYYY-MM-DD` (mahalliy). */
export function monthDays(year: number, month: number, today: string): MonthDay[] {
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const day = i + 1;
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    return { date, day, weekday: new Date(year, month - 1, day).getDay(), future: date > today };
  });
}

/** O'quvchi shu sanada guruhda bo'lganmi (qo'shilgan/chiqib ketgan sanalar bo'yicha). */
export function isMemberOn(student: Pick<JournalStudent, 'joined_at' | 'left_at'>, date: string): boolean {
  const joined = student.joined_at?.slice(0, 10);
  const left = student.left_at?.slice(0, 10);
  return (!joined || joined <= date) && (!left || left >= date);
}

/** `1500000` → `1 500 000`. */
export const formatSum = (value: string | number | null | undefined): string => {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || Number.isNaN(n)) return '-';
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};
