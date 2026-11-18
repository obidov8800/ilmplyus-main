import { useCallback } from 'react';
import useAuthStore from '@/store/useAuthStore';
import { ownEmployeeId } from '@/permissions/scope';

/** Guruh/demo dars o'qituvchisi (kerakli maydonlar). */
export interface TeacherRef {
  id?: number | null;
}

/**
 * Joriy hisob — o'qituvchi (xodim) sifatida: «o'z guruhlari»ni ajratish uchun. Qoida bitta (`permissions/scope.ts`):
 * guruh o'qituvchisi = joriy hisobning xodim id si — o'zi kirgan xodimda `employee.id` (`user.id`), foydalanuvchida
 * `user.employee.id` (`/me`). PINFL bo'yicha qidiruv yo'q (`/options` PINFL qaytarmasligi kerak).
 */
export function useOwnTeacher() {
  const user = useAuthStore((state) => state.user);
  const employeeId = ownEmployeeId(user);
  const isEmployeeAccount = user?.account_type === 'employee';

  const isOwnTeacher = useCallback(
    (teacher: TeacherRef | null | undefined): boolean =>
      !!teacher && !!employeeId && Number(teacher.id) === Number(employeeId),
    [employeeId],
  );

  return { isOwnTeacher, isEmployeeAccount, employeeId, isLoading: false };
}
