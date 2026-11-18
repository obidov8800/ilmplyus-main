import type { ReactNode } from 'react';
import type { MainTab } from '@/store/useDashboardSettings';
import WidgetGrid from '../WidgetGrid';
import { SectionNodesContext } from './sectionContext';
import { useDashboardWidgets } from './useDashboardWidgets';

interface WidgetTabProps {
  tab: MainTab;
  /** Tab komponenti hisoblagan bloklar (vidjet id → eski dizayndagi JSX). */
  nodes: Record<string, ReactNode>;
  /** Joylashtirish rejimi (sudrash, o'lcham, olib tashlash/qo'shish). */
  editing: boolean;
}

/**
 * Eski (5 tabli) dizayndagi tab mazmunini vidjet gridida chiqaradi. Ma'lumot va holat
 * tab komponentida qoladi (eskidagidek), shu yerda faqat bloklarning joylashuvi:
 * tartib, kenglik, balandlik, olib tashlash — har foydalanuvchi uchun, har tab uchun.
 */
export default function WidgetTab({ tab, nodes, editing }: WidgetTabProps) {
  const widgets = useDashboardWidgets(tab);

  return (
    <SectionNodesContext.Provider value={nodes}>
      {/* `dash-tab-content` — PDF eksport shu konteynerni oladi. */}
      <div className="dash-tab-content">
        {/* `key` — tab almashganda surish/cho'zish/"qo'shish" holati tozalanadi. */}
        <WidgetGrid key={tab} api={widgets} editing={editing} />
      </div>
    </SectionNodesContext.Provider>
  );
}
