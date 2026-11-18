/**
 * Sahifa manzillari: brauzer adres satrida INGLIZCHA, lekin API nomidan FARQLI nom; ilova ichida esa avvalgi (ichki) yo'l.
 *
 * Nega: ilgari adres satrida `/payments`, `/users`, `/daily-cash-reports`, `/preschool-attendance` kabi API nomlari bilan
 * bir xil manzillar ko'rinardi. Endi foydalanuvchi `/billing`, `/accounts`, `/daily-cash`, `/prep-attendance` ni ko'radi.
 * Ichki yo'llar (marshrutlar, `navigate('/payments')`, menyu, ruxsatlar, sarlavhalar) O'ZGARMAGAN — tarjima faqat
 * `prettyHistory.ts` dagi history qatlamida: brauzerga yozishda ichki → chiroyli, o'qishda chiroyli → ichki.
 *
 * Qoidalar:
 *  - tarjima SEGMENT darajasida (`/students-contract/adult/edit/5` → `/learner-agreements/adults/edit/5`),
 *    id/hash segmentlari o'zgarmaydi;
 *  - jadvalda yo'q segment o'zgarishsiz qoladi: ochiq havolalar (`/contract/:hash`, `/chek/:id`, `/set-password`, `/login`)
 *    SMS/QR/chekda allaqachon tarqalgan — ular TEGILMAYDI; eski ichki manzillar va `LEGACY_UZ` (11-09 da qisqa vaqt
 *    ishlagan o'zbekcha nomlar) ham ochilaveradi va adres satrida yangi nomga almashtiriladi;
 *  - chiroyli nom ichki segment (API nomi) bilan BIR XIL bo'lmasligi shart; nomlar takrorlanmasin va ichki segmentlar
 *    bilan to'qnashmasin (`checkSegments()` tekshiradi);
 *  - `api`, `storage`, `assets`, `faq-media`, `errors` bo'lmasin — serverda alohida papka/proksi bor.
 *
 * Bu fayl Admin va User ilovalarida BIR XIL tuzilishda; farq faqat o'sha ilovada mavjud segmentlarda (`lid`/`lids`).
 */
export const SEGMENTS: Readonly<Record<string, string>> = {
  // umumiy (create/edit/new/add — API nomi emas, o'zgarishsiz qoladi: `KEEP`)
  archive: 'archived-items',
  permissions: 'access-rights',

  // hisoblar va tuzilma
  users: 'accounts',
  roles: 'access-roles',
  operators: 'call-operators',
  branches: 'locations',
  areas: 'territories',
  regions: 'provinces',
  districts: 'counties',
  department: 'divisions',
  rooms: 'classrooms',
  positions: 'job-titles',
  employees: 'staff',
  attendance: 'staff-attendance',
  contracts: 'staff-agreements',
  'login-history': 'sign-in-log',
  settings: 'preferences',
  'shift-times': 'work-shifts',
  trash: 'recycle-bin',

  // o'quv jarayoni
  teachers: 'instructors',
  courses: 'programs',
  levels: 'course-levels',
  'course-prices': 'program-pricing',
  'price-list': 'rate-card',
  'lesson-schedule': 'timetable',
  'demo-lesson': 'trial-lessons',
  groups: 'study-groups',
  members: 'participants',
  classes: 'school-classes',
  lessons: 'assignments',
  test: 'quizzes',
  questions: 'question-bank',
  'student-exams': 'my-exams',
  'student-exam': 'exam-session',
  students: 'learners',
  'students-attendance': 'learner-attendance',
  'student-tasks': 'homework',
  'students-contract': 'learner-agreements',
  adult: 'adults',
  minor: 'minors',
  legal_bilateral: 'company-two-party',
  legal_trilateral: 'company-three-party',

  // maktabga tayyorlov
  'academic-years': 'school-years',
  'preschool-prices': 'prep-pricing',
  'preschool-attendance': 'prep-attendance',
  'preschool-contracts': 'prep-agreements',

  // sotuv
  lids: 'leads',
  registration: 'enrollment',
  sources: 'lead-sources',
  'refusal-reasons': 'decline-reasons',
  'ip-telephone': 'telephony',
  tasks: 'to-do',
  cyclogram: 'cycle-chart',
  reports: 'analytics',

  // moliya
  payments: 'billing',
  commissions: 'gateway-fees',
  expenses: 'spending',
  category: 'categories',
  subcategory: 'subcategories',
  salaries: 'pay-slips',
  finances: 'ledger',
  jamgarma: 'funds',
  'jamgarma-names': 'fund-names',
  debts: 'fund-transfers',
  'fine-types': 'penalty-types',
  penalties: 'fines',
  'daily-cash-reports': 'daily-cash',
  'finance-generation': 'generation',
  'advance-schedule': 'advance-calendar',
  'salary-schedule': 'pay-calendar',
  payroll: 'salary-split',
  distributions: 'allocations',
  'payroll-adjustments': 'salary-adjustments',
  'payroll-distribution-requests': 'allocation-requests',
  'finance-plans': 'budget-plans',
  'month-end-analysis': 'month-close-review',

  // boshqa
  profile: 'my-profile',
  notifications: 'alerts',
  faq: 'help',
};

/**
 * 11-09 da bir necha daqiqa ishlagan o'zbekcha nomlar (ichki → o'zbekcha). FAQAT teskari yo'nalishda ishlatiladi:
 * saqlangan xatcho'p/havola ochilsin va adres satri yangi inglizcha nomga almashsin.
 */
export const LEGACY_UZ: Readonly<Record<string, string>> = {
  // umumiy
  archive: 'arxiv',
  add: 'qoshish',
  edit: 'tahrirlash',
  create: 'yaratish',
  new: 'yangi',
  permissions: 'ruxsatlar',

  // foydalanuvchi va tuzilma
  users: 'foydalanuvchilar',
  roles: 'rollar',
  operators: 'operatorlar',
  branches: 'filiallar',
  areas: 'hududlar',
  regions: 'viloyatlar',
  districts: 'tumanlar',
  department: 'bolimlar',
  rooms: 'xonalar',
  positions: 'lavozimlar',
  employees: 'xodimlar',
  attendance: 'xodim-davomati',
  contracts: 'xodim-shartnomalari',
  'login-history': 'kirishlar-tarixi',
  settings: 'sozlamalar',
  'shift-times': 'smena-vaqtlari',
  trash: 'ochirilganlar',

  // o'quv jarayoni
  teachers: 'oqituvchilar',
  courses: 'kurslar',
  levels: 'darajalar',
  'course-prices': 'kurs-narxlari',
  'price-list': 'narxlar-royxati',
  'lesson-schedule': 'dars-jadvali',
  'demo-lesson': 'sinov-darsi',
  groups: 'guruhlar',
  members: 'azolar',
  classes: 'sinflar',
  lessons: 'darslar',
  test: 'testlar',
  questions: 'savollar',
  'student-exams': 'imtihonlar',
  'student-exam': 'imtihon',
  students: 'oquvchilar',
  'students-attendance': 'oquvchi-davomati',
  'student-tasks': 'oquvchi-vazifalari',
  'students-contract': 'oquvchi-shartnomalari',
  adult: 'katta-yoshli',
  minor: 'voyaga-yetmagan',
  legal_bilateral: 'yuridik-ikki-tomonlama',
  legal_trilateral: 'yuridik-uch-tomonlama',

  // maktabga tayyorlov
  'academic-years': 'oquv-yillari',
  'preschool-prices': 'tayyorlov-narxlari',
  'preschool-attendance': 'davomat',
  'preschool-contracts': 'tayyorlov-shartnomalari',

  // sotuv
  lids: 'lidlar',
  registration: 'royxatga-olish',
  sources: 'manbalar',
  'refusal-reasons': 'rad-sabablari',
  'ip-telephone': 'ip-telefoniya',
  tasks: 'vazifalar',
  cyclogram: 'siklogramma',
  reports: 'hisobotlar',

  // moliya
  payments: 'tolovlar',
  commissions: 'komissiyalar',
  expenses: 'chiqimlar',
  category: 'kategoriya',
  subcategory: 'ichki-kategoriya',
  salaries: 'oyliklar',
  finances: 'moliya',
  jamgarma: 'jamgarmalar',
  'jamgarma-names': 'jamgarma-nomlari',
  debts: 'jamgarma-otkazmalari',
  'fine-types': 'jarima-turlari',
  penalties: 'jarimalar',
  'daily-cash-reports': 'kunlik-kassa',
  'finance-generation': 'generatsiya',
  'advance-schedule': 'avans-jadvali',
  'salary-schedule': 'oylik-jadvali',
  payroll: 'oylik-taqsimoti',
  distributions: 'taqsimlash',
  'payroll-adjustments': 'oylik-tuzatishlari',
  'payroll-distribution-requests': 'taqsimlash-sorovlari',
  'finance-plans': 'moliya-rejalari',
  'month-end-analysis': 'oy-yakuni-tahlili',

  // boshqa
  profile: 'profil',
  notifications: 'bildirishnomalar',
  faq: 'savol-javob',
};

/** Ataylab o'zgarmaydigan umumiy fe'llar (API nomi emas): adres satrida ham shunday qoladi. */
export const UNCHANGED_SEGMENTS: readonly string[] = ['add', 'edit', 'create', 'new'];

const TO_PRETTY = new Map(Object.entries(SEGMENTS));

/** Teskari jadval (chiroyli nom → ichki segment). Nomlar takrorlanmasligi `checkSegments` bilan tekshiriladi. */
const TO_INTERNAL = new Map<string, string>(Array.from(TO_PRETTY, ([internal, pretty]) => [pretty, internal]));
for (const [internal, legacy] of Object.entries(LEGACY_UZ)) if (!TO_INTERNAL.has(legacy)) TO_INTERNAL.set(legacy, internal);

const mapPath = (pathname: string, table: ReadonlyMap<string, string>): string =>
  pathname
    .split('/')
    .map((segment) => table.get(segment) ?? segment)
    .join('/');

/** Ichki yo'l → brauzer adres satridagi yo'l (`/payments/archive` → `/billing/archived-items`). */
export const toPrettyPath = (pathname: string): string => mapPath(pathname, TO_PRETTY);

/** Brauzer adres satridagi yo'l → ichki yo'l (`/billing/archived-items` → `/payments/archive`). Noma'lum segment o'zgarmaydi. */
export const toInternalPath = (pathname: string): string => mapPath(pathname, TO_INTERNAL);

/** `/yo'l?so'rov#belgi` ko'rinishidagi satrning faqat yo'l qismini almashtiradi. */
export const prettifyUrl = (url: string): string => {
  const cut = url.search(/[?#]/);
  return cut === -1 ? toPrettyPath(url) : toPrettyPath(url.slice(0, cut)) + url.slice(cut);
};

/** Test uchun: jadvalning yaxlitligi (API nomi bilan bir xillik, takroriy nom, ichki segment bilan to'qnashuv). */
export const checkSegments = (): string[] => {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  const internals = new Set(TO_PRETTY.keys());
  const reserved = ['api', 'storage', 'assets', 'faq-media', 'errors', 'login', 'contract', 'chek', 'set-password', 'view'];
  for (const [internal, pretty] of TO_PRETTY) {
    if (!/^[a-z0-9-]+$/.test(pretty)) problems.push(`${internal}: «${pretty}» faqat kichik lotin harf, raqam va chiziqcha bo'lsin`);
    if (pretty === internal) problems.push(`${internal}: chiroyli nom ichki (API) nom bilan BIR XIL`);
    if (internals.has(pretty)) problems.push(`${internal}: «${pretty}» boshqa ichki segment bilan to'qnashadi`);
    if (reserved.includes(pretty)) problems.push(`${internal}: «${pretty}» band nom`);
    const prev = seen.get(pretty);
    if (prev) problems.push(`«${pretty}» ikki marta: ${prev} va ${internal}`);
    seen.set(pretty, internal);
  }
  for (const [internal, legacy] of Object.entries(LEGACY_UZ)) {
    if (!TO_PRETTY.has(internal) && !UNCHANGED_SEGMENTS.includes(internal)) problems.push(`LEGACY_UZ: «${internal}» asosiy jadvalda yo'q`);
    if (seen.has(legacy) || internals.has(legacy)) problems.push(`LEGACY_UZ: «${legacy}» yangi/ichki nom bilan to'qnashadi`);
  }
  return problems;
};
