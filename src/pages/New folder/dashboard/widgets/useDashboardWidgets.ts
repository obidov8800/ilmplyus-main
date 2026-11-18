import { useCallback, useMemo } from 'react';
import useAuthStore from '@/store/useAuthStore';
import useDashboardSettings, { ALL_TABS, type MainTab } from '@/store/useDashboardSettings';
import { useWidgetLayoutStore } from '@/store/useWidgetLayout';
import { isAdminUser } from '@/utils/isAdminUser';
import type { User } from '@/types/user.types';
import { WIDGET_REGISTRY } from './registry';
import type { WidgetDef, WidgetLayoutItem } from './widget.types';

/** Vidjet ta'rifi + foydalanuvchi saqlagan holati birga. */
export interface PlacedWidget extends WidgetLayoutItem {
  def: WidgetDef;
}

export interface DashboardWidgetsApi {
  /** Ekranda ko'rsatiladigan vidjetlar — foydalanuvchi tartibida. */
  placed: PlacedWidget[];
  /** Ruxsat bor, lekin foydalanuvchi olib tashlagan vidjetlar ("qo'shish" ro'yxati). */
  available: WidgetDef[];
  move: (fromIndex: number, toIndex: number) => void;
  /** Chetidan cho'zilganda — kenglik (ustun) va/yoki balandlik (piksel). */
  setBox: (widgetId: string, box: { w?: number; h?: number }) => void;
  remove: (widgetId: string) => void;
  add: (widgetId: string) => void;
  reset: () => void;
  /** Foydalanuvchi joylashuvni o'zgartirganmi (qaytarish tugmasi shu asosda). */
  isCustomized: boolean;
}

/** Rol nomi `role` (satr yoki obyekt) yoki `roles[0]` da bo'lishi mumkin. */
function getRoleName(user: User | null): string {
  if (!user) return '';
  if (typeof user.role === 'string') return user.role;
  if (user.role && typeof user.role === 'object') {
    return (user.role as { name: string }).name ?? '';
  }
  return user.roles?.[0]?.name ?? '';
}

const isAdminRole = (role: string) => role === 'admin' || role === 'superadmin';

/** Hozirgi reyestrdagi vidjet id'lari — rolga saqlangan eski ro'yxatni tanib olish uchun. */
const KNOWN_IDS = new Set(WIDGET_REGISTRY.map((w) => w.id));

/**
 * Rolga ruxsat etilgan vidjetlar (hamma tab bo'yicha) va ular asosidagi tablar.
 *
 * Ruxsat uch bosqichda tekshiriladi:
 *  1. `roleVisibility` — rolga ochiq BO'LIMLAR (tablar);
 *  2. `featureFlag` — masalan IP-telefoniya bloki;
 *  3. `widgetVisibility` — rolga ochiq aniq vidjetlar. Sozlanmagan rol uchun hammasi
 *     ochiq (mavjud xatti-harakat buzilmasin). Ro'yxatda bu dizayndagi birorta ham id
 *     bo'lmasa (vidjetlar almashtirilgunga qadar berilgan eski ro'yxat) u e'tiborga
 *     olinmaydi — aks holda rol panelsiz qolardi. Bo'sh ro'yxat — "hech biri".
 *
 * `tabs` — kamida bitta ruxsat etilgan vidjeti bor bo'limlar: tab qatorida shular
 * chiqadi (vidjeti qolmagan bo'lim bo'sh tab bo'lib turmaydi).
 */
export function useAllowedWidgets() {
  const user = useAuthStore((s) => s.user);
  const { widgetVisibility, hasFeature, getVisibleTabs } = useDashboardSettings();

  const roleName = getRoleName(user);
  const visibleCategories = getVisibleTabs(roleName);
  const adminLike = isAdminUser(user);

  const allowed = useMemo<WidgetDef[]>(() => {
    const isAdmin = isAdminRole(roleName);

    const byCategory = WIDGET_REGISTRY.filter(
      (w) => isAdmin || visibleCategories.includes(w.category),
    );
    const byFeature = byCategory.filter(
      (w) => !w.featureFlag || adminLike || hasFeature(w.featureFlag),
    );
    if (isAdmin) return byFeature;

    const ids = widgetVisibility[roleName];
    if (!ids || (ids.length > 0 && !ids.some((id) => KNOWN_IDS.has(id)))) return byFeature;
    return byFeature.filter((w) => ids.includes(w.id));
    // `visibleCategories` har renderda yangi massiv — uzunligi bo'yicha
    // taqqoslash yetarli, chunki u faqat sozlama o'zgarganda o'zgaradi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleName, adminLike, widgetVisibility, hasFeature, visibleCategories.join(',')]);

  const tabs = useMemo(
    () => ALL_TABS.filter((cat) => allowed.some((w) => w.category === cat)),
    [allowed],
  );

  return { allowed, tabs, hasAnyAccess: allowed.length > 0 };
}

/**
 * Bitta tabning vidjet ro'yxatini yig'adi: reyestr (kod) + ruxsatlar (backend
 * `/dashboard-settings`) + foydalanuvchi joylashuvi (localStorage). Joylashuv har
 * tab uchun alohida saqlanadi (kalit — tab nomi): birining tartibi boshqasiga tegmaydi.
 *
 * Tartib birlashtirish: saqlangan tartib saqlanadi, kodga YANGI qo'shilgan
 * vidjet oxiriga qo'shiladi, ruxsati olib qo'yilgan yoki kodda endi mavjud
 * bo'lmagan vidjet tashlab yuboriladi.
 */
export function useDashboardWidgets(tab: MainTab): DashboardWidgetsApi {
  const user = useAuthStore((s) => s.user);
  const userId = String(user?.id ?? 'anon');

  const { allowed: allowedAll } = useAllowedWidgets();

  /** Shu tabga tegishli, rolga ruxsat etilgan vidjetlar. */
  const allowed = useMemo<WidgetDef[]>(
    () => allowedAll.filter((w) => w.category === tab),
    [allowedAll, tab],
  );

  const layout = useWidgetLayoutStore((s) => s.byUser[userId]?.[tab]);
  const setItems = useWidgetLayoutStore((s) => s.setItems);
  const setBoxRaw = useWidgetLayoutStore((s) => s.setBox);
  const removeRaw = useWidgetLayoutStore((s) => s.removeWidget);
  const addRaw = useWidgetLayoutStore((s) => s.addWidget);
  const resetRaw = useWidgetLayoutStore((s) => s.resetTab);

  const { placed, available } = useMemo(() => {
    const saved = layout?.items ?? [];
    const removed = new Set(layout?.removed ?? []);

    // 1) Saqlangan tartib — ruxsati bor va kodda mavjudlari.
    const ordered: PlacedWidget[] = [];
    saved.forEach((item) => {
      const def = allowed.find((w) => w.id === item.id);
      if (def) ordered.push({ ...item, def });
    });

    // 2) Saqlanmagan (yangi yoki hech qachon tegilmagan) vidjetlar oxiriga.
    allowed.forEach((def) => {
      if (removed.has(def.id)) return;
      if (ordered.some((p) => p.id === def.id)) return;
      ordered.push({ id: def.id, w: def.defaultCols, def });
    });

    const shownIds = new Set(ordered.map((p) => p.id));
    return { placed: ordered, available: allowed.filter((w) => !shownIds.has(w.id)) };
  }, [allowed, layout]);

  const persist = useCallback(
    (next: PlacedWidget[]) =>
      setItems(
        userId,
        tab,
        next.map(({ id, w, h }) => ({ id, w, h })),
      ),
    [setItems, userId, tab],
  );

  /**
   * Hali hech narsa saqlanmagan bo'lsa, o'zgartirishdan OLDIN joriy ko'rinish
   * yoziladi. Aks holda birinchi amal (masalan kenglikni oshirish) bo'sh
   * ro'yxatga yozilib, qolgan vidjetlarning tartibi "unutilgan" bo'lib qolardi.
   */
  const ensureSaved = useCallback(() => {
    if (!layout?.items.length) persist(placed);
  }, [layout, persist, placed]);

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const next = [...placed];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return;
      next.splice(toIndex, 0, moved);
      persist(next);
    },
    [placed, persist],
  );

  return {
    placed,
    available,
    move,
    setBox: (widgetId, box) => {
      ensureSaved();
      setBoxRaw(userId, tab, widgetId, box);
    },
    remove: (widgetId) => {
      ensureSaved();
      removeRaw(userId, tab, widgetId);
    },
    add: (widgetId) => {
      const def = allowed.find((w) => w.id === widgetId);
      if (!def) return;
      ensureSaved();
      addRaw(userId, tab, { id: def.id, w: def.defaultCols });
    },
    reset: () => resetRaw(userId, tab),
    isCustomized: Boolean(layout && (layout.items.length > 0 || layout.removed.length > 0)),
  };
}
