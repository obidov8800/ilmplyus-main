/** [label, qiymat] juftliklari ichidan bo'sh qolgan birinchi maydon labelini qaytaradi. */
export type FieldPair = [label: string, value: unknown];

export function findMissingField(fields: FieldPair[]): string | null {
  for (const [label, value] of fields) {
    if (value === null || value === undefined || String(value).trim() === '') return label;
  }
  return null;
}

/** Lid faqat ro'yxatdan tanlangan bo'lishi kerak — qiymat butun son ekanini tekshiradi. */
export function isValidLidId(value: string): boolean {
  return /^\d+$/.test(String(value).trim());
}
