import { createContext, type ReactNode } from 'react';

/**
 * Tab komponenti hisoblagan bloklar: vidjet id → eski dizayndagi tayyor JSX.
 * Ma'lumot va holat (filtr, tanlangan tab...) tab komponentida qoladi; vidjet
 * grid'i faqat qaysi blok qayerda va qanday o'lchamda chiqishini hal qiladi.
 */
export const SectionNodesContext = createContext<Record<string, ReactNode>>({});
