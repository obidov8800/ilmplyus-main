/* ------------------------------------------------------------------ *
 * Moliyaviy rejalar (Rejalar) — tiplar.
 * Manba: `/financial-plans` moduli, zararsiz ishlash nuqtasi (BEP).
 * ------------------------------------------------------------------ */

/**
 * draft → sent → approved | rejected (sabab majburiy, qayta tahrirlab yuborsa bo'ladi)
 * cancelled — istalgan bosqichda, taqsimotlar jamg'armaga o'tmagan bo'lsa.
 * Tasdiqlangan reja o'zgartirilmaydi — o'zgarish keyingi oy rejasiga kiradi.
 */
export type PlanStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'cancelled';

/**
 * during_month — har bir to'lov kelganda darhol taqsimlanadi.
 * month_end — oy yakunida generate → tahrir → confirm uch bosqichda.
 */
export type DistributionMode = 'during_month' | 'month_end';

export type CalculationType = 'percent' | 'amount';

/** Workflow amallari — endpoint segmenti va ruxsat kodi bilan bir xil. */
export type PlanAction = 'send' | 'approve' | 'reject' | 'cancel';

/**
 * Jamg'arma bo'limi (`jamgarma_fund_type`) — reja formasida qatorlar shu bo'yicha 3 bo'limga ajratiladi:
 * zararsiz ishlash nuqtasi / marjinal daromad / muvofiqlashtirilgan daromad (MD).
 */
export type JamgarmaFundType = 'harmless_point' | 'marginal_income' | 'adjusted_income';

/** Rejaning bitta qatori — bitta jamg'arma bo'yicha. */
export interface PlanItem {
  id?: number;
  jamgarma_id: number;
  jamgarma_name?: string;
  /** Faqat forma uchun (qatorni bo'limga joylash) — serverga yuborilmaydi. */
  fund_type?: JamgarmaFundType | null;
  calculation_type: CalculationType;
  percent: number;
  amount: number;
}

export interface FinancialPlan {
  id: number;
  /** Backendda alohida ustun bo'lmasa `PLN-YYYY-MM` sifatida hosil qilinadi. */
  doc_number: string;
  branch_id: number;
  branch_name: string | null;
  year: number;
  month: number;
  planned_income: number;
  distribution_mode: DistributionMode | null;
  status: PlanStatus;
  /** Qatorlar foizi yig'indisi — ro'yxatdagi "Taqsimlangan %" ustuni. */
  total_percent: number;
  reject_reason: string | null;
  created_by: string | null;
  created_at: string | null;
  copied_from_plan_id: number | null;
  items: PlanItem[];
}

export interface PlanLog {
  action: string;
  field?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  user: string | null;
  created_at: string;
  from_status?: string | null;
  to_status?: string | null;
}

/** `GET /financial-plans/{id}/analysis` — bitta jamg'arma qatori. */
export interface PlanAnalysisRow {
  jamgarma_id: number;
  jamgarma_name: string;
  planned_percent: number;
  actual_percent: number;
  planned_amount: number;
  actual_allocated: number;
  spent: number;
  balance: number;
  diff_amount: number;
  diff_percent: number;
  fulfillment_percent: number;
}

export interface PlanAnalysis {
  plan: FinancialPlan;
  planned_income: number;
  actual_income: number;
  actual_spent: number;
  net_result: number;
  income_fulfillment_percent: number;
  bep_reached: boolean | null;
  rows: PlanAnalysisRow[];
}

/** `POST /financial-plans` / `PUT /financial-plans/{id}` tanasi. */
export interface PlanPayload {
  branch_id: number;
  year: number;
  month: number;
  planned_income: number;
  items: { jamgarma_id: number; calculation_type: CalculationType; percent?: number; amount?: number }[];
  distribution_mode?: DistributionMode;
  copied_from_plan_id?: number;
}
