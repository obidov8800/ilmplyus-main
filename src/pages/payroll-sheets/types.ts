/* ------------------------------------------------------------------ *
 * Avans / Oylik vedomostlari — tiplar.
 * Manba: `/payroll/sheets` moduli (TZ «АВАНС ВА ОЙЛИК ҲИСОБЛАШ»).
 * ------------------------------------------------------------------ */

/** Vedomost turi. Avans va oylik — alohida vedomost (unique: filial+oy+tur). */
export type SheetType = 'advance' | 'salary';

/**
 * draft (generatsiya) → prepared → sent → approved
 *                          ▲                  │
 *                          └── rejected ◄─────┘  (sabab majburiy)
 * Tasdiqlangan vedomost o'zgartirilmaydi va qayta generatsiya qilinmaydi.
 */
export type SheetStatus = 'draft' | 'prepared' | 'sent' | 'approved' | 'rejected';

/** Workflow amallari — endpoint segmenti va ruxsat kodi bilan bir xil. */
export type SheetAction = 'prepare' | 'send' | 'approve' | 'reject';

/** Vedomostning bitta qatori — `GET /payroll/sheets/{id}/rows`. */
export interface SheetRow {
  id: number;
  employee_id: number;
  employee_name: string;
  position_name: string;
  department_name: string;
  department_id: number | null;
  /** Pedagog (foizli sxema) — jadvalda ism yonidagi «P» belgisi. */
  is_pedagog: boolean;
  /** «Ойлик оқлади»: pedagogda balansdan, qolganlarda shartnomadan. */
  oklad: number;
  advance_cashless: number;
  advance_cash: number;
  salary_cashless: number;
  salary_cash: number;
  /** Qo'shimcha ishlar va ayrilgan — soat tuzatishlari (faqat oylikda). */
  adjustment_amount: number;
  /** KPI — qo'lda kiritiladi (`PUT {id}/rows/{rowId}`), faqat oylikda. */
  kpi_amount: number;
  /** O'sha oyda qabul qilingan jarimalar — Avans va Oylik ikkalasida ham ayriladi. */
  fines_amount: number;
  income_tax_amount: number;
  pension_fund_amount: number;
  social_tax_amount: number;
  /** Jami — backend hisoblaydi, frontend qayta hisoblamaydi. */
  total_payout: number;
  note: string | null;
  /** Yozuv kiritilgan sana — Batafsil modalda ko'rsatiladi. */
  created_at: string | null;
  /**
   * Faqat frontendda: shartnomasi bor, lekin vedomostda (taqsimlanmagan yoki
   * vedomost generatsiya qilinmagan) yo'q xodim — barcha summalar 0.
   */
  not_in_sheet?: boolean;
}

/**
 * Xodim shartnomasi — `GET /contracts` dan faqat vedomostga kerakli maydonlar.
 * Vedomost qatorlari (`/rows`) shartnoma ma'lumotini bermaydi, shuning uchun
 * «Shartnoma», «Ta'til maoshi» ustunlari va «Batafsil» bloki shu yerdan olinadi.
 */
export interface SheetContract {
  id: number;
  employee_id: number;
  contract_number: string;
  /** `active` | `inactive` (backend). */
  status: string;
  contract_start_date: string | null;
  /** Muddatsiz shartnomada bo'sh. */
  contract_end_date: string | null;
  /** Vedomostda hali bo'lmagan xodimni ko'rsatish uchun (`employee`/`position`/`department`). */
  employee_name: string;
  position_name: string;
  department_name: string;
  department_id: number | null;
  /** Xodimning filiali — `employee.branch_id`; backend bermasa `null`. */
  branch_id: number | null;
  /** `staff_schedule` | `percent` | `academic_hours`. */
  salary_type: string | null;
  working_hours_monthly: number;
  hourly_rate: number;
  base_salary: number;
  total_monthly_salary: number;
  probation_period: string | null;
  /** `beriladi` | `berilmaydi`. */
  vacation_type: string | null;
  vacation_days: number;
  /** «Ta'til uchun maosh» — shartnomada ko'rsatilgan summa. */
  vacation_payment: number;
}

/** `GET /payroll/sheets/{id}/logs`. */
export interface SheetLog {
  action: string;
  user: string | null;
  created_at: string;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
}

export interface PayrollSheet {
  id: number;
  type: SheetType;
  branch_id: number;
  branch_name: string | null;
  year: number;
  month: number;
  status: SheetStatus;
  /** Soliq snapshotlari — stavka keyin o'zgarsa vedomost qayta hisoblanmaydi. */
  income_tax_percent: number | null;
  pension_fund_percent: number | null;
  social_tax_percent: number | null;
  /** Naqd puldan ham soliq olinganmi (filial sozlamasidan). */
  tax_on_cash: boolean;
  approved_at: string | null;
  /**
   * Vedomost oxirgi marta shakllantirilgan vaqt (`generated_at`). Taqsimlash undan
   * KEYIN tasdiqlangan bo'lsa, summalar vedomostda yo'q — qayta generatsiya kerak.
   */
  generated_at: string | null;
  /** Tasdiqlash paytidagi direktor FISh. */
  director_name: string | null;
  reject_reason: string | null;
  /** Jamg'armaga pul harakati yozilganmi (`GET /payroll/sheets/{id}`). */
  is_posted?: boolean;
}

/**
 * `POST /payroll/sheets/generate` javobidagi `payroll_fund_check` bloki —
 * ish haqi jamg'armasida generatsiya qilingan vedomost uchun pul yetarlimi.
 */
export interface FundCheck {
  jamgarma_id: number | null;
  jamgarma_name: string;
  need_cash: number;
  need_non_cash: number;
  have_cash: number;
  have_non_cash: number;
  shortfall_cash: number;
  shortfall_non_cash: number;
  sufficient: boolean;
}

/**
 * `GET /payroll/sheets/{id}` › `postings[]` — vedomost tasdiqlanganda
 * jamg'armaga yozilgan pul harakati qatorlari.
 */
export interface SheetPosting {
  direction: 'net_pay' | 'tax_transfer_out' | 'tax_transfer_in' | string;
  cash_amount: number;
  non_cash_amount: number;
  status: 'posted' | 'reversed' | string;
  jamgarma: { id: number; name: string } | null;
  expense: { id: number; total_amount: number } | null;
}

/** `GET /payroll/sheets/{id}/print` — bo'limlar backendda ajratilgan. */
export interface PrintRow {
  no: number;
  employee_name: string;
  position_name: string;
  oklad: number;
  advance_cashless: number;
  advance_cash: number;
  salary_cashless: number;
  salary_cash: number;
  adjustment_amount: number;
  kpi_amount: number;
  fines_amount: number;
  income_tax_amount: number;
  pension_fund_amount: number;
  social_tax_amount: number;
  total_payout: number;
  signature: string | null;
}

export interface PrintDepartment {
  department_name: string;
  /** Backend tayyor sarlavha beradi: «Ойлик – 2026-05 – filial – bo'lim». */
  title: string;
  rows: PrintRow[];
  totals: Record<string, number>;
}

export interface PrintPayload {
  sheet: {
    type_label: string;
    period: string;
    branch_name: string;
    approved_at: string | null;
    director_name: string | null;
  };
  departments: PrintDepartment[];
  grand_totals: Record<string, number>;
}

/** `POST /payroll/sheets/generate` tanasi. */
export interface GeneratePayload {
  branch_id: number;
  year: number;
  month: number;
  type: SheetType;
}
