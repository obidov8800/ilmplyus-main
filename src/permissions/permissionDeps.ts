/**
 * RUXSAT BOG'LIQLIKLARI — faqat BO'LIM ICHIDA. Boshqa bo'limga bog'liqlik YO'Q («bir sahifa — bir ruxsat»):
 * sahifaga kerak bo'lgan boshqa bo'lim ma'lumoti `/options` dan keladi (`lookups.view`).
 *
 *  - `show`, `create`, `edit`, `delete` belgilansa — shu bo'limning `view` («Sahifani ko'rish») belgilanadi.
 *  - `edit` belgilansa — `show` ham (forma yozuvning to'liq ma'lumotini o'qiydi).
 *  - `view_all` (qamrov «hammasi») — `view` bilan birga.
 *  - «Qo'shimcha» amallar (tasdiqlash, qaytarish, yuborish, tahlil…) ham shu bo'limning `view` iga bog'liq: ular
 *    sahifaning o'zida bajariladi. Ilgari masalan faqat «Tasdiqlash» berilgan rolda sahifa ochilib, ro'yxat so'rovi
 *    «Ruxsat yo'q» qaytarardi. Istisno — sahifasiz ham ma'noga ega amallar (`STANDALONE_PERMISSIONS`).
 *  - Teskari yo'nalish: `view` olib tashlansa — unga bog'liq amallar ham olinadi (`show` olinsa — `edit`).
 *  - `lookups.view` — YAGONA avtomatik ruxsat: rolda kamida bitta ruxsat bo'lsa qo'shiladi, rol bo'sh bo'lsa olinadi.
 *
 * Fayl ikkala ilovada (Admin va User) BIR XIL.
 */
import {
  AUTO_PERMISSION,
  SCOPE_ACTION,
  isAutoPermission,
  isRetiredPermission,
  splitName,
  type RoleTemplate,
} from './permissionPolicy';

/** Amal → shu bo'limda u bilan birga kerak bo'ladigan amallar. */
export const ACTION_REQUIRES: Record<string, string[]> = {
  show: ['view'],
  create: ['view'],
  edit: ['view', 'show'],
  delete: ['view'],
  [SCOPE_ACTION]: ['view'],
};

/**
 * Sahifasiz ham ma'noga ega ruxsatlar — bo'limning `view` ini talab qilmaydi (boshqa sahifadagi tugma yoki
 * tizim darajasidagi belgi): ish vaqtidan tashqari ishlash, hisobot mas'uli, o'quvchini guruhga biriktirish va h.k.
 */
export const STANDALONE_PERMISSIONS: ReadonlySet<string> = new Set([
  'user_work_schedules.bypass',
  'daily_cash_reports.responsible',
  'students.attach_group',
  'monthly_accounting_reports.add_expense',
  'payroll_periods.close',
  'payroll_periods.reopen',
]);

/**
 * Sahifasi `show` ma'lumotisiz ishlamaydigan bo'limlar: «Sahifani ko'rish» belgilansa «Ko'rish» ham belgilanadi.
 * `payroll_sheets` — Avans/Oylik jadvali sahifasi vedomost qatorlarini (`/payroll/sheets/{id}/rows`) ko'rsatadi,
 * backend esa ularga `payroll_sheets.show` talab qiladi: faqat `view` bilan sahifa ochilib, jadval «Ruxsat yo'q» bo'lardi.
 */
export const VIEW_REQUIRES: Record<string, string[]> = {
  payroll_sheets: ['show'],
};

/**
 * Bitta amal ikki nom bilan yuradigan bo'limlar: Rollar sahifasidagi «Tahrirlash» (`edit`) va backend marshruti
 * tekshiradigan nom. `student_attendance`: mavjud davomat/bahoni saqlash (`PUT /student_attendance/{id}`) backendda
 * `student_attendance.update` bilan himoyalangan, `.edit` ni esa hech bir marshrut tekshirmaydi — faqat «Tahrirlash»
 * berilgan rolda saqlash «Ruxsat yo'q» qaytarardi. Shu sabab biri belgilansa ikkinchisi ham belgilanadi (olinsa — olinadi).
 */
export const PAIRED_PERMISSIONS: Record<string, string[]> = {
  'student_attendance.edit': ['update'],
  'student_attendance.update': ['edit'],
};

type Exists = (name: string) => boolean;

/** Ruxsat → shu bo'limda u bilan birga kerak bo'ladigan amallar. */
export function requiresOf(module: string, action: string): string[] {
  const paired = PAIRED_PERMISSIONS[`${module}.${action}`] ?? [];
  if (action === 'view') return [...(VIEW_REQUIRES[module] ?? []), ...paired];
  const explicit = ACTION_REQUIRES[action];
  if (explicit) return [...explicit, ...paired];
  // Qo'shimcha amal (approve, revert, send, analysis…) — sahifaning o'zi ham kerak.
  return [...(STANDALONE_PERMISSIONS.has(`${module}.${action}`) ? [] : ['view']), ...paired];
}

/** Bog'liqliklarni qo'shadi (faqat mavjud ruxsatlar). */
export function withDeps(names: Iterable<string>, exists: Exists): Set<string> {
  const result = new Set(names);
  // Yangi qo'shilgan ruxsatning o'z bog'liqliklari ham hisobga olinadi (masalan `approve` → `view` → `show`).
  const queue = [...result];
  while (queue.length > 0) {
    const { module, action } = splitName(queue.pop() as string);
    for (const need of requiresOf(module, action)) {
      const full = `${module}.${need}`;
      if (exists(full) && !result.has(full)) {
        result.add(full);
        queue.push(full);
      }
    }
  }
  return result;
}

/** Bitta katakchani belgilash/olib tashlash — bog'liqliklar bilan. */
export function togglePermission(selected: Set<string>, name: string, checked: boolean, exists: Exists): Set<string> {
  if (checked) return withDeps([...selected, name], exists);
  const next = new Set(selected);
  next.delete(name);
  // Olib tashlangan amalga bog'liq qolganlar ham olinadi (`view` olinsa — bo'limning hamma amali; `show` olinsa — `edit`).
  const { module } = splitName(name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const other of [...next]) {
      const { module: otherModule, action } = splitName(other);
      if (otherModule !== module) continue;
      const broken = requiresOf(otherModule, action).some((need) => {
        const full = `${otherModule}.${need}`;
        return exists(full) && !next.has(full);
      });
      if (broken) {
        next.delete(other);
        changed = true;
      }
    }
  }
  return next;
}

/** `lookups.*` ni rol tarkibiga moslaydi: bo'sh rolda yo'q, aks holda `lookups.view` bor. */
export function withAutoLookups(names: Iterable<string>, exists: Exists): Set<string> {
  const result = new Set([...names].filter((name) => !isAutoPermission(name)));
  if (result.size > 0 && exists(AUTO_PERMISSION)) result.add(AUTO_PERMISSION);
  return result;
}

/** Saqlanadigan to'plam: eskirganlar tushadi, `lookups.view` avtomatik. */
export function finalizeForSave(names: Iterable<string>, exists: Exists): Set<string> {
  return withAutoLookups(
    [...names].filter((name) => !isRetiredPermission(name)),
    exists,
  );
}

/** Shablon to'plami (bog'liqliklar va qamrov bilan; tizimda yo'q ruxsatlar tashlab ketiladi). */
export function templateSelection(template: RoleTemplate, exists: Exists): Set<string> {
  const names = template.permissions.filter(exists);
  if (template.scope === 'all') {
    for (const module of template.scopeModules) {
      const scope = `${module}.${SCOPE_ACTION}`;
      if (exists(scope)) names.push(scope);
    }
  }
  return withDeps(names, exists);
}
