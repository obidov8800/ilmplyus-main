import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import FilterBar, { type FilterBarField } from '@/components/FilterBar';
import { countFilterBarValues, type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import FilterButton from '@/components/FilterButton';

interface ListToolbarProps<K extends string> {
  /** Chap tomon: davr/filial tanlagichi, status tablari — doim ko'rinib turadigan boshqaruv. */
  left?: ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /**
   * Berilsa — "Saralash" tugmasi chiqadi va bosilganda toolbar ostida filtr paneli
   * ochiladi (yana bosilsa yoki × bosilsa yopiladi). Panel sukut bo'yicha yopiq.
   */
  filter?: {
    fields: FilterBarField<K>[];
    values: FilterBarValues<K>;
    onChange: (values: FilterBarValues<K>) => void;
    onReset: () => void;
    ariaLabel?: string;
  };
  /** O'ngdagi asosiy tugma (to'q sariq `btn-accent`), odatda `<Protected>` ichida. */
  children?: ReactNode;
}

/**
 * Moliya ro'yxat sahifalari uchun bir xil yuqori qator — "Hisobotlar" / "Qarzlar"
 * sahifalaridagi namuna: `[qidiruv] [Saralash] [asosiy tugma]`, filtrlar esa
 * "Saralash" bosilgandan keyingina chiqadi. Maydonlar ro'yxatini va filtrlash
 * mantiqini sahifaning o'zi beradi; ko'rinish va ochish/yopish shu yerda.
 *
 * Stil: `styles/consistency.css` (`.page-toolbar`, `.list-*`) — global, shuning
 * uchun alohida CSS fayl yo'q.
 */
export default function ListToolbar<K extends string = string>({
  left,
  search,
  filter,
  children,
}: ListToolbarProps<K>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const activeCount = filter ? countFilterBarValues(filter.values) : 0;

  return (
    <>
      <div className="page-toolbar list-toolbar">
        {left && <div className="list-toolbar__left">{left}</div>}

        {search && (
          <div className="page-toolbar__search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              type="text"
              value={search.value}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              onChange={(e) => search.onChange(e.target.value)}
            />
          </div>
        )}

        {filter && (
          <FilterButton
            onClick={() => setOpen((v) => !v)}
            active={open || activeCount > 0}
            expanded={open}
            count={activeCount}
          />
        )}

        {children}
      </div>

      {filter && open && (
        <div className="list-filter-card">
          <FilterBar
            fields={filter.fields}
            values={filter.values}
            onChange={filter.onChange}
            onReset={filter.onReset}
            onClose={() => setOpen(false)}
            ariaLabel={filter.ariaLabel ?? t('filterDropdown.sort')}
          />
        </div>
      )}
    </>
  );
}
