import type { MainTab } from '@/store/useDashboardSettings';
import type { WidgetDef } from './widget.types';
import { sectionComponent } from './sectionBody';

interface SectionMeta {
  /** Barqaror id: foydalanuvchi joylashuvi va rol ruxsatlari shu bo'yicha saqlanadi. */
  id: string;
  /** Vidjet nomi — tahrir rejimidagi sarlavha va "qo'shish" ro'yxati (kartadagi sarlavha kaliti). */
  titleKey: string;
  /** Boshlang'ich kenglik (12 ustunli grid). */
  cols: number;
  /** Faqat shu "feature" yoqilgan bo'lsa ko'rinadi (`/dashboard-settings` → `features`). */
  featureFlag?: string;
}

/**
 * Dashboard bloklari. Dizayn — ESKI (5 tabli) dashboard: har bir karta, diagramma
 * va jadval alohida vidjet. Tartib va boshlang'ich kenglik eski joylashuvni aynan
 * takrorlaydi: 4 ta statistika kartasi bir qatorda (3+3+3+3), "diagramma + yon karta"
 * qatori 8+4, to'liq kenglikdagi kartalar 12. Foydalanuvchi har tabda tartibni,
 * kenglik/balandlikni o'zgartirishi, blokni olib tashlashi va qaytarishi mumkin.
 *
 * Mazmun (JSX) tab komponentlarida (`UmumiyTab.tsx` ...): ular `SectionIds<tab>` kalitli
 * obyekt qaytaradi — id'ni noto'g'ri yozish yoki blokni unutish kompilyatsiyada ko'rinadi.
 *
 * `id` ni O'ZGARTIRMANG: o'zgartirilsa saqlangan joylashuv va berilgan ruxsatlar uziladi.
 */
export const SECTION_DEFS = {
  umumiy: [
    { id: 'umumiy.activeStudents', titleKey: 'dashboard.umumiy.activeStudents', cols: 3 },
    { id: 'umumiy.monthlyProfit', titleKey: 'dashboard.umumiy.monthlyProfit', cols: 3 },
    { id: 'umumiy.lessonsRooms', titleKey: 'dashboard.umumiy.currentLessonsRooms', cols: 3 },
    { id: 'umumiy.churn', titleKey: 'dashboard.umumiy.churnRate', cols: 3 },
    { id: 'umumiy.totalStudents', titleKey: 'dashboard.umumiy.totalStudentsAll', cols: 3 },
    { id: 'umumiy.newLeads', titleKey: 'dashboard.umumiy.newLeads', cols: 3 },
    { id: 'umumiy.periodIncome', titleKey: 'dashboard.umumiy.periodIncome', cols: 3 },
    { id: 'umumiy.debtStat', titleKey: 'dashboard.moliya.debts', cols: 3 },
    { id: 'umumiy.weeklyAttendance', titleKey: 'dashboard.umumiy.weeklyAttendance', cols: 3 },
    { id: 'umumiy.roomUtil', titleKey: 'dashboard.umumiy.roomUtil', cols: 3 },
    { id: 'umumiy.groupFill', titleKey: 'dashboard.umumiy.groupFill', cols: 3 },
    { id: 'umumiy.teachers', titleKey: 'dashboard.umumiy.teachers', cols: 3 },
    { id: 'umumiy.yearlyChart', titleKey: 'dashboard.umumiy.yearlyDynamics', cols: 8 },
    { id: 'umumiy.goals', titleKey: 'dashboard.umumiy.monthlyGoals', cols: 4 },
    { id: 'umumiy.alerts', titleKey: 'dashboard.umumiy.alerts', cols: 12 },
  ],
  sotuv: [
    { id: 'sotuv.totalLids', titleKey: 'dashboard.sotuv.totalLids', cols: 3 },
    { id: 'sotuv.successContracts', titleKey: 'dashboard.sotuv.successContracts', cols: 3 },
    { id: 'sotuv.conversion', titleKey: 'dashboard.metrics.conversion', cols: 3 },
    { id: 'sotuv.demoAttended', titleKey: 'dashboard.sotuv.holat.came', cols: 3 },
    { id: 'sotuv.voronka', titleKey: 'dashboard.sotuv.voronkaTitle', cols: 8 },
    { id: 'sotuv.side', titleKey: 'dashboard.sotuv.demographics', cols: 4 },
    {
      id: 'sotuv.telephonyStats',
      titleKey: 'dashboard.telephony.title',
      cols: 12,
      featureFlag: 'ip_telephone.view',
    },
  ],
  oquvchi: [
    { id: 'oquvchi.totalStudents', titleKey: 'dashboard.oquvchi.totalStudents', cols: 3 },
    { id: 'oquvchi.activeGroups', titleKey: 'dashboard.oquvchi.activeGroups', cols: 3 },
    { id: 'oquvchi.avgScore', titleKey: 'dashboard.oquvchi.avgScore', cols: 3 },
    { id: 'oquvchi.debtors', titleKey: 'dashboard.oquvchi.debtors', cols: 3 },
    { id: 'oquvchi.levelChart', titleKey: 'dashboard.oquvchi.levelDistribution', cols: 8 },
    { id: 'oquvchi.scoreChart', titleKey: 'dashboard.oquvchi.scoreDynamics', cols: 4 },
    { id: 'oquvchi.weeklyChart', titleKey: 'dashboard.oquvchi.weeklyAttendance', cols: 8 },
    { id: 'oquvchi.topStudents', titleKey: 'dashboard.oquvchi.topStudents', cols: 4 },
  ],
  oqituvchi: [
    { id: 'oqituvchi.totalTeachers', titleKey: 'dashboard.oqituvchi.totalTeachers', cols: 3 },
    { id: 'oqituvchi.avgWorkload', titleKey: 'dashboard.oqituvchi.avgWorkload', cols: 3 },
    { id: 'oqituvchi.staffAttendance', titleKey: 'dashboard.oqituvchi.staffAttendance', cols: 3 },
    { id: 'oqituvchi.weeklyLate', titleKey: 'dashboard.oqituvchi.weeklyLate', cols: 3 },
    { id: 'oqituvchi.matrix', titleKey: 'dashboard.oqituvchi.matrixTitle', cols: 8 },
    { id: 'oqituvchi.leave', titleKey: 'dashboard.oqituvchi.leaveTitle', cols: 4 },
    { id: 'oqituvchi.roomsGrid', titleKey: 'dashboard.oqituvchi.roomsTitle', cols: 12 },
  ],
  moliya: [
    { id: 'moliya.totalIncome', titleKey: 'dashboard.moliya.totalIncome', cols: 3 },
    { id: 'moliya.totalExpense', titleKey: 'dashboard.moliya.totalExpense', cols: 3 },
    { id: 'moliya.netProfit', titleKey: 'dashboard.moliya.netProfit', cols: 3 },
    { id: 'moliya.debtStat', titleKey: 'dashboard.moliya.debts', cols: 3 },
    { id: 'moliya.profitTrend', titleKey: 'dashboard.moliya.profitTrend', cols: 8 },
    { id: 'moliya.expenseStructure', titleKey: 'dashboard.moliya.expenseStructure', cols: 4 },
    { id: 'moliya.debtors', titleKey: 'dashboard.moliya.debtorsTitle', cols: 12 },
  ],
} as const satisfies Record<MainTab, readonly SectionMeta[]>;

/** Tabning vidjet id'lari (tab komponenti shu kalitlar bilan obyekt qaytaradi). */
export type SectionIds<T extends MainTab> = (typeof SECTION_DEFS)[T][number]['id'];

const TABS = Object.keys(SECTION_DEFS) as MainTab[];

/** Barcha vidjet ta'riflari — eski dizayndagi yuqoridan pastga tartibda. */
export const WIDGET_REGISTRY: WidgetDef[] = TABS.flatMap((category) =>
  (SECTION_DEFS[category] as readonly SectionMeta[]).map((def) => ({
    id: def.id,
    category,
    titleKey: def.titleKey,
    defaultCols: def.cols,
    featureFlag: def.featureFlag,
    Component: sectionComponent(def.id),
  })),
);

export function widgetsByCategory(category: string): WidgetDef[] {
  return WIDGET_REGISTRY.filter((w) => w.category === category);
}
