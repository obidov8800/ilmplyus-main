import type { User } from '../types/user.types';
import { isAdminUser } from './isAdminUser';

/**
 * Foydalanuvchi qaysi filiallar bilan CHEKLANGAN: faqat o'ziga biriktirilgan filiallarda to'lov/chiqim kirita
 * oladi, filial tanlovlarida faqat shular chiqadi. `null` — cheklov yo'q (hamma filial).
 *
 * «Hamma filial» ruxsati YO'Q: foydalanuvchiga kerakli filiallar (xohlasa — hammasi) Admin'da biriktiriladi.
 * Faqat admin / Super admin cheklanmaydi.
 *
 * DIQQAT: bu faqat interfeys; haqiqiy cheklov backendda (`BranchAccess`).
 */
export function getBranchScope(user: User | null | undefined): number[] | null {
  if (!user) return [];
  if (isAdminUser(user as never)) return null;

  const assigned = user.branches?.length ? user.branches : user.branch ? [user.branch] : [];
  return [...new Set(assigned.map((b) => Number(b.id)).filter((id) => Number.isFinite(id)))];
}

/** Cheklov bo'lsa faqat ruxsat etilgan filiallarni qoldiradi. */
export function filterByBranchScope<T extends { id: number }>(items: T[], scope: number[] | null): T[] {
  return scope ? items.filter((item) => scope.includes(Number(item.id))) : items;
}

/**
 * `/options/{entity}` ro'yxatini filial doirasiga keltiradi: filiallarning o'zi `id` bo'yicha, o'quvchi, guruh
 * va jamg'armalar `branch_id` bo'yicha (kassir boshqa filial o'quvchisiga to'lov, boshqa filial jamg'armasidan chiqim
 * kirita olmasin). Boshqa entity'larga tegilmaydi.
 */
export function scopeOptionItems<T extends { id: number; branch_id?: number | null }>(
  entity: string,
  items: T[],
  scope: number[] | null,
): T[] {
  if (!scope) return items;
  if (entity === 'branches') return items.filter((item) => scope.includes(Number(item.id)));
  if (entity === 'students' || entity === 'groups' || entity === 'jamgarmas' || entity === 'employees') {
    return items.filter((item) => item.branch_id == null || scope.includes(Number(item.branch_id)));
  }
  return items;
}
