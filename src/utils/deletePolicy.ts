/**
 * O'chirish siyosati (xodimlar ilovasi — staff).
 *
 * Ruxsat mantig'i: sahifa ruxsati (`view`) sahifa va jadvalni ochadi, `create` / `edit` o'z tugmalarini, `delete`
 * esa o'chirishni beradi. LEKIN bu ilovada (staff) «O'chirish» tugmasi hech qaysi bo'limda chizilmaydi —
 * o'chirish faqat Admin (boshqaruv) panelida bajariladi. Shuning uchun `*.delete` / `*.destroy` ruxsatlari
 * bu ilovada hech kimda (admin rolida ham) yo'q deb hisoblanadi.
 *
 * Tekshiruv ruxsat ro'yxatining o'zida (`useAuthStore`) va `usePermission` / `Protected` da qo'yilgan — shuning
 * uchun yangi sahifalar ham avtomatik shu qoidaga bo'ysunadi. Backend o'zgarmaydi (Admin panel ishlayveradi).
 *
 * Qaytarish uchun: `isDeleteBlocked` ni `false` qaytaradigan qilib qo'ying.
 */
export function isDeleteBlocked(permission: string): boolean {
  return permission.endsWith('.delete') || permission.endsWith('.destroy');
}

/** Ruxsatlar ro'yxatidan o'chirish ruxsatlarini olib tashlaydi. */
export function withoutDeletePermissions(list: string[]): string[] {
  return list.filter((permission) => !isDeleteBlocked(permission));
}
