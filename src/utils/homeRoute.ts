import {
  COURSES_PAGE_VIEW,
  DAILY_CASH_REPORTS_VIEW,
  DEBTS_VIEW,
  FINANCE_ACCOUNTS_VIEW,
  FINANCIAL_PLANS_VIEW,
  LESSON_SCHEDULE_VIEW,
  MONTH_END_ANALYSIS_VIEW,
  PAYROLL_ADJUSTMENTS_VIEW,
  PAYROLL_DISTRIBUTION_REQUESTS_VIEW,
  PAYROLL_SHEETS_VIEW,
  PENALTIES_VIEW,
  STAFF_ATTENDANCE_VIEW,
  STUDENT_ATTENDANCE_VIEW,
} from './financePermissions';
import { canSeeAll } from '@/permissions/scope';

/**
 * Foydalanuvchining "bosh sahifasi".
 *
 * `/` marshruti — Boshqaruv paneli (analitika). Agar foydalanuvchining rolida
 * analitika paneliga ruxsat bo'lmasa (`dashboard-settings.roleVisibility`da
 * bo'sh ro'yxat), `/` shu funksiya qaytargan sahifaga yo'naltiradi — ruxsat
 * ro'yxatidan USTUVORLIK bo'yicha birinchi mos keladigani.
 *
 * Har bir nomzodning `anyOf`i `App.tsx`dagi tegishli `<PermissionRoute>` bilan
 * BIR XIL (o'sha konstantalar) — aks holda cheksiz redirekt bo'ladi. Hech biri mos
 * kelmasa `/profile` (hech qanday ruxsat talab qilmaydigan sahifa) qaytariladi.
 * Tekshiruv: `.claude/tools/audit/role_matrix_test.mjs` (har shablon rolda).
 */
export const HOME_CANDIDATES: { to: string; anyOf: readonly string[] }[] = [
  { to: '/lids', anyOf: ['lids.view'] },
  { to: '/students-attendance', anyOf: STUDENT_ATTENDANCE_VIEW },
  { to: '/lessons', anyOf: ['lessons.view'] },
  { to: '/lesson-schedule', anyOf: LESSON_SCHEDULE_VIEW },
  { to: '/groups', anyOf: ['groups.view'] },
  { to: '/test', anyOf: ['tests.view'] },
  { to: '/student-exams', anyOf: ['exam_sessions.view'] },
  { to: '/students-contract', anyOf: ['student_contracts.view'] },
  { to: '/preschool-contracts', anyOf: ['preschool_contracts.view'] },
  { to: '/preschool-attendance', anyOf: ['preschool_attendances.view'] },
  { to: '/contracts', anyOf: ['employee_contracts.view'] },
  { to: '/attendance', anyOf: STAFF_ATTENDANCE_VIEW },
  { to: '/payments', anyOf: ['payments.view'] },
  { to: '/registration', anyOf: ['lids.view'] },
  { to: '/courses', anyOf: COURSES_PAGE_VIEW },
  { to: '/reports', anyOf: ['reports.view'] },
  { to: '/tasks', anyOf: ['tasks.view'] },
  { to: '/expenses', anyOf: ['expenses.view'] },
  { to: '/daily-cash-reports', anyOf: DAILY_CASH_REPORTS_VIEW },
  { to: '/finances', anyOf: FINANCE_ACCOUNTS_VIEW },
  { to: '/debts', anyOf: DEBTS_VIEW },
  { to: '/finance-plans', anyOf: FINANCIAL_PLANS_VIEW },
  { to: '/month-end-analysis', anyOf: MONTH_END_ANALYSIS_VIEW },
  { to: '/payroll-adjustments', anyOf: PAYROLL_ADJUSTMENTS_VIEW },
  { to: '/payroll-distribution-requests', anyOf: PAYROLL_DISTRIBUTION_REQUESTS_VIEW },
  { to: '/salary-schedule', anyOf: PAYROLL_SHEETS_VIEW },
  { to: '/penalties', anyOf: PENALTIES_VIEW },
  { to: '/preschool-prices', anyOf: ['preschool_prices.view'] },
  { to: '/users', anyOf: ['users.view'] },
  { to: '/roles', anyOf: ['roles.view'] },
  { to: '/regions', anyOf: ['regions.view'] },
  { to: '/districts', anyOf: ['districts.view'] },
];

/** Har doim ochiq — hech qanday ruxsat talab qilinmaydi (`App.tsx`da guard yo'q). */
export const FALLBACK_HOME_ROUTE = '/profile';

export function resolveHomeRoute(permissions: readonly string[]): string {
  const has = (perm: string) => permissions.includes(perm);
  // O'qituvchi rejimi (`useTeacherGroupsMerged`): «Davomat» menyuda yo'q, o'rniga «Guruhlar» — bosh sahifa ham shu.
  const teacherGroupsMerged =
    has('groups.view') && !canSeeAll('groups', { fullAccess: false, has }) && STUDENT_ATTENDANCE_VIEW.some(has);
  for (const c of HOME_CANDIDATES) {
    if (c.anyOf.some(has)) return teacherGroupsMerged && c.to === '/students-attendance' ? '/groups' : c.to;
  }
  return FALLBACK_HOME_ROUTE;
}
