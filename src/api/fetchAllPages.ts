import { API } from './api';
import { safeList, safeLastPage, type RawList } from './normalize';

/**
 * Sahifalangan endpointning BARCHA sahifalarini olib, bitta massivga birlashtiradi.
 *
 * Nega kerak: bir qancha jadval sahifalari serverdan faqat BITTA sahifani olib,
 * keyin `.filter()` bilan o'sha 10-15 qatorni qidirar/filtrlar edi — natijada
 * 2-sahifadagi yozuv filtrga umuman tushmasdi va pastdagi "Jami: N" server
 * jami bilan mos kelmasdi. Endi butun ro'yxat bir marta olinadi, filtrlash va
 * sahifalash klient tomonda bajariladi.
 *
 * Ishlashi: 1-sahifa olinadi, `last_page` o'qiladi; agar >1 bo'lsa qolgan
 * sahifalar parallel yuklanadi. Endpoint katta `per_page` ni qo'llasa —
 * `last_page` 1 bo'lib bitta so'rov ketadi; qo'llamasa — har sahifa alohida.
 */
export async function fetchAllPages<T>(
  url: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  // `per_page` katta beriladi: endpoint qo'llasa — bitta so'rovda hammasi keladi
  // (`last_page` = 1). Qo'llamasa — pastda sahifama-sahifa yig'ib olamiz.
  const withSize = { per_page: 100, ...params };

  const firstRaw = (await API.get(url, { params: { ...withSize, page: 1 } }).then(
    (r) => r.data,
  )) as RawList<T>;

  const firstList = safeList<T>(firstRaw);
  const lastPage = safeLastPage(firstRaw, 1);

  if (lastPage <= 1) return firstList;

  // Juda ko'p sahifa bo'lsa ham himoya: 50 tadan oshsa to'xtaymiz
  // (per_page=100 da ~5000 qator, per_page=500 da ~25000 qator).
  const cappedLast = Math.min(lastPage, 50);

  const restLists = await Promise.all(
    Array.from({ length: cappedLast - 1 }, (_, i) =>
      API.get(url, { params: { ...withSize, page: i + 2 } }).then((r) => safeList<T>(r.data)),
    ),
  );

  return [firstList, ...restLists].flat();
}
