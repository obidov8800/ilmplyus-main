import type { QueryClient } from '@tanstack/react-query';
import type { Lid } from '@/types/lid.types';

/**
 * Bitta lidning maydonlarini `['lids', ...]` keshidagi BARCHA ro'yxatlarda
 * joyida yangilaydi (kanban ustunlari `useInfiniteQuery` → `pages[].data[]`,
 * jadval sahifasi → `{ data: [...] }`, tekis massiv). Rang kabi kichik
 * o'zgarishdan keyin hamma ustunni qayta yuklamaslik va natijani darhol
 * ko'rsatish uchun ishlatiladi.
 */
export function patchLidInCache(queryClient: QueryClient, id: number, patch: Partial<Lid>) {
  const patchItems = (items: unknown[]): unknown[] => {
    let changed = false;
    const next = items.map((item) => {
      if (item && typeof item === 'object' && (item as { id?: unknown }).id === id) {
        changed = true;
        return { ...(item as object), ...patch };
      }
      return item;
    });
    return changed ? next : items;
  };

  const patchContainer = (value: unknown): unknown => {
    if (Array.isArray(value)) return patchItems(value);
    if (!value || typeof value !== 'object') return value;
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.pages)) {
      return { ...obj, pages: obj.pages.map(patchContainer) };
    }
    if (Array.isArray(obj.data)) {
      const data = patchItems(obj.data);
      return data === obj.data ? value : { ...obj, data };
    }
    if (obj.id === id && 'status' in obj) return { ...obj, ...patch };
    return value;
  };

  queryClient.setQueriesData({ queryKey: ['lids'] }, patchContainer);
}
