import type { ComponentType } from 'react';
import type { MainTab } from '@/store/useDashboardSettings';

/**
 * Grid ustunlari soni. 12 ta — foydalanuvchi chetidan ushlab cho'zganda
 * o'lcham mayin o'zgarsin (4 ta qattiq o'lcham o'rniga). Baribir gridga
 * tekislanadi, shuning uchun panel tartibsiz bo'lib ketmaydi.
 */
export const GRID_COLS = 12;

/** Balandlik chegaralari (piksel) — juda past yoki cheksiz baland bo'lmasin. */
export const MIN_WIDGET_H = 160;
export const MAX_WIDGET_H = 1400;

export interface WidgetDef {
  /**
   * Barqaror identifikator — foydalanuvchi joylashuvi (localStorage) va rol
   * ruxsatlari (`/dashboard-settings` → `widgetVisibility`) shu bo'yicha
   * saqlanadi. Mavjud id'ni O'ZGARTIRMANG: o'zgartirilsa foydalanuvchilarning
   * saqlangan joylashuvi va berilgan ruxsatlar uziladi.
   */
  id: string;
  /**
   * Vidjet kategoriyasi = dashboard tabi (`umumiy`, `sotuv`, ...): vidjet shu tabda
   * chiqadi, joylashuv ham shu tab uchun alohida saqlanadi.
   */
  category: MainTab;
  /** i18n kaliti — vidjet nomi. */
  titleKey: string;
  /**
   * Boshlang'ich kenglik — 12 ustunli gridda necha ustun. Eski dizayndagi joylashuvga mos:
   * statistika kartalari 3+3+3+3, "diagramma + yon karta" qatori 8+4, to'liq qator 12.
   */
  defaultCols: number;
  /**
   * Ixtiyoriy: shu "feature" yoqilgan bo'lsagina ko'rinadi
   * (`/dashboard-settings` → `features`). Admin uchun har doim ochiq.
   */
  featureFlag?: string;
  /**
   * Vidjet mazmuni. Tab komponenti hisoblagan tayyor JSX kontekstdan olinadi
   * (`sectionComponent` — har id uchun barqaror komponent).
   */
  Component: ComponentType;
}

/**
 * Foydalanuvchi saqlagan bitta vidjet holati.
 *
 * `w` — nechta ustunni egallashi (1..12), `h` — balandligi pikselda
 * (belgilanmagan bo'lsa mazmuniga qarab o'zi o'lchanadi).
 */
export interface WidgetLayoutItem {
  id: string;
  w: number;
  h?: number;
}
