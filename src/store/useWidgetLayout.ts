import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WidgetLayoutItem } from '@/pages/dashboard/widgets/widget.types';

/** Bitta sahifa uchun foydalanuvchi joylashuvi. */
export interface TabLayout {
  /** Ko'rinadigan vidjetlar — foydalanuvchi qo'ygan tartibda, o'lchami bilan. */
  items: WidgetLayoutItem[];
  /**
   * Foydalanuvchi ataylab olib tashlagan vidjetlar.
   *
   * Bu ro'yxatsiz farqni bilib bo'lmaydi: vidjet `items` da yo'q — foydalanuvchi
   * uni o'chirganmi yoki u kodga endi qo'shilganmi? Birinchisi yashirin qolishi,
   * ikkinchisi esa o'z-o'zidan paydo bo'lishi kerak.
   */
  removed: string[];
}

interface WidgetLayoutState {
  /** `userId -> kalit -> joylashuv`. Bitta brauzerda bir necha odam ishlashi mumkin. */
  byUser: Record<string, Record<string, TabLayout>>;

  setItems: (userId: string, key: string, items: WidgetLayoutItem[]) => void;
  /** Kenglik (ustun) va/yoki balandlik (piksel) — chetidan cho'zilganda. */
  setBox: (
    userId: string,
    key: string,
    widgetId: string,
    box: { w?: number; h?: number },
  ) => void;
  removeWidget: (userId: string, key: string, widgetId: string) => void;
  addWidget: (userId: string, key: string, item: WidgetLayoutItem) => void;
  resetTab: (userId: string, key: string) => void;
}

const EMPTY_TAB: TabLayout = { items: [], removed: [] };

function updateTab(
  state: WidgetLayoutState,
  userId: string,
  key: string,
  fn: (layout: TabLayout) => TabLayout,
): Pick<WidgetLayoutState, 'byUser'> {
  const userLayouts = state.byUser[userId] ?? {};
  const current = userLayouts[key] ?? EMPTY_TAB;
  return { byUser: { ...state.byUser, [userId]: { ...userLayouts, [key]: fn(current) } } };
}

/**
 * Vidjet joylashuvi — HAR FOYDALANUVCHI uchun alohida, brauzerda saqlanadi.
 *
 * Backendda foydalanuvchiga bog'langan erkin sozlama uchun endpoint yo'q,
 * shuning uchun joylashuv `localStorage` da turadi. Kalit `userId` bo'lgani
 * uchun bitta kompyuterda navbatma-navbat ishlaydigan ikki xodim bir-birining
 * joylashuvini buzmaydi.
 *
 * Saqlash nomi `v3`: vidjetlar eski (5 tabli) dizayn bloklariga almashtirildi,
 * id'lari boshqa — oldingi (`v2`) yozuvlar bu bloklarga mos kelmaydi, shuning uchun
 * joylashuv standartdan boshlanadi.
 */
export const useWidgetLayoutStore = create<WidgetLayoutState>()(
  persist(
    (set) => ({
      byUser: {},

      setItems: (userId, key, items) =>
        set((state) => updateTab(state, userId, key, (l) => ({ ...l, items }))),

      setBox: (userId, key, widgetId, box) =>
        set((state) =>
          updateTab(state, userId, key, (l) => ({
            ...l,
            items: l.items.map((it) => (it.id === widgetId ? { ...it, ...box } : it)),
          })),
        ),

      removeWidget: (userId, key, widgetId) =>
        set((state) =>
          updateTab(state, userId, key, (l) => ({
            items: l.items.filter((it) => it.id !== widgetId),
            removed: l.removed.includes(widgetId) ? l.removed : [...l.removed, widgetId],
          })),
        ),

      addWidget: (userId, key, item) =>
        set((state) =>
          updateTab(state, userId, key, (l) => ({
            items: l.items.some((it) => it.id === item.id) ? l.items : [...l.items, item],
            removed: l.removed.filter((id) => id !== item.id),
          })),
        ),

      resetTab: (userId, key) =>
        set((state) => updateTab(state, userId, key, () => ({ items: [], removed: [] }))),
    }),
    { name: 'dashboard-widget-layout-v3' },
  ),
);
