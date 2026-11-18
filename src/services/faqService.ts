import { FAQ_SEED } from '@/data/faqSeed';
import { deleteVideoBlob, getVideoBlob, saveVideoBlob } from './faqVideoStore';
import type { FaqEntry } from '@/types/faq.types';

/**
 * VAQTINCHALIK QATLAM: backendda FAQ uchun API hali yo'q (tekshirildi —
 * `/faq`, `/faqs`, `/videos` va h.k. 404 qaytaradi). Shu sabab bu servis
 * hozircha `localStorage`da ishlaydi, LEKIN barcha funksiyalar ATAYLAB
 * asinxron (`Promise` qaytaradi) — xuddi haqiqiy `API.get/post/put/delete`
 * chaqiruvi kabi. Backend qo'shilganda faqat SHU faylning ICHINI
 * `API.*`ga almashtirish yetarli — `FaqContent.tsx` (chaqiruvchi tomon)
 * o'zgarishi shart emas.
 *
 * DIQQAT — bu chegara: hozirgi holatda ma'lumot faqat SHU BRAUZERDA
 * saqlanadi. Admin FAQ qo'shsa/tahrirlasa, boshqa foydalanuvchilarga (va
 * boshqa qurilmalarga) darhol ko'rinmaydi — chunki `localStorage`/IndexedDB
 * qurilmalar orasida ulashilmaydi. Bu haqiqiy, ko'p foydalanuvchili holat
 * uchun backend qo'shilishi shart.
 */

const STORAGE_KEY = 'ilmplyus_faq_entries_v1';
/** Seeddagi skrinshot/videolar qaysi nashrgacha saqlangan nusxaga qo'shilgani. */
const MEDIA_KEY = 'ilmplyus_faq_media_v';
const MEDIA_VERSION = 1;

/**
 * Rasm/video qo'shilgach javob matni yangilangan yozuvlarning ESKI seed
 * javobi xeshlari (`hashText`). Saqlangan nusxadagi javob aynan eski seed
 * bo'lsa (admin tahrirlamagan) — yangi matn bilan almashtiriladi; admin
 * o'zgartirgan matnga tegilmaydi.
 */
const LEGACY_ANSWER_HASHES: Record<string, string> = {
  'general-2': 'nesyfr',
  'lids-1': '19t29i9',
  'lids-2': 'hfmpl2',
  'lids-4': '1y714mk',
  'tasks-1': '1omnqx2',
  'tasks-2': 'r0a6zr',
  'groups-1': 'nayksa',
  'groups-2': 'x3dgqm',
  'courses-1': '29d35a',
  'demo-1': 'jf5hxt',
  'schedule-1': '9tcqld',
  'lessons-1': 'bwkg0n',
  'reports-1': '6ztwjj',
  'student-attendance-1': '317lay',
  'staff-attendance-1': '1f0x3c3',
  'payments-1': '7b337j',
  'payments-2': '12em3yi',
  'contracts-1': 'bepvjt',
  'students-contracts-1': '6stys8',
  'expenses-1': '1r6voo9',
  'roles-1': 'wwq5ug',
  'users-1': 'dw4b9j',
};

function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Brauzerda allaqachon saqlangan (eski) nusxaga seeddagi rasm/videolarni bir
 * marta qo'shadi — admin o'zi yuklagan video yoki o'zgartirgan matnga tegmaydi.
 * `MEDIA_VERSION` oshirilsa, yangi seed mediasi yana bir marta qo'shiladi.
 */
function mergeSeedMedia(entries: FaqEntry[]): FaqEntry[] {
  const seedById = new Map(FAQ_SEED.map((e) => [e.id, e]));
  let changed = false;
  const merged = entries.map((entry) => {
    const seed = seedById.get(entry.id);
    if (!seed) return entry;
    const next: FaqEntry = { ...entry };
    if (seed.images?.length && !entry.images?.length) {
      next.images = seed.images;
      changed = true;
    }
    if (seed.videoUrl && !entry.videoUrl && !entry.videoId) {
      next.videoUrl = seed.videoUrl;
      next.videoPoster = seed.videoPoster ?? null;
      changed = true;
    }
    if (LEGACY_ANSWER_HASHES[entry.id] && hashText(entry.answer_uz) === LEGACY_ANSWER_HASHES[entry.id]) {
      next.answer_uz = seed.answer_uz;
      changed = true;
    }
    return next;
  });
  return changed ? merged : entries;
}

function migrateMedia(): void {
  try {
    if (Number(localStorage.getItem(MEDIA_KEY)) >= MEDIA_VERSION) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) writeRaw(mergeSeedMedia(parsed));
    }
    localStorage.setItem(MEDIA_KEY, String(MEDIA_VERSION));
  } catch {
    // Saqlash cheklangan bo'lsa — seeddagi holat ko'rsatilaveradi.
  }
}

function readRaw(): FaqEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return FAQ_SEED;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : FAQ_SEED;
  } catch {
    return FAQ_SEED;
  }
}

function writeRaw(entries: FaqEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export async function fetchFaqEntries(): Promise<FaqEntry[]> {
  if (!localStorage.getItem(STORAGE_KEY)) {
    writeRaw(FAQ_SEED);
    localStorage.setItem(MEDIA_KEY, String(MEDIA_VERSION));
  } else {
    migrateMedia();
  }
  return readRaw();
}

export async function saveFaqEntry(entry: FaqEntry): Promise<FaqEntry[]> {
  const entries = readRaw();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  writeRaw(entries);
  return entries;
}

export async function deleteFaqEntry(id: string): Promise<FaqEntry[]> {
  const target = readRaw().find((e) => e.id === id);
  if (target?.videoId) {
    await deleteVideoBlob(target.videoId).catch(() => undefined);
  }
  const entries = readRaw().filter((e) => e.id !== id);
  writeRaw(entries);
  return entries;
}

/** Sozlamalarni boshlang'ich (seed) holatga qaytaradi — admin uchun "Standart holatga qaytarish". */
export async function resetFaqEntries(): Promise<FaqEntry[]> {
  writeRaw(FAQ_SEED);
  localStorage.setItem(MEDIA_KEY, String(MEDIA_VERSION));
  return FAQ_SEED;
}

/** Video faylni yuklaydi (IndexedDB'ga) va unga ishora qiluvchi ID qaytaradi. */
export async function uploadFaqVideo(file: File): Promise<string> {
  const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await saveVideoBlob(id, file);
  return id;
}

/** Saqlangan videoni ko'rsatish uchun vaqtinchalik obyekt-URL yaratadi (`<video src>` uchun). */
export async function getFaqVideoObjectUrl(videoId: string): Promise<string | null> {
  const blob = await getVideoBlob(videoId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function deleteFaqVideo(videoId: string): Promise<void> {
  await deleteVideoBlob(videoId);
}
