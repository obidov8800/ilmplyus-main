import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// ── Band / bo'sh belgili ochiladigan ro'yxat (o'qituvchi, xona) ──────────────

export interface AvailOption {
  value: string;
  label: string;
  busy: boolean;
}

interface AvailSelectProps {
  value: string;
  options: AvailOption[];
  placeholder: string;
  busyLabel: string;
  freeLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/*
 * Ochiladigan ro'yxat oynaning (`.gf-modal`, overflow: auto) ichida `absolute` turganda oyna pastidan
 * kesilib, ro'yxatni ko'rish uchun oynani pastga aylantirishga to'g'ri kelardi. Endi ro'yxat `fixed`:
 * oyna chegarasi kesmaydi, joyi tugma koordinatasidan hisoblanadi va qayerda joy ko'p bo'lsa —
 * pastga yoki YUQORIGA ochiladi (balandligi shu joyga moslanadi). Oyna aylantirilsa/o'lcham o'zgarsa qayta joylanadi.
 */
const DROPDOWN_GAP = 4; // tugma bilan ro'yxat orasi
const DROPDOWN_EDGE = 12; // ekran chetigacha qoldiriladigan joy
const DROPDOWN_MAX_HEIGHT = 360;
const OPTION_ROW_HEIGHT = 42;

interface DropdownPos {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function AvailSelect({
  value,
  options,
  placeholder,
  busyLabel,
  freeLabel,
  disabled,
  onChange,
}: AvailSelectProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - DROPDOWN_GAP - DROPDOWN_EDGE;
    const spaceAbove = rect.top - DROPDOWN_GAP - DROPDOWN_EDGE;
    // Hamma qatorlar (+ «Tanlang») sig'adigan balandlik, lekin DROPDOWN_MAX_HEIGHT dan oshmaydi
    const wanted = Math.min((options.length + 1) * OPTION_ROW_HEIGHT + 2, DROPDOWN_MAX_HEIGHT);
    const openUp = spaceBelow < wanted && spaceAbove > spaceBelow;

    const next: DropdownPos = openUp
      ? {
          bottom: viewportHeight - rect.top + DROPDOWN_GAP,
          left: rect.left,
          width: rect.width,
          maxHeight: Math.max(120, Math.min(DROPDOWN_MAX_HEIGHT, spaceAbove)),
        }
      : {
          top: rect.bottom + DROPDOWN_GAP,
          left: rect.left,
          width: rect.width,
          maxHeight: Math.max(120, Math.min(DROPDOWN_MAX_HEIGHT, spaceBelow)),
        };

    setPos((prev) =>
      prev &&
      prev.top === next.top &&
      prev.bottom === next.bottom &&
      prev.left === next.left &&
      prev.width === next.width &&
      prev.maxHeight === next.maxHeight
        ? prev
        : next,
    );
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    // capture: oyna (`.gf-modal`) aylantirilganda ham qayta joylanadi
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // Ochilganda tanlangan qator ko'rinadigan joyga keltiriladi; Esc yopadi
  useEffect(() => {
    if (!open || !pos) return;
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('.gf-select__option--active');
    if (list && active) {
      list.scrollTop = Math.max(0, active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2);
    }
    // faqat ochilish paytida (pos qayta hisoblanganda ro'yxat sakramasin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos === null]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="gf-select">
      <button
        ref={triggerRef}
        type="button"
        className="gf-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
      >
        <span>{selected?.label ?? placeholder}</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 12 }} />
      </button>

      {open && pos && (
        <div
          ref={listRef}
          className="gf-select__dropdown"
          role="listbox"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
        >
          <div
            className="gf-select__option gf-select__option--placeholder"
            role="option"
            aria-selected={!value}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            {placeholder}
          </div>
          {options.map((opt) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className={`gf-select__option${value === opt.value ? ' gf-select__option--active' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span>{opt.label}</span>
              <span className={`gf-badge ${opt.busy ? 'gf-badge--busy' : 'gf-badge--free'}`}>
                {opt.busy ? busyLabel : freeLabel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
