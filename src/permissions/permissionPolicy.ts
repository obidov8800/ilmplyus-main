/**
 * ROL RUXSATLARI QOIDALARI — Rollar sahifasi (Admin va User) shu fayldan foydalanadi. Fayl ikkala ilovada BIR XIL.
 *
 *  - `view`   = «Sahifani ko'rish»: menyuda bo'lim chiqadi va jadval (ro'yxat) ochiladi. Sahifa to'liq ishlashi uchun
 *               shu ruxsat YETADI — boshqa bo'limning ruxsati kerak emas (tanlovlar `/options` dan, `lookups.view` bilan).
 *  - `show`   = «Ko'rish»: bitta yozuvning to'liq ma'lumoti (ko'z tugmasi).
 *  - `create` / `edit` / `delete` — o'z amallari. Bog'liqliklar (`edit` ⇒ `show` ⇒ `view`…): `permissionDeps.ts`.
 *  - `view_all` — alohida katakcha emas: «Sahifani ko'rish» yonidagi «Qamrov: o'ziniki / hammasi» tugmasi.
 *  - `lookups.*` — Rollar sahifasida ko'rinmaydi, saqlashda o'zi qo'shiladi/olib tashlanadi (`permissionDeps.ts`).
 *  - Filial va davomat bo'limlari — ruxsat emas, foydalanuvchiga biriktiriladi.
 */

export interface PermissionEntry {
  id: number;
  /** To'liq kod: `modul.amal`. */
  name: string;
  module: string;
  action: string;
}

/** Matritsadagi beshta asosiy ustun — har bo'limda shu tartibda. Qolgan amallar «Qo'shimcha» ustunida. */
export const STANDARD_ACTIONS = ['view', 'show', 'create', 'edit', 'delete'] as const;
export type StandardAction = (typeof STANDARD_ACTIONS)[number];

/** Qamrov amali: `<modul>.view_all` — «hammasi»; yo'q bo'lsa «o'ziniki». */
export const SCOPE_ACTION = 'view_all';

/** Rolga avtomatik qo'shiladigan YAGONA ruxsat (forma tanlovlari, `/options/*`). */
export const AUTO_PERMISSION = 'lookups.view';

export function splitName(name: string): { module: string; action: string } {
  const [module = '', ...rest] = name.split('.');
  return { module, action: rest.join('.') };
}

/** Endi ishlatilmaydigan ruxsatlar: Rollar sahifasida ko'rinmaydi va rol saqlanganda ro'yxatdan chiqib ketadi. */
export function isRetiredPermission(name: string): boolean {
  return (
    name.endsWith('.view_all_branches') ||
    name === 'jamgarmas.view_all' ||
    name === 'chart_of_accounts.view_all' ||
    // Davomat bo'limlari foydalanuvchiga biriktiriladi; `attendance.department.*` backenddan olib tashlangan.
    name.startsWith('attendance.department.')
  );
}

/** `lookups.*` — avtomatik (`permissionDeps.withAutoLookups`). */
export function isAutoPermission(name: string): boolean {
  return splitName(name).module === 'lookups';
}

/** Rollar sahifasida ko'rinmaydi, lekin rolda bo'lsa o'zgarishsiz saqlanib qoladi. */
export function isKeptHiddenPermission(name: string): boolean {
  return splitName(name).module === 'permissions';
}

export function isHiddenPermission(name: string): boolean {
  return isRetiredPermission(name) || isAutoPermission(name) || isKeptHiddenPermission(name);
}

/** Backend `/permissions` javobidan (massiv yoki `{data}`) yagona ro'yxat. */
export function indexPermissions(all: unknown): { entries: PermissionEntry[]; byName: Map<string, PermissionEntry> } {
  const list: unknown[] = Array.isArray(all)
    ? all
    : Array.isArray((all as { data?: unknown[] } | null)?.data)
      ? (all as { data: unknown[] }).data
      : [];
  const byName = new Map<string, PermissionEntry>();
  for (const raw of list) {
    const item = raw as { id?: number; name?: string } | null;
    const id = Number(item?.id);
    const name = item?.name;
    if (!name || !Number.isFinite(id) || byName.has(name)) continue;
    const { module, action } = splitName(name);
    if (!module || !action) continue;
    byName.set(name, { id, name, module, action });
  }
  return { entries: [...byName.values()], byName };
}

/** Rol yozuvidagi ruxsatlar (`[{name}]` yoki `['a.b']`) — nomlar to'plami. */
export function namesOf(permissions: unknown): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(permissions)) return names;
  for (const raw of permissions) {
    const name = typeof raw === 'string' ? raw : (raw as { name?: string } | null)?.name;
    if (name) names.add(name);
  }
  return names;
}

/* ── Matritsa qatorlari ── */

export interface ModuleRow {
  module: string;
  /** Beshta asosiy amal (bo'limda bo'lmasa — katak bo'sh). */
  standard: Partial<Record<StandardAction, PermissionEntry>>;
  /** Tasdiqlash, yuborish, qabul qilish… — «Qo'shimcha» ustuni. */
  extras: PermissionEntry[];
  /** `<modul>.view_all` bo'lsa — «Qamrov» tugmasi. */
  scope?: PermissionEntry;
}

/** Ba'zi bo'limlarda faqat shu amallar ko'rsatiladi (qolganlari rolda saqlanib qoladi, lekin ko'rinmaydi). */
const DISPLAY_ONLY: Record<string, string[]> = {
  lessons_schedules: ['view'],
};

/** Backend ruxsatlaridan matritsa qatorlari (yashirinlarsiz). */
export function buildModuleRows(entries: PermissionEntry[]): ModuleRow[] {
  const rows = new Map<string, ModuleRow>();
  for (const entry of entries) {
    if (isHiddenPermission(entry.name)) continue;
    const only = DISPLAY_ONLY[entry.module];
    if (only && !only.includes(entry.action)) continue;
    const row = rows.get(entry.module) ?? { module: entry.module, standard: {}, extras: [] };
    rows.set(entry.module, row);
    if ((STANDARD_ACTIONS as readonly string[]).includes(entry.action)) row.standard[entry.action as StandardAction] = entry;
    else if (entry.action === SCOPE_ACTION) row.scope = entry;
    else row.extras.push(entry);
  }
  for (const row of rows.values()) row.extras.sort((a, b) => a.action.localeCompare(b.action));
  return [...rows.values()];
}

/** Qatorda ko'rinadigan barcha ruxsatlar (asosiy + qamrov + qo'shimcha). */
export function rowEntries(row: ModuleRow): PermissionEntry[] {
  const list: PermissionEntry[] = [];
  for (const action of STANDARD_ACTIONS) {
    const entry = row.standard[action];
    if (entry) list.push(entry);
  }
  if (row.scope) list.push(row.scope);
  return [...list, ...row.extras];
}

/* ── Bo'limlar (Rollar sahifasidagi tablar) ── */

export interface SectionDef {
  key: 'pedagogical' | 'financial' | 'administrative' | 'sales';
  title: string;
  modules: string[];
}

export const PERMISSION_SECTIONS: SectionDef[] = [
  {
    key: 'pedagogical',
    title: 'Pedagogik',
    modules: [
      'groups', 'lessons_schedules', 'lessons', 'student_attendance', 'demo_lessons', 'homework_submissions',
      'level_promotions', 'tests', 'questions', 'exam_sessions', 'exam_attempts', 'exam_reports', 'academic_years',
      'preschool_attendances',
    ],
  },
  {
    key: 'financial',
    title: 'Moliyaviy',
    modules: [
      'payments', 'payment_commission_logs', 'payment_gateway_commissions', 'expenses', 'expense_categories',
      'expense_subcategories', 'jamgarmas', 'jamgarma_names', 'jamgarma_transactions', 'jamgarma_loans',
      'jamgarma_loan_repayments', 'jamgarma_loan_forfeitures', 'chart_of_accounts', 'chart_of_accounts_transfers',
      'account_to_jamgarma_transfers', 'daily_cash_reports', 'financial_plans', 'branch_reports',
      'monthly_accounting_reports', 'employee_fines', 'fine_types', 'payroll_sheets', 'payroll_adjustments',
      'payroll_distributions', 'payroll_periods', 'payroll_settings', 'course_prices', 'preschool_prices',
    ],
  },
  {
    key: 'administrative',
    title: 'Ma’muriy',
    modules: [
      'users', 'user_work_schedules', 'work_schedules', 'roles', 'permissions', 'admin', 'lookups', 'employees',
      'employee_contracts', 'positions', 'departments', 'attendance', 'hikvision_devices', 'branches', 'rooms',
      'courses', 'levels', 'regions', 'districts', 'students', 'student_contracts', 'preschool_contracts', 'settings',
      'login_histories', 'trash',
    ],
  },
  {
    key: 'sales',
    title: 'Sotuv va boshqa',
    modules: ['lids', 'sources', 'rejection_reasons', 'ip_telefon_operators', 'tasks'],
  },
];

/** Ro'yxatda bo'lmagan yangi bo'lim — oxirgi bo'limga tushadi (hech narsa yashirinib qolmaydi). */
const FALLBACK_SECTION = PERMISSION_SECTIONS[PERMISSION_SECTIONS.length - 1];

const SECTION_OF = new Map<string, SectionDef>();
for (const section of PERMISSION_SECTIONS) for (const module of section.modules) SECTION_OF.set(module, section);

export function sectionOf(module: string): SectionDef {
  return SECTION_OF.get(module) ?? FALLBACK_SECTION;
}

/** Bitta sahifada chiqadigan bo'limlar — Rollar sahifasida bitta sarlavha ostida. */
export interface PageBundle {
  key: string;
  title: string;
  modules: string[];
}

export const PAGE_BUNDLES: PageBundle[] = [
  {
    key: 'debts',
    title: 'Jamg‘armalar o‘rtasidagi o‘tkazmalar (qarz berish, qaytarish, kechirish)',
    modules: ['jamgarma_loans', 'jamgarma_loan_repayments', 'jamgarma_loan_forfeitures'],
  },
];

export type SectionItem = { kind: 'row'; row: ModuleRow } | { kind: 'bundle'; bundle: PageBundle; rows: ModuleRow[] };

/** Bo'limlar: tartib qat'iy, bo'lim ichida — yorliq bo'yicha; bir sahifadagi bo'limlar bitta guruhda. */
export function layoutSections(
  rows: ModuleRow[],
  labelOf: (module: string) => string,
): { section: SectionDef; items: SectionItem[]; rows: ModuleRow[] }[] {
  const bundleOf = new Map<string, PageBundle>();
  for (const bundle of PAGE_BUNDLES) for (const module of bundle.modules) bundleOf.set(module, bundle);

  return PERMISSION_SECTIONS.map((section) => {
    const own = rows
      .filter((row) => sectionOf(row.module).key === section.key)
      .sort((a, b) => labelOf(a.module).localeCompare(labelOf(b.module)));
    const items: SectionItem[] = [];
    const placed = new Set<string>();
    for (const row of own) {
      if (placed.has(row.module)) continue;
      const bundle = bundleOf.get(row.module);
      if (!bundle) {
        items.push({ kind: 'row', row });
        continue;
      }
      const members = bundle.modules
        .map((module) => own.find((r) => r.module === module))
        .filter((r): r is ModuleRow => !!r);
      members.forEach((r) => placed.add(r.module));
      items.push(members.length > 1 ? { kind: 'bundle', bundle, rows: members } : { kind: 'row', row });
    }
    return { section, items, rows: own };
  }).filter((entry) => entry.rows.length > 0);
}

/* ── Shablonlar (boshlang'ich taklif: admin keyin o'zgartira oladi) ── */

export interface RoleTemplate {
  key: 'teacher' | 'manager' | 'cashier' | 'accountant';
  title: string;
  /** Belgilanadigan ruxsatlar; bog'liqliklar (`view`, `show`, `lookups.view`) `permissionDeps.templateSelection` da qo'shiladi. */
  permissions: string[];
  /** Qamrov: `all` — mavjud `*.view_all` belgilanadi; `own` — belgilanmaydi. */
  scope: 'own' | 'all';
  /** «Hammasi» qamrovi qaysi bo'limlarda belgilanadi. */
  scopeModules: string[];
}

const TEACHER_PERMISSIONS = [
  'groups.view', 'groups.show',
  'lessons_schedules.view',
  // `lessons.edit` — «Darsni boshlash / tamomlash» (backend `POST /lessons/{id}/start|end`) va uy vazifasini saqlash
  // (`PUT /lessons/{id}`) AYNAN shu ruxsat bilan: usiz o'qituvchi darsni boshlay olmaydi, demak davomat ham qo'ya olmaydi.
  'lessons.view', 'lessons.show', 'lessons.create', 'lessons.edit',
  'student_attendance.view', 'student_attendance.create',
  'demo_lessons.view', 'demo_lessons.show', 'demo_lessons.create', 'demo_lessons.edit', 'demo_lessons.mark_attendance',
  'homework_submissions.view', 'homework_submissions.show', 'homework_submissions.create', 'homework_submissions.edit',
];

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { key: 'teacher', title: 'O‘qituvchi', permissions: TEACHER_PERMISSIONS, scope: 'own', scopeModules: ['groups'] },
  {
    key: 'manager',
    title: 'Menejer',
    permissions: [
      ...TEACHER_PERMISSIONS,
      'groups.create', 'groups.edit',
      'students.view', 'students.show', 'students.create', 'students.edit', 'students.attach_group',
      'student_contracts.view', 'student_contracts.show', 'student_contracts.create', 'student_contracts.edit',
    ],
    scope: 'all',
    scopeModules: ['groups'],
  },
  {
    key: 'cashier',
    title: 'Kassir',
    permissions: [
      'payments.view', 'payments.show', 'payments.create',
      'daily_cash_reports.view', 'daily_cash_reports.close_shift', 'daily_cash_reports.send',
    ],
    scope: 'own',
    scopeModules: ['payments'],
  },
  {
    key: 'accountant',
    title: 'Buxgalter',
    permissions: [
      'payments.view', 'payments.show',
      'expenses.view', 'expenses.show', 'expenses.create', 'expenses.edit',
      'daily_cash_reports.view', 'daily_cash_reports.accept', 'daily_cash_reports.approve',
      'monthly_accounting_reports.view',
    ],
    scope: 'all',
    scopeModules: ['payments'],
  },
];
