/**
 * Backend ro'yxatlarni bir nechta shaklda qaytaradi: `T[]`, `{ data: T[] }` yoki
 * `{ data: T[], total, meta: { total } }`. Bu yordamchilar ularni bitta shaklga keltiradi,
 * shunda har bir `queryFn` ichida `Array.isArray(...) ? ... : ...` takrorlanmaydi.
 */
export type RawList<T> =
  | T[]
  | { data: T[] }
  | {
      data: T[];
      total?: number;
      from?: number;
      to?: number;
      last_page?: number;
      meta?: { total?: number; from?: number; to?: number; last_page?: number };
    };

export function safeList<T>(raw: RawList<T> | null | undefined): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if ('data' in raw && Array.isArray(raw.data)) return raw.data;
  return [];
}

/**
 * Sahifalash sonini oladi. Laravel oddiy `paginate()` da bu qiymatlar javob
 * ildizida, `JsonResource` to'plamida esa `meta` ichida keladi — ikkalasini ham
 * qaraymiz, chunki loyihadagi endpointlar aralash.
 */
function pickCount<T>(
  raw: RawList<T> | null | undefined,
  key: 'total' | 'last_page' | 'from' | 'to',
  fallback: number,
): number {
  if (!raw || Array.isArray(raw)) return fallback;

  const root = (raw as Record<string, unknown>)[key];
  if (typeof root === 'number') return root;

  const meta = (raw as { meta?: Record<string, unknown> }).meta?.[key];
  if (typeof meta === 'number') return meta;

  return fallback;
}

export function safeTotal<T>(raw: RawList<T> | null | undefined, fallback = 0): number {
  return pickCount(raw, 'total', fallback);
}

export function safeLastPage<T>(raw: RawList<T> | null | undefined, fallback = 1): number {
  return pickCount(raw, 'last_page', fallback);
}

/** Bo'sh sahifada Laravel `from`/`to` ni `null` qaytaradi — shuning uchun 0 ga tushamiz. */
export function safeFrom<T>(raw: RawList<T> | null | undefined, fallback = 0): number {
  return pickCount(raw, 'from', fallback);
}

export function safeTo<T>(raw: RawList<T> | null | undefined, fallback = 0): number {
  return pickCount(raw, 'to', fallback);
}
