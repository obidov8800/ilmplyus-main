/**
 * Yuklangan FAQ videolarini brauzerda saqlash — IndexedDB orqali.
 *
 * Nega `localStorage` emas: video fayllar odatda bir necha MB, `localStorage`
 * esa (~5–10MB, sinxron, faqat matn) bunga mos emas. IndexedDB katta
 * hajmdagi binary (`Blob`) ma'lumotni asinxron saqlay oladi.
 *
 * DIQQAT — bu VAQTINCHALIK, faqat SHU BRAUZERDA ishlaydigan yechim: backend
 * hali FAQ/video uchun API taqdim etmaydi (tekshirildi, 404). Shu sabab
 * admin yuklagan video faqat o'sha admin ochgan brauzerda ko'rinadi, boshqa
 * foydalanuvchilarga UZATILMAYDI. Backend qo'shilgach, bu fayl butunlay
 * "https://.../storage/faq-videos/{id}" kabi haqiqiy URL qaytaradigan
 * versiyaga almashtiriladi — chaqiruvchi tomon (`faqService.ts`) o'zgarishi
 * shart emas, chunki funksiya imzolari xuddi shunday qoladi.
 */

const DB_NAME = 'ilmplyus_faq_videos';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveVideoBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVideoBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVideoBlob(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
