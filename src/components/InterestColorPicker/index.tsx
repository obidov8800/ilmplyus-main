import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LID_INTEREST_COLORS, getInterestColorMeta, type LidInterestColor } from '@/types/lid.types';
import './interestColorPicker.css';

interface InterestColorPickerProps {
  value: LidInterestColor | null | undefined;
  onChange: (color: LidInterestColor | null) => void;
  disabled?: boolean;
  /** `dot` — bitta rangli doira (kanban karta uchun). `row` — nom bilan birga to'liq qator (tafsilot oynasi uchun). */
  variant?: 'dot' | 'row';
}

/** Oyna va ekran chetlari orasidagi minimal bo'shliq. */
const EDGE_GAP = 8;

/**
 * Lidning "qiziqish rangi" belgisini (backend ustuni `color`) ko'rsatish va
 * o'zgartirish uchun umumiy komponent. Rang backendda `PATCH /lids/{id}`
 * orqali saqlanadi — saqlash chaqiruvchi tomonda (`onChange`).
 *
 * Rang oynasi `document.body`ga PORTAL qilib chiziladi (`position: fixed`):
 * kanban ustuni va karta `overflow` bilan kesadi, shuning uchun oyna karta
 * ichida chizilsa o'ng chetdan kesilib, ranglar ko'rinmay qolardi. Joyi
 * tugma o'lchamidan hisoblanadi va ekran chegarasidan chiqmaydigan qilib
 * suriladi; sahifa aylantirilganda yopiladi.
 */
export default function InterestColorPicker({
  value,
  onChange,
  disabled,
  variant = 'dot',
}: InterestColorPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  /**
   * Oynaning joyi DOMga bevosita yoziladi (React holati emas): o'lcham faqat
   * chizilgandan keyin ma'lum, holatga yozish esa ortiqcha qayta chizish berardi.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const rect = trigger.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;

    let left = rect.left;
    if (left + width > window.innerWidth - EDGE_GAP) left = rect.right - width;
    left = Math.max(EDGE_GAP, left);

    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - EDGE_GAP) top = rect.top - height - 6;
    top = Math.max(EDGE_GAP, top);

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.visibility = 'visible';
  }, []);

  // Oyna ochilganda o'lchamini o'lchab, bo'yashdan OLDIN joylashtiramiz.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Sahifa/kanban aylantirilsa tugma siljiydi — oyna "uchib" qolmasin.
    const handleScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const meta = getInterestColorMeta(value);

  const handlePick = useCallback(
    (color: LidInterestColor | null) => {
      setOpen(false);
      if (color !== (meta?.key ?? null)) onChange(color);
    },
    [onChange, meta],
  );

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      setOpen((v) => !v);
    },
    [disabled],
  );

  return (
    <div
      ref={rootRef}
      className={`icp icp--${variant}`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      draggable={false}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`icp__trigger${meta ? '' : ' icp__trigger--empty'}`}
        style={
          meta
            ? variant === 'row'
              ? ({ '--icp-color': meta.hex } as React.CSSProperties)
              : { background: meta.hex, borderColor: meta.hex }
            : undefined
        }
        onClick={toggle}
        disabled={disabled}
        title={meta ? `${t(meta.labelKey)} — ${t(meta.descKey)}` : t('lid.interest.none')}
        aria-label={t('lid.interest.title')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {variant === 'row' && (
          <span className="icp__trigger-label">{meta ? t(meta.labelKey) : t('lid.interest.none')}</span>
        )}
      </button>

      {open &&
        createPortal(
          // Portal ichidagi hodisalar React daraxti bo'ylab yuqoriga (karta `onClick`i,
          // sudrab olish va h.k.) chiqib ketmasin.
          <div
            ref={popoverRef}
            className="icp__popover"
            role="menu"
            style={{ visibility: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="icp__popover-title">{t('lid.interest.title')}</div>
            <div className="icp__options">
              {LID_INTEREST_COLORS.map((c) => {
                const active = meta?.key === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`icp__option${active ? ' icp__option--active' : ''}`}
                    onClick={() => handlePick(c.key)}
                  >
                    <span className="icp__option-dot" style={{ background: c.hex }} aria-hidden="true" />
                    <span className="icp__option-text">
                      <span className="icp__option-name">{t(c.labelKey)}</span>
                      <span className="icp__option-desc">{t(c.descKey)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {meta && (
              <button type="button" className="icp__clear" onClick={() => handlePick(null)}>
                {t('lid.interest.clear')}
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
