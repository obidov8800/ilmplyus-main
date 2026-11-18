import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { useOptions } from '@/api/options';
import { usePermission } from '@/hooks/usePermission';
import ConfirmModal from '@/components/ConfirmModal';
import { type FilterBarField } from '@/components/FilterBar';
import { type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import ListToolbar from '@/components/ListToolbar';
import { Pagination } from '@/components/Pagination';
import { formatDate } from '@/utils/date';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatMoney, monthI18nKey } from '../payroll-sheets/helpers';
import {
  PER_PAGE,
  isBackendMissing,
  useDeleteDistribution,
  useDistributionAction,
  useDistributionRequests,
  type DistributionRequest,
  type DistributionStatus,
} from './api';
import './payrollDistributionRequests.css';

/* ------------------------------------------------------------------ *
 * Oylik taqsimlash so'rovlari — Moliya bo'limi.
 *
 * Taqsimlash formasida saqlangan yozuv QORALAMA (`draft`) bo'ladi va oylik
 * vedomostga tushmaydi. Ruxsati bor foydalanuvchi (direktor / bosh admin)
 * uni shu yerda tasdiqlaydi (`approved`) — faqat shundan keyin vedomostga
 * tushadi. Tasdiq bekor qilinsa yozuv yana qoralamaga qaytadi.
 *   draft    → «Tasdiqlash»          `payroll_distributions.approve`
 *   approved → «Tasdiqdan qaytarish» `payroll_distributions.revert`
 * Staff ilovasida «O'chirish» yo'q (`utils/deletePolicy`) — qoralamani o'zgartirish
 * yoki o'chirish Admin panelda bajariladi.
 * ------------------------------------------------------------------ */

type FilterKey = 'period' | 'branch_id' | 'department_id' | 'last_name';

const EMPTY_FILTERS: FilterBarValues<FilterKey> = {
  period: '',
  branch_id: '',
  department_id: '',
  last_name: '',
};

const STATUS_TABS: ('' | DistributionStatus)[] = ['', 'draft', 'approved'];

type ConfirmKind = 'approve' | 'revert' | 'delete';
type ConfirmState = { id: number; kind: ConfirmKind; name: string } | null;

/** Faqat nolmas summalar — taqsimlash sxemasiga qarab har xil to'plam keladi. */
function amountLines(row: DistributionRequest, t: (key: string) => string) {
  const all: [string, number][] = [
    [t('payrollDistributionRequests.amounts.totalCashless'), row.total_cashless],
    [t('payrollDistributionRequests.amounts.advanceCashless'), row.advance_cashless],
    [t('payrollDistributionRequests.amounts.advanceCash'), row.advance_cash],
    [t('payrollDistributionRequests.amounts.payoutCashless'), row.payout_cashless],
    [t('payrollDistributionRequests.amounts.payoutCash'), row.payout_cash],
    [t('payrollDistributionRequests.amounts.privileged'), row.privileged_amount],
  ];
  return all.filter(([, value]) => value !== 0);
}

const PayrollDistributionRequests = () => {
  const { t } = useTranslation();
  const canApprove = usePermission('payroll_distributions.approve');
  const canRevert = usePermission('payroll_distributions.revert');

  const [filters, setFilters] = useState<FilterBarValues<FilterKey>>(EMPTY_FILTERS);
  const [status, setStatus] = useState<'' | DistributionStatus>('');
  const [page, setPage] = useState(1);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [detail, setDetail] = useState<DistributionRequest | null>(null);

  const { data: branchOptions = [] } = useOptions('branches');
  const { data: departmentOptions = [] } = useOptions('departments');

  const fields: FilterBarField<FilterKey>[] = [
    { key: 'period', label: t('payrollDistributionRequests.filters.period'), type: 'date' },
    {
      key: 'branch_id',
      label: t('payrollDistributionRequests.filters.branch'),
      type: 'select',
      placeholder: t('payrollDistributionRequests.filters.all'),
      options: branchOptions.map((o) => ({ value: o.id, label: o.label })),
    },
    {
      key: 'department_id',
      label: t('payrollDistributionRequests.filters.department'),
      type: 'select',
      placeholder: t('payrollDistributionRequests.filters.all'),
      options: departmentOptions.map((o) => ({ value: o.id, label: o.label })),
    },
    {
      key: 'last_name',
      label: t('payrollDistributionRequests.filters.lastName'),
      type: 'text',
      placeholder: t('payrollDistributionRequests.filters.lastName'),
    },
  ];

  // "Davr" sanasidan period_year / period_month ajratiladi.
  const requestFilters = useMemo(() => {
    const period = filters.period ?? '';
    const [year, month] = period ? period.split('-') : [];
    return {
      status,
      period_year: year ?? '',
      period_month: month ? String(Number(month)) : '',
      branch_id: filters.branch_id ?? '',
      department_id: filters.department_id ?? '',
      last_name: filters.last_name ?? '',
    };
  }, [filters, status]);

  const { data, isLoading, isError, error } = useDistributionRequests(requestFilters, page);
  const decision = useDistributionAction();
  const remove = useDeleteDistribution();
  const busy = decision.isPending || remove.isPending;

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, data?.lastPage ?? 1);
  const start = (page - 1) * PER_PAGE;

  // Sahifalar soni kamayib qolsa oxirgi mavjud sahifaga qaytamiz (render fazasida).
  const [seenLastPage, setSeenLastPage] = useState(lastPage);
  if (lastPage !== seenLastPage) {
    setSeenLastPage(lastPage);
    if (page > lastPage) setPage(lastPage);
  }

  /** `is_editable === false` bo'lsa o'chirish yashirin (backend ham rad etadi). */

  const runConfirmed = () => {
    if (!confirmState) return;
    const { id, kind } = confirmState;
    const finish = () => setConfirmState(null);

    // Xato xabarini (403 / 422) umumiy interceptor ko'rsatadi — bu yerda takrorlanmaydi.
    if (kind === 'delete') {
      remove.mutate(id, {
        onSuccess: (res) => {
          notifications.show({
            title: t('payrollDistributionRequests.savedTitle'),
            message: res?.message || t('payrollDistributionRequests.deletedMessage'),
            color: 'green',
          });
          setDetail(null);
        },
        onSettled: finish,
      });
      return;
    }

    decision.mutate(
      { id, action: kind },
      {
        onSuccess: (res) => {
          notifications.show({
            title: t('payrollDistributionRequests.savedTitle'),
            // Backend taqsimlash tasdiqlanganda vedomostni o'zi yangilamaydi — qayerda
            // (qayta) generatsiya qilinishi kerakligi shu yerning o'zida eslatiladi.
            message: (
              <>
                {res?.message ||
                  t(
                    kind === 'approve'
                      ? 'payrollDistributionRequests.approvedMessage'
                      : 'payrollDistributionRequests.revertedMessage',
                  )}
                <br />
                {t('payrollDistributionRequests.sheetHint')}
              </>
            ),
            color: kind === 'approve' ? 'green' : 'orange',
            autoClose: 8000,
          });
          setDetail(null);
        },
        onSettled: finish,
      },
    );
  };

  const periodLabel = (row: DistributionRequest) =>
    row.period_year && row.period_month
      ? `${t(monthI18nKey(row.period_month))} ${row.period_year}`
      : '—';
  const kindLabel = (kind: string) =>
    ['advance', 'salary', 'combined'].includes(kind)
      ? t(`payrollDistributionRequests.kind.${kind}`)
      : kind || '—';

  /** Tasdiq ma'lumoti: kim va qachon tasdiqlagan (yoki kutilmoqda). */
  const approvalView = (row: DistributionRequest) =>
    row.status === 'approved' ? (
      <>
        <span className="pdr-name">{row.approved_by || '—'}</span>
        {row.approved_at && <span className="pdr-sub">{formatDate(row.approved_at, '')}</span>}
      </>
    ) : (
      <span className="pdr-sub">{t('payrollDistributionRequests.approval.waiting')}</span>
    );

  const actionButtons = (row: DistributionRequest) => {
    const name = row.employee_name || '-';
    return (
      <>
        {row.status === 'draft' && canApprove && (
          <button
            type="button"
            className="pdr-btn pdr-btn--success"
            disabled={busy}
            onClick={() => setConfirmState({ id: row.id, kind: 'approve', name })}
          >
            {t('payrollDistributionRequests.actions.approve')}
          </button>
        )}
        {row.status === 'approved' && canRevert && (
          <button
            type="button"
            className="pdr-btn pdr-btn--warning"
            disabled={busy}
            onClick={() => setConfirmState({ id: row.id, kind: 'revert', name })}
          >
            {t('payrollDistributionRequests.actions.revert')}
          </button>
        )}
      </>
    );
  };

  const confirmKind = confirmState?.kind ?? 'approve';

  return (
    <div className="pdr-container list-page container">
      <div className="pdr-header">
        <p className="pdr-subtitle">{t('payrollDistributionRequests.subtitle')}</p>
      </div>

      <ListToolbar
        left={
          <div className="list-tabs" role="tablist">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab || 'all'}
                type="button"
                role="tab"
                aria-selected={status === tab}
                className={`list-tab ${status === tab ? 'list-tab--active' : ''}`}
                onClick={() => {
                  setStatus(tab);
                  setPage(1);
                }}
              >
                {tab
                  ? t(`payrollDistributionRequests.status.${tab}`)
                  : t('payrollDistributionRequests.tabs.all')}
              </button>
            ))}
          </div>
        }
        filter={{
          fields,
          values: filters,
          onChange: (v) => {
            setFilters(v);
            setPage(1);
          },
          onReset: () => {
            setFilters(EMPTY_FILTERS);
            setStatus('');
            setPage(1);
          },
          ariaLabel: t('payrollDistributionRequests.title'),
        }}
      />

      <div className="list-table-wrap responsive-table-wrap">
        <table className="list-table pdr-table">
          <thead>
            <tr>
              <th className="list-left">{t('payrollDistributionRequests.table.employee')}</th>
              <th>{t('payrollDistributionRequests.table.period')}</th>
              <th className="list-left">{t('payrollDistributionRequests.table.amounts')}</th>
              <th className="list-left">{t('payrollDistributionRequests.table.approval')}</th>
              <th>{t('payrollDistributionRequests.table.status')}</th>
              <th>{t('payrollDistributionRequests.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="pdr-empty">
                  {t('payrollDistributionRequests.loading')}
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={6} className="pdr-empty">
                  {isBackendMissing(error)
                    ? t('payrollDistributionRequests.backendMissing')
                    : getApiErrorMessage(error, t('payrollDistributionRequests.error'))}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="pdr-empty">
                  {t('payrollDistributionRequests.noData')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="list-left">
                    <span className="pdr-name">{row.employee_name || '-'}</span>
                    <span className="pdr-sub">
                      {[row.department_name, row.position_name].filter(Boolean).join(' · ') ||
                        '—'}
                    </span>
                    {row.branch_name && <span className="pdr-sub">{row.branch_name}</span>}
                  </td>
                  <td>
                    <span className="pdr-name">{periodLabel(row)}</span>
                    <span className="pdr-badge">{kindLabel(row.kind)}</span>
                  </td>
                  <td className="list-left">
                    <ul className="pdr-amounts">
                      {amountLines(row, t).map(([label, value]) => (
                        <li key={label}>
                          <span>{label}</span>
                          <b>{formatMoney(value)}</b>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="list-left">{approvalView(row)}</td>
                  <td>
                    <span className={`pdr-status pdr-status--${row.status}`}>
                      {t(`payrollDistributionRequests.status.${row.status}`)}
                    </span>
                  </td>
                  <td>
                    <div className="pdr-actions">
                      <button
                        type="button"
                        className="pdr-btn pdr-btn--ghost"
                        onClick={() => setDetail(row)}
                      >
                        {t('payrollDistributionRequests.actions.view')}
                      </button>
                      {actionButtons(row)}
                    </div>
                  </td>
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
            {t('payrollDistributionRequests.loading')}
          </div>
        ) : isError ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {isBackendMissing(error)
              ? t('payrollDistributionRequests.backendMissing')
              : getApiErrorMessage(error, t('payrollDistributionRequests.error'))}
          </div>
        ) : rows.length === 0 ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('payrollDistributionRequests.noData')}
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="data-card">
              <div className="data-card__head">
                <span className="data-card__title">{row.employee_name || '-'}</span>
                <span className={`pdr-status pdr-status--${row.status}`}>
                  {t(`payrollDistributionRequests.status.${row.status}`)}
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('payrollDistributionRequests.table.period')}</span>
                <span className="data-card__value">
                  {periodLabel(row)} · {kindLabel(row.kind)}
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">
                  {t('payrollDistributionRequests.detail.deptPosition')}
                </span>
                <span className="data-card__value">
                  {[row.department_name, row.position_name, row.branch_name]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
              </div>
              {amountLines(row, t).map(([label, value]) => (
                <div className="data-card__row" key={label}>
                  <span className="data-card__label">{label}</span>
                  <span className="data-card__value">{formatMoney(value)}</span>
                </div>
              ))}
              <div className="data-card__row">
                <span className="data-card__label">{t('payrollDistributionRequests.table.approval')}</span>
                <span className="data-card__value">
                  {row.status === 'approved'
                    ? [row.approved_by, row.approved_at ? formatDate(row.approved_at, '') : '']
                        .filter(Boolean)
                        .join(' · ') || '—'
                    : t('payrollDistributionRequests.approval.waiting')}
                </span>
              </div>
              <div className="data-card__actions">
                <button
                  type="button"
                  className="pdr-btn pdr-btn--ghost"
                  onClick={() => setDetail(row)}
                >
                  {t('payrollDistributionRequests.actions.view')}
                </button>
                {actionButtons(row)}
              </div>
            </div>
          ))
        )}
      </div>

      {!isLoading && total > 0 && (
        <Pagination
          currentPage={page}
          lastPage={lastPage}
          total={total}
          from={start + 1}
          to={Math.min(start + rows.length, total)}
          onPageChange={setPage}
        />
      )}

      {detail && (
        <div className="pdr-overlay" onClick={() => setDetail(null)}>
          <div
            className="pdr-modal"
            role="dialog"
            aria-modal="true"
            aria-label={detail.employee_name}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pdr-modal-head">
              <h2>{detail.employee_name || '-'}</h2>
              <button
                type="button"
                className="pdr-modal-close"
                onClick={() => setDetail(null)}
                aria-label={t('payrollDistributionRequests.actions.close')}
              >
                ×
              </button>
            </div>
            <div className="pdr-modal-body">
              <dl className="pdr-info">
                {[
                  [
                    t('payrollDistributionRequests.detail.deptPosition'),
                    [detail.department_name, detail.position_name].filter(Boolean).join(' · ') ||
                      '—',
                  ],
                  [t('payrollDistributionRequests.detail.branch'), detail.branch_name || '—'],
                  [t('payrollDistributionRequests.table.period'), periodLabel(detail)],
                  [t('payrollDistributionRequests.detail.kind'), kindLabel(detail.kind)],
                  [
                    t('payrollDistributionRequests.table.status'),
                    t(`payrollDistributionRequests.status.${detail.status}`),
                  ],
                  ...amountLines(detail, t).map(
                    ([label, value]) => [label, `${formatMoney(value)} ${t('payrollSheets.soum')}`],
                  ),
                  [
                    t('payrollDistributionRequests.detail.createdBy'),
                    [detail.created_by, detail.created_at ? formatDate(detail.created_at, '') : '']
                      .filter(Boolean)
                      .join(' · ') || '—',
                  ],
                  ...(detail.note ? [[t('payrollDistributionRequests.detail.note'), detail.note]] : []),
                  ...(detail.status === 'approved'
                    ? [
                        [
                          t('payrollDistributionRequests.detail.approvedBy'),
                          [
                            detail.approved_by,
                            detail.approved_at ? formatDate(detail.approved_at, '') : '',
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—',
                        ],
                      ]
                    : []),
                ].map(([label, value]) => (
                  <div className="pdr-info-row" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="pdr-modal-actions">{actionButtons(detail)}</div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmState}
        title={t(`payrollDistributionRequests.confirm.${confirmKind}Title`)}
        message={t(`payrollDistributionRequests.confirm.${confirmKind}Message`, {
          name: confirmState?.name ?? '',
        })}
        confirmLabel={t(`payrollDistributionRequests.actions.${confirmKind}`)}
        cancelLabel={t('payrollDistributionRequests.confirm.cancel')}
        tone={confirmKind === 'approve' ? 'success' : 'danger'}
        busy={busy}
        onConfirm={runConfirmed}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default PayrollDistributionRequests;
