import { API } from "@/api/api";
import { normalizeInterestColor } from "@/types/lid.types";
import type {
  LidComment,
  LidOperator,
  Lid,
  LidStatus,
  LidInterestColor,
} from "@/types/lid.types";
import type { PaginatedResponse } from "@/types/common.types";
import { queryClient } from "@/main";

export interface LidsQueryParams {
  page: number;
  per_page: number;
}

/**
 * BACKEND BUG (aniqlangan 2026-09-22): `GET /lids*` `status`ni RAQAM emas, MATN
 * qaytaradi (`"1"`, TS tipi `LidStatus` esa 1..10 raqam union'i). Natijada har
 * qanday qattiq (`===`) taqqoslash jimgina hech qachon mos kelmasdi. Tuzatish
 * shu YAGONA joyda — barcha o'qish yo'llari shu orqali o'tadi.
 *
 * Qiziqish rangi backendda `color` ustunida saqlanadi (`l_i_d_s.color`,
 * `PATCH /lids/{id} { color }`; model/validatsiyada `interest_color` YO'Q) —
 * UI ichida `interest_color` ga normallashtiriladi (`normalizeInterestColor`).
 * Ilgari frontend `interest_color` yuborib/o'qigani uchun rang hech qachon
 * saqlanmasdi: backend nomaʼlum maydonni jimgina tashlab yuborardi.
 */
function normalizeLid<T extends Lid>(lid: T): T {
  const status =
    typeof lid.status === "string" ? (Number(lid.status) as LidStatus) : lid.status;
  return {
    ...lid,
    status,
    interest_color: normalizeInterestColor(lid.color ?? lid.interest_color),
  };
}

export async function fetchLids(params: LidsQueryParams): Promise<Lid[]> {
  const { data } = await API.get<Lid[] | { data: Lid[] }>("/lids", { params });
  const list = Array.isArray(data) ? data : (data.data ?? []);
  return list.map(normalizeLid);
}

/**
 * `fetchLids` sahifalash metama'lumotini (`total`/`last_page`/...) tashlab
 * yuboradi — ro'yxatni to'liq (masalan qidiruv uchun) olib kelishga mo'ljallangan.
 * Haqiqiy sahifama-sahifa ko'rinish (`registration`) uchun to'liq javob kerak.
 */
export async function fetchLidsPaginated(
  params: LidsQueryParams,
): Promise<PaginatedResponse<Lid[]>> {
  const { data } = await API.get<PaginatedResponse<Lid[]>>("/lids", { params });
  return { ...data, data: data.data.map(normalizeLid) };
}

export async function fetchLidsByStatus(params: {
  status: number;
  page: number;
  per_page: number;
}): Promise<PaginatedResponse<Lid[]>> {
  const { data } = await API.get<PaginatedResponse<Lid[]>>("/lids", { params });
  return { ...data, data: data.data.map(normalizeLid) };
}

/** Bitta so'rovda so'raladigan eng katta yozuvlar soni. */
const FULL_LIST_PAGE_SIZE = 1000;
/** Himoya chegarasi — holat g'ayrioddiy o'sib ketsa ham cheksiz so'rov yuborilmasin. */
const FULL_LIST_MAX_PAGES = 5;

/**
 * Berilgan holatdagi BARCHA lidlarni yuklaydi (sahifalab emas, hammasi bir yo'la).
 *
 * TEKSHIRILGAN: backend `/lids?search=` (shuningdek `name=`/`q=`) parametrini
 * BUTUNLAY E'TIBORSIZ QOLDIRADI — natija har doim filtrsiz bilan bir xil
 * chiqadi (faqat `status` ishlaydi). Shu sabab qidiruv MAHALLIY (frontendda)
 * bajariladi: holat bo'yicha butun ro'yxat shu yordamchi bilan olib
 * kelinadi, so'ng nomi/raqami bo'yicha filtrlanadi — natijada "faqat
 * ko'rinayotgan 50 ta emas, holatdagi HAMMA lid" bo'yicha qidiriladi.
 * Mantiq `ip-telephone`dagi `fetchAllHistory`ga o'xshash.
 */
export async function fetchAllLidsByStatus(status: number): Promise<Lid[]> {
  const all: Lid[] = [];
  for (let page = 1; page <= FULL_LIST_MAX_PAGES; page++) {
    const res = await fetchLidsByStatus({
      status,
      page,
      per_page: FULL_LIST_PAGE_SIZE,
    }).catch(() => null);
    const chunk = res?.data ?? [];
    all.push(...chunk);
    if (!res || chunk.length < FULL_LIST_PAGE_SIZE) break;
  }
  return all;
}

export async function fetchLidById(id: number): Promise<Lid> {
  const { data } = await API.get<Lid | { data: Lid }>(`/lids/${id}`);
  const lid = "data" in data && !("id" in data) ? data.data : (data as Lid);
  return normalizeLid(lid);
}

export async function fetchArchivedLids(
  params: LidsQueryParams,
): Promise<PaginatedResponse<Lid[]>> {
  const { data } = await API.get<PaginatedResponse<Lid[]>>(
    "/lids/archived/list",
    { params },
  );
  return data;
}

export async function deleteLid(id: number): Promise<void> {
  await API.delete(`/lids/${id}`);
}

// export async function getLidComments(lidId: number): Promise<LidComment[]> {
//   const { data } = await API.get<LidComment[]>(`/lids/${lidId}/comment`);
//   return data;
// }

export async function addLidComment(
  lidId: number,
  text: string,
): Promise<LidComment> {
  const { data } = await API.post<LidComment>(`/lids/${lidId}/comment`, {
    text,
  });
  return data;
}

export function getOperatorFullName(
  operator: LidOperator | null | undefined,
): string {
  if (!operator) return "—";
  return operator.full_name || operator.username || '—';
}

export async function updateLidStatus(
  id: number,
  status: LidStatus,
  // `null` bo'lsa `operator_id` yuborilmaydi; lid statusi boshqa modullardan
  // o'zgartirilganda operatorni almashtirmaslik uchun.
  operator_id: number | null,
  comment?: string,
): Promise<Lid> {
  const { data } = await API.patch<Lid>(`/lids/${id}`, {
    status,
    ...(operator_id !== null ? { operator_id } : {}),
    comment,
  });

  return data;
}

/**
 * Lidni boshqa modul (shartnoma, to'lov, demo-dars davomati)dagi
 * MUVAFFAQIYATLI amaldan keyingi "yon ta'sir" sifatida yangi holatga
 * o'tkazadi (2026-09-22, avtomatlashtirilgan pipeline). SIP qo'ng'iroq
 * asosidagi avtomatika (`O'rnatildi`/`O'rnatilmadi`) `pages/lid/index.tsx`
 * ichida, chaqiruv Lid sahifasining o'zidan boshlangani uchun to'g'ridan-
 * to'g'ri `updateStatus` bilan qolgan — bu funksiya boshqa, LID SAHIFASI
 * BO'LMAGAN sahifalardan (shartnoma formasi, to'lov modali, demo-dars
 * davomat sahifasi) chaqiriladi, shuning uchun operator_id'ni bila olmaydi
 * (backend uni bo'sh qoldiradi — `updateLidStatus`ning o'zidagi izohga
 * qara) va xato chiqsa ham ASOSIY amalni (shartnoma/to'lov/davomat allaqachon
 * saqlangan) "muvaffaqiyatsiz"ga aylantirmaydi — faqat konsolga yoziladi.
 * `lidId` bo'sh/`0`/raqam bo'lmasa jimgina hech narsa qilmaydi (masalan
 * shartnoma lidsiz — texnik xodim orqali emas — yaratilgan bo'lsa).
 */
export async function advanceLidStatus(
  lidId: number | string | null | undefined,
  status: LidStatus,
): Promise<void> {
  const id = Number(lidId);
  if (!id || Number.isNaN(id)) return;
  try {
    await updateLidStatus(id, status, null);
    queryClient.invalidateQueries({ queryKey: ["lids"] });
  } catch (e) {
    console.warn(`Lid #${id} holatini ${status}ga avtomatik yangilab bo'lmadi`, e);
  }
}

/**
 * Lidning "qiziqish rangi" belgisini backendda saqlaydi:
 * `PATCH /lids/{id} { color }` (backend ustuni — `color`, `nullable|string`).
 * `color: null` — belgini tozalash. Xato (422/500) chaqiruvchiga uzatiladi —
 * `useLidInterestColor` eski rangni qaytaradi.
 */
export async function updateLidInterestColor(
  id: number,
  color: LidInterestColor | null,
): Promise<void> {
  await API.patch(`/lids/${id}`, { color });
}
