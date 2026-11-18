import type { User } from '../types/user.types';

/**
 * Foydalanuvchi roli backenddan uch xil ko'rinishda kelishi mumkin:
 * `role` — satr, `role` — obyekt, yoki `roles[]` massivi. Shu yerda hammasi
 * bitta ro'yxatga keltiriladi.
 */
export const getRoleNames = (user: User | null | undefined): string[] => {
  if (!user) return [];

  const names: string[] = [];

  if (typeof user.role === 'string') {
    names.push(user.role);
  } else if (user.role && typeof user.role === 'object') {
    const name = (user.role as { name?: string }).name;
    if (name) names.push(name);
  }

  for (const role of user.roles ?? []) {
    if (role?.name) names.push(role.name);
  }

  return names.map((name) => name.toLowerCase().trim());
};

/** Birinchi (asosiy) rol nomi. */
export const getRoleName = (user: User | null | undefined): string => getRoleNames(user)[0] ?? '';

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

/** `Super admin`, `super_admin`, `super-admin`, `SuperAdmin` → `superadmin` (Admin ilovasi `fullAccess.ts` bilan bir xil). */
const normalizeRole = (name: string) => name.replace(/[\s_-]/g, '');

/** Texnik ma'lumot (ruxsat kodlari, xatolik tafsilotlari) ko'rsatsa bo'ladimi. */
export const isAdminUser = (user: User | null | undefined): boolean =>
  getRoleNames(user).some((name) => ADMIN_ROLES.has(normalizeRole(name)));
