/**
 * Moliya bo'limining ruxsat kodlari — yon menyu (`Aside`) va marshrutlar
 * (`App.tsx`) bir xil ro'yxatdan foydalanishi uchun shu yerda jamlangan.
 * Menyuda ko'rinadigan har bir havolaning marshruti ham xuddi shu ro'yxat
 * bilan qo'riqlanadi: URL'ni qo'lda yozib kirish ham to'siladi.
 *
 * Bir sahifa bir nechta backend resursini ko'rsatsa (masalan «Hisobotlar»da
 * hisob rejasi, jamg'armalar va ikki xil o'tkazma bor), shu resurslardan
 * **kamida bittasi** ochiq bo'lsa sahifa ko'rinadi — shuning uchun ro'yxatlar
 * «anyOf» ma'nosida ishlatiladi.
 */

/**
 * Moliya → Hisobotlar (`/finances`).
 *
 * DIQQAT: bu ro'yxatda `jamgarmas.view` YO'Q va bo'lmasligi kerak.
 *
 * Sabab: `jamgarmas.view` — jamg'arma ma'lumotini **o'qish** ruxsati. U chiqim
 * kiritishda ham kerak: oynada jamg'arma balansi va xodimga ruxsat etilgan
 * to'lov usuli (naqd / naqdsiz) shu ma'lumotdan aniqlanadi.
 *
 * Ilgari u shu ro'yxatda turgani uchun kassirga jamg'armani o'qishga ruxsat
 * berilishi bilan «Hisobotlar» sahifasi — hisob varaqalar va jamg'armalar
 * o'rtasidagi o'tkazmalar — ham ochilib ketardi. Bu sahifa hisob varaqalar va
 * o'tkazmalar haqida, shuning uchun u faqat shularning o'z ruxsatlari bilan
 * ochiladi.
 */
export const FINANCE_ACCOUNTS_VIEW = [
  'chart_of_accounts.view',
  'chart_of_accounts_transfers.view',
  'account_to_jamgarma_transfers.view',
  'jamgarma_transactions.view',
];

/** Moliya → Qarzlar (`/debts`) — berish / qaytarish / kechirish. */
export const DEBTS_VIEW = [
  'jamgarma_loans.view',
  'jamgarma_loan_repayments.view',
  'jamgarma_loan_forfeitures.view',
];

/**
 * Moliya → Jarimalar (`/penalties`) — xodimlarga jarima kiritish/ko'rish. Faqat `employee_fines.view` («bir sahifa —
 * bir ruxsat»): ilgari `fine_types.view` ham ochardi — sahifa `/employee-fines` ni so'rab «Ruxsat yo'q» chiqarardi.
 * Jarima turlari tanlovi `/options/fine-types` dan olinadi.
 */
export const PENALTIES_VIEW = ['employee_fines.view'];

/** Moliya → Ish haqi tuzatishlari (`/payroll-adjustments`). */
export const PAYROLL_ADJUSTMENTS_VIEW = ['payroll_adjustments.view'];

/** Moliya → Kunlik kassa hisobotlari (`/daily-cash-reports`). */
export const DAILY_CASH_REPORTS_VIEW = ['daily_cash_reports.view'];

/** Moliya → Generatsiya / Avans jadvali / Oylik jadvali. */
export const PAYROLL_SHEETS_VIEW = ['payroll_sheets.view'];

/** Moliya → Rejalar (`/finance-plans`). */
export const FINANCIAL_PLANS_VIEW = ['financial_plans.view'];

/** Moliya → Oy yakuni tahlili (`/month-end-analysis`) — alohida ruxsat. */
export const MONTH_END_ANALYSIS_VIEW = ['financial_plans.analysis'];

/**
 * Ish haqi taqsimoti (`/payroll/distributions/:employeeId`) — menyuda yo'q,
 * shartnomalar sahifasidan ochiladi. Ko'rish/yaratish/tahrirlashdan bittasi.
 */
export const PAYROLL_DISTRIBUTION_VIEW = [
  'payroll_distributions.view',
  'payroll_distributions.create',
  'payroll_distributions.edit',
];

/**
 * Moliya → Taqsimlash so'rovlari (`/payroll-distribution-requests`) — saqlangan
 * taqsimlash qoralama bo'ladi, ruxsati bor foydalanuvchi (direktor / bosh admin)
 * uni tasdiqlaydi va tasdiqdan qaytaradi; faqat tasdiqlangani vedomostga tushadi.
 * Sahifa — `payroll_distributions.view` bilan (ro'yxat so'rovi shuni talab qiladi); tasdiqlash/qaytarish ruxsatlari
 * Rollar sahifasida `view` bilan birga belgilanadi (`permissions/permissionDeps.ts`).
 */
export const PAYROLL_DISTRIBUTION_REQUESTS_VIEW = ['payroll_distributions.view'];

/** Moliya akkordeonidagi barcha havolalar — bittasi ham yo'q bo'lsa bo'lim yashiriladi. */
export const FINANCE_SECTION_VIEW = [
  ...FINANCE_ACCOUNTS_VIEW,
  ...DEBTS_VIEW,
  ...PAYROLL_ADJUSTMENTS_VIEW,
  ...PAYROLL_DISTRIBUTION_REQUESTS_VIEW,
  ...DAILY_CASH_REPORTS_VIEW,
  ...PAYROLL_SHEETS_VIEW,
  ...PENALTIES_VIEW,
  ...FINANCIAL_PLANS_VIEW,
  ...MONTH_END_ANALYSIS_VIEW,
];

/*
 * Yon menyu (`Aside`), mobil panel (`MobileTabBar`) va marshrutlar (`App.tsx`)
 * bir xil ro'yxatdan foydalansin — menyuda ko'ringan havola bosilganda sahifa
 * ochilishi shart.
 */

/**
 * Kurs narxlari — `/courses`: menyu, marshrut va bosh sahifa — faqat `course_prices.view` («bir sahifa, bir ruxsat»).
 * Ilgari `courses.view` ham ochardi: sahifa `/course_prices` ni so'raydi — faqat `courses.view` li rolda «Ruxsat yo'q»
 * chiqardi, menyuda esa band yo'q edi.
 */
export const COURSES_PAGE_VIEW = ['course_prices.view'];

/**
 * Dars jadvali — `/lesson-schedule`: menyu, marshrut va bosh sahifa — faqat `lessons_schedules.view` («bir sahifa, bir
 * ruxsat»). Guruhlar `groups.view` bo'lsa `/groups` dan, bo'lmasa `/options/groups` dan (`useGroupsData`).
 */
export const LESSON_SCHEDULE_VIEW = ['lessons_schedules.view'];

/** O'quvchilar davomati — `/students-attendance`: menyu `.view` yoki `.create` bilan chiqadi. */
export const STUDENT_ATTENDANCE_VIEW = ['student_attendance.view', 'student_attendance.create'];

/** Xodimlar davomati — `/attendance`: menyu `.view` yoki `.create` bilan chiqadi. */
export const STAFF_ATTENDANCE_VIEW = ['attendance.view', 'attendance.create'];
