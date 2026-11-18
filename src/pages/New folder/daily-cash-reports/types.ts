/* ------------------------------------------------------------------ *
 * Kunlik kassa hisobotlari (Tushumlar hisobotlari) — turlar.
 * Pul maydonlari backenddan string ko'rinishida keladi ("1000000.00").
 * ------------------------------------------------------------------ */

/** Status zanjiri: created → sent → assistant_accepted → accountant_approved.
 *  Tuzatish tarmog'i: → returned → finalized. */
export type ReportStatus =
  | 'created'
  | 'sent'
  | 'assistant_accepted'
  | 'accountant_approved'
  | 'returned'
  | 'finalized';

export interface BranchRef {
  id: number;
  name_uz?: string;
  name_ru?: string;
  name_en?: string;
}

export interface PersonRef {
  id?: number;
  full_name?: string;
}

/** Ro'yxat (jadval) qatori. Pul maydonlari string. */
export interface DailyCashReport {
  id: number;
  report_number: string;
  branch_id: number;
  report_date: string;
  status: ReportStatus;
  cash_income: string;
  card_income: string;
  qr_income: string;
  bank_income: string;
  paynet_income: string;
  total_income: string;
  expense_balance_total: string;
  cash_expense: string;
  non_cash_expense: string;
  total_expense: string;
  remainder_total: string;
  branch?: BranchRef;
  /** Topshiruvchi kassir — ro'yxatда bo'lmasligi mumkin (GET /{id} da bor). */
  cashier?: PersonRef | null;
}

/**
 * To'liq hisobot — GET /daily-cash-reports/{id}.
 * Ro'yxatда bo'lmagan mas'ul shaxslar shu yerdan olinadi. Qabul/topshirish
 * vaqtlari esa audit jurnalidan (logs) aniqroq olinadi — timestamp maydon
 * nomlari spetsifikatsiyada berilmagan.
 */
export interface FullReport extends DailyCashReport {
  assistant?: PersonRef | null;
  accountant?: PersonRef | null;
  creator?: PersonRef | null;
}

/** Laravel paginator javobi normallashtirilgandan keyin. */
export interface ReportsPage {
  rows: DailyCashReport[];
  total: number;
  perPage: number;
  lastPage: number;
}

/** «Batafsil» — jamg'armalar kesimidagi qatorlar. */
export interface DetailBalanceRow {
  jamgarma_id: number;
  jamgarma_name: string;
  cash: string;
  non_cash: string;
  total: string;
}

/** «Чиқим» — kun bo'yicha chiqimlar ro'yxati. */
export interface DetailExpenseRow {
  expense_date: string;
  jamgarma: string;
  category: string;
  subcategory: string;
  info: string;
  cash_amount: string;
  non_cash_amount: string;
  amount: string;
  employee: string;
}

export interface ReportDetails {
  balance: DetailBalanceRow[];
  expenses: DetailExpenseRow[];
  remainder: DetailBalanceRow[];
  totals: {
    expense_balance_total: string;
    cash_expense: string;
    non_cash_expense: string;
    total_expense: string;
    remainder_total: string;
  };
}

/** Audit jurnal yozuvi. */
export interface ReportLog {
  action: string;
  from_status: ReportStatus | null;
  to_status: ReportStatus | null;
  note: string | null;
  user: string | { full_name?: string } | null;
  created_at: string;
}

/** Admin tuzatishi (correct) uchun tahrirlanadigan maydonlar. */
export interface CorrectPayload {
  cash_income?: string;
  card_income?: string;
  qr_income?: string;
  bank_income?: string;
  paynet_income?: string;
  cash_expense?: string;
  non_cash_expense?: string;
  note?: string;
}

/** Statusga qarab ko'rinadigan workflow amallari. */
export type WorkflowAction = 'send' | 'accept' | 'approve' | 'return' | 'correct';
