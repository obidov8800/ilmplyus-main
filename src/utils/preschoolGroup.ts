/**
 * Maktabga tayyorlov (`branches.type = preschool`) filiali guruhlari uchun avtomatik qiymatlar.
 *
 * Oddiy filialdagi guruhdan farqi: kurs/daraja tanlanmaydi, tugash sanasi va kurs davomiyligi kiritilmaydi
 * (o'quv yili oxirigacha), dars kunlari va vaqti tayyor keladi, nomi o'quv yili ichida harf bilan ketadi.
 */
export const PRESCHOOL_GROUP_PREFIX = '0';

/** Hafta kunlari (backend `days` kalitlari). Dushanba–juma; shanba ham kerak bo'lsa shu yerga qo'shiladi. */
export const PRESCHOOL_DEFAULT_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

export const PRESCHOOL_START_TIME = '09:00';
export const PRESCHOOL_END_TIME = '16:00';

/** 0 → A, 1 → B … 25 → Z, 26 → AA, 27 → AB … */
export function letterSuffix(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Keyingi bo'sh guruh nomi: `0-A`, `0-B`, `0-C` … `takenNames` — shu filialning SHU o'quv yilidagi guruh nomlari
 * (backend nomni filial + o'quv yili ichida takrorlashga qo'ymaydi, boshqa yilda esa nom qayta ishlatiladi).
 * Band harf (masalan B) o'tkazib yuboriladi, birinchi bo'sh harf olinadi.
 */
export function nextPreschoolGroupName(takenNames: Iterable<string | null | undefined>): string {
  const taken = new Set<string>();
  for (const name of takenNames) {
    if (name) taken.add(name.trim().toUpperCase());
  }
  for (let i = 0; ; i += 1) {
    const candidate = `${PRESCHOOL_GROUP_PREFIX}-${letterSuffix(i)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Kunlar ro'yxati maktabga tayyorlov filialning standart haftasi bilan bir xilmi (tartibdan qat'i nazar). */
export function isPreschoolDefaultDays(days: readonly string[]): boolean {
  return (
    days.length === PRESCHOOL_DEFAULT_DAYS.length &&
    PRESCHOOL_DEFAULT_DAYS.every((day) => days.includes(day))
  );
}
