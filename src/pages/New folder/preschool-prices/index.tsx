import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import '@/styles/preschool.css';
import { useOptions } from '@/api/options';
import {
  PRICE_STATUSES,
  PRICE_STATUS_PERMISSION,
  changePreschoolPriceStatus,
  createPreschoolPrice,
  fetchPreschoolPrices,
  formatSum,
  isPriceActive,
  priceStatus,
  type PreschoolPrice,
} from '@/api/preschool';
import PriceStatusModal from '@/components/PriceStatusModal';
import { type FilterBarField } from '@/components/FilterBar';
import { type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import ConfirmModal from '@/components/ConfirmModal';
import ListToolbar from '@/components/ListToolbar';
import { Pagination } from '@/components/Pagination';
import { Protected } from '@/components/Protected';
import { usePermission } from '@/hooks/usePermission';
import { formatDateTime } from '@/utils/date';
import { getLocalized } from '@/utils/getLocalized';

/*
 * Maktabga tayyorlov filiallari ta'lim narxi: o'quv yili + filial bo'yicha oylik narx.
 * Filial tanlanmasa — shu yildagi barcha maktabga tayyorlov filiallar uchun umumiy narx. Davomat jurnalidagi oylik to'lov
 * holati (to'langan / qisman / to'lanmagan) shu narx bilan solishtiriladi.
 *
 * Bu panelda narxlar ko'rinadi va yangisi qo'shiladi; tahrirlash va o'chirish/tiklash — Admin panelda.
 */

type FilterKey = 'year' | 'branch' | 'status' | 'active';

const NO_PRICES: PreschoolPrice[] = [];

const PreschoolPrices = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const [yearFilter, setYearFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [formOpen, setFormOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<PreschoolPrice | null>(null);
  const [statusTarget, setStatusTarget] = useState<PreschoolPrice | null>(null);

  const canChangeStatus = usePermission(PRICE_STATUS_PERMISSION);

  const { data: years } = useOptions('academic_years');
  const { data: activeYears } = useOptions('academic_years', { status: 'active' });
  const { data: branches } = useOptions('branches', { type: 'preschool' });

  const { data: prices = NO_PRICES, isLoading } = useQuery<PreschoolPrice[]>({
    queryKey: ['preschool-prices'],
    queryFn: fetchPreschoolPrices,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['preschool-prices'] });

  // Holat va «Faol» ustunlari hamda tugmalar faqat backend `status` bersa chiqadi
  const hasWorkflow = prices.some((p) => priceStatus(p) !== null);
  const showActions = hasWorkflow && canChangeStatus;
  const colCount = 7 + (hasWorkflow ? 2 : 0) + (showActions ? 1 : 0);

  const approveMutation = useMutation({
    mutationFn: (id: number) => changePreschoolPriceStatus(id, 'approved'),
    onSuccess: () => {
      setApproveTarget(null);
      refresh();
    },
  });

  const yearName = (p: PreschoolPrice) =>
    p.academic_year?.name ?? years?.find((y) => y.id === p.academic_year_id)?.label ?? '—';

  const branchName = (p: PreschoolPrice) =>
    !p.branch_id
      ? t('preschoolPrices.general')
      : p.branch
        ? getLocalized(p.branch, 'name', i18n.language)
        : (branches?.find((b) => b.id === p.branch_id)?.label ?? '—');

  const priceParams = (p: PreschoolPrice) => ({
    price: formatSum(p.monthly_price),
    year: yearName(p),
    branch: branchName(p),
  });

  const statusBadge = (p: PreschoolPrice) => {
    const status = priceStatus(p);
    return status ? (
      <span className={`pp-status pp-status--${status}`} title={p.status_reason ?? undefined}>
        {t(`preschoolPrices.statuses.${status}`)}
      </span>
    ) : null;
  };

  const activeBadge = (p: PreschoolPrice) => (
    <span className={`pp-status ${isPriceActive(p) ? 'pp-status--approved' : 'pp-status--inactive'}`}>
      {t(isPriceActive(p) ? 'preschoolPrices.active' : 'preschoolPrices.inactive')}
    </span>
  );

  const rowActions = (p: PreschoolPrice) => {
    const status = priceStatus(p);
    return (
      <span className="pp-row-actions">
        {canChangeStatus && status === 'pending' && (
          <button
            type="button"
            className="pp-act pp-act--approve"
            title={t('preschoolPrices.approveAction')}
            aria-label={t('preschoolPrices.approveAction')}
            onClick={() => setApproveTarget(p)}
          >
            <i className="fa-solid fa-check" />
          </button>
        )}
        {canChangeStatus && status !== null && (
          <button
            type="button"
            className="pp-act pp-act--status"
            title={t('preschoolPrices.statusAction')}
            aria-label={t('preschoolPrices.statusAction')}
            onClick={() => setStatusTarget(p)}
          >
            <i className="fa-solid fa-right-left" />
          </button>
        )}
      </span>
    );
  };

  const filtered = useMemo(
    () =>
      prices
        .filter((p) => !yearFilter || String(p.academic_year_id) === yearFilter)
        .filter((p) =>
          !branchFilter ? true : branchFilter === 'general' ? !p.branch_id : String(p.branch_id) === branchFilter,
        )
        .filter((p) => !statusFilter || priceStatus(p) === statusFilter)
        .filter((p) => !activeFilter || (activeFilter === 'active') === isPriceActive(p))
        .sort((a, b) => b.id - a.id),
    [prices, yearFilter, branchFilter, statusFilter, activeFilter],
  );

  const total = filtered.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, lastPage);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const filterValues: FilterBarValues<FilterKey> = {
    year: yearFilter,
    branch: branchFilter,
    status: statusFilter,
    active: activeFilter,
  };
  const filterFields: FilterBarField<FilterKey>[] = [
    {
      key: 'year',
      label: t('preschoolPrices.year'),
      type: 'select',
      placeholder: t('preschoolPrices.allYears'),
      options: (years ?? []).map((y) => ({ value: y.id, label: y.label })),
    },
    {
      key: 'branch',
      label: t('preschoolPrices.branch'),
      type: 'select',
      placeholder: t('preschoolPrices.allBranches'),
      options: [
        { value: 'general', label: t('preschoolPrices.general') },
        ...(branches ?? []).map((b) => ({ value: b.id, label: b.label })),
      ],
    },
    ...(hasWorkflow
      ? ([
          {
            key: 'status',
            label: t('preschoolPrices.statusLabel'),
            type: 'select',
            placeholder: t('preschoolPrices.allStatuses'),
            options: PRICE_STATUSES.map((s) => ({ value: s, label: t(`preschoolPrices.statuses.${s}`) })),
          },
          {
            key: 'active',
            label: t('preschoolPrices.activeLabel'),
            type: 'select',
            placeholder: t('preschoolPrices.allActivity'),
            options: [
              { value: 'active', label: t('preschoolPrices.active') },
              { value: 'inactive', label: t('preschoolPrices.inactive') },
            ],
          },
        ] as FilterBarField<FilterKey>[])
      : []),
  ];
  const changeFilters = (v: FilterBarValues<FilterKey>) => {
    setYearFilter(v.year);
    setBranchFilter(v.branch);
    setStatusFilter(v.status);
    setActiveFilter(v.active);
    setPage(1);
  };

  return (
    <div className="pp-page list-page container">
      <ListToolbar
        filter={{
          fields: filterFields,
          values: filterValues,
          onChange: changeFilters,
          onReset: () => changeFilters({ year: '', branch: '', status: '', active: '' }),
          ariaLabel: t('preschoolPrices.listTitle'),
        }}
      >
        <Protected permission="preschool_prices.create">
          <button className="btn-accent" type="button" onClick={() => setFormOpen(true)}>
            {t('preschoolPrices.addNew')}
          </button>
        </Protected>
      </ListToolbar>

      <div className="list-table-wrap responsive-table-wrap">
        <table className="list-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t('preschoolPrices.year')}</th>
              <th>{t('preschoolPrices.branch')}</th>
              <th>{t('preschoolPrices.price')}</th>
              {hasWorkflow && <th>{t('preschoolPrices.statusLabel')}</th>}
              {hasWorkflow && <th>{t('preschoolPrices.activeLabel')}</th>}
              <th>{t('preschoolPrices.description')}</th>
              <th>{t('preschoolPrices.creator')}</th>
              <th>{t('preschoolPrices.createdAt')}</th>
              {showActions && <th>{t('preschoolPrices.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={colCount}>{t('preschoolPrices.loading')}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount}>{t('preschoolPrices.notFound')}</td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{yearName(p)}</td>
                  <td>{branchName(p)}</td>
                  <td className="pp-money">
                    {formatSum(p.monthly_price)} {t('preschoolPrices.currency')}
                  </td>
                  {hasWorkflow && <td>{statusBadge(p) ?? '—'}</td>}
                  {hasWorkflow && <td>{activeBadge(p)}</td>}
                  <td>{p.description || '—'}</td>
                  <td>{p.creator?.full_name || '—'}</td>
                  <td>{formatDateTime(p.created_at, '—')}</td>
                  {showActions && <td>{rowActions(p)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
      <div className="responsive-cards">
        {isLoading ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('preschoolPrices.loading')}
          </div>
        ) : rows.length === 0 ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('preschoolPrices.notFound')}
          </div>
        ) : (
          rows.map((p) => (
            <div key={p.id} className="data-card">
              <div className="data-card__head">
                <span className="data-card__title">{yearName(p)}</span>
                <span className="pp-money">
                  {formatSum(p.monthly_price)} {t('preschoolPrices.currency')}
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('preschoolPrices.branch')}</span>
                <span className="data-card__value">{branchName(p)}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('preschoolPrices.description')}</span>
                <span className="data-card__value">{p.description || '—'}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('preschoolPrices.creator')}</span>
                <span className="data-card__value">{p.creator?.full_name || '—'}</span>
              </div>
              {hasWorkflow && (
                <div className="data-card__row">
                  <span className="data-card__label">{t('preschoolPrices.statusLabel')}</span>
                  <span className="data-card__value">{statusBadge(p) ?? '—'}</span>
                </div>
              )}
              {hasWorkflow && (
                <div className="data-card__row">
                  <span className="data-card__label">{t('preschoolPrices.activeLabel')}</span>
                  <span className="data-card__value">{activeBadge(p)}</span>
                </div>
              )}
              {showActions && <div className="data-card__row">{rowActions(p)}</div>}
            </div>
          ))
        )}
      </div>

      {total > 0 && (
        <Pagination
          currentPage={safePage}
          lastPage={lastPage}
          total={total}
          from={(safePage - 1) * pageSize + 1}
          to={Math.min(safePage * pageSize, total)}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <ConfirmModal
        open={approveTarget !== null}
        title={t('preschoolPrices.approveTitle')}
        message={approveTarget ? t('preschoolPrices.approveMessage', priceParams(approveTarget)) : ''}
        confirmLabel={t('preschoolPrices.approveAction')}
        cancelLabel={t('preschoolPrices.cancel')}
        tone="success"
        busy={approveMutation.isPending}
        onConfirm={() => approveTarget && approveMutation.mutate(approveTarget.id)}
        onCancel={() => setApproveTarget(null)}
      />

      {statusTarget && (
        <PriceStatusModal
          price={statusTarget}
          summary={`${priceParams(statusTarget).price} ${t('preschoolPrices.currency')} · ${priceParams(statusTarget).year} · ${priceParams(statusTarget).branch}`}
          onClose={() => setStatusTarget(null)}
          onSaved={() => {
            setStatusTarget(null);
            refresh();
          }}
        />
      )}

      {formOpen && (
        <PriceForm
          years={(years ?? []).map((y) => ({ id: y.id, label: y.label }))}
          defaultYearId={activeYears?.[0] ? String(activeYears[0].id) : ''}
          branches={(branches ?? []).map((b) => ({ id: b.id, label: b.label }))}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            refresh();
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
};

// ── Yangi narx ───────────────────────────────────────────────────────────────

interface PriceFormProps {
  years: { id: number; label: string }[];
  defaultYearId: string;
  branches: { id: number; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function PriceForm({ years, defaultYearId, branches, onClose, onSaved }: PriceFormProps) {
  const { t } = useTranslation();
  const [yearId, setYearId] = useState(defaultYearId);
  const [branchId, setBranchId] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showErrors, setShowErrors] = useState(false);

  const invalid = !yearId || price.trim() === '' || Number(price) < 0;

  const save = useMutation({
    mutationFn: () =>
      createPreschoolPrice({
        academic_year_id: Number(yearId),
        branch_id: branchId ? Number(branchId) : null,
        monthly_price: Number(price),
        description: description.trim() || null,
        is_active: isActive,
      }),
    onSuccess: onSaved,
  });

  const submit = () => {
    if (invalid) {
      setShowErrors(true);
      notifications.show({ color: 'yellow', message: t('preschoolPrices.fillRequired') });
      return;
    }
    save.mutate();
  };

  return (
    <div className="pp-overlay">
      <div className="pp-modal" role="dialog" aria-modal="true">
        <h3 className="pp-title">{t('preschoolPrices.addTitle')}</h3>

        <form
          className="pp-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className={`pp-field${showErrors && !yearId ? ' pp-field--invalid' : ''}`}>
            <label>{t('preschoolPrices.year')}</label>
            <select value={yearId} onChange={(e) => setYearId(e.target.value)}>
              <option value="">{t('preschoolPrices.choose')}</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pp-field">
            <label>{t('preschoolPrices.branch')}</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">{t('preschoolPrices.generalOption')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <span className="pp-hint">{t('preschoolPrices.branchHint')}</span>
          </div>

          <div
            className={`pp-field${showErrors && (price.trim() === '' || Number(price) < 0) ? ' pp-field--invalid' : ''}`}
          >
            <label>
              {t('preschoolPrices.price')} ({t('preschoolPrices.currency')})
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div className="pp-field">
            <label>{t('preschoolPrices.description')}</label>
            <textarea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="pp-check-row">
            <label>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span>{t('preschoolPrices.activeLabel')}</span>
            </label>
          </div>
          <span className="pp-hint">{t('preschoolPrices.activeHint')}</span>

          <div className="pp-actions">
            <button type="submit" className="pp-btn pp-btn--primary" disabled={save.isPending}>
              {save.isPending ? t('preschoolPrices.saving') : t('preschoolPrices.save')}
            </button>
            <button type="button" className="pp-btn pp-btn--cancel" onClick={onClose}>
              {t('preschoolPrices.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PreschoolPrices;
