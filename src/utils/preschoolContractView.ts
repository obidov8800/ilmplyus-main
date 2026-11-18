import type { PreschoolContract, PreschoolContractPerson } from '@/types/preschoolContract.types';

/** Maktabga tayyorlov shartnomasi ro'yxati va ko'rish oynasi uchun ko'rsatish yordamchilari. Admin va User'da bir xil fayl. */

export const DASH = '—';

/** `2026-09-15…` → `15.09.2026`. */
export const formatContractDate = (value?: string | null): string => {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : DASH;
};

/**
 * O'qish oylari soni — backend (`preparePreschoolStudent`) bilan bir xil qoida: boshlanish va tugash oylari to'liq oy
 * hisoblanadi (`2026-10-23 … 2027-06-30` → 9 oy). Sana noto'g'ri yoki tugash boshlanishdan oldin bo'lsa — 0.
 */
export const contractMonths = (start: string, end: string): number => {
  const s = start.match(/^(\d{4})-(\d{2})/);
  const e = end.match(/^(\d{4})-(\d{2})/);
  if (!s || !e) return 0;
  const months = (Number(e[1]) - Number(s[1])) * 12 + (Number(e[2]) - Number(s[2])) + 1;
  return months > 0 ? months : 0;
};

export const personName = (p?: PreschoolContractPerson | null): string =>
  p ? p.full_name || [p.last_name, p.first_name, p.father_name].filter(Boolean).join(' ') || DASH : DASH;

/** Bir nechta vakil (yangi); eski backendda faqat bitta `representative`. */
export const contractRepresentatives = (c: PreschoolContract): PreschoolContractPerson[] =>
  c.representatives && c.representatives.length > 0 ? c.representatives : c.representative ? [c.representative] : [];

export const branchName = (b: PreschoolContract['branch'], lang: string): string => {
  if (!b) return DASH;
  const key = `name_${lang.slice(0, 2)}` as 'name_uz' | 'name_ru' | 'name_en';
  return b[key] || b.name_uz || DASH;
};
