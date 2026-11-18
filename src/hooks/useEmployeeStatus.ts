import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import { isAdminUser } from '../utils/roles';
import { fetchOptions } from '../api/options';
import { getBranchScope } from '../utils/branchScope';

/**
 * Joriy foydalanuvchining xodim/shartnoma holati:
 *  - `ok`          — xodim yozuvi bor (va, backend bildirsa, FAOL shartnoma ham);
 *  - `no_employee` — foydalanuvchiga xodim yozuvi bog'lanmagan (JSHSHIR yo'q yoki xodimlar ro'yxatida topilmadi);
 *  - `no_contract` — xodim bor, lekin faol shartnomasi yo'q (backend `/me` da `employee.has_active_contract` bersa);
 *  - `unknown`     — hali aniqlanmagan (yuklanmoqda) yoki ruxsat yo'q — ogohlantirish CHIQMAYDI.
 *
 * Admin / Super admin uchun doim `ok` (ular shartnomasiz ham ishlay oladi).
 * Eslatma: shartnoma FAOLLIGI faqat backend `/me` ga `employee.has_active_contract` qo'shsa aniqlanadi
 * (`backend-topshiriqlar-2026-10-31-ruxsatlar.md`); hozir faqat xodim yozuvi bor-yo'qligi tekshiriladi.
 */
export type EmployeeStatus = 'ok' | 'no_employee' | 'no_contract' | 'unknown';

export function useEmployeeStatus(): EmployeeStatus {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const full = isAdminUser(user);
  const canLookup = permissions.includes('lookups.view');

  const embedded = user?.employee;
  const pinfl = (user?.pinfl ?? '').trim();
  const needLookup = !!user && !full && !embedded && !!pinfl && canLookup;

  // Xodim yozuvi kamdan-kam o'zgaradi: uzoq keshlanadi va real vaqt yangilashiga kirmaydi (har 30 s da butun ro'yxat tortilmasin).
  const { data: employees } = useQuery({
    queryKey: ['employee-status', user?.id, pinfl],
    // PINFL javobda qaytmaydi (backend B2) — server `?pinfl=` bo'yicha filtrlaydi, topilsa xodim bor.
    queryFn: () => fetchOptions('employees', { pinfl }),
    enabled: needLookup,
    staleTime: 10 * 60 * 1000,
    meta: { noAutoSync: true },
  });

  if (!user || full) return 'ok';
  // O'z login/paroli bilan kirgan xodim (`/employee/login`): hisob xodimning o'zi, shartnomasiz kira olmaydi —
  // PINFL bo'yicha qidirib «shartnomangiz yo'q» ogohlantirishini chiqarmaymiz.
  if (user.account_type === 'employee') return 'ok';
  if (embedded)return embedded.has_active_contract === false ? 'no_contract' : 'ok';
  if (!pinfl) return 'no_employee';
  if (!employees) return 'unknown';
  return employees.length > 0 ? 'ok' : 'no_employee';
}

/**
 * Foydalanuvchiga filial BIRIKTIRILMAGAN — backend `/me` da `branches` ro'yxatini (bo'sh) bersa va admin
 * bo'lmasa. `branches` kelmasa (eski backend) — `false` (noma'lum).
 */
export function useHasNoBranch(): boolean {
  const user = useAuthStore((state) => state.user);
  if (!user || isAdminUser(user)) return false;
  if (getBranchScope(user)?.length) return false;
  return Array.isArray(user.branches) && user.branches.length === 0;
}
