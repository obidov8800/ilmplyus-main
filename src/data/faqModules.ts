import { FINANCE_SECTION_VIEW } from '@/utils/financePermissions';
import type { FaqModule } from '@/types/faq.types';

/**
 * FAQ bo'limlari — yon menyu (`Aside.tsx`) bilan BIR XIL ruxsat satrlaridan
 * foydalanadi, shu sababli qaysi modulga kirish huquqi bo'lsa, o'sha
 * modulning FAQ'i ham ko'rinadi ("Misol: guruhga ruxsat bo'lsa guruh
 * bo'yicha FAQ chiqadi").
 *
 * `general` — hech qanday ruxsat talab qilmaydi, login sahifasida ham
 * (tizimga kirmasdan) ko'rinadi.
 */
export const FAQ_MODULES: FaqModule[] = [
  { key: 'general', labelKey: 'faq.modules.general', permission: null },
  { key: 'lids', labelKey: 'header.lids', permission: 'lids.view' },
  { key: 'tasks', labelKey: 'header.tasks', permission: 'tasks.view' },
  { key: 'groups', labelKey: 'header.groups', permission: 'groups.view' },
  { key: 'courses', labelKey: 'header.courses', permission: 'course_prices.view' },
  { key: 'demoLesson', labelKey: 'header.demoLesson', permission: 'demo_lessons.view' },
  { key: 'lessonSchedule', labelKey: 'header.lessonSchedule', permission: 'lessons_schedules.view' },
  { key: 'lessons', labelKey: 'header.lessons', permission: 'lessons.view' },
  { key: 'reports', labelKey: 'header.reports', permission: 'reports.view' },
  { key: 'studentAttendance', labelKey: 'header.attendance', permission: 'student_attendance.view' },
  { key: 'staffAttendance', labelKey: 'header.staffAttendance', permission: 'attendance.view' },
  { key: 'payments', labelKey: 'header.payments', permission: 'payments.view' },
  { key: 'contracts', labelKey: 'header.contracts', permission: 'employee_contracts.view' },
  {
    key: 'studentsContracts',
    labelKey: 'header.studentsContracts',
    permission: 'student_contracts.view',
  },
  { key: 'expenses', labelKey: 'expenses.expenseTitle', permission: 'expenses.view' },
  { key: 'finance', labelKey: 'header.finance', permission: FINANCE_SECTION_VIEW },
  { key: 'roles', labelKey: 'header.roles', permission: 'roles.view' },
  { key: 'users', labelKey: 'header.users', permission: 'users.view' },
];

export function isModuleVisible(
  module: FaqModule,
  hasPermission: (p: string) => boolean,
): boolean {
  if (module.permission === null) return true;
  if (Array.isArray(module.permission)) return module.permission.some(hasPermission);
  return hasPermission(module.permission);
}
