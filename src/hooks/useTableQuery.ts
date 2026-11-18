import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { API } from '@/api/api';
import { safeFrom, safeLastPage, safeList, safeTo, safeTotal, type RawList } from '@/api/normalize';

/**
 * Sahifalanadigan jadvallar uchun umumiy qatlam: qidiruv, filtrlar va sahifa
 * raqami serverga query param sifatida yuboriladi, filtrlashni backend bajaradi.
 *
 * Nega shunday: ilgari har bir sahifa serverdan bitta sahifani olib, keyin
 * `.filter()` bilan o'sha 15 qatorni qidirar edi — natijada 2-sahifadagi yozuv
 * qidiruvda umuman topilmasdi. Endi qidiruv butun ma'lumot ustidan ketadi.
 *
 * MUHIM: `toParams` funksiyasi komponent tashqarisida (modul darajasida)
 * e'lon qilinishi kerak — u har renderda qayta yaratilsa, keraksiz so'rovlar ketadi.
 */

/** Bo'sh qiymatlar serverga yuborilmaydi — aks holda `?branch_id=` kabi keraksiz filtr ketadi. */
function dropEmpty(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    out[key] = value;
  }

  return out;
}

export interface UseTableQueryOptions<F> {
  /** Query key uchun asos, masalan `'payments'`. */
  key: string;
  /** Endpoint manzili, masalan `'/payments'`. */
  url: string;
  /** Filtrlarning boshlang'ich holati. */
  initialFilters: F;
  /** Filtr holatini backend kutayotgan query paramlarga o'giradi. Modul darajasida e'lon qiling. */
  toParams: (filters: F) => Record<string, unknown>;
  /** Bir sahifadagi qatorlar soni. */
  perPage?: number;
  /** Qidiruv paramining nomi — backend `q` ishlatsa shu yerda o'zgartiriladi. */
  searchParam?: string;
  /** Qidiruv so'rovi yuborilguncha kutish vaqti (ms). */
  debounceMs?: number;
  enabled?: boolean;
}

export interface UseTableQueryResult<T, F> {
  rows: T[];
  total: number;
  lastPage: number;
  from: number;
  to: number;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  perPage: number;
  setPerPage: Dispatch<SetStateAction<number>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  filters: F;
  setFilters: Dispatch<SetStateAction<F>>;
  resetFilters: () => void;
  isLoading: boolean;
  /** Eski qatorlar ekranda turgan holda yangi so'rov ketayotganini bildiradi. */
  isFetching: boolean;
  isError: boolean;
}

export function useTableQuery<T, F extends object>({
  key,
  url,
  initialFilters,
  toParams,
  perPage: initialPerPage = 15,
  searchParam = 'search',
  debounceMs = 400,
  enabled = true,
}: UseTableQueryOptions<F>): UseTableQueryResult<T, F> {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [search, setSearchState] = useState('');
  const [filters, setFiltersState] = useState<F>(initialFilters);

  // Qidiruv yoki filtr o'zgarsa 1-sahifaga qaytamiz: aks holda 5-sahifada turib
  // qidirganda natija 5 sahifadan kam bo'lsa, bo'sh jadval ko'rinardi.
  const setSearch: Dispatch<SetStateAction<string>> = (value) => {
    setSearchState(value);
    setPage(1);
  };

  const setFilters: Dispatch<SetStateAction<F>> = (value) => {
    setFiltersState(value);
    setPage(1);
  };

  // Har harf bosilganda emas, yozishdan to'xtagach bitta so'rov ketadi.
  const [debouncedSearch] = useDebouncedValue(search, debounceMs);

  const params = useMemo(
    () =>
      dropEmpty({
        page,
        per_page: perPage,
        [searchParam]: debouncedSearch.trim(),
        ...toParams(filters),
      }),
    [page, perPage, searchParam, debouncedSearch, filters, toParams],
  );

  const query = useQuery<RawList<T>>({
    queryKey: [key, params],
    queryFn: () => API.get(url, { params }).then((r) => r.data),
    // Yangi natija kelguncha eski qatorlar ekranda qoladi — jadval oqarib ketmaydi.
    placeholderData: keepPreviousData,
    enabled,
  });

  const rows = useMemo(() => safeList<T>(query.data), [query.data]);

  return {
    rows,
    total: safeTotal(query.data, rows.length),
    lastPage: safeLastPage(query.data, 1),
    from: safeFrom(query.data, rows.length > 0 ? 1 : 0),
    to: safeTo(query.data, rows.length),
    page,
    setPage,
    perPage,
    setPerPage,
    search,
    setSearch,
    filters,
    setFilters,
    resetFilters: () => setFilters(initialFilters),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}
