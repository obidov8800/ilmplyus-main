/**
 * Rollar sahifasi yorliqlari (o'zbekcha). Admin ilovasining `messages/uz.json` dagi `modules` va
 * `roles.permissionActions` bo'limlaridan olingan — Admin'da yorliq o'zgarsa, shu yerda ham yangilang.
 */
export const MODULE_LABELS: Record<string, string> = {
  "admin": "Admin panel",
  "user_work_schedules": "Foydalanuvchi ish vaqti (tizimga yozish)",
  "ip_telephone": "IP telefoniya",
  "users": "Foydalanuvchilar",
  "roles": "Rollar",
  "operators": "Operatorlar",
  "branches": "Filiallar",
  "regions": "Viloyatlar",
  "departments": "Bo‘limlar",
  "rooms": "Xonalar",
  "hikvision_devices": "Hikvision qurilmalar",
  "ip_telefon_operators": "IP telefon operatorlari",
  "attendance": "Davomat",
  "positions": "Lavozimlar",
  "employee_contracts": "Xodim shartnomalari",
  "teachers": "O‘qituvchilar",
  "courses": "Kurslar",
  "levels": "Darajalar",
  "course_prices": "Kurs narxlari",
  "lesson_schedule": "Dars jadvali",
  "demo_lessons": "Demo darslar",
  "groups": "Guruhlar",
  "lids": "Lidlar",
  "ip-telephone": "IP-Telefon",
  "rejection_reasons": "Rad etish sabablari",
  "sources": "Manbalar",
  "tasks": "Vazifalar",
  "questions": "Savollar",
  "expense_categories": "Xarajat kategoriyalari",
  "expense_subcategories": "Xarajat subkategoriyalari",
  "expenses": "Xarajatlar",
  "student_attendance": "O‘quvchi davomati",
  "homework_submissions": "O‘quvchi vazifalari",
  "student_contracts": "O‘quvchi shartnomalari",
  "students": "O‘quvchilar",
  "payments": "To‘lovlar",
  "salaries": "Maoshlar",
  "trash": "Arxiv",
  "exam_sessions": "Imtihon sessiyalari",
  "exam_attempts": "Imtihon urinishlari",
  "exam_reports": "Imtihon hisobotlari",
  "level_promotions": "Daraja ko‘tarilishi",
  "districts": "Tumanlar",
  "work_schedules": "Xodim ish jadvali (davomat)",
  "employees": "Xodimlar",
  "tests": "Testlar",
  "lessons": "Darslar",
  "permissions": "Ruxsatlar",
  "lessons_schedules": "Dars jadvali",
  "chart_of_accounts": "Hisobvaraqlar rejasi",
  "chart_of_accounts_transfers": "Hisobvaraqlar o‘rtasidagi o‘tkazmalar",
  "jamgarmas": "Jamg‘armalar",
  "account_to_jamgarma_transfers": "Hisobvaraqdan jamg‘armaga o‘tkazmalar",
  "jamgarma_loans": "Jamg‘arma qarzlari",
  "jamgarma_loan_repayments": "Jamg‘arma qarz qaytarishlari",
  "jamgarma_loan_forfeitures": "Jamg‘arma qarzlarini kechirish",
  "jamgarma_transactions": "Jamg‘arma tranzaksiyalari",
  "payment_gateway_commissions": "To‘lov tizimi komissiyalari",
  "payment_commission_logs": "Komissiya loglari",
  "payroll_settings": "Ish haqi sozlamalari",
  "payroll_periods": "Ish haqi davrlari",
  "payroll_adjustments": "Ish haqi tuzatishlari",
  "payroll_distributions": "Ish haqi taqsimlash",
  "daily_cash_reports": "Kunlik kassa hisobotlari",
  "branch_reports": "Filiallar bo‘yicha hisobotlar",
  "monthly_accounting_reports": "Oylik buxgalteriya hisoboti",
  "financial_plans": "Moliyaviy rejalar",
  "payroll_sheets": "Ish haqi qaydnomalari",
  "fine_types": "Jarima turlari",
  "employee_fines": "Xodim jarimalari",
  "settings": "Sozlamalar",
  "academic_years": "O‘quv yillari",
  "preschool_prices": "Maktabga tayyorlov narxi",
  "preschool_attendances": "Maktabga tayyorlov davomati",
  "preschool_contracts": "Maktabga tayyorlov shartnomalari",
  "jamgarma_names": "Jamg‘arma nomlari",
  "login_histories": "Kirishlar tarixi",
  "lookups": "Forma tanlov ro‘yxatlari",
};

export const ACTION_LABELS: Record<string, string> = {
  "lookups_view": "Tanlov ro‘yxatlarini ko‘rish",
  "bypass": "Cheklovdan ozod (istalgan vaqtda yozadi)",
  "payments_view_all": "Boshqa kassirlar kiritgan to‘lovlarni ham ko‘rish",
  "view": "Sahifani ko‘rish",
  "show": "Ko‘rish",
  "create": "Qo‘shish",
  "edit": "Tahrirlash",
  "delete": "O‘chirish",
  "attach_group": "Guruh biriktirish",
  "submit_for_approval": "Tasdiqlashga yuborish",
  "approve": "Tasdiqlash",
  "reject": "Rad etish",
  "set_active": "Faollashtirish",
  "set_inactive": "Nofaollashtirish",
  "terminate": "Tugatish",
  "sync": "Sinxronlashtirish",
  "mark_attendance": "Davomat belgilash",
  "add_questions": "Savol qo‘shish",
  "cancel": "Bekor qilish",
  "add_transfer_maker": "O‘tkazma qiluvchi qo‘sish",
  "remove_transfer_maker": "O‘tkazma qiluvchini o‘chirish",
  "add_withdrawer": "Yechib oluvchi qo‘sish",
  "remove_withdrawer": "Yechib oluvchini o‘chirish",
  "update": "Yangilash",
  "restore": "Tiklash",
  "destroy": "Butunlay o‘chirish",
  "close": "Yopish",
  "reopen": "Qayta ochish",
  "close_shift": "Smenani yopish",
  "send": "Yuborish",
  "accept": "Qabul qilish",
  "return_for_correction": "Tuzatishga qaytarish",
  "correct": "Tuzatish",
  "responsible": "Mas’ul shaxs",
  "add_expense": "Chiqim qo‘shish",
  "generate": "Shakllantirish",
  "prepare": "Tayyorlash",
  "distribute": "Taqsimlash",
  "analysis": "Tahlil",
  "print": "Chop etish",
  "view_all": "Boshqalarning yozuvlarini ham ko‘rish",
  "revert": "Tasdiqni qaytarish",
  "change_status": "Holatni o‘zgartirish",
  "access": "Kirish",
};

const humanize = (key: string): string => {
  const text = key.replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
};

/** Bo'lim yorlig'i (tarjimasi bo'lmasa o'qiladigan zaxira). */
export function moduleLabel(moduleName: string): string {
  return MODULE_LABELS[moduleName] ?? humanize(moduleName);
}

/** Amal yorlig'i (`view` → «Sahifani ko'rish», `show` → «Ko'rish»…). */
export function actionLabel(moduleName: string, action: string): string {
  if (moduleName === 'payments' && action === 'view_all') return ACTION_LABELS.payments_view_all ?? humanize(action);
  if (moduleName === 'lookups' && action === 'view') return ACTION_LABELS.lookups_view ?? humanize(action);
  return ACTION_LABELS[action] ?? humanize(action);
}

/** «Bo'lim → Amal» ko'rinishidagi yorliq (`fromModule` shu bo'lim bo'lsa faqat amal nomi). */
export function permissionLabel(name: string, fromModule?: string): string {
  const [module, ...rest] = name.split('.');
  const action = rest.join('.');
  if (fromModule && fromModule === module) return actionLabel(module, action);
  return `${moduleLabel(module)} → ${actionLabel(module, action)}`;
}
