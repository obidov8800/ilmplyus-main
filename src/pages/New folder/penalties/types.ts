/* ------------------------------------------------------------------ *
 * Jarimalar — tiplar.
 * Manba: `/fine-types` (jarima turlari) va `/employee-fines` (xodim jarimalari).
 * ------------------------------------------------------------------ */

/** new (янги) → accepted (қабул қилинган) | cancelled (бекор қилинган). */
export type FineStatus = 'new' | 'accepted' | 'cancelled';

/** Faqat `accepted` jarimalar oylik vedomostiga tushadi. */
export interface EmployeeFine {
  id: number;
  employee_id: number;
  /** Tabel raqami — jadvaldagi «XODIM ID» ustuni. */
  employee_code: string;
  full_name: string;
  position_name: string;
  department_name: string;
  branch_name: string;
  fine_type_id: number;
  fine_type_name: string;
  /** Summa yozuvga qotiriladi — tur summasi keyin o'zgarsa bu o'zgarmaydi. */
  amount: number;
  status: FineStatus;
  note: string | null;
  /** `YYYY-MM-DD`. */
  date: string | null;
}

export interface FineType {
  id: number;
  name: string;
  /** Standart summa — jarima kiritilganda summa berilmasa shu olinadi. */
  amount: number;
}

/** Xodim jarimasi formasi. */
export interface FineForm {
  employee_id: string;
  fine_type_id: string;
  date: string;
  /** Bo'sh qoldirilsa turdagi standart summa qo'llanadi. */
  amount: string;
  note: string;
  /** Xodim bir nechta filialda ishlasa — jarima shu filial vedomostiga tushadi. */
  branch_id?: string;
}

export interface FineTypeForm {
  name: string;
  amount: string;
}

export interface FineFilters {
  period_year: number;
  period_month: number;
  branch_id: string;
  department_id: string;
  status: string;
  /** «ID / FISh» qidiruvi — familiya yoki tabel raqami. */
  search: string;
}
