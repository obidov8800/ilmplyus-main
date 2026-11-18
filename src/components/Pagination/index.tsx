import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import './Pagination.css';

/**
 * Butun ilova bo'ylab BITTA sahifalash ko'rinishi — oldin har bir jadval
 * sahifasi (`courses`, `finance`, `groups`, `registration`, `demo-lesson`,
 * `payments`, `contracts`, `users`, h.k.) o'zining alohida, bir-biridan
 * farqli sahifalash kodini yozgan edi (turli matn, turli tugma uslubi,
 * ba'zilarida "Jami" umuman yo'q). Endi hammasi shu yerdan.
 */
export interface PaginationProps {
  /** Joriy sahifa (1 dan boshlanadi). */
  currentPage: number;
  /** Oxirgi sahifa raqami. */
  lastPage: number;
  /** Umumiy yozuvlar soni. */
  total: number;
  /** Joriy sahifadagi birinchi yozuv tartib raqami. */
  from: number;
  /** Joriy sahifadagi oxirgi yozuv tartib raqami. */
  to: number;
  onPageChange: (page: number) => void;
  /** Berilsa — "necha qator" tanlagichi chap tomonda ko'rsatiladi. */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  /** Tanlash variantlari. Default: 10 / 20 / 50 / 100. */
  pageSizeOptions?: number[];
}

/**
 * Ko'rsatiladigan sahifa raqamlari: kam bo'lsa (<=7) hammasi, ko'p bo'lsa
 * birinchi, oxirgi va joriy sahifa atrofidagi oyna + '...' bilan.
 */
function buildPageList(currentPage: number, lastPage: number): (number | '...')[] {
  if (lastPage <= 7) return Array.from({ length: lastPage }, (_, i) => i + 1);

  const pages: (number | '...')[] = [1];

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(lastPage - 1, currentPage + 1);

  // Chegara shartlari ilgari bittaga siljigan edi: masalan 10 sahifadan 4-sinda
  // turganda «1 · 3 4 5 … 10» chiqib, 2-sahifaga bevosita o'tib bo'lmasdi (raqam ham,
  // «…» ham yo'q). Endi oradagi bitta sahifa «…» o'rniga o'zi ko'rsatiladi.
  if (start > 2) pages.push(start === 3 ? 2 : '...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < lastPage - 1) pages.push(end === lastPage - 2 ? lastPage - 1 : '...');

  pages.push(lastPage);
  return pages;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function Pagination({
  currentPage,
  lastPage,
  total,
  from,
  to,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  const { t } = useTranslation();
  const pages = useMemo(() => buildPageList(currentPage, lastPage), [currentPage, lastPage]);

  // Joriy `pageSize` variantlar ro'yxatida bo'lmasa ham ko'rsatilsin.
  const sizeOptions =
    pageSize != null && !pageSizeOptions.includes(pageSize)
      ? [...pageSizeOptions, pageSize].sort((a, b) => a - b)
      : pageSizeOptions;

  return (
    <div className="app-pagination">
      <div className="app-pagination__left">
        {onPageSizeChange && pageSize != null && (
          <label className="app-pagination__size">
            {t('pagination.perPage', { defaultValue: 'Ko‘rsatish' })}:
            <select
              className="app-pagination__size-select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {sizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="app-pagination__info">
          {t('pagination.total')}: {total} {t('pagination.from')} {from}-{to} {t('pagination.to')}{' '}
          {t('pagination.showing')}
        </span>
      </div>

      <div className="app-pagination__controls">
        <button
          type="button"
          className="app-pagination__btn"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label={t('pagination.prev')}
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`el-${i}`} className="app-pagination__ellipsis">
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`app-pagination__btn${currentPage === p ? ' app-pagination__btn--active' : ''}`}
              onClick={() => onPageChange(p)}
              aria-current={currentPage === p ? 'page' : undefined}
              aria-label={`${p}-sahifa`}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          className="app-pagination__btn"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= lastPage}
          aria-label={t('pagination.next')}
        >
          ›
        </button>
      </div>
    </div>
  );
}

export default Pagination;
