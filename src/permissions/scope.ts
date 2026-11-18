/**
 * QAMROV: «o'ziniki yoki hammasi» — BITTA funksiya (`canSeeAll`). Sahifalar rol nomiga qarab o'zi qaror qilmaydi;
 * backend o'zgarganda faqat shu fayl tuzatiladi. Fayl ikkala ilovada (Admin va User) BIR XIL.
 *
 *  | Bo'lim                                   | Hozir                                   | Backend B3 dan keyin |
 *  | To'lovlar (`payments`)                   | `payments.view_all` (backend filtrlaydi) | o'zgarmaydi          |
 *  | Guruhlar, Dars jadvali, Darslar, Davomat, | `groups.create` bor — hammasi,          | `groups.view_all`    |
 *  | Demo dars, Uy vazifa                     | yo'q — o'z guruhlari                    |                      |
 *
 * «O'z guruhlari»: guruh o'qituvchisi = joriy hisobning xodim id si (`ownEmployeeId`).
 */

/** Backend B3 (`groups.view_all` va o'qituvchiga faqat o'z guruhlari) — stage15 bilan birga `true`. */
export const GROUPS_VIEW_ALL_READY = true;

/** Qamrovi guruh bo'yicha aniqlanadigan bo'limlar. */
export const GROUP_SCOPED_MODULES = [
  'groups',
  'lessons_schedules',
  'lessons',
  'student_attendance',
  'demo_lessons',
  'homework_submissions',
] as const;

export interface ScopeContext {
  /** To'liq huquqli rol (admin / Super admin) — hamma narsa ko'rinadi. */
  fullAccess: boolean;
  has: (permission: string) => boolean;
}

/** Bo'limda boshqalarning yozuvlari (hammasi) ham ko'rinadimi. */
export function canSeeAll(module: string, ctx: ScopeContext): boolean {
  if (ctx.fullAccess) return true;
  if (module === 'payments') return ctx.has('payments.view_all');
  if ((GROUP_SCOPED_MODULES as readonly string[]).includes(module)) {
    if (ctx.has('groups.view_all')) return true;
    return !GROUPS_VIEW_ALL_READY && ctx.has('groups.create');
  }
  // Qolgan bo'limlarda «o'ziniki» qamrovi yo'q (filial bo'yicha — backend).
  return true;
}

export interface ScopeAccount {
  /** `employee` — o'zi kirgan xodim (`/employee/login`): `id` — `employees.id`. */
  account_type?: string | null;
  id?: number | null;
  /** Xodim-foydalanuvchi (`users`): `/me` dagi bog'langan xodim yozuvi. */
  employee?: { id?: number | null } | null;
}

/** Joriy hisobning xodim id si: o'zi kirgan xodimda `id`, foydalanuvchida `employee.id`. */
export function ownEmployeeId(account: ScopeAccount | null | undefined): number | undefined {
  if (!account) return undefined;
  if (account.account_type === 'employee') return account.id ?? undefined;
  return account.employee?.id ?? undefined;
}
