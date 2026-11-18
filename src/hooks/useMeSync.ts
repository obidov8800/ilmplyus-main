import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import type { User } from '../types/user.types';
import { meQueryOptions } from '../services/account';

/**
 * Foydalanuvchi ma'lumoti (ROL VA RUXSATLAR) — `services/account.ts` dagi yagona `/me` so'rovi:
 *  - sahifa ochilganda / yangilanganda serverdan olinadi; marshrut tekshiruvi (`PermissionRoute`) va menyu shu javobni
 *    KUTADI — brauzerda saqlangan ESKI ruxsat bilan yangi berilgan sahifadan otib yuborish yo'q;
 *  - TINMASDAN (har 15 soniyada) so'ralmaydi — server yuki odam soniga qarab o'sib ketardi. Qayta so'raladi:
 *    oynaga qaytganda (ma'lumot 5 daqiqadan eski bo'lsa), internet qayta ulanganda, o'z rol/foydalanuvchi o'zgartirishidan
 *    keyin (`dataSync`) va backend 403 qaytarganda (`utils/meRefresh.ts`);
 *  - boshqa oynada (tab) yangilangan ruxsat shu oynaga ham darhol o'tadi (`storage` hodisasi);
 *  - server umuman javob bermasa (tarmoq yo'q) — oxirgi saqlangan ruxsatlar bilan ishlashda davom etiladi.
 *
 * `ProtectedRoute`da BIR marta chaqiriladi. Ism/rol/profil ma'lumoti uchun — `useAccount()` (`services/account.ts`).
 */
export function useMeSync() {
  const isAuth = useAuthStore((state) => state.isAuth);

  const query = useQuery(meQueryOptions(isAuth));

  // /me umuman olinmasa sahifa abadiy bo'sh qolmasin — saqlangan ruxsatlar bilan davom etamiz.
  useEffect(() => {
    if (query.isError && !useAuthStore.getState().permissionsLoaded) {
      useAuthStore.setState({ permissionsLoaded: true });
    }
  }, [query.isError]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'permissions' && e.newValue) {
        try {
          const permissions = JSON.parse(e.newValue);
          if (Array.isArray(permissions)) useAuthStore.setState({ permissions, permissionsLoaded: true });
        } catch {
          /* buzilgan yozuv — keyingi /me tuzatadi */
        }
      } else if (e.key === 'user' && e.newValue) {
        try {
          useAuthStore.setState({ user: JSON.parse(e.newValue) as User });
        } catch {
          /* buzilgan yozuv — keyingi /me tuzatadi */
        }
      } else if (e.key === 'auth' && !e.newValue) {
        // Boshqa oynada chiqib ketilgan.
        useAuthStore.getState().logout();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return query;
}
