import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { useOptions } from '@/api/options';
import { Protected } from '@/components/Protected';
import { Pagination } from '@/components/Pagination';
import { usePermission } from '@/hooks/usePermission';
import useAuthStore from '@/store/useAuthStore';
import ConfirmModal from '@/components/ConfirmModal';
import { type FilterBarField } from '@/components/FilterBar';
import { type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import ListToolbar from '@/components/ListToolbar';
import { formatDate } from '@/utils/date';
import { isAdminUser } from '@/utils/isAdminUser';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyError, notifySuccess, notifyWarning } from '@/utils/notify';
import { useCloseAllShifts, useReports, useWorkflowAction, type ReportsFilters } from './api';
import {
  ACTION_PERMISSION,
  formatMoney,
  isActionAvailable,
  statusClass,
  statusI18nKey,
} from './helpers';
import type { DailyCashReport, WorkflowAction } from './types';
import DetailsModal from './DetailsModal';
import CorrectModal from './CorrectModal';
import './dailyCashReports.css';

/* ------------------------------------------------------------------ *
 * Kunlik kassa hisobotlari (Tushumlar hisobotlari) — Moliya bo'limi.
 * KIRIM (naqd/karta/QR) va CHIQIM (balans/naqd/qoldiq) guruhlangan jadval;
 * smena yopish, tasdiqlash zanjiri (send/accept/approve/return/correct).
 * ------------------------------------------------------------------ */

const STATUS_OPTIONS = [
  'created',
  'sent',
  'assistant_accepted',
  'accountant_approved',
  'returned',
  'finalized',
] as const;

type FilterKey = 'date' | 'branch_id' | 'status';

/** Details modali qaysi tabда ochilishi. */
type DetailsTab = 'balance' | 'expenses' | 'remainder';

/** Bir xil xabarli filiallarni birlashtiradi: «Xabar — A, B, C». */
function groupLines(items: { branch: string; message: string }[], fallback: string): string {
  const groups = new Map<string, string[]>();
  for (const { branch, message } of items) {
    const key = message || fallback;
    groups.set(key, [...(groups.get(key) ?? []), branch]);
  }
  return [...groups].map(([message, names]) => `${message} \u2014 ${names.join(', ')}`).join('\n');
}

type ConfirmState = {
  report: DailyCashReport;
  action: Exclude<WorkflowAction, 'correct'>;
} | null;

const DailyCashReports = () => {
  const { t } = useTranslation();
  const { data: branches = [] } = useOptions('branches');
  const workflow = useWorkflowAction();

  const canView = usePermission('daily_cash_reports.view');
  // Bir nechta filialga biriktirilgan foydalanuvchi filialni tanlay oladi (`branches` allaqachon shu filiallar bilan
  // cheklangan); bitta filialli foydalanuvchida filtr yashirin va so'rov shu filialga qotiriladi.
  const canPickBranch = branches.length > 1;
  const ownBranchId = useAuthStore((s) => s.user?.branch_id);

  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);

  const [detailsReport, setDetailsReport] = useState<DailyCashReport | null>(null);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>('balance');
  const [correctReport, setCorrectReport] = useState<DailyCashReport | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  // Hisobotni kerakli tabда ochish (raqamга yoki summaга bosilганда).
  const openDetails = (report: DailyCashReport, tab: DetailsTab = 'balance') => {
    setDetailsTab(tab);
    setDetailsReport(report);
  };

  const effectiveBranchId = canPickBranch ? branchId : (branches[0] ? String(branches[0].id) : ownBranchId ? String(ownBranchId) : '');

  // «Smenani yopish» — oynasiz: bosilishi bilan foydalanuvchi ishlay oladigan HAMMA filialning (bugungi) smenasi yopiladi.
  // Faqat o'ziga biriktirilgan filiallar (admin — hammasi); backend ham shuni tekshiradi.
  const authUser = useAuthStore((s) => s.user);
  const closeAll = useCloseAllShifts();
  const assignedBranchIds = new Set(
    (authUser?.branches?.length ? authUser.branches.map((b) => b.id) : ownBranchId ? [ownBranchId] : []).map(Number),
  );
  const closableBranches =
    isAdminUser(authUser) || assignedBranchIds.size === 0
      ? branches
      : branches.filter((b) => assignedBranchIds.has(Number(b.id)));

  const closeShifts = () => {
    if (closeAll.isPending) return;
    if (closableBranches.length === 0) {
      notifyWarning(t('dailyCashReports.closeShift.noBranches'));
      return;
    }
    closeAll.mutate(
      closableBranches.map((b) => ({ id: Number(b.id), label: b.label })),
      {
        onSuccess: ({ closed, skipped, failed }) => {
          const fallback = t('dailyCashReports.closeShift.errorMessage');
          if (closed.length) {
            notifySuccess(
              t('dailyCashReports.closeShift.closedMessage', { branches: closed.join(', ') }),
              t('dailyCashReports.closeShift.savedTitle'),
            );
          }
          if (skipped.length) {
            notifyWarning(groupLines(skipped, fallback), t('dailyCashReports.closeShift.skippedTitle'));
          }
          if (failed.length) {
            notifyError(groupLines(failed, fallback), t('dailyCashReports.errorTitle'));
          }
        },
      },
    );
  };

  const filters: ReportsFilters = useMemo(
    () => ({ branch_id: effectiveBranchId, status, date }),
    [effectiveBranchId, status, date],
  );

  const { data, isLoading, isError } = useReports(filters, page);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, data?.lastPage ?? 1);

  const filterValues: FilterBarValues<FilterKey> = { date, branch_id: branchId, status };
  const filterFields: FilterBarField<FilterKey>[] = [
    { key: 'date', label: t('dailyCashReports.filters.date'), type: 'date' },
    {
      key: 'branch_id',
      label: t('dailyCashReports.filters.branch'),
      type: 'select',
      placeholder: t('dailyCashReports.filters.allBranches'),
      options: branches.map((b) => ({ value: b.id, label: b.label })),
      // Bitta filialli foydalanuvchi uchun filial filtri yo'q.
      hidden: !canPickBranch,
    },
    {
      key: 'status',
      label: t('dailyCashReports.filters.status'),
      type: 'select',
      placeholder: t('dailyCashReports.filters.all'),
      options: STATUS_OPTIONS.map((st) => ({ value: st, label: t(statusI18nKey(st)) })),
    },
  ];
  const changeFilters = (v: FilterBarValues<FilterKey>) => {
    setDate(v.date);
    setBranchId(v.branch_id);
    setStatus(v.status);
    setPage(1);
  };

  const runConfirmed = (state: NonNullable<ConfirmState>, reason?: string) => {
    workflow.mutate(
      { id: state.report.id, action: state.action, reason },
      {
        onSuccess: () => {
          notifications.show({
            title: t('dailyCashReports.savedTitle'),
            message: t(`dailyCashReports.actionDone.${state.action}`),
            color: state.action === 'return' ? 'orange' : 'green',
          });
        },
        onError: (error) => {
          notifications.show({
            title: t('dailyCashReports.errorTitle'),
            message: getApiErrorMessage(error, t('dailyCashReports.actionError')),
            color: 'red',
          });
        },
        onSettled: () => setConfirmState(null),
      },
    );
  };

  // Bitta qatorning workflow tugmalari — statusга va ruxsatga qarab.
  const renderActions = (report: DailyCashReport) => {
    const rowBusy =
      (workflow.isPending && workflow.variables?.id === report.id) || undefined;

    const actionBtn = (action: WorkflowAction, cls: string) =>
      isActionAvailable(action, report.status) && (
        <Protected permission={ACTION_PERMISSION[action]}>
          <button
            className={`dcr-btn dcr-btn--sm ${cls}`}
            disabled={rowBusy}
            onClick={() =>
              action === 'correct'
                ? setCorrectReport(report)
                : setConfirmState({ report, action })
            }
          >
            {t(`dailyCashReports.actions.${action}`)}
          </button>
        </Protected>
      );

    return (
      <div className="dcr-actions">
        <button className="dcr-btn dcr-btn--sm dcr-btn--ghost" onClick={() => openDetails(report)}>
          {t('dailyCashReports.actions.view')}
        </button>
        {actionBtn('send', 'dcr-btn--primary')}
        {actionBtn('accept', 'dcr-btn--primary')}
        {actionBtn('approve', 'dcr-btn--success')}
        {actionBtn('return', 'dcr-btn--warning')}
        {actionBtn('correct', 'dcr-btn--warning')}
      </div>
    );
  };

  if (!canView) {
    return (
      <div className="dcr-container container">
        <p className="dcr-forbidden">{t('dailyCashReports.forbidden')}</p>
      </div>
    );
  }

  return (
    <div className="dcr-container list-page container">
      <div className="dcr-header">
        <p className="dcr-subtitle">{t('dailyCashReports.subtitle')}</p>
      </div>

      <ListToolbar
        filter={{
          fields: filterFields,
          values: filterValues,
          onChange: changeFilters,
          onReset: () => changeFilters({ date: '', branch_id: '', status: '' }),
          ariaLabel: t('dailyCashReports.title'),
        }}
      >
        <Protected permission="daily_cash_reports.close_shift">
          <button type="button" className="btn-accent" disabled={closeAll.isPending} onClick={closeShifts}>
            <span className="dcr-lock" aria-hidden>
              🔒
            </span>
            {closeAll.isPending ? t('dailyCashReports.closeShift.closing') : t('dailyCashReports.closeShift.button')}
          </button>
        </Protected>
      </ListToolbar>

      {/* Jadval */}
      <div className="list-table-wrap responsive-table-wrap">
        <table className="list-table dcr-table">
          <thead>
            <tr>
              <th rowSpan={2}>№</th>
              <th rowSpan={2}>{t('dailyCashReports.columns.reportNumber')}</th>
              <th rowSpan={2}>{t('dailyCashReports.columns.date')}</th>
              <th rowSpan={2}>{t('dailyCashReports.columns.branch')}</th>
              <th rowSpan={2}>{t('dailyCashReports.columns.cashier')}</th>
              <th colSpan={3} className="dcr-group dcr-group--income">
                {t('dailyCashReports.columns.income')}
              </th>
              <th colSpan={3} className="dcr-group dcr-group--expense">
                {t('dailyCashReports.columns.expense')}
              </th>
              <th rowSpan={2}>{t('dailyCashReports.columns.status')}</th>
              <th rowSpan={2}>{t('dailyCashReports.columns.actions')}</th>
            </tr>
            <tr>
              <th className="dcr-sub dcr-sub--income">{t('dailyCashReports.columns.cash')}</th>
              <th className="dcr-sub dcr-sub--income">{t('dailyCashReports.columns.card')}</th>
              <th className="dcr-sub dcr-sub--income">{t('dailyCashReports.columns.qr')}</th>
              <th className="dcr-sub dcr-sub--expense">
                {t('dailyCashReports.columns.expenseBalance')}
              </th>
              <th className="dcr-sub dcr-sub--expense">
                {t('dailyCashReports.columns.cashExpense')}
              </th>
              <th className="dcr-sub dcr-sub--expense">
                {t('dailyCashReports.columns.remainder')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={13} className="dcr-empty">
                  {t('dailyCashReports.loading')}
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={13} className="dcr-empty">
                  {t('dailyCashReports.error')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="dcr-empty">
                  {t('dailyCashReports.emptyHint')}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>
                    {/* Hisobot raqamiga bosilganda hisobot ochiladi (TZ). */}
                    <button
                      type="button"
                      className="dcr-link"
                      onClick={() => openDetails(r)}
                    >
                      {r.report_number}
                    </button>
                  </td>
                  <td>{formatDate(r.report_date)}</td>
                  <td>{r.branch?.name_uz ?? '—'}</td>
                  <td>{r.cashier?.full_name ?? '—'}</td>
                  <td className="dcr-num">{formatMoney(r.cash_income)}</td>
                  <td className="dcr-num">{formatMoney(r.card_income)}</td>
                  <td className="dcr-num">{formatMoney(r.qr_income)}</td>
                  {/* Har bir summa yonida «Batafsil» — mos tabни ochadi (TZ 7-band). */}
                  <td className="dcr-num">
                    <button
                      type="button"
                      className="dcr-link"
                      onClick={() => openDetails(r, 'balance')}
                    >
                      {formatMoney(r.expense_balance_total)}
                    </button>
                  </td>
                  <td className="dcr-num">
                    <button
                      type="button"
                      className="dcr-link"
                      onClick={() => openDetails(r, 'expenses')}
                    >
                      {formatMoney(r.cash_expense)}
                    </button>
                  </td>
                  <td className="dcr-num dcr-strong">
                    <button
                      type="button"
                      className="dcr-link dcr-link--strong"
                      onClick={() => openDetails(r, 'remainder')}
                    >
                      {formatMoney(r.remainder_total)}
                    </button>
                  </td>
                  <td>
                    <span className={`dcr-status ${statusClass(r.status)}`}>
                      {t(statusI18nKey(r.status))}
                    </span>
                  </td>
                  <td>{renderActions(r)}</td>
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
            {t('dailyCashReports.loading')}
          </div>
        ) : isError ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('dailyCashReports.error')}
          </div>
        ) : rows.length === 0 ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('dailyCashReports.emptyHint')}
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="data-card">
              <div className="data-card__head">
                <button type="button" className="dcr-link data-card__title" onClick={() => openDetails(r)}>
                  №{r.report_number}
                </button>
                <span className={`dcr-status ${statusClass(r.status)}`}>
                  {t(statusI18nKey(r.status))}
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('dailyCashReports.columns.date')}</span>
                <span className="data-card__value">{formatDate(r.report_date)}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('dailyCashReports.columns.branch')}</span>
                <span className="data-card__value">{r.branch?.name_uz ?? '—'}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('dailyCashReports.columns.cashier')}</span>
                <span className="data-card__value">{r.cashier?.full_name ?? '—'}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('dailyCashReports.columns.income')}</span>
                <span className="data-card__value">
                  {t('dailyCashReports.columns.cash')} {formatMoney(r.cash_income)} ·{' '}
                  {t('dailyCashReports.columns.card')} {formatMoney(r.card_income)} ·{' '}
                  {t('dailyCashReports.columns.qr')} {formatMoney(r.qr_income)}
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">
                  {t('dailyCashReports.columns.expenseBalance')}
                </span>
                <span className="data-card__value">
                  <button type="button" className="dcr-link" onClick={() => openDetails(r, 'balance')}>
                    {formatMoney(r.expense_balance_total)}
                  </button>
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">
                  {t('dailyCashReports.columns.cashExpense')}
                </span>
                <span className="data-card__value">
                  <button type="button" className="dcr-link" onClick={() => openDetails(r, 'expenses')}>
                    {formatMoney(r.cash_expense)}
                  </button>
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">
                  {t('dailyCashReports.columns.remainder')}
                </span>
                <span className="data-card__value">
                  <button
                    type="button"
                    className="dcr-link dcr-link--strong"
                    onClick={() => openDetails(r, 'remainder')}
                  >
                    {formatMoney(r.remainder_total)}
                  </button>
                </span>
              </div>
              <div className="data-card__actions">{renderActions(r)}</div>
            </div>
          ))
        )}
      </div>

      {!isLoading && total > 0 && (
        <Pagination
          currentPage={page}
          lastPage={totalPages}
          total={total}
          from={(page - 1) * (data?.perPage ?? total) + 1}
          to={Math.min(page * (data?.perPage ?? total), total)}
          onPageChange={setPage}
        />
      )}

      <DetailsModal
        report={detailsReport}
        initialTab={detailsTab}
        onClose={() => setDetailsReport(null)}
      />
      <CorrectModal report={correctReport} onClose={() => setCorrectReport(null)} />

      <ConfirmModal
        open={!!confirmState}
        title={t(
          confirmState ? `dailyCashReports.confirm.${confirmState.action}Title` : 'dailyCashReports.confirm.sendTitle',
        )}
        message={t(
          confirmState ? `dailyCashReports.confirm.${confirmState.action}Message` : 'dailyCashReports.confirm.sendMessage',
          { number: confirmState?.report.report_number ?? '' },
        )}
        confirmLabel={t(confirmState ? `dailyCashReports.actions.${confirmState.action}` : 'dailyCashReports.actions.send')}
        cancelLabel={t('dailyCashReports.cancel')}
        tone={confirmState?.action === 'return' ? 'danger' : 'primary'}
        busy={workflow.isPending}
        reasonRequired={confirmState?.action === 'return'}
        reasonLabel={t('dailyCashReports.confirm.reasonLabel')}
        onConfirm={(reason) => confirmState && runConfirmed(confirmState, reason)}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default DailyCashReports;
