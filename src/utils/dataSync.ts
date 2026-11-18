import { useSyncExternalStore } from 'react';
import type { Query } from '@tanstack/react-query';
import { queryClient } from '../main';

/**
 * MA'LUMOT SINXRONI — har bir muvaffaqiyatli yozuvchi so'rovdan (POST / PUT / PATCH / DELETE)
 * keyin ekrandagi HAMMA ma'lumot sahifani yangilamasdan (F5 siz) yangilanadi.
 *
 * MUAMMO: ilgari yangi yozuv qo'shilgach/tahrirlangach/o'chirilgach jadval, forma `select`lari,
 * hisoblagichlar va boshqa sahifalar keshda (5–30 daqiqa) qolib ketardi va F5 bosilgunicha
 * ko'rinmasdi. Har bir sahifa faqat O'Z ro'yxatini yangilashi mumkin edi (va ko'pincha
 * unutilardi), `cacheSync` esa so'rov manzili bilan so'rov kaliti nomini "taxmin" qilib
 * solishtirardi — nomlar mos kelmasa (masalan `/student-contracts` ↔ `students-contract`)
 * ekrandagi ro'yxat yangilanmay qolardi.
 *
 * YECHIM — taxmin yo'q, hamma narsa yangilanadi (yagona joyda, `api/api.ts` interceptor'idan):
 *  1) DARHOL: butun kesh "eskirgan" deb belgilanadi. Foydalanuvchi boshqa sahifaga o'tsa
 *     (masalan forma saqlangach ro'yxatga qaytsa) u yerda yangi ma'lumot tortiladi;
 *  2) ~120 ms dan keyin: hozir ekranda ochiq turgan (kuzatuvchisi bor) barcha so'rovlar qayta
 *     yuklanadi — jadval, `select`lar, hisoblagichlar, "badge"lar;
 *  3) kesh tashqarisidagi ma'lumotlar (modul darajasidagi xotira: JSHSHIR qidiruvi...) —
 *     `registerDataCache()` bilan ro'yxatdan o'tkazilgan tozalagichlar chaqiriladi;
 *  4) `useDataVersion()` — React'ning o'z so'rovlarisiz (useEffect + API) yuklovchi komponentlari
 *     ma'lumot o'zgarganini bilib, qayta yuklashi uchun hisoblagich;
 *  5) rol/foydalanuvchi/xodim o'zgarsa — joriy foydalanuvchi (`['me']`: ruxsatlar, menyu) ham yangilanadi.
 *
 * Moslashuvchanlik:
 *  • so'rov kaliti bosh qismi KEEP ro'yxatida bo'lsa (me, permissions, sozlamalar) — tegilmaydi;
 *  • `useQuery({ meta: { noAutoSync: true } })` — shu so'rov avtomatik yangilanmaydi (juda og'ir ma'lumot);
 *  • `API.post(url, data, { skipDataSync: true })` — shu yozuvchi so'rov sinxron qo'zg'amaydi;
 *  • SOFT_URL — tez-tez ketadigan yozuvlar (davomat belgilash, imtihon javoblari): kesh eskirgan deb
 *    belgilanadi, lekin ochiq so'rovlar DARHOL qayta yuklanmaydi (sahifa o'zi boshqaradi, "miltillash" bo'lmasin);
 *  • halqa himoyasi: 10 soniyada 15 tadan ko'p sinxron bo'lsa — qayta yuklash to'xtatiladi (cheksiz sikldan saqlaydi).
 */

/** So'rov kaliti bosh qismini qiyoslash uchun yagona ko'rinish: "course-prices" → "courseprice". */
const norm = (s: string): string => s.toLowerCase().replace(/[-_\s]/g, '').replace(/s$/, '');

/** Sozlamalar/ruxsatlar — o'zgartiruvchi so'rovdan keyin ham tegilmaydi (o'zlari alohida yangilanadi). */
const KEEP = new Set(['me', 'permissions', 'table-settings', 'dashboard-settings', 'roles-settings'].map(norm));

/** Ma'lumotga tegmaydigan yozuvchi so'rovlar (kirish/chiqish, sozlamalar, "ko'rildi" belgisi). */
const IGNORE_URL =
  /\/(login|logout|forgot-password|set-password|table-settings|dashboard-settings|trash\/mark-viewed)(\/|$|\?)/;

/**
 * Juda tez-tez ketadigan yozuvlar (o'quvchi davomatini belgilash, imtihon javobi): kesh eskirgan deb belgilanadi,
 * lekin ochiq so'rovlar darhol qayta yuklanmaydi — sahifa o'z holatini o'zi boshqaradi va "miltillash" bo'lmaydi.
 */
const SOFT_URL = /\/student_attendance(\/|$|\?)|\/exam-attempts\/\d+\/answer(\/|$|\?)/;

/** Joriy foydalanuvchining ruxsatlariga ta'sir qilishi mumkin bo'lgan resurslar. */
const ME_URL = /\/(roles?|permissions?|users?|employees?|operators?)(\/|$|\?)/;

const DEBOUNCE_MS = 120;
const LOOP_WINDOW_MS = 10_000;
const LOOP_MAX = 15;

const headOf = (q: Query): string => (typeof q.queryKey[0] === 'string' ? norm(q.queryKey[0]) : '');
const syncable = (q: Query): boolean => !KEEP.has(headOf(q)) && q.meta?.noAutoSync !== true;

// ── so'rov boshlanish vaqti (mutatsiya paytida yo'lda bo'lgan so'rov eski ma'lumot qaytarishi mumkin) ──
const fetchStartedAt = new WeakMap<object, number>();
let subscribed = false;
function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'fetch') fetchStartedAt.set(event.query, Date.now());
  });
}

// ── kesh tashqarisidagi ma'lumotlar uchun tozalagichlar ──
const dataCaches = new Set<() => void>();
/** Modul darajasidagi xotira (Map va h.k.) ni ma'lumot o'zgarganda tozalash uchun ro'yxatdan o'tkazish. */
export function registerDataCache(clear: () => void): () => void {
  dataCaches.add(clear);
  return () => {
    dataCaches.delete(clear);
  };
}

// ── ma'lumot versiyasi (react-query ishlatmaydigan komponentlar uchun) ──
let version = 0;
const listeners = new Set<() => void>();
export const getDataVersion = (): number => version;
export function subscribeDataVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Yozuvchi so'rov muvaffaqiyatli bo'lganda o'zgaradi: `useEffect(() => { load(); }, [useDataVersion()])`. */
export function useDataVersion(): number {
  return useSyncExternalStore(subscribeDataVersion, getDataVersion, getDataVersion);
}

function markStale(): void {
  version += 1;
  dataCaches.forEach((clear) => {
    try {
      clear();
    } catch {
      /* bitta tozalagich xatosi sinxronni to'xtatmasin */
    }
  });
  void queryClient.invalidateQueries({ predicate: syncable, refetchType: 'none' });
  listeners.forEach((listener) => listener());
}

function refetchActive(since: number): void {
  void queryClient.invalidateQueries({
    predicate: (q) =>
      syncable(q) &&
      q.state.dataUpdatedAt <= since &&
      // mutatsiyadan KEYIN boshlangan so'rov (masalan sahifaning o'z `invalidateQueries`i) allaqachon yangi ma'lumot oladi
      !(q.state.fetchStatus === 'fetching' && (fetchStartedAt.get(q) ?? 0) >= since),
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingSince = 0;
let pendingFull = false;
let pendingMe = false;
const stamps: number[] = [];

interface SyncConfig {
  method?: string;
  url?: string;
  skipDataSync?: boolean;
}

/**
 * O'zgartiruvchi so'rov muvaffaqiyatli tugaganda chaqiriladi (`api/api.ts`).
 * Ketma-ket so'rovlar (masalan ommaviy o'chirish) bitta yangilashga birlashtiriladi.
 */
export function scheduleDataSync(config: SyncConfig | undefined): void {
  if (!config || config.skipDataSync) return;
  const method = (config.method ?? 'get').toLowerCase();
  if (method === 'get' || method === 'head' || method === 'options') return;
  const url = config.url ?? '';
  if (IGNORE_URL.test(url)) return;

  ensureSubscribed();
  markStale();

  if (!SOFT_URL.test(url)) pendingFull = true;
  if (ME_URL.test(url)) pendingMe = true;
  pendingSince = Date.now();

  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const since = pendingSince;
    const full = pendingFull;
    const me = pendingMe;
    pendingFull = false;
    pendingMe = false;

    if (me) void queryClient.invalidateQueries({ queryKey: ['me'] });
    if (!full) return;

    const now = Date.now();
    while (stamps.length && now - stamps[0] > LOOP_WINDOW_MS) stamps.shift();
    stamps.push(now);
    if (stamps.length > LOOP_MAX) {
      console.warn('[dataSync] juda ko‘p sinxron (halqa bo‘lishi mumkin) — qayta yuklash to‘xtatildi');
      return;
    }
    refetchActive(since);
  }, DEBOUNCE_MS);
}
