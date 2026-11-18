import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API } from '@/api/api';
import { fetchLidById } from '@/pages/lid/lid.service';
import type { Lid } from '@/types/lid.types';

/**
 * Lid qidiruvi server tomonda bajariladi — 1000 talik ro'yxatni oldindan
 * yuklab olish o'rniga /lids?search= dan foydalanadi. Raqam kiritilsa
 * bu ID deb qaraladi va faqat /lids/{id} natijasi ko'rsatiladi —
 * matnli qidiruvning yondosh natijalari aralashmaydi.
 */
export function useLidSearch(term: string, enabled: boolean) {
  const [debouncedTerm, setDebouncedTerm] = useState(term);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term), 400);
    return () => clearTimeout(timer);
  }, [term]);

  const trimmed = debouncedTerm.trim();

  const { data, isFetching } = useQuery({
    queryKey: ['lids-search', trimmed],
    queryFn: async (): Promise<Lid[]> => {
      if (/^\d+$/.test(trimmed)) {
        const byId = await fetchLidById(Number(trimmed)).catch(() => null);
        return byId ? [byId] : [];
      }
      return API.get('/lids', { params: { search: trimmed || undefined, per_page: 10 } })
        .then((res) => (Array.isArray(res.data) ? res.data : res.data?.data || []) as Lid[])
        .catch(() => [] as Lid[]);
    },
    enabled,
  });

  // Debounce oynasi ham "qidirilmoqda" hisoblanadi — notFound miltillamasligi uchun
  const isSearching = enabled && (term.trim() !== trimmed || isFetching);

  return { results: data ?? [], isSearching };
}
