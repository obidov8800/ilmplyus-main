import i18next from 'i18next';

/**
 * Eski yozuvlarda `payment_method` kalit emas, ko'rsatiladigan matn bo'lib saqlangan
 * ("Paynet", "Naqd", "Наличные"...). Solishtirish va filtrlash uchun hammasini
 * bitta kalitga keltiramiz.
 */
const ALIASES: Record<string, string> = {
  naqd: 'cash',
  naqt: 'cash',
  наличные: 'cash',
  karta: 'card',
  карта: 'card',
  'qr kod': 'qr',
  'qr code': 'qr',
  'qr код': 'qr',
  "o'tkazma": 'transfer',
  'o‘tkazma': 'transfer',
  перевод: 'transfer',
  'bank o‘tkazmasi': 'bank',
  "bank o'tkazmasi": 'bank',
  'банковский перевод': 'bank',
  'bank transfer': 'bank',
};

/** Har qanday ko'rinishdagi to'lov turini `cash` / `card` / `paynet` kabi kalitga keltiradi. */
export function normalizePaymentMethod(method?: string | null): string {
  if (!method) return '';
  const key = method.trim().toLowerCase();
  return ALIASES[key] ?? key;
}

/**
 * To'lov turining joriy tildagi nomi. Tarjimasi bo'lmasa kelgan qiymatning o'zini
 * ko'rsatamiz — filial yangi tur qo'shishi mumkin.
 */
export function paymentMethodLabel(method?: string | null): string {
  if (!method) return '—';
  const key = normalizePaymentMethod(method);
  return i18next.t(`payments.paymentTypes.${key}`, { defaultValue: method });
}
