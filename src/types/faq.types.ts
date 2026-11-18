/**
 * FAQ — bo'lim (modul) bo'yicha savol-javoblar.
 *
 * Ko'p tilli maydonlar boshqa joylardagi kabi `_uz`/`_ru`/`_en` konvensiyasida
 * (masalan `Course.name_uz`) — hozircha faqat `_uz` to'ldirilgan (admin
 * keyinchalik RU/EN qo'shishi mumkin), qolganlari bo'sh bo'lsa `getLocalized`
 * avtomatik `_uz`ga tushadi.
 */
/** Javob ostidagi skrinshot (`public/faq-media/img/*.webp`). Izoh bo'sh bo'lsa UZ'ga tushadi. */
export interface FaqImage {
  src: string;
  caption_uz?: string;
  caption_ru?: string;
  caption_en?: string;
}

export interface FaqEntry {
  id: string;
  /** `faqModules.ts`dagi `FaqModule.key`ga ishora qiladi. */
  moduleKey: string;
  question_uz: string;
  question_ru?: string;
  question_en?: string;
  answer_uz: string;
  answer_ru?: string;
  answer_en?: string;
  /**
   * Yuklangan video (`faqVideoStore`, IndexedDB) ID'si. `videoUrl` bilan bir
   * vaqtda faqat bittasi to'ldiriladi.
   */
  videoId?: string | null;
  /** Tashqi video havolasi (YouTube va h.k.) — fayl yuklash o'rniga. */
  videoUrl?: string | null;
  /** `videoUrl` fayl bo'lsa — video boshlanmasdan oldin ko'rinadigan rasm. */
  videoPoster?: string | null;
  /** Savol-javobga ilova qilingan skrinshotlar (raqamlangan belgilar bilan). */
  images?: FaqImage[];
  order: number;
}

export interface FaqModule {
  key: string;
  labelKey: string;
  /** `null` — har doim ko'rinadi; massiv — ro'yxatdagi ruxsatlardan bittasi yetarli. */
  permission: string | string[] | null;
}
