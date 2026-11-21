import type { BaseEntity, PaginatedResponse } from './common.types';
import type { CourseLevel } from './course.types';

export type PaymentMethod = 'Naqd' | 'Karta' | 'QR kod' | "O'tkazma" | 'Paynet' | string;

export interface SimpleCourse {
  id: number;
  name?: string;
  name_uz?: string;
  name_ru?: string | null;
  name_en?: string | null;
}

export interface SimpleGroup {
  id: number;
  name: string;
  course?: SimpleCourse;
  teacher?: SimpleTeacher;
  level?: CourseLevel;
}

export interface SimpleDirection {
  id: number;
  name: string;
  color?: string;
}

export interface SimpleTeacher {
  id: number;
  first_name: string;
  last_name: string;
}

export interface SimpleBranch {
  id: number;
  branch_code?: string;
  /** `standard` | `preschool` (maktabga tayyorlov) — `/payments` javobidagi `branch` obyektida keladi. */
  type?: string;
  name?: string;
  name_uz?: string;
  name_ru?: string | null;
  name_en?: string | null;
  city?: string;
  has_contract?: number;
  director_name?: string;
  address_uz?: string;
  address_ru?: string | null;
  address_en?: string | null;
  postal_code?: string;
  legal_address_uz?: string;
  legal_address_ru?: string | null;
  legal_address_en?: string | null;
  legal_name?: string;
  inn?: string;
  phone?: string;
  email?: string;
  bank_name?: string;
  account_number?: string;
  mfo?: string;
  oked?: string;
  is_active?: number | boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface SimpleStudent {
  id: number;
  student_code?: string;
  balance?: string | number;
  username?: string;
  is_contract_confirmed?: boolean;
  first_name: string;
  last_name: string;
  father_name?: string;
  birth_date?: string;
  gender?: string | null;
  phone?: string;
  region_id?: number | null;
  district_id?: number | null;
  branch_id?: number;
  is_active?: boolean;
  lid_id?: number;
  image?: string;
  image_url?: string;
  role_id?: number;
  full_name?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  last_payment_date?: string;
  groups?: SimpleGroup[];
  direction?: SimpleDirection;
  teacher?: SimpleTeacher;
  branch?: SimpleBranch;
}

export interface SimpleTeacherFull {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string;
  full_name?: string;
  photo_url?: string;
}

export interface Payment extends BaseEntity {
  student_id: number;
  group_id?: number | null;
  course_id?: number | null;
  branch_id?: number | null;
  teacher_id?: number | null;
  user_id?: number | null;
  amount: string | number;
  payment_method?: PaymentMethod;
  payment_type?: PaymentMethod;
  payment_date?: string;
  paid_at?: string;
  paynet_transaction_id?: string | null;
  payment_period?: string | null;
  deleted_at?: string | null;
  full_name?: string | null;
  student?: SimpleStudent;
  group?: SimpleGroup;
  course?: SimpleCourse;
  branch?: SimpleBranch;
  direction?: SimpleDirection;
  teacher?: SimpleTeacherFull;
  cashier?: SimpleCashier | null;
  /** To'lov qabul qilinganda ushlab qolingan komissiya (`/payments` javobida keladi). */
  commission_percent?: string | number | null;
  commission_amount?: string | number | null;
  final_amount?: string | number | null;
  commission_log?: PaymentCommissionLog | null;
  /** Chekdagi QR kod imzosi (backend `Payment.receipt_sig`): `/chek/{id}?sig=…` kirmasdan ochiladi. */
  receipt_sig?: string;
}

/** Bitta to'lovning komissiya yozuvi (`payment.commission_log`). */
export interface PaymentCommissionLog {
  id: number;
  payment_id: number;
  branch_id: number;
  payment_method: string;
  original_amount: string | number;
  commission_percent: string | number;
  commission_amount: string | number;
  final_amount: string | number;
  reference_number?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** To'lovni qabul qilgan xodim. */
export interface SimpleCashier {
  id: number;
  full_name?: string;
  username?: string;
  phone?: string;
  branch_id?: number;
}

/**
 * To'lov usuli va uning komissiyasi — barcha filiallar uchun umumiy (filialga
 * bog'lanmaydi, muddati yo'q).
 * Manba: GET /options/payment-gateway-commissions (`api/commissions.ts`) — faqat faol usullar keladi.
 */
export interface PaymentGatewayCommission {
  id: number;
  payment_method: string;
  commission_percent: string | number;
  show_on_site?: boolean;
}

export interface SavePaymentPayload {
  amount: number;
  payment_method: string;
  student_id: number;
  payment_date: string;
  group_id?: number;
  group?: string;
  full_name?: string;
  branch_id?: number;
  course_id?: number;
  teacher_id?: number;
  user_id?: number;
  /** To'lov qaysi oy uchun — `YYYY-MM` (maktabga tayyorlov filial jurnalida oylik to'lov holati shu oyga yoziladi). */
  payment_period?: string;
}

export type PaymentListResponse = PaginatedResponse<Payment[]>;
