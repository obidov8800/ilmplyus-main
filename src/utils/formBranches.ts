import type { User } from '@/types/user.types';
import type { Option } from '@/api/options';
import { isAdminUser } from './isAdminUser';

/**
 * Forma (to'lov, chiqim) dagi «Filial» tanlovi.
 *
 * - Admin / Super admin uchun backend qaytargan barcha filial taklif qilinadi.
 * - Boshqalar uchun faqat o'ziga biriktirilgan filiallar (backend `/options/branches` ham shunday kesadi).
 */
export function formBranches(user: User | null, options: Option[] = []): Option[] {
  if (isAdminUser(user as never)) return options;

  const assigned = user?.branches?.length ? user.branches : user?.branch ? [user.branch] : [];
  const ids = assigned.length ? assigned.map((b) => b.id) : user?.branch_id ? [user.branch_id] : [];
  if (!ids.length) return [];
  return [...new Set(ids)].map((id) => options.find((b) => Number(b.id) === Number(id)) ?? {
    id,
    label: assigned.find((b) => b.id === id)?.name_uz || String(id),
  });
}

export function selectedFormBranch(options: Option[], choice: string): string {
  if (options.length === 1) return String(options[0].id);
  return options.some((b) => String(b.id) === choice) ? choice : '';
}
