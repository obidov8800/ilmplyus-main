/**
 * Ism-familiya qismlarini ko'rsatishdan oldin tozalaydi: backendda "otasining ismi" o'rnida ba'zan `------` kabi
 * to'ldirgich turadi (harfi yo'q qism) — u chek va jadvalda `A.-.Muydinov` / `Muydinov Ahmadullo ------` bo'lib chiqardi.
 * Hech bo'lmaganda bitta harfi bor qismlar qoladi.
 */
export function cleanPersonName(value: string | null | undefined): string {
  return (value ?? '')
    .split(/\s+/)
    .filter((part) => /\p{L}/u.test(part))
    .join(' ');
}

/** Harfi bor bo'lsa — `value`, aks holda `undefined` (ism qismi to'ldirgich bo'lsa tashlab ketish uchun). */
export function realNamePart(value: string | null | undefined): string | undefined {
  const cleaned = cleanPersonName(value);
  return cleaned || undefined;
}
