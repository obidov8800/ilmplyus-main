import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/Pagination';
import {
  useDashboardDetail,
  buildCsv,
  downloadCsv,
  type DetailColumn,
  type DetailRow,
  type SortDir,
} from './useDashboardDetail';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function colSortValue(col: DetailColumn, row: DetailRow): string | number {
  if (col.sortValue) return col.sortValue(row);
  const v = row[col.key];
  if (typeof v === 'number') return v;
  return v == null ? '' : String(v);
}

function colText(col: DetailColumn, row: DetailRow): string {
  const v = row[col.key];
  return v == null ? '' : String(v);
}

/**
 * Panelning "Batafsil / Hammasini ko'rish" oynasi — `index.tsx` da bir marta
 * render qilinadi, `useDashboardDetail` store'i orqali ochiladi. Qidiruv +
 * ustun bo'yicha saralash + CSV eksport + sahifalash. Mobilda pastki-varaq +
 * karta ko'rinishi.
 */
export default function DashboardDetailModal() {
  const { t } = useTranslation();
  const config = useDashboardDetail((s) => s.config);
  const closeDetail = useDashboardDetail((s) => s.closeDetail);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Oyna har ochilganda (config obyekti almashganda) holatni tozalaymiz —
  // render paytida (React tavsiya qilgan "propdan holat" naqshi), effekt emas.
  const [prevConfig, setPrevConfig] = useState(config);
  if (config !== prevConfig) {
    setPrevConfig(config);
    setSearch('');
    setSort(config?.initialSort ?? null);
    setPage(1);
  }

  // Esc bilan yopish + fonni scroll qilmaslik.
  useEffect(() => {
    if (!config) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDetail();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [config, closeDetail]);

  const columns = useMemo(() => config?.columns ?? [], [config]);

  const filtered = useMemo(() => {
    const rows = config?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const getText =
      config?.searchText ?? ((row: DetailRow) => columns.map((c) => colText(c, row)).join(' '));
    return rows.filter((r) => getText(r).toLowerCase().includes(q));
  }, [config, search, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = colSortValue(col, a);
      const vb = colSortValue(col, b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [filtered, sort, columns]);

  const total = sorted.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, lastPage);
  const start = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  if (!config) return null;

  const toggleSort = (col: DetailColumn) => {
    if (col.sortable === false) return;
    setPage(1);
    setSort((prev) => {
      if (prev?.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
      return null;
    });
  };

  const onExport = () => {
    downloadCsv(config.csvName || 'dashboard-detail', buildCsv(columns, sorted));
  };

  return (
    <div
      className="ddm-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && closeDetail()}
    >
      <div className="ddm-modal" role="dialog" aria-modal="true" aria-label={config.title}>
        <div className="ddm-header">
          <h2 className="ddm-title">{config.title}</h2>
          <button className="ddm-close" onClick={closeDetail} aria-label={t('dashboard.detail.close')}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="ddm-toolbar">
          <div className="ddm-search">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('dashboard.detail.searchPlaceholder')}
            />
          </div>
          <button className="ddm-export" onClick={onExport} disabled={total === 0}>
            <i className="fa-solid fa-file-arrow-down" /> {t('dashboard.detail.exportCsv')}
          </button>
        </div>

        <div className="ddm-body">
          {total === 0 ? (
            <div className="dash-empty">{t('dashboard.detail.noResults')}</div>
          ) : (
            <>
              <div className="ddm-table-wrap">
                <table className="data-table ddm-table">
                  <thead>
                    <tr>
                      {columns.map((c) => {
                        const active = sort?.key === c.key;
                        return (
                          <th
                            key={c.key}
                            style={{ textAlign: c.align ?? 'left' }}
                            className={c.sortable === false ? '' : 'ddm-th--sortable'}
                            onClick={() => toggleSort(c)}
                          >
                            {c.label}
                            {active && (
                              <span className="ddm-sort-arrow">
                                {sort?.dir === 'asc' ? ' ▲' : ' ▼'}
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, i) => (
                      <tr key={i}>
                        {columns.map((c) => (
                          <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                            {c.render ? c.render(row) : colText(c, row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ddm-cards">
                {pageRows.map((row, i) => (
                  <div key={i} className="data-card">
                    {columns.map((c) => (
                      <div key={c.key} className="data-card__row">
                        <span className="data-card__label">{c.label}</span>
                        <span className="data-card__value">
                          {c.render ? c.render(row) : colText(c, row)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {total > 0 && (
          <div className="ddm-footer">
            <Pagination
              currentPage={safePage}
              lastPage={lastPage}
              total={total}
              from={total === 0 ? 0 : start + 1}
              to={Math.min(start + pageSize, total)}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          </div>
        )}
      </div>
    </div>
  );
}
