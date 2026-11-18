/**
 * Loyihadagi barcha telefon inputlari uchun yagona format:
 * `+998` prefiksi majburiy, undan keyin roppa-rosa 9 ta raqam.
 * Backendga har doim `+998901234567` ko'rinishida yuboriladi.
 */

export const PHONE_PREFIX = '+998';

/** `+998` + 9 ta raqam = 13 belgi. */
export const PHONE_MAX_LENGTH = 13;

/** Prefiksdan keyingi raqamlar soni. */
export const PHONE_NATIONAL_DIGITS = 9;

export const PHONE_PLACEHOLDER = '+998901234567';

/**
 * Har qanday kiritilgan qiymatni `+998XXXXXXXXX` ko'rinishiga keltiradi:
 * prefiks hech qachon o'chmaydi, undan keyin ko'pi bilan 9 ta raqam qoladi.
 */
export function formatPhone(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();

  // Prefiksning o'zini o'chirishga urinish (`+99`, `+9`, `+`, ``) — prefiks qaytariladi
  if (PHONE_PREFIX.startsWith(raw)) return PHONE_PREFIX;

  let digits = raw.replace(/\D/g, '');
  // Faqat bitta bosh `998` prefiks sifatida olib tashlanadi
  if (digits.startsWith('998')) digits = digits.slice(3);

  return PHONE_PREFIX + digits.slice(0, PHONE_NATIONAL_DIGITS);
}

/** Prefiksdan keyin roppa-rosa 9 ta raqam bo'lsagina to'g'ri. */
export function isValidPhone(value: string | null | undefined): boolean {
  return /^\+998\d{9}$/.test(String(value ?? '').trim());
}

/** Faqat prefiks turgan bo'lsa — raqam hali kiritilmagan. */
export function isEmptyPhone(value: string | null | undefined): boolean {
  return formatPhone(value) === PHONE_PREFIX;
}

/**
 * Backendga yuborishdan oldingi normalizatsiya.
 * Raqam kiritilmagan bo'lsa bo'sh string qaytadi (majburiylik alohida tekshiriladi).
 */
export function toApiPhone(value: string | null | undefined): string {
  const formatted = formatPhone(value);
  return formatted === PHONE_PREFIX ? '' : formatted;
}

/** Ro'yxatdagi qo'shimcha raqamlardan faqat to'liq kiritilganlarini qoldiradi. */
export function toApiPhones(values: (string | null | undefined)[]): string[] {
  return values.map(formatPhone).filter(isValidPhone);
}
