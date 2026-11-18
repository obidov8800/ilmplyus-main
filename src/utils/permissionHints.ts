/**
 * 403 javobini o'qiladigan xabarga aylantiradi.
 *
 * Toastda faqat «Sahifa mavjud emas» yozilsa, qaysi ruxsat yetishmayotganini
 * bilish uchun har safar DevTools'dan so'rovni qidirishga to'g'ri keladi.
 * Shu modul so'rovning o'zidan (metod + URL) backend ruxsat kodini —
 * `resource.action` — va menyudagi sahifa nomini taxmin qiladi.
 *
 * Taxmin backend konventsiyasiga suyanadi:
 *   `/employee-fines`            → `employee_fines`
 *   `GET` → view, `POST` → create, `PUT|PATCH` → edit, `DELETE` → delete
 *   `POST /employee-fines/7/accept` → `employee_fines.accept`
 * Konventsiyaga tushmaydigan yo'llar quyidagi jadvallarda qo'lda ko'rsatilgan.
 *
 * Agar backend javobining o'zida ruxsat kodi bo'lsa (masalan
 * `{"message":"Missing permission: employee_fines.create"}`), taxmin o'rniga
 * o'sha ishlatiladi — `exact: true`.
 */

/** URL yo'lidagi segment ruxsat resursiga to'g'ridan-to'g'ri mos kelmasa. */
const PATH_OVERRIDES: [RegExp, string][] = [
  // Xodim shartnomalari: `/employees/12/contracts/3` → employee_contracts
  [/^employees\/[^/]+\/contracts/, 'employee_contracts'],
  [/^contracts(\/|$)/, 'employee_contracts'],
  // Dropdownlar `/options/{entity}` — hammasi bitta `lookups.view` bilan.
  [/^options(\/|$)/, 'lookups'],
  // Xodimlar davomati endpointi ko'plikda, ruxsat esa birlikda.
  [/^attendances(\/|$)/, 'attendance'],
  [/^student_attendance(\/|$)/, 'student_attendance'],
  [/^course_prices(\/|$)/, 'course_prices'],
  [/^financial-plans(\/|$)/, 'financial_plans'],
  [/^dashboard-settings(\/|$)/, 'dashboard_settings'],
];

/** Ikki segmentdan iborat resurslar (`/payroll/sheets` → payroll_sheets). */
const COMPOUND_PREFIXES = ['payroll/sheets', 'payroll/distributions', 'payroll/adjustments'];

/**
 * URL oxiridagi segment ruxsat amali bo'lishi mumkin bo'lgan so'zlar.
 * Ro'yxatda yo'q segmentlar (masalan `/logs`, `/rows`) amal emas — ular
 * resursning ichki ko'rinishi, ruxsat esa metoddan olinadi.
 */
const ACTION_SEGMENTS = new Set([
  'approve',
  'revert',
  'reject',
  'cancel',
  'accept',
  'send',
  'restore',
  'generate',
  'prepare',
  'distribute',
  'correct',
  'terminate',
  'start',
  'end',
  'force-delete',
  'close-shift',
  'return-for-correction',
  'submit-for-approval',
  'set-inactive',
  'send-sms',
  'grant-retake',
]);

/** GET so'rovlarda ham amal bo'lib qoladigan segmentlar. */
const READ_ACTION_SEGMENTS = new Set(['analysis', 'print']);

/** Resursga xos amal nomlari (umumiy qoidadan chetga chiqadiganlar). */
const ACTION_ALIASES: Record<string, Record<string, string>> = {
  financial_plans: { edit: 'update' },
};

/** Ruxsat resursi → yon menyudagi sahifa nomi. */
const RESOURCE_PAGES: Record<string, string> = {
  lids: 'Sotuv bo\'limi → Lidlar boshqaruvi',
  // «Ro'yxatga olish» sahifasi lidlar bilan ishlaydi; `students.*` esa faqat
  // boshqaruv panelidagi o'quvchilar bloklarida qoldi.
  students: 'Boshqaruv paneli → O\'quvchilar',
  tasks: 'Sotuv bo\'limi → Vazifalar',
  payments: 'To\'lovlar',
  courses: 'Kurslar',
  course_prices: 'Kurslar → Narxlar',
  groups: 'Guruhlar',
  lessons: 'Darslar',
  lessons_schedules: 'Dars jadvali',
  demo_lessons: 'Demo dars',
  tests: 'Test',
  questions: 'Test → Savollar',
  exam_sessions: 'O\'quvchi imtihonlari',
  reports: 'Hisobotlar',
  student_attendance: 'Davomat → O\'quvchilar davomati',
  attendance: 'Davomat → Xodimlar davomati',
  employee_contracts: 'Shartnomalar',
  student_contracts: 'O\'quvchilar shartnomalari',
  preschool_contracts: 'Maktabga tayyorlov shartnomalari',
  employees: 'Xodimlar',
  users: 'Foydalanuvchilar',
  roles: 'Rollar',
  regions: 'Viloyatlar',
  districts: 'Tumanlar',
  branches: 'Filiallar',
  expenses: 'Chiqimlar',
  expense_categories: 'Chiqimlar → Kategoriyalar',
  expense_subcategories: 'Chiqimlar → Ichki kategoriyalar',
  chart_of_accounts: 'Moliya → Hisobotlar',
  chart_of_accounts_transfers: 'Moliya → Hisobotlar (o\'tkazmalar)',
  jamgarmas: 'Moliya → Hisobotlar (jamg\'armalar)',
  jamgarma_transactions: 'Moliya → Hisobotlar (jamg\'arma harakatlari)',
  account_to_jamgarma_transfers: 'Moliya → Hisobotlar (o\'tkazmalar)',
  jamgarma_loans: 'Moliya → Jamg‘armalar o‘rtasidagi o‘tkazmalar (berish)',
  jamgarma_loan_repayments: 'Moliya → Jamg‘armalar o‘rtasidagi o‘tkazmalar (qaytarish)',
  jamgarma_loan_forfeitures: 'Moliya → Jamg‘armalar o‘rtasidagi o‘tkazmalar (kechirish)',
  payroll_adjustments: 'Moliya → Ish haqi tuzatishlari',
  daily_cash_reports: 'Moliya → Kunlik kassa hisobotlari',
  payroll_sheets: 'Moliya → Generatsiya / Avans / Oylik jadvali',
  employee_fines: 'Moliya → Jarimalar',
  fine_types: 'Moliya → Jarimalar (jarima turlari)',
  financial_plans: 'Moliya → Rejalar',
  payroll_distributions: 'Ish haqi taqsimoti',
  lookups: 'Ro\'yxatlar (tanlov maydonlari)',
  dashboard_settings: 'Boshqaruv paneli sozlamalari',
};

/** Sahifasi resursdan boshqa bo'lgan alohida ruxsatlar. */
const PERMISSION_PAGES: Record<string, string> = {
  'financial_plans.analysis': 'Moliya → Oy yakuni tahlili',
};

/** Amal kodi → o'zbekcha nom (toastda o'qishga qulay bo'lsin uchun). */
const ACTION_LABELS: Record<string, string> = {
  view: 'ko\'rish',
  create: 'qo\'shish',
  edit: 'tahrirlash',
  update: 'tahrirlash',
  delete: 'o\'chirish',
  restore: 'tiklash',
  approve: 'tasdiqlash',
  revert: 'tasdiqdan qaytarish',
  reject: 'rad etish',
  cancel: 'bekor qilish',
  accept: 'qabul qilish',
  send: 'yuborish',
  generate: 'generatsiya qilish',
  prepare: 'tayyorlash',
  distribute: 'taqsimlash',
  print: 'chop etish',
  analysis: 'tahlil qilish',
  correct: 'tuzatish',
  terminate: 'bekor qilish',
  close_shift: 'smenani yopish',
  return_for_correction: 'tuzatishga qaytarish',
  submit_for_approval: 'tasdiqlashga yuborish',
  set_inactive: 'nofaol qilish',
};

export interface ForbiddenHint {
  /** To'liq ruxsat kodi — `employee_fines.create`. */
  permission: string;
  /** Menyudagi sahifa nomi (topilsa). */
  page: string | null;
  /** Amalning o'zbekcha nomi (topilsa). */
  actionLabel: string | null;
  /** So'rovning o'zi — `POST /employee-fines/7/accept`. */
  request: string;
  /** Ruxsat kodi backend javobidan olindimi (aks holda — taxmin). */
  exact: boolean;
}

const isIdSegment = (segment: string) =>
  /^\d+$/.test(segment) || /^[0-9a-f]{8,}$/i.test(segment) || /^[0-9a-f-]{20,}$/i.test(segment);

const toSnake = (value: string) => value.replace(/-/g, '_');

/** Ruxsatga o'xshab ko'ringan, lekin ruxsat bo'lmagan matnlar (fayl, domen). */
const NOT_A_PERMISSION = /\.(php|js|ts|jsx|tsx|json|html|css|uz|com|net|org|ru)$/;

/**
 * Javobning matnli maydonlaridan `resource.action` ko'rinishidagi kodni
 * qidiradi. Faqat xabar maydonlariga qaraydi — debug rejimidagi stack trace
 * ichidagi fayl nomlari ruxsat deb o'qilib qolmasligi uchun.
 */
const permissionFromResponse = (data: unknown): string | null => {
  const candidates: string[] = [];

  if (typeof data === 'string') {
    candidates.push(data);
  } else if (data && typeof data === 'object') {
    const body = data as Record<string, unknown>;
    for (const key of ['permission', 'required_permission', 'message', 'error', 'detail']) {
      const value = body[key];
      if (typeof value === 'string') candidates.push(value);
    }
  }

  for (const text of candidates) {
    const match = text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)*\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*\b/);
    if (match && !NOT_A_PERMISSION.test(match[0])) return match[0];
  }

  return null;
};

const resolveResource = (path: string): string | null => {
  for (const [pattern, resource] of PATH_OVERRIDES) {
    if (pattern.test(path)) return resource;
  }

  const compound = COMPOUND_PREFIXES.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (compound) return toSnake(compound.replace('/', '_'));

  const [first] = path.split('/');
  return first ? toSnake(first) : null;
};

const resolveAction = (segments: string[], method: string): string => {
  const isRead = method === 'GET';
  const last = segments[segments.length - 1] ?? '';

  if (ACTION_SEGMENTS.has(last) || (isRead && READ_ACTION_SEGMENTS.has(last))) {
    return toSnake(last);
  }

  if (isRead) return 'view';
  if (method === 'POST') return 'create';
  if (method === 'PUT' || method === 'PATCH') return 'edit';
  if (method === 'DELETE') return 'delete';
  return 'view';
};

/**
 * 403 javobi uchun toastda ko'rsatiladigan ma'lumotni tayyorlaydi.
 * URL tanilmasa `null` qaytaradi — bu holda eski umumiy xabar chiqadi.
 */
export const describeForbidden = (
  method: string | undefined,
  url: string | undefined,
  responseData?: unknown,
): ForbiddenHint | null => {
  if (!url) return null;

  const httpMethod = (method ?? 'get').toUpperCase();
  const path = url.split('?')[0].replace(/^\/+|\/+$/g, '');
  if (!path) return null;

  const segments = path.split('/').filter(Boolean);
  const resource = resolveResource(path);
  if (!resource) return null;

  const rawAction = resolveAction(segments, httpMethod);
  const action = ACTION_ALIASES[resource]?.[rawAction] ?? rawAction;

  const fromServer = permissionFromResponse(responseData);
  const permission = fromServer ?? `${resource}.${action}`;
  const [permResource, permAction] = permission.split('.');

  const readablePath = `/${segments.map((s) => (isIdSegment(s) ? ':id' : s)).join('/')}`;

  return {
    permission,
    page: PERMISSION_PAGES[permission] ?? RESOURCE_PAGES[permResource] ?? null,
    actionLabel: ACTION_LABELS[permAction] ?? null,
    request: `${httpMethod} ${readablePath}`,
    exact: fromServer !== null,
  };
};
