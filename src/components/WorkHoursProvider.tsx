import { useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import useAuthStore from '../store/useAuthStore';
import { API } from '../api/api';
import { WorkHoursContext } from '../contexts/workHoursContext';
import {
  clearWorkHoursCache,
  msUntilNextBoundary,
  readWorkHoursCache,
  writeWorkHoursCache,
  type WorkHoursStatus,
} from '../utils/workHours';

/**
 * Ish vaqti holati TINMASDAN (har daqiqada) so'ralmaydi — bu har ochiq oynadan doimiy yuk edi. Qayta so'raladi:
 * sahifa ochilganda; oynaga qaytganda (ma'lumot shu muddatdan eski bo'lsa); ish vaqti boshlanish/tugash aniq lahzasida
 * (pastdagi taymer); backend `403 outside_work_hours` qaytarganda (`api/api.ts` holatni darhol yangilaydi).
 */
const STALE_MS = 2 * 60 * 1000;

/** Qo'lda yozilgan yoki Mantine modal ichidagi forma ekanini aniqlaydi (sinf nomida `modal` bor yoki `role="dialog"`). */
const MODAL_SELECTOR = '[role="dialog"], [class*="modal"]';

/**
 * Ish vaqti holatini (`GET /me/work-hours`) butun ilovaga yetkazadi.
 *
 * `can_write === false` bo'lsa: banner chiqadi, `Protected` ichidagi yozuvchi tugmalar (Qo'shish/O'chirish/...) o'chadi,
 * modal ichidagi formalar yuborilmaydi, axios hech qanday yozuvchi so'rovni serverga yubormaydi.
 * Holat hali noma'lum bo'lsa (birinchi javob kelmagan, server javob bermagan) cheklov QO'LLANMAYDI — haqiqiy to'siq
 * baribir backendda (403 `outside_work_hours`), uning javobi ham shu yerdagi holatni darhol yangilaydi.
 */
export function WorkHoursProvider({ children }: { children: ReactNode }) {
  const isAuth = useAuthStore((state) => state.isAuth);
  const userId = useAuthStore((state) => state.user?.id);

  const { data, dataUpdatedAt, refetch } = useQuery<WorkHoursStatus>({
    queryKey: ['me', 'work-hours', userId ?? null],
    queryFn: async () => {
      const { data: response } = await API.get('/me/work-hours', { silentError: true });
      return (response?.data ?? response) as WorkHoursStatus;
    },
    enabled: isAuth,
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });

  // Sahifa yangilanganda birinchi javob kelguncha oxirgi saqlangan holat bilan boshlaymiz.
  const cached = useMemo(() => (isAuth ? readWorkHoursCache(userId) : null), [isAuth, userId]);
  const status: WorkHoursStatus | null = isAuth ? (data ?? cached ?? null) : null;
  const locked = status?.can_write === false;

  // Holat `localStorage`ga yoziladi — axios interceptor uni sinxron o'qiydi. `dataUpdatedAt` bo'yicha: javob
  // o'zgarmagan bo'lsa ham `checked_at` yangilanib turadi.
  useEffect(() => {
    if (!isAuth) {
      clearWorkHoursCache();
      return;
    }
    if (data && typeof data.can_write === 'boolean') writeWorkHoursCache(userId, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt, isAuth, userId]);

  // Ish vaqti boshlanadigan/tugaydigan aniq lahzada holat qayta so'raladi.
  useEffect(() => {
    const delay = msUntilNextBoundary(data);
    if (delay == null) return undefined;
    const timer = window.setTimeout(() => {
      void refetch();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [data, refetch]);

  // Modal ichidagi formalar: cheklov paytida yuborilmaydi (Enter bilan ham). CSS (`html[data-work-locked]`) shu
  // modallardagi saqlash tugmalarini o'chirilgan ko'rsatadi.
  useEffect(() => {
    if (!locked) return undefined;
    document.documentElement.setAttribute('data-work-locked', 'true');

    const onSubmit = (event: Event) => {
      const target = event.target as Element | null;
      if (!target?.closest?.(MODAL_SELECTOR)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      notifications.show({
        id: 'work-hours-blocked',
        color: 'yellow',
        title: 'Ish vaqtidan tashqarida',
        message: status?.message || 'Hozircha ma’lumotlarni faqat ko‘rishingiz mumkin.',
      });
    };
    document.addEventListener('submit', onSubmit, true);

    return () => {
      document.documentElement.removeAttribute('data-work-locked');
      document.removeEventListener('submit', onSubmit, true);
    };
  }, [locked, status?.message]);

  return <WorkHoursContext.Provider value={status}>{children}</WorkHoursContext.Provider>;
}
