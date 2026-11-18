import type { FaqEntry, FaqImage } from '@/types/faq.types';

/**
 * Boshlang'ich FAQ mazmuni — birinchi ochilishda `faqService`
 * (`localStorage`) shu ro'yxatni nusxalab saqlaydi, keyin admin uni
 * tahrirlashi mumkin. Faqat `_uz` maydonlari to'ldirilgan — RU/EN'ni admin
 * keyinchalik "Tahrirlash" oynasidan qo'shishi mumkin (bo'sh qolsa
 * ko'rsatishda avtomatik UZ'ga tushadi).
 *
 * Rasm va videolar `public/faq-media/` ichida (ilova bilan birga joylanadi):
 *  • `img/*.webp` — haqiqiy sahifadan olingan skrinshotlar, raqamli belgilar bilan;
 *  • `video/*.webm` (+ `.jpg` poster) — qadamma-qadam ko'rsatma videolari.
 * Ularni qayta olish: `D:\ilmplyus\.claude\tools\audit\faq_media.mjs`.
 */

const IMG_BASE = '/faq-media/img';
const VIDEO_BASE = '/faq-media/video';

const img = (name: string, caption_uz: string): FaqImage => ({ src: `${IMG_BASE}/${name}.webp`, caption_uz });
const video = (name: string) => ({
  videoUrl: `${VIDEO_BASE}/${name}.webm`,
  videoPoster: `${VIDEO_BASE}/${name}.jpg`,
});

export const FAQ_SEED: FaqEntry[] = [
  // ── Umumiy (login sahifasida ham ko'rinadi) ──────────────────────────
  {
    id: 'general-1',
    moduleKey: 'general',
    question_uz: 'Tizimga qanday kiraman?',
    answer_uz:
      'Login sahifasida sizga berilgan login (foydalanuvchi nomi) va parolni kiriting, so\'ng «Kirish» tugmasini bosing. Login va parolni bilmasangiz, administratoringizga murojaat qiling.',
    images: [img('general-login', '1 — login, 2 — parol, 3 — «Kirish» tugmasi.')],
    videoUrl: null,
    order: 1,
  },
  {
    id: 'general-2',
    moduleKey: 'general',
    question_uz: 'Parolni unutdim, nima qilaman?',
    answer_uz:
      'Login sahifasidagi «Parolni tiklash» havolasini bosing, ro\'yxatdan o\'tgan telefon raqamingizni kiriting va «SMS yuborish» tugmasini bosing. Raqamingizga login va vaqtinchalik parol SMS orqali yuboriladi — shu ma\'lumot bilan kirib, yangi parol o\'rnatasiz.',
    images: [
      img('general-reset-link', '«Parolni tiklash» havolasi.'),
      img('general-reset-phone', 'Telefon raqamni kiriting va «SMS yuborish» ni bosing.'),
    ],
    videoUrl: null,
    order: 2,
  },
  {
    id: 'general-3',
    moduleKey: 'general',
    question_uz: 'Interfeys tilini qanday o\'zgartiraman?',
    answer_uz:
      'Sahifaning yuqori qismidagi til tanlagich (UZ / RU / EN) orqali istalgan vaqtda tilni almashtirishingiz mumkin — bu login sahifasida ham, tizimga kirgandan keyin ham mavjud.',
    images: [img('general-lang', 'Til tanlagich — sahifaning yuqori o\'ng burchagida.')],
    videoUrl: null,
    order: 3,
  },
  {
    id: 'general-4',
    moduleKey: 'general',
    question_uz: 'Sessiyam qancha vaqtdan keyin tugaydi?',
    answer_uz:
      'Xavfsizlik sabab, agar 6 soat davomida hech qanday amal bajarilmasa, tizim sizni avtomatik chiqaradi va qaytadan kirish so\'raladi.',
    videoUrl: null,
    order: 4,
  },

  // ── Lidlar ────────────────────────────────────────────────────────────
  {
    id: 'lids-1',
    moduleKey: 'lids',
    question_uz: 'Lidlar doskasi qanday ishlaydi?',
    answer_uz:
      'Doska 4 ta asosiy bo\'limdan iborat: «Ro\'yxatdan o\'tganlar» (Onlayn/Oflayn), «Aloqa» (O\'rnatildi/O\'rnatilmadi/Qiziqmadi), «Demo dars» (Kelmoqchi/Keldi/Kelmadi) va «Shartnoma va to\'lov». Har bir bo\'lim ichida bir nechta ustun (holat) bor — lid kartasini bir ustundan boshqasiga sudrab o\'tkazish orqali uning holatini o\'zgartirasiz.',
    images: [
      img('lids-board', '1–3 — bo\'limlar, 4 — ustun (lidning holati). Har ustun sarlavhasida lidlar soni ko\'rsatilgan.'),
      img('lids-board-right', 'Doskani o\'ngga surib, «Shartnoma va to\'lov» bo\'limini ko\'rasiz.'),
    ],
    videoUrl: null,
    order: 1,
  },
  {
    id: 'lids-2',
    moduleKey: 'lids',
    question_uz: 'Yangi lid qanday qo\'shiladi?',
    answer_uz:
      'Har bir ustun sarlavhasidagi «+» belgisini bosing — «Ro\'yxatga olish» oynasi ochiladi. Lidning ismi, telefon raqami, manbasi va boshqa ma\'lumotlarini kiriting (* bilan belgilangan maydonlar majburiy) va «Qo\'shish» tugmasini bosing.',
    images: [
      img('lids-add-btn', '«+» — shu ustunga yangi lid qo\'shadi.'),
      img('lids-add-modal', 'Ro\'yxatga olish oynasi: majburiy maydonlarni to\'ldirib, «Qo\'shish» ni bosing.'),
    ],
    videoUrl: null,
    order: 2,
  },
  {
    id: 'lids-3',
    moduleKey: 'lids',
    question_uz: 'Lid bir bo\'limdan boshqasiga (masalan Aloqadan Demo darsga) o\'tkazilsa nima bo\'ladi?',
    answer_uz:
      'Agar lid BOSHQA bo\'limga ko\'chirilsa (masalan «Aloqa»dan «Demo dars»ga), tizim tasdiqlash oynasini chiqaradi — u yerda yangi holatni tanlaysiz va izoh yozasiz. Bitta bo\'lim ICHIDAGI ustunlar orasida (masalan «Onlayn»dan «Oflayn»ga) esa to\'g\'ridan-to\'g\'ri, tasdiqlashsiz o\'tadi.',
    images: [img('lids-drop-confirm', '1 — yangi holat, 2 — izoh (ixtiyoriy), 3 — «Saqlash».')],
    videoUrl: null,
    order: 3,
  },
  {
    id: 'lids-4',
    moduleKey: 'lids',
    question_uz: 'Lid kartasini qanday sudrab (drag-and-drop) o\'tkazaman? — batafsil ko\'rsatma',
    answer_uz:
      'Sichqoncha bilan kartaning istalgan joyidan bosib ushlab turing, kerakli ustun ustiga olib boring va qo\'yib yuboring. Quyidagi videoda ikki holat ko\'rsatilgan: bir bo\'lim ichida (tasdiqlashsiz) va boshqa bo\'limga o\'tkazish (tasdiqlash oynasi bilan). Karta sudralmasa — sizda lidni tahrirlash ruxsati yo\'q, administratorga murojaat qiling.',
    ...video('lids-drag'),
    order: 4,
  },

  // ── Vazifalar ─────────────────────────────────────────────────────────
  {
    id: 'tasks-1',
    moduleKey: 'tasks',
    question_uz: 'Vazifa qanday yaratiladi?',
    answer_uz:
      '«Vazifa yaratish» tugmasini bosing, lidni (FISH yoki ID bo\'yicha) tanlang, ustuvorlik (Shoshilinch / O\'rta / Bemalol), sana va vaqt, mas\'ul operator hamda izohni kiriting va «Vazifani saqlash» ni bosing.',
    images: [
      img('tasks-page', '1 — yangi vazifa, 2 — holat filtri, 3 — operator filtri.'),
      img('tasks-create-modal', 'Vazifa oynasi: lid, ustuvorlik, sana/vaqt, mas\'ul operator, izoh.'),
    ],
    videoUrl: null,
    order: 1,
  },
  {
    id: 'tasks-2',
    moduleKey: 'tasks',
    question_uz: 'Vazifa holatini qanday o\'zgartiraman?',
    answer_uz:
      'Yangi vazifada «Bajarish» tugmasini bosing — vazifa «Bajarilmoqda» holatiga o\'tadi va «Bajarildi» hamda «Bajarilmadi» tugmalari paydo bo\'ladi. Ulardan birini bosganingizda izoh yozish maydoni chiqadi — izohni yozib tasdiqlaysiz. Yakunlangan vazifa qayta o\'zgartirilmaydi.',
    images: [img('tasks-card-buttons', '1 — jarayonda, 2 — bajarildi, 3 — bajarilmadi (izoh bilan).')],
    videoUrl: null,
    order: 2,
  },
  {
    id: 'tasks-3',
    moduleKey: 'tasks',
    question_uz: 'Faqat o\'zimga biriktirilgan vazifalarni qanday ko\'raman?',
    answer_uz:
      'Agar sizda vazifa yaratish huquqi bo\'lmasa, sahifa avtomatik ravishda faqat sizga biriktirilgan vazifalarni ko\'rsatadi. Boshqaruvchilar esa yuqoridagi operator filtri orqali istalgan xodimning vazifalarini ko\'ra oladi.',
    images: [img('tasks-page', '3 — operator filtri (faqat boshqaruvchilarda).')],
    videoUrl: null,
    order: 3,
  },

  // ── Guruhlar ──────────────────────────────────────────────────────────
  {
    id: 'groups-1',
    moduleKey: 'groups',
    question_uz: 'Yangi guruh qanday ochiladi?',
    answer_uz:
      '«Guruhlar» sahifasida «Guruh yaratish» tugmasini bosing. Avval filialni tanlang — kurs, daraja, o\'qituvchi va xona shunga qarab ochiladi. So\'ng boshlanish/tugash sanasi va vaqti hamda dars kunlarini belgilab «Saqlash» ni bosing.',
    images: [
      img('groups-page', '1 — yangi guruh, 2 — guruh a\'zolarini ko\'rish.'),
      img('groups-create-modal', 'Filial → kurs → daraja ketma-ketligida tanlanadi; dars kunlarini belgilang.'),
    ],
    videoUrl: null,
    order: 1,
  },
  {
    id: 'groups-2',
    moduleKey: 'groups',
    question_uz: 'Guruhga o\'quvchi qanday qo\'shiladi?',
    answer_uz:
      'O\'quvchi guruhga shartnoma tuzish paytida qo\'shiladi: «O\'quvchilar shartnomasi» formasida kurs → bosqich → guruhni tanlaysiz (batafsil video — «O\'quvchilar shartnomasi» bo\'limida). Guruh a\'zolarini ko\'rish uchun guruhlar jadvalidagi «ko\'z» belgisini bosing.',
    images: [img('groups-page', '2 — guruh a\'zolari ro\'yxatini ochadi.')],
    videoUrl: null,
    order: 2,
  },

  // ── Kurslar ───────────────────────────────────────────────────────────
  {
    id: 'courses-1',
    moduleKey: 'courses',
    question_uz: 'Kurs narxini qanday o\'zgartiraman?',
    answer_uz:
      '«Kurs narxlari» sahifasida «Qo\'shish» tugmasini bosing, filial, kurs va darajani tanlab, yangi narxni (1 oylik summa) hamda o\'zgarish sanasini kiriting. Yangi narx darhol emas, balki siz belgilagan sanadan boshlab kuchga kiradi — shu bilan eski shartnomalar buzilmaydi. Narxlar holat bo\'yicha tablarda turadi (Yangi narx, Jarayonda, Tasdiqlandi, Rad etildi, Eski narx).',
    images: [
      img('courses-page', '1 — yangi narx kiritish, 2 — holat bo\'yicha tablar.'),
      img('courses-add-modal', '1 — faqat bir oylik summa, 2 — narx kuchga kiradigan sana.'),
    ],
    videoUrl: null,
    order: 1,
  },

  // ── Demo dars ─────────────────────────────────────────────────────────
  {
    id: 'demo-1',
    moduleKey: 'demoLesson',
    question_uz: 'Demo darsga kelgan lidning davomatini qanday belgilayman?',
    answer_uz:
      'Demo dars sahifasida kerakli dars qatoridagi «Davomat» tugmasini (daftar belgisi) bosing. Ochilgan sahifada har bir lid qarshisidagi tugmani — kelgan bo\'lsa yoqing — va «Davomatni saqlash» ni bosing. Kelganlar lidlar doskasidagi «Keldi», kelmaganlar «Kelmadi» ustuniga avtomatik o\'tadi.',
    images: [
      img('demo-page', '1 — yangi demo dars, 2 — shu darsning davomati.'),
      img('demo-attendance', '1 — kelgan lidni yoqing, 2 — «Davomatni saqlash».'),
    ],
    videoUrl: null,
    order: 1,
  },

  // ── Dars jadvali ──────────────────────────────────────────────────────
  {
    id: 'schedule-1',
    moduleKey: 'lessonSchedule',
    question_uz: 'Dars jadvalida xona band ekanini qanday bilaman?',
    answer_uz:
      'Jadvalda xona va kun kesishmasida shu vaqtda band bo\'lgan guruh kartochka bo\'lib ko\'rinadi (guruh nomi, o\'qituvchi, soat). Kartochka bo\'lmagan joy — bo\'sh. Yuqoridagi «Kunlik / Haftalik / Oylik» tugmalari ko\'rinishni almashtiradi.',
    images: [img('schedule-grid', '1 — ko\'rinish tanlash, 2 — band vaqt kartochkasi (guruh, o\'qituvchi, soat).')],
    videoUrl: null,
    order: 1,
  },

  // ── O'quvchi vazifalari (Lessons) ────────────────────────────────────
  {
    id: 'lessons-1',
    moduleKey: 'lessons',
    question_uz: 'O\'quvchiga vazifa qanday biriktiriladi?',
    answer_uz:
      'Avval ro\'yxatdan guruhni tanlang, so\'ng «Dars qo\'shish» tugmasi orqali dars mavzusi, dars fayli va uyga vazifa (matn hamda fayl) ni kiriting.',
    images: [img('lessons-page', '1 — guruhni tanlang, 2 — dars va uyga vazifa qo\'shish.')],
    videoUrl: null,
    order: 1,
  },

  // ── Hisobotlar ────────────────────────────────────────────────────────
  {
    id: 'reports-1',
    moduleKey: 'reports',
    question_uz: 'Qanday hisobotlar mavjud?',
    answer_uz:
      'Hisobotlar bo\'limi hozircha ishga tushirilmoqda. U tayyor bo\'lgach, shu yerda filial, sana oralig\'i va boshqa filtrlar bo\'yicha o\'quvchilar, to\'lovlar va boshqa ko\'rsatkichlar bo\'yicha umumlashtirilgan hisobotlarni ko\'rasiz.',
    videoUrl: null,
    order: 1,
  },

  // ── O'quvchilar davomati ─────────────────────────────────────────────
  {
    id: 'student-attendance-1',
    moduleKey: 'studentAttendance',
    question_uz: 'O\'quvchi davomatini qanday belgilayman?',
    answer_uz:
      'Guruhni tanlang. Dars kuni bo\'lsa pastdagi «Darsni boshlash» tugmasini bosing (dars mavzusi so\'ralishi mumkin). So\'ng o\'quvchi qatorida kerakli kun ustunidagi doirani bosing — ochilgan oynada Keldi / Kelmadi / Kech qolgan / Sababli kelmagan belgisini tanlang, kerak bo\'lsa baho qo\'ying va «Saqlash» ni bosing. Dars tugagach «Darsni tamomlash» tugmasini bosing.',
    images: [
      img('sattend-groups', 'Avval guruhni tanlang.'),
      img('sattend-table', '1 — belgilar ma\'nosi, 2 — kun ustunidagi doira, 3 — darsni boshlash.'),
      img('sattend-popover', 'Holatni tanlang, kerak bo\'lsa baho yozing va «Saqlash» ni bosing.'),
    ],
    videoUrl: null,
    order: 1,
  },

  // ── Xodimlar davomati ─────────────────────────────────────────────────
  {
    id: 'staff-attendance-1',
    moduleKey: 'staffAttendance',
    question_uz: 'Xodim ish vaqtini qanday ko\'raman?',
    answer_uz:
      '«Davomat» sahifasida jadvaldan xodim ismini bosing — uning ish kunlari, jami ish vaqti, kech qolgan va sababsiz kelmagan kunlari hamda har kun uchun kelish/ketish vaqti batafsil jadvalda ko\'rinadi.',
    images: [
      img('attend-list', '1 — xodim ismini bosing, 2 — bo\'lim bo\'yicha filtr.'),
      img('attend-employee', 'Tanlangan xodimning oylik ko\'rsatkichlari va kunlar bo\'yicha jadvali.'),
    ],
    videoUrl: null,
    order: 1,
  },

  // ── To'lovlar ─────────────────────────────────────────────────────────
  {
    id: 'payments-1',
    moduleKey: 'payments',
    question_uz: 'To\'lov qanday qabul qilinadi?',
    answer_uz:
      '«To\'lov kiritish» tugmasini bosing, guruhni va o\'quvchini tanlang, summani kiriting, to\'lov turini (Naqd yoki Karta) tanlab «Saqlash» ni bosing. To\'lov o\'quvchining balansiga darhol qo\'shiladi. Quyidagi videoda butun jarayon ko\'rsatilgan.',
    images: [
      img('payments-page', '1 — «To\'lov kiritish», 2 — filtr.'),
      img('payments-modal', '1 — guruh, 2 — o\'quvchi, 3 — summa, 4 — to\'lov turi, 5 — «Saqlash».'),
    ],
    ...video('payment-add'),
    order: 1,
  },
  {
    id: 'payments-2',
    moduleKey: 'payments',
    question_uz: 'Xato kiritilgan to\'lovni qanday bekor qilaman?',
    answer_uz:
      'Hozircha to\'lovni o\'zingiz o\'chira olmaysiz (o\'chirish tugmasi yopilgan). Xato kiritilgan bo\'lsa, to\'lovning ID raqami (jadvalning birinchi ustuni), o\'quvchi va summasini aytib administratorga murojaat qiling.',
    videoUrl: null,
    order: 2,
  },

  // ── Xodim shartnomalari ───────────────────────────────────────────────
  {
    id: 'contracts-1',
    moduleKey: 'contracts',
    question_uz: 'Xodim bilan yangi shartnoma qanday tuziladi? — batafsil ko\'rsatma',
    answer_uz:
      '«Yangi shartnoma» tugmasini bosing — «Xodim bilan shartnoma» formasi ochiladi. Xodimning JSHSHIR raqami, filial, shartnoma sanasi, passport va shaxsiy ma\'lumotlarini (FISH, tug\'ilgan sana), so\'ng oylik maosh va maosh davri, mehnat ta\'tili, telefon va yashash manzilini kiriting. * bilan belgilangan maydonlar majburiy. Oxirida «Saqlash» ni bosing — shartnoma hujjati avtomatik shakllantiriladi.',
    images: [
      img('contracts-page', '1 — yangi shartnoma.'),
      img('contracts-create', '1 — JSHSHIR, 2 — filial, 3 — shartnoma sanasi, 4 — passport.'),
      img('contracts-create-bottom', 'Forma oxiri: oylik maosh, maosh davri, ta\'til, telefon, manzil va «Saqlash».'),
    ],
    videoUrl: null,
    order: 1,
  },

  // ── O'quvchilar shartnomasi ───────────────────────────────────────────
  {
    id: 'students-contracts-1',
    moduleKey: 'studentsContracts',
    question_uz: 'O\'quvchi bilan shartnoma qanday tuziladi va tasdiqlanadi? — batafsil ko\'rsatma',
    answer_uz:
      '«Shartnoma tuzish» tugmasini bosib shartnoma turini tanlang (voyaga yetgan / voyaga yetmagan / yuridik shaxs / yuridik shaxs va vakil). Formada lidni ID yoki ism bo\'yicha topsangiz, ma\'lumotlari avtomatik to\'ladi. So\'ng JSHSHIR, passport, kurs → bosqich → guruh, oylik to\'lov va sanalar, telefon va manzilni kiriting — o\'quvchi tanlangan guruhga shu yerda qo\'shiladi. Shartnoma tuzilgach, mijoz uni SMS orqali yuborilgan havola bilan onlayn tasdiqlaydi. Butun jarayon quyidagi videoda.',
    images: [
      img('scontract-page', '1 — shartnoma tuzish.'),
      img('scontract-choose', 'Shartnoma turini tanlang (1–4).'),
    ],
    ...video('student-contract'),
    order: 1,
  },

  // ── Chiqimlar ─────────────────────────────────────────────────────────
  {
    id: 'expenses-1',
    moduleKey: 'expenses',
    question_uz: 'Xarajat qanday kiritiladi?',
    answer_uz:
      '«Qo\'shish» tugmasini bosing — «Chiqim kiritish» oynasida jamg\'armani, chiqim kategoriyasi va podkategoriyasini tanlang, summani kiriting va «Saqlash» ni bosing. Chiqim filialingiz bo\'yicha hisobga olinadi. Butun jarayon quyidagi videoda.',
    images: [
      img('expenses-page', '1 — yangi chiqim.'),
      img('expenses-modal', '1 — jamg\'arma, 2 — kategoriya, 3 — summa, 4 — «Saqlash».'),
    ],
    ...video('expense-add'),
    order: 1,
  },

  // ── Moliya ────────────────────────────────────────────────────────────
  {
    id: 'finance-1',
    moduleKey: 'finance',
    question_uz: 'Moliya bo\'limida nima bor?',
    answer_uz:
      'Bu bo\'lim hisob raqamlari orasidagi tranzaksiyalar, jamg\'armalar, qarz oldi-berdisi, ish haqi taqsimoti, kunlik kassa hisobotlari va jarimalarni o\'z ichiga oladi — sizga qaysi qismga ruxsat berilgan bo\'lsa, o\'sha yon menyuda ko\'rinadi.',
    images: [img('finances-page', 'Masalan, hisob raqamlar orasidagi tranzaksiyalar: 1 — transfer, 2 — tasdiqlash / rad etish.')],
    videoUrl: null,
    order: 1,
  },

  // ── Rollar ────────────────────────────────────────────────────────────
  {
    id: 'roles-1',
    moduleKey: 'roles',
    question_uz: 'Xodimga yangi ruxsat qanday beriladi?',
    answer_uz:
      '«Rollar boshqaruvi» sahifasida chapdan kerakli rolni tanlang, so\'ng bo\'limlar bo\'yicha ruxsatlarni belgilang (View — ko\'rish, Create — qo\'shish, Edit — tahrirlash, Delete — o\'chirish) va «Saqlash» ni bosing. O\'sha rolga biriktirilgan barcha xodimlarga ruxsat avtomatik tarqaladi.',
    images: [
      img('roles-list', '1 — rolni tanlang.'),
      img('roles-permissions', '1 — tanlangan rol, 2 — bo\'lim ruxsatlari, 3 — ruxsat belgisi, 4 — «Saqlash».'),
    ],
    ...video('role-permissions'),
    order: 1,
  },

  // ── Foydalanuvchilar ──────────────────────────────────────────────────
  {
    id: 'users-1',
    moduleKey: 'users',
    question_uz: 'Yangi xodim uchun tizimga kirish qanday yaratiladi?',
    answer_uz:
      'Foydalanuvchilar bo\'limida «+ Qo\'shish» tugmasini bosing, ism, login, telefon raqami, boshlang\'ich parol, rol va filialni belgilab «Saqlash» ni bosing. Xodim birinchi kirishda parolni o\'zgartirishi tavsiya etiladi.',
    images: [
      img('users-page', '1 — yangi foydalanuvchi.'),
      img('users-modal', 'Login, parol, rol (ruxsatlarni rol belgilaydi) va filial.'),
    ],
    videoUrl: null,
    order: 1,
  },
];
