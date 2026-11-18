import { useQuery, type QueryKey } from '@tanstack/react-query';
import { usePermission } from '@/hooks/usePermission';

/**
 * Boshqaruv paneli bloklari uchun so'rov: foydalanuvchida ruxsat bo'lmasa
 * umuman yuborilmaydi.
 *
 * Aks holda backend 403 qaytaradi va API interceptori har biri uchun "Ruxsat
 * yo'q" xabarini chiqaradi — panel bir nechta manbadan o'qigani uchun ekran
 * xabarlarga to'lib ketardi. Ruxsat yo'q blok shunchaki bo'sh ko'rsatiladi.
 */
export function useGatedQuery<T>(queryKey: QueryKey, queryFn: () => Promise<T>, permission: string) {
  const allowed = usePermission(permission);

  return useQuery({
    queryKey,
    queryFn,
    enabled: allowed,
    // Panel endi har bir manbaning BARCHA sahifasini tortadi (bir necha yuz
    // so'rovgacha). Tablar orasida almashganda yoki qayta kirganda 5 daqiqa
    // ichida qayta tortmasin — aks holda har almashish sekin bo'lardi.
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
