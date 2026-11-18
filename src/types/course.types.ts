import type { BaseEntity, PaginatedResponse } from './common.types';
import type { Branch, User } from './user.types';

/** Backend qaytaradigan qiymatlar — rad etilgani `rejected` (`cancelled` emas). */
export type CourseStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'old_price';

export interface CourseLevel {
  id: number;
  name: string;
  name_uz: string;
  name_ru?: string;
  name_en?: string;
  created_at?: string;
  updated_at?: string;

  pivot?: {
    course_id: number;
    level_id: number;
  };
}

export interface Course extends BaseEntity {
  name: string;
  name_uz: string;
  name_ru?: string;
  name_en?: string;
  description: string;
  branch_id: number;
  level_id: number;
  is_active: number;
  levels?: CourseLevel[];
  branches?: Branch[];
}

export interface CoursePrice extends BaseEntity {
  branch_id: number;
  course_id: number;
  old_price: string;
  new_price: string;
  lessons_count: number;
  lesson_price: string;
  percentage: number;
  start_date: string;
  comment: string | null;
  course: Course;
  level_id: number;
  level?: CourseLevel;
  branch: Branch;
  holat?: CourseStatus;
  status?: CourseStatus;

  // ── Amalni kim/qachon bajargan ──
  // `*_by` — user id (payloadda yuboriladi), `creator`/`approver`/`rejecter` —
  // backend qaytaradigan to'liq user obyekti (jadvalda ism shundan olinadi).
  created_by?: number | null;
  approved_by?: number | null;
  approved_at?: string | null;
  rejected_by?: number | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  creator?: User | null;
  approver?: User | null;
  rejecter?: User | null;

  // ── Avtomatik indeksatsiya (docs/course-price-auto-index.md) ──
  // Barchasi backend tomonidan hisoblanadi va faqat o'qish uchun; backend ularni
  // qaytarmasa frontend `percentage` + `start_date` dan o'zi hisoblab ko'rsatadi.
  /** Avtomatik oshirish yoqilganmi (backend bermasa — yoqilgan deb hisoblanadi). */
  auto_apply?: boolean;
  /** Cron oxirgi marta narxni oshirgan vaqt. */
  last_applied_at?: string | null;
  /** Keyingi avtomatik oshirish sanasi, `YYYY-MM-DD`. */
  next_apply_date?: string | null;
  /** O'sha sanada bo'ladigan narx. */
  next_price?: string | number | null;
}

export type CoursePriceListResponse = PaginatedResponse<CoursePrice[]>;

export interface SaveCoursePayload {
  id?: number;

  branch_id: number;
  course_id: number;
  level_id: number;

  old_price: number;
  new_price: number;
  lessons_count: number;
  lesson_price: number;
  percentage: number;
  start_date: string;
  comment: string;
  /** Kim yaratgani — login qilgan foydalanuvchidan to'ldiriladi. */
  created_by?: number | null;
}

/** Status o'tishida backendga yuboriladigan "kim va qachon" maydonlari. */
export interface CourseStatusPayload {
  created_by?: number | null;
  approved_by?: number | null;
  approved_at?: string | null;
  rejected_by?: number | null;
  rejected_at?: string | null;
}

export interface CourseFormState {
  filial: string;
  kurs: string;
  level: string;
  /** Mavjud narxdan avtomatik to'ladi, lekin qo'lda o'zgartirsa bo'ladi. */
  old_price: string;
  new_price: string;
  /**
   * Kelgusidagi o'sish foizi — qo'lda kiritiladi. `start_date` (kun.oy) kelganda
   * backend `new_price` ni shu foizga oshirib yuborishi kerak.
   */
  percentage: string;
  start_date: string;
  comment: string;
}

export interface CourseFormErrors {
  filial?: string;
  kurs?: string;
  level?: string;
  old_price?: string;
  new_price?: string;
  percentage?: string;
  start_date?: string;
}

export interface CoursesFilterState {
  courseName: string;
  levelName: string;
  branchName: string;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_COURSES_FILTER: CoursesFilterState = {
  courseName: '',
  levelName: '',
  branchName: '',
  dateFrom: '',
  dateTo: '',
};
