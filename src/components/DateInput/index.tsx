import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import {
  DISPLAY_DATE_PLACEHOLDER,
  dateToIso,
  isWithinRange,
  isoToDisplay,
  maskTypedDate,
  parseIsoDate,
  parseTypedDate,
  toIsoDate,
} from '../../utils/date';
import './dateInput.css';

/**
 * Native `<input type="date">` bilan bir xil ishlaydigan hodisa shakli, shuning uchun
 * mavjud `onChange={(e) => ...e.target.value}` handlerlari o'zgarishsiz qoladi.
 */
export interface DateInputChangeEvent {
  target: { name: string; value: string };
}

export interface DateInputProps {
  /** Ichki format: `YYYY-MM-DD`. Bo'sh bo'lsa `''`. */
  value: string | null | undefined;
  /** `e.target.value` — har doim `YYYY-MM-DD` yoki `''`. */
  onChange: (event: DateInputChangeEvent) => void;
  name?: string;
  id?: string;
  className?: string;
  /** `YYYY-MM-DD` — kalendarda chegaradan tashqari kunlar o'chiriladi. */
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Native input'dagi kabi — inline uslublar input elementiga beriladi. */
  style?: CSSProperties;
  title?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  onBlur?: () => void;
}

const CALENDAR_WIDTH = 268;
const CALENDAR_HEIGHT = 320;
const VIEWPORT_GAP = 8;

/** Kalendar sarlavhasi tor — oy nomi shundan uzun bo'lmasligi kerak. */
const MONTH_LABEL_MAX = 4;

// prettier-ignore
const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

/** Dushanbadan boshlanadi — kalendar setkasi ham shunday. */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function startOfMonthOffset(year: number, month: number): number {
  // Dushanba — haftaning birinchi kuni.
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function DateInput({
  value,
  onChange,
  name = '',
  id,
  className,
  min,
  max,
  disabled = false,
  required = false,
  placeholder = DISPLAY_DATE_PLACEHOLDER,
  autoFocus,
  style,
  title,
  onBlur,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: DateInputProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'uz';

  const iso = typeof value === 'string' ? value.slice(0, 10) : '';
  const [text, setText] = useState(() => isoToDisplay(iso));
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const today = new Date();
  const selected = parseIsoDate(iso);
  const [view, setView] = useState(() => ({
    year: selected?.year ?? today.getFullYear(),
    month: selected?.month ?? today.getMonth() + 1,
  }));

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  // Kalendar yopilib input'ga fokus qaytganda `onFocus` uni darhol qayta ochib
  // yubormasligi uchun o'sha bitta fokus hodisasini o'tkazib yuboramiz.
  const skipFocusOpenRef = useRef(false);

  // Tashqi qiymat o'zgarsa matnni sinxronlaymiz — lekin foydalanuvchi yozayotgan payt emas.
  const [syncedIso, setSyncedIso] = useState(iso);
  if (iso !== syncedIso && !focused) {
    setSyncedIso(iso);
    setText(isoToDisplay(iso));
  }

  const emit = useCallback(
    (nextIso: string) => {
      if (nextIso !== iso) onChange({ target: { name, value: nextIso } });
    },
    [iso, name, onChange],
  );

  /** Yozilgan matnni tasdiqlaydi: bo'sh → tozalash, to'g'ri → normallashtirish, xato → qaytarish. */
  const commit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      setText('');
      emit('');
      return;
    }
    const parsed = parseTypedDate(trimmed);
    if (parsed) {
      setText(isoToDisplay(parsed));
      emit(parsed);
    } else {
      // Native input ham noto'g'ri sanani saqlab qololmaydi.
      setText(isoToDisplay(iso));
    }
  }, [text, iso, emit]);

  const openCalendar = useCallback(() => {
    if (disabled) return;
    const parts = parseIsoDate(iso);
    setView({
      year: parts?.year ?? new Date().getFullYear(),
      month: parts?.month ?? new Date().getMonth() + 1,
    });
    setOpen(true);
  }, [disabled, iso]);

  const closeCalendar = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) {
      skipFocusOpenRef.current = true;
      inputRef.current?.focus();
    }
  }, []);

  // Modal ichidagi `overflow` kesib qo'ymasligi uchun kalendar `body` ga portal qilinadi.
  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < CALENDAR_HEIGHT + VIEWPORT_GAP && rect.top > CALENDAR_HEIGHT + VIEWPORT_GAP
          ? rect.top - CALENDAR_HEIGHT - 4
          : rect.bottom + 4;
      const left = Math.min(
        Math.max(VIEWPORT_GAP, rect.left),
        window.innerWidth - CALENDAR_WIDTH - VIEWPORT_GAP,
      );
      setPosition({ top, left });
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeCalendar(true);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, closeCalendar]);

  const selectDay = (day: number) => {
    const nextIso = toIsoDate({ year: view.year, month: view.month, day });
    setText(isoToDisplay(nextIso));
    emit(nextIso);
    closeCalendar(true);
  };

  const shiftMonth = (delta: number) => {
    setView((prev) => {
      const next = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });
  };

  // `Intl` `uz` uchun oy nomlarini bilmaydigan muhitlarda "M01"…"M12" qaytaradi,
  // shuning uchun nomlar tarjimadan olinadi va `Intl` faqat zaxira sifatida qoladi.
  const monthNames = MONTH_KEYS.map((key, i) => {
    const translated = t(`dateInput.months.${key}`, { defaultValue: '' });
    if (translated) return translated;
    return new Intl.DateTimeFormat(lang, { month: 'long' })
      .format(new Date(2000, i, 1))
      .slice(0, MONTH_LABEL_MAX);
  });
  const weekdayNames = WEEKDAY_KEYS.map((key, i) => {
    const translated = t(`dateInput.weekdays.${key}`, { defaultValue: '' });
    if (translated) return translated;
    // 2024-01-01 — dushanba.
    return new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2024, 0, 1 + i));
  });

  // Ko'rilayotgan yil doim ro'yxatda bo'lishi kerak, aks holda `select` bo'sh qoladi.
  const minYear = Math.min(parseIsoDate(min)?.year ?? today.getFullYear() - 100, view.year);
  const maxYear = Math.max(parseIsoDate(max)?.year ?? today.getFullYear() + 10, view.year);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);

  const offset = startOfMonthOffset(view.year, view.month);
  const total = daysInMonth(view.year, view.month);
  const todayIso = dateToIso(today);

  const calendar = open && position && (
    <div
      ref={popupRef}
      id={dialogId}
      role="dialog"
      aria-modal="false"
      aria-label={t('dateInput.openCalendar')}
      className="date-input__calendar"
      style={{ top: position.top, left: position.left, width: CALENDAR_WIDTH }}
    >
      <div className="date-input__calendar-header">
        <button
          type="button"
          className="date-input__nav"
          onClick={() => shiftMonth(-1)}
          aria-label={t('dateInput.previousMonth')}
        >
          ‹
        </button>
        <div className="date-input__selects">
          <select
            className="date-input__select"
            value={view.month}
            onChange={(e) => setView((prev) => ({ ...prev, month: Number(e.target.value) }))}
            aria-label={t('dateInput.month')}
          >
            {monthNames.map((label, index) => (
              <option key={MONTH_KEYS[index]} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="date-input__select"
            value={view.year}
            onChange={(e) => setView((prev) => ({ ...prev, year: Number(e.target.value) }))}
            aria-label={t('dateInput.year')}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="date-input__nav"
          onClick={() => shiftMonth(1)}
          aria-label={t('dateInput.nextMonth')}
        >
          ›
        </button>
      </div>

      <div className="date-input__weekdays">
        {weekdayNames.map((day, index) => (
          <span key={WEEKDAY_KEYS[index]} className="date-input__weekday">
            {day}
          </span>
        ))}
      </div>

      <div className="date-input__grid">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`pad-${i}`} className="date-input__day date-input__day--empty" />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const day = i + 1;
          const dayIso = toIsoDate({ year: view.year, month: view.month, day });
          const outOfRange = !isWithinRange(dayIso, min, max);
          const classes = ['date-input__day'];
          if (dayIso === iso) classes.push('date-input__day--selected');
          if (dayIso === todayIso) classes.push('date-input__day--today');

          return (
            <button
              key={day}
              type="button"
              className={classes.join(' ')}
              onClick={() => selectDay(day)}
              disabled={outOfRange}
              aria-current={dayIso === todayIso ? 'date' : undefined}
              aria-selected={dayIso === iso}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="date-input__calendar-footer">
        <button
          type="button"
          className="date-input__action"
          disabled={!isWithinRange(todayIso, min, max)}
          onClick={() => {
            setView({ year: today.getFullYear(), month: today.getMonth() + 1 });
            setText(isoToDisplay(todayIso));
            emit(todayIso);
            closeCalendar(true);
          }}
        >
          {t('dateInput.today')}
        </button>
        <button
          type="button"
          className="date-input__action"
          onClick={() => {
            setText('');
            emit('');
            closeCalendar(true);
          }}
        >
          {t('dateInput.clear')}
        </button>
      </div>
    </div>
  );

  return (
    <div className={`date-input${disabled ? ' date-input--disabled' : ''}`} ref={wrapperRef}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        className={`date-input__field${className ? ` ${className}` : ''}`}
        style={style}
        title={title}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onChange={(e) => {
          const masked = maskTypedDate(e.target.value);
          setText(masked);
          // To'liq va haqiqiy sana yozilishi bilan qiymat chiqadi va kalendar
          // o'sha oyga o'tadi — blur kutilmaydi.
          const parsed = parseTypedDate(masked);
          if (parsed) {
            const parts = parseIsoDate(parsed);
            if (parts) setView({ year: parts.year, month: parts.month });
            emit(parsed);
          }
        }}
        // Tab bilan kelinganda ham, `autoFocus` bilan ham kalendar o'zi ochiladi.
        onFocus={() => {
          setFocused(true);
          // Kun tanlangach yoki Escape'dan keyingi qaytgan fokus — qayta ochmaymiz.
          if (skipFocusOpenRef.current) {
            skipFocusOpenRef.current = false;
            return;
          }
          openCalendar();
        }}
        // Fokus allaqachon input'da bo'lib, kalendar yopiq qolgan holat uchun
        // (masalan Enter bosilgandan keyin) — bosish yana ochadi.
        onClick={() => {
          if (!open) openCalendar();
        }}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          // Kalendar ichiga bosilganda `commit` qilmaymiz — tanlov o'zi yakunlaydi.
          if (popupRef.current?.contains(next)) return;
          setFocused(false);
          commit();
          onBlur?.();
          // Fokus butunlay chiqib ketsa kalendar ochiq qolmasin. Ikonka tugmasi
          // wrapper ichida — uni bosish `onClick`da yopiladi, bu yerda emas.
          if (!wrapperRef.current?.contains(next)) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            setOpen(false);
          } else if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            openCalendar();
          }
        }}
      />
      <button
        type="button"
        className="date-input__toggle"
        onClick={() => (open ? closeCalendar(true) : openCalendar())}
        disabled={disabled}
        tabIndex={-1}
        aria-label={t('dateInput.openCalendar')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
          <path
            d="M3 10h18M8 3v4M16 3v4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {calendar && createPortal(calendar, document.body)}
    </div>
  );
}

export default DateInput;
