import type { Group } from '@/types/group.types';

/**
 * Guruh nomining avtomatik generatsiyasi.
 *
 * Format: `{filial}-{kurs}-{daraja}{tartib}` — masalan `AF-EN-A101`
 * ("Asosiy filial" + "English" + "A1" + birinchi guruh). Hammasi katta
 * harfda — filial, kurs va daraja kodlari bir xil registrda ko'rinishi
 * uchun.
 */

/** Kod tuzishda apostrof, chiziqcha va bo'shliqlar hisobga olinmaydi: `O‘rta` → `Orta`. */
function lettersAndDigits(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, '');
}

/** `Asosiy filial` → `AF`. Bir so'zli filialda o'sha so'zning ikki harfi olinadi. */
function branchCode(branchName: string): string {
  const words = branchName.trim().split(/\s+/).map(lettersAndDigits).filter(Boolean);
  if (words.length === 0) return '';
  const code = words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0].slice(0, 2);
  return code.toUpperCase();
}

/** `English` → `EN`. */
function courseCode(courseName: string): string {
  const word = lettersAndDigits(courseName.trim().split(/\s+/)[0] ?? '');
  if (!word) return '';
  return word.slice(0, 2).toUpperCase();
}

/** Nomli darajalar kodi shuncha harfga qisqartiriladi: `Boshlang‘ich` → `BOSH`. */
const LEVEL_CODE_MAX = 4;

/** `A1` → `A1`, `Boshlang‘ich` → `BOSH`, `O‘rta` → `ORTA`. */
function levelCode(levelName: string): string {
  const clean = lettersAndDigits(levelName);
  if (!clean) return '';

  // `A1`, `B2`, `C1` — harf + raqam o'z holicha qoladi.
  const shortLevel = clean.match(/^(\p{L})(\d)$/u);
  if (shortLevel) return `${shortLevel[1].toUpperCase()}${shortLevel[2]}`;

  return clean.slice(0, LEVEL_CODE_MAX).toUpperCase();
}

/**
 * Filial + kurs + daraja uchlgi bo'yicha keyingi bo'sh nomni qaytaradi:
 * `AF-EN-A101`, undan keyin `AF-EN-A102` va hokazo.
 *
 * `existingGroups` — sahifalangan emas, TO'LIQ ro'yxat bo'lishi kerak, aks holda
 * tartib raqami takrorlanadi.
 */
export function generateGroupName(
  branchName: string,
  courseName: string,
  levelName: string,
  existingGroups: Group[],
): string {
  const branch = branchCode(branchName);
  const course = courseCode(courseName);
  const level = levelCode(levelName);
  if (!branch || !course || !level) return '';

  const prefix = `${branch}-${course}-${level}`;
  // Solishtirish registrga bog'liq bo'lmasligi uchun ikkala tomon ham kattalashtiriladi.
  const prefixUpper = prefix.toUpperCase();

  // Tartib raqami faqat aynan shu prefiksli guruhlar orasidan olinadi.
  const usedNumbers = existingGroups
    .map((g) => g.name?.trim().toUpperCase() ?? '')
    .filter((name) => name.startsWith(prefixUpper))
    .map((name) => Number(name.slice(prefixUpper.length)))
    .filter((num) => Number.isFinite(num) && num > 0);

  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;

  return `${prefix}${String(next).padStart(2, '0')}`;
}
