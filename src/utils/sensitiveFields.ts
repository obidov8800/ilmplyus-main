/**
 * Nozik maydonlar (PINFL, pasport, balans, bank rekvizitlari, parollar) brauzer keshiga — `localStorage` ga — YOZILMAYDI.
 * Ular faqat xotirada (store) turadi va sahifa yangilanganda `/me` dan qayta keladi. Fayl Admin va User'da BIR XIL.
 */
const SENSITIVE_KEYS = new Set([
  'pinfl',
  'jshshir',
  'passport',
  'passport_series',
  'passport_number',
  'passport_serial',
  'passport_given_by',
  'passport_issued_by',
  'balance',
  'cash_balance',
  'non_cash_balance',
  'bank_account',
  'bank_name',
  'mfo',
  'inn',
  'stir',
  'card_number',
  'password',
  'sms_password',
  'sip_password',
]);

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/** Nozik maydonlarsiz nusxa (ichma-ich obyekt va massivlar ham). */
export function withoutSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutSensitive(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) continue;
    out[key] = withoutSensitive(item);
  }
  return out as T;
}

/** `localStorage` ga nozik maydonlarsiz yozadi (xato bo'lsa — jim). */
export function storeWithoutSensitive(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(withoutSensitive(value)));
  } catch {
    /* kesh — majburiy emas */
  }
}
