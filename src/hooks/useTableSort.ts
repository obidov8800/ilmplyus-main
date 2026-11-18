import { useCallback, useMemo, useRef, useState } from 'react';
import { compareByNewest } from '@/utils/sortByNewest';

/**
 * Jadval ustuni bo'yicha saralash (amalda — ID ustuni).
 *
 * Default holat: hech qaysi ustun tanlanmagan — qatorlar `sortByNewest` bo'yicha,
 * ya'ni eng oxirgi qo'shilgani birinchi bo'lib chiqadi (desc).
 * Ustun sarlavhasi bosilganda asc <-> desc almashib turadi.
 */
export type SortDirection = 'asc' | 'desc';

export type SortableValue = string | number | boolean | Date | null | undefined;

export type SortAccessors<T> = Record<string, (row: T) => SortableValue>;

type Sortable = { id?: number | string | null; created_at?: string | null };

export interface TableSort<T> {
  /** Saralangan qatorlar */
  rows: T[];
  /** Hozir tanlangan ustun kaliti, default holatda `null` */
  activeKey: string | null;
  direction: SortDirection;
  toggle: (key: string) => void;
  /** Default holatga (eng yangisi tepada) qaytaradi */
  reset: () => void;
}

function isEmpty(value: SortableValue): boolean {
  return value === null || value === undefined || value === '';
}

function compareValues(a: SortableValue, b: SortableValue): number {
  // Bo'sh qiymatlar har doim oxirida turadi (asc/desc'dan qat'i nazar emas —
  // bu yerda faqat asc tartibi qaytariladi, yo'nalish tashqarida qo'llanadi).
  const aEmpty = isEmpty(a);
  const bEmpty = isEmpty(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : new Date(String(a)).getTime();
    const bt = b instanceof Date ? b.getTime() : new Date(String(b)).getTime();
    if (!Number.isNaN(at) && !Number.isNaN(bt)) return at - bt;
  }

  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Number(Boolean(a)) - Number(Boolean(b));
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  return String(a).localeCompare(String(b), 'uz', { numeric: true, sensitivity: 'base' });
}

export function useTableSort<T extends Sortable>(
  rows: readonly T[] | null | undefined,
  /** Default — faqat `id` ustuni saralanadi. */
  accessors: SortAccessors<T> = { id: (row) => row.id },
  /** Hech qaysi ustun tanlanmagandagi tartib. Default — `compareByNewest`. */
  defaultCompare: (a: T, b: T) => number = compareByNewest,
): TableSort<T> {
  const [sort, setSort] = useState<{ key: string | null; direction: SortDirection }>({
    key: null,
    direction: 'desc',
  });

  // Accessor'lar har renderda qaytadan yaratiladi, shuning uchun ref orqali
  // ushlab turamiz — aks holda useMemo har safar qayta ishga tushadi.
  const accessorsRef = useRef(accessors);
  accessorsRef.current = accessors;

  const defaultCompareRef = useRef(defaultCompare);
  defaultCompareRef.current = defaultCompare;

  const toggle = useCallback((key: string) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }, []);

  const reset = useCallback(() => setSort({ key: null, direction: 'desc' }), []);

  const sorted = useMemo(() => {
    // `Array.isArray` — backend kutilmaganda `{ data: [...] }` qaytarsa ham jadval qulamaydi.
    const list = Array.isArray(rows) ? [...rows] : [];
    const accessor = sort.key ? accessorsRef.current[sort.key] : undefined;
    if (!accessor) return list.sort(defaultCompareRef.current);

    const factor = sort.direction === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const diff = compareValues(accessor(a), accessor(b));
      if (diff !== 0) return diff * factor;
      return defaultCompareRef.current(a, b);
    });
  }, [rows, sort]);

  return { rows: sorted, activeKey: sort.key, direction: sort.direction, toggle, reset };
}
