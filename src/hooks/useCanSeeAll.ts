import useAuthStore from '@/store/useAuthStore';
import { canSeeAll } from '@/permissions/scope';
import { usePermission } from '@/hooks/usePermission';

/**
 * Qamrov: bo'limda hamma yozuvlar (true) yoki faqat o'ziniki (false). Qaror BITTA joyda — `permissions/scope.ts`;
 * sahifalar rol nomiga qarab o'zi hal qilmaydi.
 */
export function useCanSeeAll(module: string): boolean {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  // `usePermission` bilan bir xil: `admin` rolida ruxsat nomi tekshirilmaydi.
  return canSeeAll(module, { fullAccess: user?.role === 'admin', has: (name) => permissions.includes(name) });
}

/**
 * O'qituvchi rejimi (guruhlar qamrovi «o'ziniki»): «Guruhlar» sahifasi (o'z guruhlari kartalari) va «O'quvchi davomati»
 * (guruh tanlash) BIR XIL kartalarni ko'rsatadi — menyuda (yon panel va mobil panel) bitta «Guruhlar» qoladi, karta
 * bosilganda davomat ochiladi va u yerda ham «Guruhlar» faol ko'rinadi.
 */
export function useTeacherGroupsMerged(): boolean {
  const seeAllGroups = useCanSeeAll('groups');
  const canViewGroups = usePermission('groups.view');
  const canViewAttendance = usePermission('student_attendance.view');
  const canMarkAttendance = usePermission('student_attendance.create');
  return !seeAllGroups && canViewGroups && (canViewAttendance || canMarkAttendance);
}

/** «Guruhlar» menyu bandi shu sahifalarda ham faol (birlashtirilgan o'qituvchi rejimida). */
export const MERGED_GROUPS_PATHS = ['/groups', '/students-attendance'];

