/**
 * PBX (`mainoffice.uz`) qo'ng'iroqlar tarixini yuklash — tarmoq qatlami.
 *
 * Sahifa komponentidan ALOHIDA va ATAYLAB yengil (faqat `callRecord.ts`ga
 * bog'liq): yon menyu va marshrut (`App.tsx`) tarixni sahifaning katta bo'lagi
 * yuklanishini kutmasdan oldindan boshlab qo'yishi (`prefetchCallHistory`)
 * uchun. Natijada foydalanuvchi sahifaga kirganda ma'lumot ko'pincha tayyor
 * bo'ladi.
 */
import {
  collapseCallLegs,
  type CallRecord,
  type HistoryResponse,
} from './callRecord';

export const PBX_BASE_URL = 'https://mainoffice.uz:8181';

/** Bitta so'rovda olinadigan yozuvlar soni (gateway cheklovi ichida). */
const HISTORY_PAGE_SIZE = 1000;
/** Himoya chegarasi — tarix o'sib ketsa ham cheksiz so'rov yuborilmasin. */
const HISTORY_MAX_PAGES = 10;
/**
 * Bir vaqtda parallel so'raladigan sahifalar. Gateway javobida jami son YO'Q,
 * shu sabab sahifalar ketma-ket emas, guruh-guruh (oldindan, taxminan) so'raladi:
 * ketma-ket kutish har bir sahifa uchun alohida server vaqtini qo'shardi
 * (4 sahifa ≈ 1,8 s o'rniga ≈ 0,5 s).
 */
const HISTORY_PARALLEL_PAGES = 4;
/**
 * Qo'ng'iroq tugagach / sahifaga qaytilganda olinadigan oxirgi qatorlar soni.
 * Bitta qo'ng'iroq o'nlab oyoqdan (jiringlash urinishlaridan) iborat bo'lishi
 * mumkin, shu sabab oyna u butunlay sig'adigan darajada katta: kichik oyna
 * qo'ng'iroqni o'rtasidan kesib, holatini noto'g'ri ko'rsatardi (masalan, javob
 * berilganini "javobsiz").
 */
export const HISTORY_LATEST_WINDOW = 200;
/** Shuncha vaqt ichida tugagan to'liq yuklash qayta ishlatiladi (prefetch -> sahifa). */
const HISTORY_REUSE_MS = 30_000;

/** Bitta sahifa; tarmoq xatosida bir marta qayta uriniladi. `null` — olinmadi. */
async function fetchHistoryPage(page: number, limit: number): Promise<CallRecord[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${PBX_BASE_URL}/api/v1/history?limit=${limit}&page=${page}`);
      if (!res.ok) continue;
      const json = (await res.json()) as HistoryResponse;
      if (Array.isArray(json?.data)) return json.data;
    } catch {
      /* qayta uriniladi */
    }
  }
  return null;
}

/**
 * Butun qo'ng'iroqlar tarixini yuklaydi va qo'ng'iroqlarga birlashtiradi.
 *
 * Yozuvlar yengil (~3000 qator ≈ 650 KB), shuning uchun hammasi bir marta
 * olinadi: "Jami" aniq chiqadi, filtr va sahifalash BUTUN tarix bo'yicha
 * ishlaydi. PBX har bir qo'ng'iroq uchun bir nechta CDR qatorini (oyoqni)
 * qaytaradi — ular barcha sahifalar o'qilgach `collapseCallLegs` bilan birlashtiriladi
 * (oyoqlar sahifa chegarasida bo'linib qolishi mumkin, shu sabab birlashtirish
 * eng oxirida bajariladi).
 *
 * Birinchi sahifa olinmasa xato tashlanadi (bo'sh ro'yxat "tarix yo'q" deb
 * eslab qolinmasin).
 */
export async function fetchAllHistory(): Promise<CallRecord[]> {
  const legs: CallRecord[] = [];
  for (let first = 1; first <= HISTORY_MAX_PAGES; first += HISTORY_PARALLEL_PAGES) {
    const pages = Array.from(
      { length: Math.min(HISTORY_PARALLEL_PAGES, HISTORY_MAX_PAGES - first + 1) },
      (_, i) => first + i,
    );
    const chunks = await Promise.all(pages.map((p) => fetchHistoryPage(p, HISTORY_PAGE_SIZE)));

    // Sahifalar tartibida qo'shiladi; birinchi xato yoki to'lmagan sahifadan keyin
    // to'xtaymiz — aks holda tarixda "teshik" qolardi.
    let more = true;
    for (const chunk of chunks) {
      if (!chunk) {
        if (!legs.length) throw new Error('PBX tarixini olib bo‘lmadi');
        more = false;
        break;
      }
      legs.push(...chunk);
      if (chunk.length < HISTORY_PAGE_SIZE) {
        more = false;
        break;
      }
    }
    if (!more) break;
  }
  return collapseCallLegs(legs);
}

// ── Umumiy holat (modul darajasida: sahifadan chiqib-kirganda ham saqlanadi) ──

let snapshot: { at: number; records: CallRecord[] } | null = null;
let inflight: Promise<CallRecord[]> | null = null;

/** Oxirgi ma'lum ro'yxat (sahifaga qaytilganda darhol ko'rsatish uchun). */
export function peekCallHistory(): CallRecord[] | null {
  return snapshot?.records ?? null;
}

/** Sahifadagi birlashtirilgan ro'yxatni eslab qoladi (to'liq yuklash vaqti o'zgarmaydi). */
export function rememberCallHistory(records: CallRecord[]): void {
  snapshot = { at: snapshot?.at ?? Date.now(), records };
}

/**
 * Butun tarixni yuklaydi. Bir vaqtda faqat BITTA so'rov bo'ladi (prefetch va
 * sahifa bir xil va'dani oladi); `maxAgeMs` ichida tugagan natija qayta ishlatiladi.
 */
export function loadCallHistory(maxAgeMs = 0): Promise<CallRecord[]> {
  if (snapshot && Date.now() - snapshot.at < maxAgeMs) return Promise.resolve(snapshot.records);
  if (!inflight) {
    inflight = fetchAllHistory()
      .then((records) => {
        snapshot = { at: Date.now(), records };
        return records;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Foydalanuvchi sahifaga o'tmasdan OLDIN (yon menyuda kursor, marshrut bo'lagi
 * yuklanayotgan payt) tarixni boshlab qo'yadi. Ro'yxat allaqachon bor bo'lsa
 * hech narsa qilmaydi — qaytilganda sahifa o'zi arzon yangilaydi.
 */
export function prefetchCallHistory(): void {
  if (snapshot) return;
  loadCallHistory(HISTORY_REUSE_MS).catch(() => {
    /* sahifa o'zi qayta urinadi */
  });
}

/**
 * Mavjud ro'yxatga (`known`) qo'shiladigan eng so'nggi qo'ng'iroqlar.
 *
 * Avval faqat OXIRGI qatorlar olinadi (arzon, ~40 KB). Agar ular ro'yxatning
 * eng yangi qo'ng'irog'iga ulanmasa (oradagi qo'ng'iroqlar tushib qolishi
 * mumkin — masalan sahifa uzoq vaqt ochiq turgan), butun tarix olinadi.
 * Natijani `mergeCalls` bilan ro'yxatga qo'shing.
 */
export async function fetchRecentCalls(known: CallRecord[]): Promise<CallRecord[]> {
  if (!known.length) return loadCallHistory(HISTORY_REUSE_MS);

  const legs = await fetchHistoryPage(1, HISTORY_LATEST_WINDOW);
  if (!legs?.length) return [];

  let oldest = legs[0].vaqt;
  for (const leg of legs) if (leg.vaqt < oldest) oldest = leg.vaqt;
  // `known[0]` — ro'yxatdagi eng yangi qo'ng'iroq (ro'yxat yangidan eskiga tartiblangan).
  if (oldest > known[0].vaqt) return loadCallHistory(HISTORY_REUSE_MS);

  return collapseCallLegs(legs);
}
