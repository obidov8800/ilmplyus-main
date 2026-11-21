/**
 * RUXSATLAR KATALOGI — «Rollar» sahifasida har bir bo'lim kartochkasidagi undov (!) belgisi shu yerdan o'qiydi:
 * qaysi ruxsat berilsa nima CHIQADI va nima BO'LADI.
 *
 * Manba: backend `permission:*` middleware'lari (controllerlar) + frontend `Aside` / `PermissionRoute` / `Protected`.
 * Yangi ruxsat qo'shilganda shu faylga ham yozing (yozilmasa — umumiy matn chiqadi).
 *
 * Umumiy qoidalar (`GENERAL_RULES`) sahifa tepasidagi umumiy izohda ko'rsatiladi.
 */

export interface PermissionGroupInfo {
  /** Bo'lim nima uchun (1 jumla). */
  summary: string;
  /** Menyuda qayerda chiqadi (yoki qaysi sahifada ishlaydi). */
  where?: string;
  /** Shu bo'lim uchun maxsus harakatlar yoki umumiy matnni almashtirish. */
  actions?: Record<string, string>;
  /** Filial bo'yicha cheklov qoidasi. */
  branch?: string;
  /** Xodim shartnomasi talabi. */
  contract?: string;
  /** Ishlashi uchun qo'shimcha kerak bo'ladigan ruxsatlar. */
  needs?: string;
}

/** CRUD harakatlar uchun umumiy matn (bo'limda maxsus matn bo'lmasa). */
export const DEFAULT_ACTION_TEXT: Record<string, string> = {
  view: 'Menyuda bo‘lim chiqadi va sahifadagi jadval (ro‘yxat) ochiladi. Qo‘shish, tahrirlash, o‘chirish ishlashi uchun avval shu ruxsat kerak.',
  show: 'Qatordagi «Ko‘rish» (ko‘z) tugmasi chiqadi — bitta yozuvning (foydalanuvchi, guruh…) to‘liq ma’lumoti ochiladi. «Sahifani ko‘rish»dan alohida beriladi.',
  create: '«Qo‘shish» tugmasi chiqadi — yangi yozuv yaratish mumkin.',
  edit: 'Qatorda «Tahrirlash» (qalam) tugmasi chiqadi — mavjud yozuvni o‘zgartirish mumkin.',
  delete: '«O‘chirish» (savat) tugmasi chiqadi — yozuv arxivga o‘tadi (tiklash alohida: «Arxiv» bo‘limi). Tugma faqat boshqaruv panelida (Admin) chiqadi; xodimlar ilovasida (staff) o‘chirish tugmasi YO‘Q.',
  view_all: 'Boshqalar kiritgan yozuvlarni ham ko‘radi. Bu ruxsat bo‘lmasa — faqat o‘zi kiritgan (yoki o‘z filialiga tegishli) yozuvlar ko‘rinadi.',
  revert: 'Tasdiqlangan yozuvni tasdiqdan qaytaradi (balanslar avvalgi holatiga tiklanadi).',
  change_status: 'Holatini o‘zgartiradi: tasdiqlash, rad etish yoki bekor qilish.',
};

export const GENERAL_RULES: string[] = [
  'Rolga ruxsat berilsa yoki olib tashlansa, foydalanuvchida o‘zgarish sahifa yangilanganda yoki 5 daqiqa ichida ko‘rinadi.',
  'Bir sahifa — bir ruxsat: sahifa ochilishi va to‘liq ishlashi uchun faqat o‘zining «Sahifani ko‘rish» (view) ruxsati yetadi. Boshqa bo‘limning ruxsati kerak emas — forma tanlovlari (filial, kurs, guruh, o‘quvchi…) tanlov ro‘yxatlaridan keladi; bu ruxsat rolga o‘zi qo‘shiladi va Rollar sahifasida ko‘rinmaydi.',
  'Bo‘lim ichida: «Ko‘rish», «Qo‘shish», «Tahrirlash» yoki «O‘chirish» belgilansa — shu bo‘limning «Sahifani ko‘rish» ruxsati o‘zi belgilanadi; «Tahrirlash» belgilansa «Ko‘rish» ham (forma yozuvning to‘liq ma’lumotini o‘qiydi).',
  'Qamrov: ba’zi bo‘limlarda «Sahifani ko‘rish» yonida «o‘ziniki / hammasi» tugmasi bor (masalan To‘lovlar: o‘zi kiritgan yoki hamma kassirlarniki).',
  '«admin» / «Super admin» rollarida ruxsat nomi tekshirilmaydi — hammasi ochiq.',
  'Filial: foydalanuvchi qaysi filiallarga biriktirilgan bo‘lsa (Foydalanuvchilar → tahrirlash), to‘lov, chiqim, ro‘yxat va tanlovlarda faqat shu filial(lar) chiqadi. «Hamma filial» ruxsati yo‘q — hammasini ko‘rsatish uchun foydalanuvchiga barcha filiallarni biriktiring. Davomat bo‘limlari ham foydalanuvchiga biriktiriladi.',
  'Shartnoma: oylik, jarima, davomat hisobi, o‘qituvchi foizi va vazifa/eslatmalar xodim yozuvi va FAOL xodim shartnomasi bilan ishlaydi. Shartnomasi yo‘q foydalanuvchi kirishi mumkin, lekin shu bo‘limlarda ogohlantirish chiqadi.',
  'Ruxsat bo‘lmasa, tegishli so‘rov serverga yuborilmaydi (xato xabari chiqmaydi) — bo‘lim yoki tugma shunchaki ko‘rinmaydi.',
];

/** Sahifa tepasidagi umumiy undov (!) matni. */
export const GENERAL_RULES_HINT = [
  'Ruxsatlar qanday ishlaydi:',
  '',
  ...GENERAL_RULES.flatMap((rule) => [`• ${rule}`, '']),
  'Har bir bo‘lim yonidagi (!) belgisini bosing — qaysi ruxsat berilsa nima chiqishi va nima bo‘lishi yoziladi.',
].join('\n');

const BRANCH_SCOPED =
  'Filialga biriktirilgan foydalanuvchi faqat o‘z filiali yozuvlarini ko‘radi va yaratadi (hamma filial uchun — foydalanuvchiga barcha filiallar biriktiriladi).';

export const GROUP_INFO: Record<string, PermissionGroupInfo> = {
  academic_years: {
    summary: 'Maktabga tayyorlov guruhlari uchun o‘quv yillari.',
    where: 'Menyu: O‘quv yillari',
  },
  account_to_jamgarma_transfers: {
    summary: 'Hisob raqamdan jamg‘armaga pul o‘tkazish.',
    where: 'Moliya → Hisobraqamlar',
    actions: {
      view: 'O‘tkazmalar ro‘yxati ko‘rinadi.',
      create: 'Yangi o‘tkazma yaratadi (tasdiqlash kutiladi).',
      approve: 'Kutilayotgan o‘tkazmani TASDIQLAydi — pul harakati amalga oshadi.',
      reject: 'O‘tkazmani rad etadi.',
      cancel: 'Yaratilgan o‘tkazmani bekor qiladi.',
    },
  },
  admin: {
    summary: 'Admin panelga kirish belgisi.',
    actions: { access: 'Admin panelga (console) kirishga ruxsat beradi.' },
  },
  attendance: {
    summary: 'Xodimlar davomati (Face ID / qurilma orqali kelish-ketish).',
    where: 'Menyu: Xodim davomati',
    contract: 'Davomat va undan hisoblanadigan oylik xodim shartnomasiga bog‘liq — shartnomasiz xodimning ish soati oylikka tushmaydi.',
    actions: {
      view: 'Xodim davomati jadvali ochiladi.',
      show: 'Xodim kunlik davomati tafsiloti.',
      create: 'Davomatni qo‘lda kiritish.',
      edit: 'Davomatni tuzatish.',
      delete: 'Davomat yozuvini o‘chirish.',
      sync: 'Qurilmadan davomatni qayta sinxronlash.',
    },
  },
  branch_reports: {
    summary: 'Filiallar bo‘yicha jamlangan hisobot.',
    where: 'Moliya hisobotlari',
    actions: { view: 'Filial hisobotini ko‘rish (foydalanuvchiga biriktirilgan filiallar bo‘yicha).' },
  },
  branches: {
    summary: 'Filiallar ro‘yxati va ularning rekvizitlari.',
    where: 'Menyu: Tashkilot → Filiallar',
    actions: { show: 'Filial ma’lumotini ochish. Boshqa bo‘limlarning filial tanlovlari uchun bu ruxsat kerak emas.' },
  },
  chart_of_accounts: {
    summary: 'Hisob raqamlar (naqd / naqdsiz) va ularning balansi.',
    where: 'Moliya → Hisobraqamlar',
    actions: {
      add_transfer_maker: 'Hisob raqamga «o‘tkazma qiluvchi» xodim qo‘shish.',
      remove_transfer_maker: 'O‘tkazma qiluvchini olib tashlash.',
    },
  },
  chart_of_accounts_transfers: {
    summary: 'Hisob raqamlar orasidagi o‘tkazmalar.',
    where: 'Moliya → Hisobraqamlar',
    actions: {
      view: 'O‘tkazmalar ro‘yxati.',
      create: 'Yangi o‘tkazma yaratish.',
      approve: 'O‘tkazmani tasdiqlash (pul harakati amalga oshadi).',
      reject: 'O‘tkazmani rad etish.',
      cancel: 'O‘tkazmani bekor qilish.',
    },
  },
  course_prices: {
    summary: 'Kurs narxlari (filial + kurs + daraja bo‘yicha oylik narx).',
    where: 'Menyu: Kurslar → Kurs narxlari',
    actions: {
      create: '«Qo‘shish» va «Excel’dan import» tugmalari chiqadi — narx qoralama (kutilmoqda) bo‘lib yaratiladi.',
      submit_for_approval: 'Qoralama narxni tasdiqlashga yuboradi (holat «Yuborilgan»).',
      approve: 'Narxni TASDIQLAydi (qatorda ✓ va «Tasdiqlash (N)» tugmasi). Tasdiqlangan narx o‘quvchi balansidan yechishda ishlatiladi.',
      reject: 'Narxni bekor qiladi / rad etadi (qatorda 🚫 va «Bekor qilish (N)» tugmasi).',
    },
  },
  courses: {
    summary: 'Kurslar ro‘yxati va ularning darajalari/filiallari.',
    where: 'Menyu: Kurslar',
  },
  daily_cash_reports: {
    summary: 'Kunlik kassa hisobotlari (smena yopish → buxgalter tasdig‘i).',
    where: 'Moliya → Kunlik kassa hisobotlari',
    branch: 'Hisobotlar ro‘yxati foydalanuvchiga biriktirilgan filiallar bo‘yicha cheklanadi.',
    actions: {
      close_shift: '«Smenani yopish» tugmasi chiqadi: kassir bugungi kun uchun kunlik kassa hisobotini shakllantiradi (User panelida — bir bosishda o‘z filiallari smenasi; Admin’da filial tanlanadi). Bugun to‘lov bo‘lmasa smena yopilmaydi.',
      send: 'Hisobotni buxgalteriyaga yuboradi.',
      accept: 'Yuborilgan hisobotni qabul qiladi (assistent/buxgalter).',
      approve: 'Hisobotni yakuniy tasdiqlaydi.',
      return_for_correction: 'Hisobotni tuzatish uchun kassirga qaytaradi.',
      correct: 'Qaytarilgan hisobotni tuzatib qayta yuboradi.',
      responsible: 'Hisobot bo‘yicha mas’ul shaxs sifatida belgilanadi.',
    },
  },
  demo_lessons: {
    summary: 'Demo (sinov) darslari.',
    where: 'Menyu: Demo dars',
    actions: { mark_attendance: 'Demo darsda lid/o‘quvchi davomatini belgilash.' },
  },
  departments: { summary: 'Xodimlar bo‘limlari (Ma’muriy, Pedagog, Sotuv, Texnik…).', where: 'Menyu: Tashkilot → Bo‘limlar' },
  districts: { summary: 'Tumanlar (hududning ichida).', where: 'Menyu: Tashkilot → Hududlar' },
  employee_contracts: {
    summary: 'Xodim shartnomalari — oylik turi, foiz, ish vaqti. O‘qituvchi, oylik va davomat shu shartnomaga bog‘liq.',
    where: 'Menyu: Xodimlar → Shartnoma (va «O‘qituvchilar»)',
    contract: 'Xodimning ish haqi, o‘qituvchi foizi va davomat hisobi AYNAN shu shartnomadan olinadi.',
    actions: {
      set_active: 'Shartnomani faollashtiradi.',
      set_inactive: 'Shartnomani nofaol qiladi.',
      terminate: 'Shartnomani tugatadi (xodim oyligi shu sanadan to‘xtaydi).',
    },
  },
  employee_fines: {
    summary: 'Xodimlarga jarima (jarima turlari bo‘yicha).',
    where: 'Moliya → Jarimalar',
    contract: 'Jarima xodimning oyligidan ushlanadi — shartnomasiz xodimga jarima kiritilmaydi/ushlanmaydi.',
    actions: {
      accept: 'Jarimani tasdiqlaydi (oylikdan ushlanadi).',
      cancel: 'Jarimani bekor qiladi.',
    },
  },
  employees: {
    summary: 'Xodimlar ro‘yxati (shaxsiy ma’lumot, lavozim, filial).',
    where: 'Menyu: Xodimlar',
    needs: 'Boshqa sahifalardagi xodim tanlovi uchun bu ruxsat kerak emas (tanlov ro‘yxatidan keladi). «Xodimlar» sahifasi hamma xodimlar ro‘yxatini ochadi — kassirga bermang.',
  },
  exam_attempts: { summary: 'O‘quvchining imtihon urinishlari.', where: 'Test bo‘limi' },
  exam_reports: { summary: 'Imtihon natijalari hisobotlari.', where: 'Test bo‘limi → hisobotlar' },
  exam_sessions: { summary: 'Imtihon seanslari (testni guruhga belgilash).', where: 'Menyu: Mening testlarim / Test' },
  expense_categories: { summary: 'Chiqim kategoriyalari.', where: 'Menyu: Moliya → Chiqimlar kategoriyasi' },
  expense_subcategories: { summary: 'Chiqim podkategoriyalari.', where: 'Menyu: Moliya → Chiqimlar podkategoriyasi' },
  expenses: {
    summary: 'Chiqim kiritish (jamg‘armadan pul yechish).',
    where: 'Menyu: Moliya → Chiqim kiritish',
    branch: BRANCH_SCOPED + ' Jamg‘arma tanlovida ham faqat o‘z filiali jamg‘armalari chiqadi.',
    needs: 'Chiqim to‘liq ishlaydi: jamg‘arma va kategoriya tanlovlari tanlov ro‘yxatidan keladi. Rolda «Jamg‘armalar» sahifasi ham bo‘lsa — oynada jamg‘arma balansi qo‘shimcha ko‘rinadi.',
    actions: { create: 'Chiqim kiritish oynasi ochiladi. Chiqim faqat foydalanuvchi o‘z filialiga yoziladi.' },
  },
  financial_plans: {
    summary: 'Oylik moliyaviy rejalar (jamg‘armalar bo‘yicha reja → taqsimlash).',
    where: 'Moliya → Rejalar',
    branch: 'Rejalar foydalanuvchiga biriktirilgan filiallar bo‘yicha cheklanadi.',
    actions: {
      create: 'Yangi oy rejasini yaratish.',
      update: 'Rejani o‘zgartirish.',
      send: 'Rejani tasdiqlashga yuborish.',
      approve: 'Rejani tasdiqlash yoki rad etish.',
      cancel: 'Rejani bekor qilish.',
      distribute: 'Reja summasini jamg‘armalarga taqsimlash va tasdiqlash.',
      analysis: 'Moliya → Oy yakuni tahlili sahifasi ochiladi.',
    },
  },
  fine_types: { summary: 'Jarima turlari (nomi, summasi).', where: 'Menyu: Moliya → Jarima turlari' },
  groups: {
    summary: 'O‘quv guruhlari (o‘qituvchi, xona, dars kunlari).',
    where: 'Menyu: Guruhlar — «Sahifani ko‘rish» (view) ruxsati bilan chiqadi',
    branch: BRANCH_SCOPED,
    actions: {
      view: '«Guruhlar» menyusi chiqadi. Qamrov «hammasi» bo‘lsa (hozircha: «Qo‘shish» ruxsati bor) — to‘liq jadval, «o‘ziniki» bo‘lsa (masalan o‘qituvchi) — faqat o‘ziga biriktirilgan guruhlar.',
      edit: 'Guruhni tahrirlash va o‘quvchi biriktirish (guruh a’zolari sahifasi).',
    },
    contract: 'Guruh o‘qituvchisi FAOL pedagog shartnomasiga ega xodim bo‘lishi kerak; shartnomasiz xodim o‘qituvchi tanloviga chiqmaydi.',
  },
  hikvision_devices: {
    summary: 'Face ID (Hikvision) qurilmalari.',
    where: 'Menyu: Tashkilot → Face ID',
    actions: { edit: 'Qurilmani tahrirlash, vaqt va xodimlarni sinxronlash (🔄).' },
  },
  homework_submissions: { summary: 'O‘quvchilarning uy vazifalari topshirig‘i.', where: 'Menyu: O‘quvchi vazifalari' },
  ip_telefon_operators: {
    summary: 'IP-telefoniya operatorlari va ularning ichki raqamlari.',
    where: 'Menyu: Foydalanuvchilar → Operatorlar; Sotuv → IP telefon',
    needs: 'IP telefon sahifasi ochilishi uchun bu rol sahifasidagi «IP Telephone» belgisi (Dashboard bo‘limlari kartochkasi, umumiy sozlama) ham yoqilgan bo‘lishi kerak; qo‘ng‘iroqlarni tinglash — «Listen Recordings» belgisi.',
    actions: { view: 'Operatorlar ro‘yxati va IP-telefoniya sahifasi (qo‘ng‘iroqlar tarixi) ochiladi (yuqoridagi shart bilan).' },
  },
  jamgarma_loan_forfeitures: {
    summary: 'Qarzni kechirish (jamg‘arma qarzlari).',
    where: 'Moliya → Jamg‘armalar o‘rtasidagi o‘tkazmalar',
    actions: { approve: 'Kechirishni tasdiqlaydi.', reject: 'Rad etadi.', cancel: 'Bekor qiladi.', create: 'Kechirish so‘rovi yaratadi.' },
  },
  jamgarma_loan_repayments: {
    summary: 'Qarzni qaytarish (jamg‘armalar orasida).',
    where: 'Moliya → Jamg‘armalar o‘rtasidagi o‘tkazmalar',
    actions: { approve: 'Qaytarishni tasdiqlaydi.', reject: 'Rad etadi.', cancel: 'Bekor qiladi.', create: 'Qaytarish so‘rovi yaratadi.' },
  },
  jamgarma_loans: {
    summary: 'Jamg‘armalar orasida qarz berish.',
    where: 'Moliya → Jamg‘armalar o‘rtasidagi o‘tkazmalar',
    actions: { approve: 'Qarz berishni tasdiqlaydi.', reject: 'Rad etadi.', cancel: 'Bekor qiladi.', create: 'Qarz so‘rovi yaratadi.' },
  },
  jamgarma_names: { summary: 'Jamg‘arma nomlari (bir nom — bir necha filial).', where: 'Menyu: Moliya → Jamg‘arma nomlari' },
  jamgarma_transactions: {
    summary: 'Jamg‘arma tranzaksiyalari (kirim/chiqim yozuvlari). Faqat o‘ziga biriktirilgan jamg‘armada, naqd va naqdsiz alohida (Moliya → Jamg‘armalar → chiqim qiluvchilar).',
    where: 'Moliya → Hisobraqamlar',
    actions: { approve: 'Tranzaksiyani tasdiqlaydi.' },
  },
  jamgarmas: {
    summary: 'Jamg‘armalar (filial bo‘yicha balans, naqd/naqdsiz).',
    where: 'Menyu: Moliya → Jamg‘armalar',
    branch: 'Tanlov ro‘yxatlarida faqat foydalanuvchi filiali jamg‘armalari chiqadi.',
    actions: {
      view: 'Jamg‘armalar ro‘yxati va chiqim oynasida BALANS hamda «naqd/naqdsiz» ruxsati ko‘rinadi.',
      add_withdrawer: 'Jamg‘armaga «pul yechuvchi» xodim qo‘shish.',
      remove_withdrawer: 'Pul yechuvchini olib tashlash.',
    },
  },
  lessons: {
    summary: 'Darslar (guruh bo‘yicha dars yozuvlari, mavzu, uy vazifa).',
    where: 'Menyu: Darslar (O‘quvchi vazifalar) va Davomat sahifasi',
    contract: 'Darsni o‘qituvchi o‘tadi — o‘qituvchi foizi shartnomasidan hisoblanadi; shartnomasiz o‘qituvchiga haq tushmaydi.',
    actions: {
      create: '«Dars qo‘shish» tugmasi chiqadi; Davomat sahifasida bugungi dars yozuvi ham shu ruxsat bilan yaratiladi.',
      edit: 'Davomat sahifasida «Darsni boshlash» va «Darsni tamomlash» tugmalari ishlaydi (dars boshlash/tugatish — AYNAN «edit» ruxsati; alohida «start/end» ruxsati yo‘q). Mavjud darsga uy vazifasi va fayl saqlash ham shu ruxsat bilan.',
    },
  },
  lessons_schedules: { summary: 'Dars jadvali (haftalik).', where: 'Menyu: Dars jadvali' },
  level_promotions: { summary: 'Daraja ko‘tarish (o‘quvchini keyingi darajaga o‘tkazish).', where: 'Guruhlar' },
  levels: { summary: 'Darajalar.', where: 'Menyu: Kurslar → Darajalar' },
  lids: {
    summary: 'Lidlar (potensial o‘quvchilar) va ularning holatlari.',
    where: 'Menyu: Sotuv → Lid ro‘yxati',
    actions: {
      edit: 'Lidni tahrirlash va kartani boshqa ustunga (holatga) SUDRASH imkoni.',
      create: 'Yangi lid qo‘shish (ro‘yxatga olish).',
      delete: 'Lidni arxivlash.',
    },
  },
  login_histories: {
    summary: 'Foydalanuvchilarning kirish tarixi va faol seanslar.',
    where: 'Menyu: Kirishlar tarixi',
    actions: { terminate: 'Boshqa qurilmadagi seansni tugatadi (foydalanuvchi chiqarib yuboriladi).' },
  },
  lookups: {
    summary: 'Forma tanlovlari (filial, kurs, o‘quvchi, jamg‘arma ro‘yxatlari).',
    actions: { view: 'Formalardagi «tanlang» ro‘yxatlari to‘ladi. Rollar sahifasida ko‘rinmaydi: rolda kamida bitta ruxsat bo‘lsa o‘zi qo‘shiladi, rol bo‘sh bo‘lsa olib tashlanadi.' },
  },
  monthly_accounting_reports: {
    summary: 'Oylik buxgalteriya hisoboti.',
    where: 'Moliya → Oylik hisobot',
    actions: { view: 'Hisobotni ko‘rish.', add_expense: 'Qo‘lda chiqim qo‘shish va o‘chirish.' },
  },
  payment_commission_logs: { summary: 'To‘lov komissiyasi yozuvlari jurnali.', where: 'To‘lovlar', actions: { view: 'Komissiya jurnalini ko‘rish.' } },
  payment_gateway_commissions: {
    summary: 'To‘lov turlari bo‘yicha komissiya foizlari (barcha filiallar uchun umumiy).',
    where: 'Menyu: Komissiyalar',
    actions: { create: '«Qo‘shish» — yangi to‘lov turi va uning foizini belgilash (har bir turga bitta yozuv).' },
  },
  payments: {
    summary: 'O‘quvchi to‘lovlari.',
    where: 'Menyu: To‘lovlar',
    branch: BRANCH_SCOPED + ' To‘lov kiritishda o‘quvchi tanlovida ham faqat o‘z filiali o‘quvchilari chiqadi.',
    actions: {
      create: '«To‘lov kiritish» tugmasi chiqadi. To‘lov faqat o‘z filialiga yoziladi.',
      view_all: 'Boshqa kassirlar kiritgan to‘lovlarni ham ko‘radi. Bu ruxsat bo‘lmasa kassir FAQAT O‘ZI kiritgan to‘lovlarni ko‘radi va boshqaradi (o‘z filiali ichida).',
      delete: 'To‘lovni o‘chirish va ARXIVDAN tiklash/butunlay o‘chirish.',
    },
  },
  payroll_adjustments: {
    summary: 'Ish haqi tuzatishlari (ish soatlari bo‘yicha).',
    where: 'Moliya → Ish haqi tuzatishlari',
    contract: 'Tuzatish xodimning shartnoma bo‘yicha oyligiga ta’sir qiladi.',
    actions: { approve: 'Tuzatishni tasdiqlaydi.', reject: 'Rad etadi.' },
  },
  payroll_distributions: {
    summary: 'Oylikni jamg‘armalar bo‘yicha taqsimlash so‘rovlari.',
    where: 'Moliya → Taqsimlash so‘rovlari',
    contract: 'Taqsimlash shartnomasi bor xodim uchun yaratiladi.',
    actions: { approve: 'Taqsimlashni tasdiqlaydi (jamg‘armalardan yechiladi).', revert: 'Tasdiqlashni qaytaradi.' },
  },
  payroll_periods: {
    summary: 'Oylik davrlari (oyni yopish/qayta ochish).',
    actions: { close: 'Oylik davrini yopadi.', reopen: 'Yopilgan davrni qayta ochadi.' },
  },
  payroll_settings: { summary: 'Oylik hisoblash sozlamalari (soliq, stavkalar).', actions: { view: 'Sozlamalarni ko‘rish.', edit: 'Sozlamalarni o‘zgartirish.' } },
  payroll_sheets: {
    summary: 'Oylik / avans vedomostlari (generatsiya → tasdiqlash).',
    where: 'Moliya → Generatsiya, Avans jadvali, Oylik jadvali',
    branch: 'Vedomost foydalanuvchiga biriktirilgan filiallar bo‘yicha cheklanadi.',
    contract: 'Vedomost qatorlari xodim shartnomalaridan hosil bo‘ladi — faol shartnomasi yo‘q xodim vedomostga tushmaydi.',
    actions: {
      generate: 'Vedomostni generatsiya qiladi.',
      prepare: 'Vedomostni tayyorlaydi.',
      edit: 'Vedomost qatorlarini tahrirlaydi.',
      send: 'Tasdiqlashga yuboradi.',
      approve: 'Tasdiqlaydi (to‘lovga tayyor).',
      reject: 'Rad etadi.',
      revert: 'Tasdiqlangan vedomostni qaytaradi.',
      print: 'Chop etish / PDF.',
    },
  },
  permissions: { summary: 'Ruxsatlar ro‘yxatining o‘zi (tizim sozlamasi).', actions: { view: 'Ruxsatlar ro‘yxatini ko‘rish (Rollar sahifasi uchun).' } },
  positions: { summary: 'Lavozimlar.', where: 'Menyu: Xodimlar → Lavozimlar' },
  preschool_attendances: {
    summary: 'Maktabga tayyorlov davomat jurnali.',
    where: 'Menyu: Maktabga tayyorlov davomati',
    contract: 'Jurnalni yurituvchi o‘qituvchi shartnomasi bilan bog‘liq.',
    actions: {
      create: 'Faqat BUGUNGI davomatni kiritish — har bir o‘quvchi uchun bir marta (saqlangach o‘zgartirib bo‘lmaydi).',
      edit: 'O‘tgan sanalar davomatini kiritish va saqlangan belgini o‘zgartirish.',
    },
  },
  preschool_contracts: {
    summary: 'Maktabga tayyorlov (bolalar) shartnomalari.',
    where: 'Menyu: Maktabga tayyorlov shartnomasi',
    branch: 'Shartnoma faqat foydalanuvchiga biriktirilgan filial(lar)ga tuziladi/o‘zgartiriladi (hamma filialga — foydalanuvchiga barcha filiallar biriktiriladi; Super admin roli cheklanmaydi).',
    actions: { create: 'Yangi shartnoma yaratish (alohida «student_contracts» dan mustaqil).' },
  },
  preschool_prices: {
    summary: 'Maktabga tayyorlov oylik narxlari.',
    where: 'Menyu: Maktabga tayyorlov narxi',
    actions: { change_status: 'Narx holatini o‘zgartirish (tasdiqlash / nofaol qilish).' },
  },
  questions: { summary: 'Test savollari va variantlari.', where: 'Menyu: Savollar va variantlar' },
  regions: { summary: 'Hududlar (viloyatlar).', where: 'Menyu: Tashkilot → Hududlar' },
  rejection_reasons: { summary: 'Lid rad etish sabablari.', where: 'Menyu: Sotuv → Rad etish sabablari' },
  roles: {
    summary: 'Rollar va ularning ruxsatlari (shu sahifa).',
    where: 'Menyu: Foydalanuvchilar → Ro‘llar',
    actions: { edit: 'Rolning ruxsatlarini o‘zgartirish — o‘zgarish shu roldagilarda sahifa yangilanganda yoki 5 daqiqa ichida kuchga kiradi.' },
  },
  rooms: { summary: 'Xonalar.', where: 'Menyu: Tashkilot → Xonalar' },
  settings: {
    summary: 'Tizim sozlamalari (jadval ustunlari, dashboard).',
    where: 'Menyu: Sozlamalar',
    actions: { update: 'Jadval ustunlari va dashboard sozlamalarini saqlash (hamma foydalanuvchiga ta’sir qiladi).' },
  },
  sources: { summary: 'Lid manbalari (reklama kanallari).', where: 'Menyu: Sotuv → Manbalar' },
  student_attendance: {
    summary: 'O‘quvchi davomati va baholari (darsda).',
    where: 'Menyu: Davomat / O‘quvchi davomati',
    contract: 'Davomatni belgilagan o‘qituvchiga foiz FAOL shartnomasidan hisoblanadi; kelmagan o‘quvchidan ham dars narxi yechiladi (faqat «sababli» emas).',
    actions: {
      create: 'Bugungi (boshlangan) dars uchun davomat va baho qo‘yish; dars davomida o‘zi qo‘ygan belgini tuzatish ham shu ruxsat bilan.',
      edit: 'Qo‘yilgan davomat va bahoni o‘zgartirish — o‘tgan dars kunlari ham (o‘qituvchiga faqat o‘z guruhlarida; o‘quvchi balansi qayta hisoblanadi). «Yangilash (update)» bilan birga belgilanadi.',
      delete: 'Davomatni o‘chirish (balans qaytariladi).',
      update: 'Qo‘yilgan davomat/bahoni saqlash — backend aynan shu nomni tekshiradi; «Tahrirlash» bilan birga belgilanadi.',
    },
  },
  student_contracts: {
    summary: 'O‘quvchi shartnomalari (lid/guruh bo‘yicha).',
    where: 'Menyu: O‘quvchi shartnoma',
    branch: 'Shartnoma faqat foydalanuvchiga biriktirilgan filial(lar)ga tuziladi/o‘zgartiriladi (hamma filialga — foydalanuvchiga barcha filiallar biriktiriladi; Super admin roli cheklanmaydi).',
    actions: { view: 'Shartnomalar ro‘yxati, ko‘rish va chop etish. SMS yuborish — «edit» ruxsati bilan.' },
  },
  students: {
    summary: 'O‘quvchilar.',
    where: 'Menyu: O‘quvchilar',
    branch: BRANCH_SCOPED,
    actions: { attach_group: 'O‘quvchini guruhga biriktirish.' },
  },
  tasks: {
    summary: 'Vazifalar (Operator vazifalari va Siklogramma).',
    where: 'Menyu: Vazifalar',
    contract: '«Taymer» (o‘ziga eslatma) vazifasi xodim yozuvi bo‘lgan foydalanuvchi uchun yaratiladi.',
  },
  tests: {
    summary: 'Testlar.',
    where: 'Menyu: Test',
    actions: { add_questions: 'Testga savollarni biriktirish.' },
  },
  trash: {
    summary: 'Arxiv (o‘chirilgan yozuvlar).',
    where: 'Menyu: Arxiv',
    actions: { restore: 'Arxivdan tiklash.', destroy: 'Butunlay o‘chirish (qaytarib bo‘lmaydi).', view: 'Arxivdagi yozuvlarni ko‘rish.' },
  },
  users: {
    summary: 'Foydalanuvchilar (tizimga kiruvchilar), rol va filial biriktirish.',
    where: 'Menyu: Foydalanuvchilar',
    needs: 'Foydalanuvchiga FILIAL biriktirilsa — u faqat shu filialda to‘lov/chiqim kirita oladi.',
  },
  work_schedules: {
    summary: 'Xodimning ish jadvali — Face ID davomatida kechikishni hisoblash uchun. Tizimga kirishni CHEKLAMAYDI.',
    where: 'Menyu: Xodimlar va Shartnomalar → soat tugmasi',
    contract: 'O‘qituvchiga (pedagogik bo‘limda faol shartnomasi borga) jadval kiritilmaydi — uning davomati dars jadvalidan olinadi.',
    actions: {
      view: 'Xodim qatorida soat tugmasi chiqadi — haftalik jadval ochiladi (jadvalni serverdan yuklash shu ruxsat bilan).',
      create: 'Jadvalni saqlaydi: har hafta kuni uchun alohida vaqt, belgilanmagan kun — dam olish.',
    },
  },
  user_work_schedules: {
    summary: 'Foydalanuvchi tizimda QAYSI KUN va SOATDA ma’lumot kirita olishini belgilaydi. Davomat jadvali emas.',
    where: 'Menyu: Foydalanuvchilar → soat tugmasi',
    needs: 'Jadvali bo‘sh foydalanuvchi cheklanmaydi. Jadvalda belgilangan vaqtdan tashqarida u faqat ko‘radi (qo‘shish/o‘zgartirish/o‘chirish bloklanadi).',
    actions: {
      view: 'Foydalanuvchi qatorida soat tugmasi chiqadi — haftalik yozish jadvali va hozirgi holat ko‘rinadi.',
      edit: 'Boshqa foydalanuvchining haftalik vaqtini saqlaydi (jadvalni tozalasangiz — cheklov olib tashlanadi). O‘z jadvalini o‘zgartira olmaydi.',
      bypass: 'Bu foydalanuvchi vaqt cheklovidan OZOD: istalgan paytda yoza oladi va o‘z jadvalini ham o‘zgartira oladi. Odatda faqat Super admin uchun.',
    },
  },
};

/** Bitta ruxsat (`group.action`) nima qilishini tushuntiradi. */
export function describeAction(group: string, action: string): string {
  return GROUP_INFO[group]?.actions?.[action] ?? DEFAULT_ACTION_TEXT[action] ?? `«${action}» harakati.`;
}

/**
 * Bo'lim kartochkasidagi undov (!) matni: nima uchun, qayerda chiqadi, har bir (mavjud) ruxsat nima qiladi,
 * filial va shartnoma qoidalari.
 */
export function buildGroupHint(group: string, actions: string[]): string {
  const info = GROUP_INFO[group];
  const lines: string[] = [];
  lines.push(info ? info.summary : `«${group}» bo‘limi.`);
  if (info?.where) lines.push(`📍 ${info.where}`);
  lines.push('');
  lines.push('Ruxsatlar:');
  const order = (action: string) => {
    const i = ['view', 'show', 'create', 'edit', 'delete'].indexOf(action);
    return i >= 0 ? i : action === 'view_all' ? 98 : 10;
  };
  const sorted = [...actions].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  for (const action of sorted) lines.push(`• ${action}: ${describeAction(group, action)}`);
  if (info?.branch) lines.push('', `🏢 Filial: ${info.branch}`);
  if (info?.contract) lines.push('', `📄 Shartnoma: ${info.contract}`);
  if (info?.needs) lines.push('', `➕ Qo‘shimcha: ${info.needs}`);
  return lines.join('\n');
}
