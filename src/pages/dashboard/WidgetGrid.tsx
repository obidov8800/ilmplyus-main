import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import useDashboardSettings, { type MainTab } from '@/store/useDashboardSettings';
import type { DashboardWidgetsApi, PlacedWidget } from './widgets/useDashboardWidgets';
import { GRID_COLS, MAX_WIDGET_H, MIN_WIDGET_H } from './widgets/widget.types';

/** Qaysi chetidan ushlanganini bildiradi. */
type ResizeEdge = 'e' | 's' | 'se';

interface LiveBox {
  id: string;
  w: number;
  h: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface WidgetFrameProps {
  item: PlacedWidget;
  index: number;
  editing: boolean;
  isDragging: boolean;
  /** Cho'zish paytidagi jonli o'lcham (saqlanmagan holat). */
  live?: LiveBox;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDrop: () => void;
  onResizeStart: (e: PointerEvent<HTMLSpanElement>, item: PlacedWidget, edge: ResizeEdge) => void;
  onRemove: () => void;
}

function WidgetFrame({
  item,
  index,
  editing,
  isDragging,
  live,
  onDragStart,
  onDragEnter,
  onDrop,
  onResizeStart,
  onRemove,
}: WidgetFrameProps) {
  const { t } = useTranslation();
  const { def } = item;

  const w = live?.w ?? item.w;
  const h = live?.h ?? item.h;

  const style = {
    '--widget-span': w,
    ...(h ? { height: `${h}px` } : null),
  } as CSSProperties;

  return (
    <div
      className={
        'dash-widget' +
        (w >= 4 ? ' dash-widget--wide' : '') +
        (h ? ' dash-widget--sized' : '') +
        (editing ? ' dash-widget--editing' : '') +
        (isDragging ? ' dash-widget--dragging' : '') +
        (live ? ' dash-widget--resizing' : '')
      }
      style={style}
      draggable={editing}
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDrop}
      onDrop={onDrop}
    >
      {editing && (
        <div className="dash-widget__bar">
          <span className="dash-widget__grip" title={t('dashboard.widgets.dragHint')}>
            <i className="fa-solid fa-grip-vertical" />
            {t(def.titleKey)}
          </span>

          <div className="dash-widget__actions">
            <span className="dash-widget__size">
              {w}/{GRID_COLS}
            </span>
            <button
              type="button"
              className="dash-widget__btn dash-widget__btn--danger"
              onClick={onRemove}
              title={t('dashboard.widgets.remove')}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>
      )}

      <div className="dash-widget__body">
        <def.Component />
      </div>

      {editing && (
        <>
          {/* Chetlaridan ushlab cho'zish: o'ng cheti — kenglik, pastki cheti —
              balandlik, burchak — ikkalasi birga. */}
          <span
            className="dash-resize dash-resize--e"
            title={t('dashboard.widgets.resizeW')}
            onPointerDown={(e) => onResizeStart(e, item, 'e')}
          />
          <span
            className="dash-resize dash-resize--s"
            title={t('dashboard.widgets.resizeH')}
            onPointerDown={(e) => onResizeStart(e, item, 's')}
          />
          <span
            className="dash-resize dash-resize--se"
            title={t('dashboard.widgets.resizeBoth')}
            onPointerDown={(e) => onResizeStart(e, item, 'se')}
          />
        </>
      )}
    </div>
  );
}

interface WidgetGridProps {
  api: DashboardWidgetsApi;
  editing: boolean;
}

/**
 * Panelning butun mazmuni — bitta 12 ustunli gridda.
 *
 * O'lchamni foydalanuvchi vidjetning CHETIDAN ushlab o'zgartiradi: o'ng cheti
 * kenglikni (ustunga tekislanadi, 1..12), pastki cheti balandlikni (piksel),
 * burchak ikkalasini. Cho'zish paytida o'lcham jonli ko'rinadi, qo'yib
 * yuborilgandan keyin `localStorage` ga yoziladi.
 *
 * Tartibni almashtirish — HTML5 drag-and-drop (qo'shimcha kutubxonasiz).
 */
export default function WidgetGrid({ api, editing }: WidgetGridProps) {
  const { t } = useTranslation();
  const { tabNames } = useDashboardSettings();
  const { placed, available, move, setBox, remove, add, reset, isCustomized } = api;

  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragFrom = useRef<number | null>(null);
  const dragTo = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  /** Cho'zish holati — jonli ko'rsatish uchun, saqlash `pointerup` da. */
  const [live, setLive] = useState<LiveBox | null>(null);
  const resizeRef = useRef<{
    id: string;
    edge: ResizeEdge;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    step: number;
  } | null>(null);

  /**
   * "Qo'shish" ro'yxati kategoriya bo'yicha guruhlanadi — 20 ta vidjetni
   * bitta uzun qatorda ko'rsatish o'qib bo'lmas holga keltirardi.
   */
  const grouped = useMemo(() => {
    const map = new Map<MainTab, typeof available>();
    available.forEach((def) => {
      const list = map.get(def.category) ?? [];
      list.push(def);
      map.set(def.category, list);
    });
    return [...map.entries()];
  }, [available]);

  const categoryLabel = (cat: MainTab) =>
    (tabNames[cat] ?? '').trim() || t(`dashboard.tabs.${cat}`);

  const handleDrop = () => {
    const from = dragFrom.current;
    const to = dragTo.current;
    dragFrom.current = null;
    dragTo.current = null;
    setDragIndex(null);
    if (from !== null && to !== null) move(from, to);
  };

  function handleResizeStart(
    e: PointerEvent<HTMLSpanElement>,
    item: PlacedWidget,
    edge: ResizeEdge,
  ) {
    e.preventDefault();
    e.stopPropagation();

    const frame = (e.currentTarget.parentElement as HTMLElement | null) ?? null;
    const grid = gridRef.current;
    if (!frame || !grid) return;

    // Bitta ustun kengligi: grid kengligidan oraliqlar ayirilib, 12 ga bo'linadi.
    const gap = parseFloat(getComputedStyle(grid).columnGap || '20') || 20;
    const colW = (grid.clientWidth - gap * (GRID_COLS - 1)) / GRID_COLS;

    resizeRef.current = {
      id: item.id,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startW: item.w,
      startH: frame.getBoundingClientRect().height,
      step: colW + gap,
    };
    setLive({ id: item.id, w: item.w, h: frame.getBoundingClientRect().height });
    // Ko'rsatkichni ushlab qolish — sichqoncha vidjetdan chiqib ketsa ham
    // cho'zish davom etsin. Ba'zi holatlarda (masalan sintetik hodisa)
    // qo'llab-quvvatlanmaydi; u holda ham grid'dagi `pointermove` ishlaydi.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ixtiyoriy */
    }
  }

  function handleResizeMove(e: PointerEvent<HTMLSpanElement>) {
    const r = resizeRef.current;
    if (!r) return;
    const widthMove = r.edge === 'e' || r.edge === 'se';
    const heightMove = r.edge === 's' || r.edge === 'se';

    const w = widthMove
      ? clamp(r.startW + Math.round((e.clientX - r.startX) / r.step), 1, GRID_COLS)
      : r.startW;
    const h = heightMove
      ? clamp(r.startH + (e.clientY - r.startY), MIN_WIDGET_H, MAX_WIDGET_H)
      : r.startH;

    setLive({ id: r.id, w, h });
  }

  function handleResizeEnd() {
    const r = resizeRef.current;
    if (r && live) {
      const box: { w?: number; h?: number } = {};
      if (r.edge === 'e' || r.edge === 'se') box.w = live.w;
      if (r.edge === 's' || r.edge === 'se') box.h = Math.round(live.h);
      setBox(r.id, box);
    }
    resizeRef.current = null;
    setLive(null);
  }

  return (
    <>
      {editing && (
        <div className="dash-widgets__toolbar">
          <button
            type="button"
            className="dash-widgets__add-btn btn-accent"
            onClick={() => setAddOpen((v) => !v)}
            disabled={available.length === 0}
          >
            {t('dashboard.widgets.add', { count: available.length })}
          </button>

          {isCustomized && (
            <button type="button" className="dash-widgets__reset-btn" onClick={reset}>
              <i className="fa-solid fa-rotate-left" />
              {t('dashboard.widgets.reset')}
            </button>
          )}
        </div>
      )}

      {editing && addOpen && grouped.length > 0 && (
        <div className="dash-widgets__picker">
          {grouped.map(([cat, defs]) => (
            <div key={cat} className="dash-widgets__picker-group">
              <p className="dash-widgets__picker-title">{categoryLabel(cat)}</p>
              <div className="dash-widgets__picker-items">
                {defs.map((def) => (
                  <button
                    key={def.id}
                    type="button"
                    className="dash-widgets__picker-item"
                    onClick={() => add(def.id)}
                  >
                    {t(def.titleKey)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {placed.length === 0 ? (
        <p className="dash-widgets__empty">{t('dashboard.widgets.allRemoved')}</p>
      ) : (
        <div
          className="dash-widgets"
          ref={gridRef}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
        >
          {placed.map((item, index) => (
            <WidgetFrame
              key={item.id}
              item={item}
              index={index}
              editing={editing}
              isDragging={dragIndex === index}
              live={live?.id === item.id ? live : undefined}
              onDragStart={(i) => {
                dragFrom.current = i;
                setDragIndex(i);
              }}
              onDragEnter={(i) => {
                dragTo.current = i;
              }}
              onDrop={handleDrop}
              onResizeStart={handleResizeStart}
              onRemove={() => remove(item.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
