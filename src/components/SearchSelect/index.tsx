import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './SearchSelect.css';

export interface SearchSelectOption {
  value: string;
  label: string;
}

interface SearchSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

export default function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
}: SearchSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Ochilganda qidiruvni tozalab, tanlangan variantdan boshlaymiz.
  const openDropdown = () => {
    setQuery('');
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Klaviatura bilan yurilganda aktiv variant ko'rinib turishi uchun.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      openDropdown();
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filtered[highlight];
      if (option) select(option.value);
    }
  };

  return (
    <div
      className={`ss-container${disabled ? ' ss-container--disabled' : ''}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className={`ss-trigger${open ? ' ss-trigger--open' : ''}`}
        onClick={() => {
          if (disabled) return;
          if (open) setOpen(false);
          else openDropdown();
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`ss-value${selected ? '' : ' ss-value--placeholder'}`}>
          {selected ? selected.label : placeholder ?? t('searchSelect.search')}
        </span>
        <svg className="ss-arrow" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2 4l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="ss-panel">
          <div className="ss-search">
            <input
              ref={searchRef}
              className="ss-search__input"
              value={query}
              placeholder={searchPlaceholder ?? t('searchSelect.search')}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
            />
          </div>

          <div className="ss-list" ref={listRef} role="listbox">
            {placeholder && !query && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={`ss-option ss-option--placeholder${!value ? ' ss-option--selected' : ''}`}
                onClick={() => select('')}
              >
                {placeholder}
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="ss-empty">{t('searchSelect.noData')}</div>
            ) : (
              filtered.map((option, i) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  data-highlighted={i === highlight}
                  className={`ss-option${option.value === value ? ' ss-option--selected' : ''}${
                    i === highlight ? ' ss-option--highlighted' : ''
                  }`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => select(option.value)}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
