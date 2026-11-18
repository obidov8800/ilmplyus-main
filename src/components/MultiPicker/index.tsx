import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './multiPicker.css';

export interface MultiPickerOption {
  value: number;
  label: string;
}

interface Props {
  options: MultiPickerOption[];
  value: number[];
  onChange: (next: number[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

const PANEL_MAX = 380;
const PANEL_MIN_WIDTH = 300;

/**
 * Ko'p tanlash: tanlanganlar yuqorida chip bo'lib turadi (olib tashlash — chipdagi ×), ochiladigan ro'yxatda esa
 * FAQAT HALI TANLANMAGANLAR ko'rinadi — tanlangan variant ro'yxatdan chiqib ketadi.
 *  - bosish — shu elementni qo'shadi (mavjudlari saqlanadi);
 *  - Shift+bosish — oxirgi bosilgan joydan shu yergacha oraliqni qo'shadi;
 *  - Ctrl+A — ko'rinib turgan (qidiruvga mos) hammasini qo'shish;
 *  - «Hammasini tanlash» / «Tozalash».
 * Ilgari bunday joylarda `<select>` har safar yopilib, bittadan qo'shish kerak edi.
 */
export default function MultiPicker({ options, value, onChange, placeholder, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastIndex = useRef<number | null>(null);

  const selected = useMemo(() => new Set(value), [value]);
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);

  // Ro'yxatda faqat tanlanmaganlar (tanlanganlar yuqoridagi chiplarda turadi; chip yorlig'i uchun `options` to'liq qoladi).
  const available = useMemo(() => options.filter((o) => !selected.has(o.value)), [options, selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? available.filter((o) => o.label.toLowerCase().includes(q)) : available;
  }, [available, query]);

  const place = () => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const openUp = below < 260 && above > below;
    const room = Math.max(180, Math.min(PANEL_MAX, openUp ? above : below));
    const width = Math.max(rect.width, PANEL_MIN_WIDTH);
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    setPanelStyle(
      openUp
        ? { left, width, bottom: window.innerHeight - rect.top + 4, maxHeight: room }
        : { left, width, top: rect.bottom + 4, maxHeight: room },
    );
  };

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    // Chip qo'shilganda maydon balandligi o'sadi — ro'yxat uning ustiga chiqib qolmasligi uchun qayta joylanadi.
    const observer = new ResizeObserver(place);
    if (boxRef.current) observer.observe(boxRef.current);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      observer.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (boxRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openPanel = () => {
    place();
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
    lastIndex.current = null;
  };

  const emit = (ids: Iterable<number>) => onChange(Array.from(ids));

  // Ro'yxatda faqat tanlanmaganlar bor, shuning uchun har qanday bosish QO'SHADI (mavjud tanlov saqlanadi);
  // olib tashlash — yuqoridagi chipdagi ×. Element qo'shilgach ro'yxatdan chiqadi, pastdagilar bir qator ko'tariladi —
  // Shift oralig'i «oxirgi bosilgan joydan» hozirgi ro'yxat bo'yicha hisoblanadi.
  const handleItem = (option: MultiPickerOption, index: number, e: MouseEvent) => {
    if (e.shiftKey && lastIndex.current !== null) {
      const [from, to] = [lastIndex.current, index].sort((a, b) => a - b);
      const next = new Set(value);
      filtered.slice(from, to + 1).forEach((o) => next.add(o.value));
      emit(next);
      lastIndex.current = from;
      return;
    }

    emit([...value, option.value]);
    lastIndex.current = index;
  };

  const selectAll = () => {
    const next = new Set(value);
    filtered.forEach((o) => next.add(o.value));
    emit(next);
  };

  const remove = (id: number) => emit(value.filter((v) => v !== id));

  const onPanelKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      boxRef.current?.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectAll();
    }
  };

  const onBoxKey = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openPanel();
    }
  };

  return (
    <div className={`mpk${disabled ? ' mpk--disabled' : ''}`}>
      <div
        ref={boxRef}
        className={`mpk-box${open ? ' mpk-box--open' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && (open ? close() : openPanel())}
        onKeyDown={onBoxKey}
      >
        {value.length === 0 && <span className="mpk-placeholder">{placeholder ?? t('multiPicker.choose')}</span>}
        {value.map((id) => (
          <span key={id} className="mpk-chip">
            <span className="mpk-chip-label">{byValue.get(id)?.label ?? id}</span>
            {!disabled && (
              <button
                type="button"
                className="mpk-chip-remove"
                aria-label={t('multiPicker.remove')}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(id);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} mpk-caret`} />
      </div>

      {open &&
        createPortal(
          // React hodisalari portal orqali ota komponentlarga (masalan modal overlay'ning `onClick`i) ko'tariladi — to'xtatamiz,
          // aks holda ro'yxatdagi bosish oynani yopib yuborishi mumkin.
          <div
            ref={panelRef}
            className="mpk-panel"
            style={panelStyle}
            onKeyDown={onPanelKey}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mpk-toolbar">
              <input
                ref={searchRef}
                className="mpk-search"
                type="search"
                value={query}
                placeholder={t('multiPicker.search')}
                onChange={(e) => {
                  setQuery(e.target.value);
                  lastIndex.current = null;
                }}
              />
              <button type="button" className="mpk-link" onClick={selectAll} disabled={filtered.length === 0}>
                {t('multiPicker.selectAll')}
              </button>
              <button type="button" className="mpk-link" onClick={() => emit([])} disabled={value.length === 0}>
                {t('multiPicker.clear')}
              </button>
            </div>

            <ul className="mpk-list" role="listbox" aria-multiselectable="true">
              {filtered.length === 0 && (
                <li className="mpk-empty">
                  {options.length > 0 && available.length === 0 ? t('multiPicker.allSelected') : t('multiPicker.noResults')}
                </li>
              )}
              {filtered.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={false}
                  className="mpk-item"
                  title={o.label}
                  onClick={(e) => handleItem(o, i, e)}
                >
                  <span className="mpk-item-label">{o.label}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
