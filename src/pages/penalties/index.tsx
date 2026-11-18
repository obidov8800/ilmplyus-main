import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { useOptions } from '@/api/options';
import ConfirmModal from '@/components/ConfirmModal';
import { type FilterBarField } from '@/components/FilterBar';
import { type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import ListToolbar from '@/components/ListToolbar';
import { Protected } from '@/components/Protected';
import { Pagination } from '@/components/Pagination';
import { usePermission } from '@/hooks/usePermission';
import { formatDate } from '@/utils/date';
import { getApiErrorMessage } from '@/utils/apiError';
import { useSheet } from '../payroll-sheets/api';
import {
  formatMoney,
  monthI18nKey,
  monthValue,
  parseMonthValue,
} from '../payroll-sheets/helpers';
import { useDeleteFine, useFineDecision, useFineTypes, useFines } from './api';
import FineFormModal from './FineFormModal';
import { FINE_PERMISSIONS, FINE_STATUSES, isEditable, statusClass, statusI18nKey } from './helpers';
import type { EmployeeFine } from './types';
import SortableTh from '@/components/SortableTh';
import { useTableSort } from '@/hooks/useTableSort';
import './penalties.css';

/* ------------------------------------------------------------------ *
 * Jarimalar — xodimga jarima kiritish/ko'rish (qabul qilish/bekor qilish).
 *
 * DIQQAT: jarima TURLARINI boshqarish (qo'shish/tahrirlash/o'chirish) endi
 * shu yerda emas — Ilmplyus Dashboard (admin panel) → Moliya → Jarima
 * turlari sahifasida. Bu yerda turlar faqat READ-ONLY tarzda, pastdagi
 * "jarima kiritish" formasidagi select uchun o'qiladi (`useFineTypes`,
 * `GET /fine-types` — ikkala ilova ham bitta backendga ulanadi).
 *
 * Faqat `accepted` jarimalar oylik vedomostiga tushadi. Filial va oy uchun
 * oylik vedomosti tasdiqlangan bo'lsa backend har qanday o'zgartirishni
 * bloklaydi — sahifa buni oldindan aytadi va tugmalarni o'chiradi.
 * ------------------------------------------------------------------ */

/**
 * Jarima o'tgan oy uchun ham kiritiladi (oylik yopilmagan bo'lsa), shuning
 * uchun ro'yxat joriy oydan ORQAGA qaraydi — avans/oylik jadvalidan farqli.
 */
const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
});

type ConfirmState =
  | { kind: 'decision'; fine: EmployeeFine; action: 'accept' | 'cancel' }
  | { kind: 'deleteFine'; fine: EmployeeFine }
  | null;

type FilterKey = 'branch_id' | 'department_id' | 'status';

const Penalties = () => {
  const { t } = useTranslation();
  const { data: branches = [] } = useOptions('branches');
  const { data: departments = [] } = useOptions('departments');

  const canViewFines = usePermission(FINE_PERMISSIONS.view);
  // Staff ilovasida jarimani o'chirish yo'q (faqat Admin panelda) — `utils/deletePolicy`.

  const [period, setPeriod] = useState(() => monthValue(MONTHS[0].year, MONTHS[0].month));
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [fineForm, setFineForm] = useState<{ open: boolean; fine: EmployeeFine | null }>({
    open: false,
    fine: null,
  });
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const { year, month } = parseMonthValue(period);

  const filters = {
    period_year: year,
    period_month: month,
    branch_id: branchId,
    department_id: departmentId,
    status,
    search,
  };

  const { data, isLoading, isError, error } = useFines(filters, page);
  // Jarima kiritish formasidagi "Jarima turi" select uchun — boshqarish emas, o'qish.
  const { data: fineTypes = [] } = useFineTypes(canViewFines);

  const decision = useFineDecision();
  const deleteFine = useDeleteFine();

  /**
   * Oylik vedomosti tasdiqlanganini oldindan bilish uchun. Filial tanlanmagan
   * bo'lsa aniqlash mumkin emas — bunda backend xatosiga tayanamiz.
   */
  const { data: salarySheet } = useSheet(
    { type: 'salary', branch_id: branchId ? Number(branchId) : null, year, month },
    Boolean(branchId),
  );
  const periodLocked = salarySheet?.status === 'approved';

  // Default — eng oxirgi jarima tepada; xodim ID ustuni bosilsa asc/desc.
  const sort = useTableSort(data?.rows ?? [], { employeeCode: (f) => f.employee_code ?? '' });
  const rows = sort.rows;
  const lastPage = data?.lastPage ?? 1;
  const total = data?.total ?? 0;
  // Backend `per_page`ni qaytarmaydi — `total`/`lastPage` dan qayta hisoblanadi
  // (Laravel paginatorida oxirgisidan boshqa barcha sahifalar bir xil o'lchamda).
  const perPage = lastPage > 0 ? Math.ceil(total / lastPage) || 1 : 1;
  const rangeFrom = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeTo = Math.min(page * perPage, total);

  // Davr (oy) doim tanlangan bo'ladi — u filtr emas, ro'yxat konteksti, shu sabab
  // toolbar'da turadi; qolganlari "Saralash" panelida.
  const filterValues: FilterBarValues<FilterKey> = {
    branch_id: branchId,
    department_id: departmentId,
    status,
  };
  const filterFields: FilterBarField<FilterKey>[] = [
    {
      key: 'branch_id',
      label: t('penalties.filters.branch'),
      type: 'select',
      placeholder: t('penalties.filters.all'),
      options: branches.map((b) => ({ value: b.id, label: b.label })),
    },
    {
      key: 'department_id',
      label: t('penalties.filters.department'),
      type: 'select',
      placeholder: t('penalties.filters.all'),
      options: departments.map((d) => ({ value: d.id, label: d.label })),
    },
    {
      key: 'status',
      label: t('penalties.filters.status'),
      type: 'select',
      placeholder: t('penalties.filters.all'),
      options: FINE_STATUSES.map((st) => ({ value: st, label: t(statusI18nKey(st)) })),
    },
  ];
  const changeFilters = (v: FilterBarValues<FilterKey>) => {
    setBranchId(v.branch_id);
    setDepartmentId(v.department_id);
    setStatus(v.status);
    setPage(1);
  };

  const notify = (ok: boolean, message: string) =>
    notifications.show({
      title: ok ? t('penalties.savedTitle') : t('penalties.errorTitle'),
      message,
      color: ok ? 'green' : 'red',
    });

  const runConfirm = () => {
    if (!confirm) return;
    const done = () => setConfirm(null);

    if (confirm.kind === 'decision') {
      decision.mutate(
        { id: confirm.fine.id, action: confirm.action },
        {
          onSuccess: () => notify(true, t(`penalties.done.${confirm.action}`)),
          onError: (err) => notify(false, getApiErrorMessage(err, t('penalties.saveError'))),
          onSettled: done,
        },
      );
      return;
    }
    deleteFine.mutate(confirm.fine.id, {
      onSuccess: () => notify(true, t('penalties.done.delete')),
      onError: (err) => notify(false, getApiErrorMessage(err, t('penalties.saveError'))),
      onSettled: done,
    });
  };

  const busy = decision.isPending || deleteFine.isPending;

  const confirmTexts = () => {
    if (!confirm) return { title: '', message: '', label: '' };
    if (confirm.kind === 'decision') {
      return {
        title: t(`penalties.confirm.${confirm.action}.title`),
        message: t(`penalties.confirm.${confirm.action}.message`),
        label: t(`penalties.actions.${confirm.action}`),
      };
    }
    return {
      title: t('penalties.confirm.delete.title'),
      message: t('penalties.confirm.delete.message'),
      label: t('penalties.actions.delete'),
    };
  };
  const texts = confirmTexts();

  if (!canViewFines) {
    return (
      <div className="pen-container container">
        <p className="pen-empty">{t('penalties.forbidden')}</p>
      </div>
    );
  }

  return (
    <div className="pen-container list-page container">
      <div className="pen-header">
        <p className="pen-subtitle">{t('penalties.subtitle')}</p>
      </div>

      <ListToolbar
        left={
          <select
            className="page-toolbar__select"
            aria-label={t('penalties.filters.month')}
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          >
            {MONTHS.map((m) => (
              <option key={monthValue(m.year, m.month)} value={monthValue(m.year, m.month)}>
                {t(monthI18nKey(m.month))} {m.year}
              </option>
            ))}
          </select>
        }
        search={{
          value: search,
          onChange: (v) => {
            setSearch(v);
            setPage(1);
          },
          placeholder: t('penalties.filters.searchPlaceholder'),
        }}
        filter={{
          fields: filterFields,
          values: filterValues,
          onChange: changeFilters,
          onReset: () => changeFilters({ branch_id: '', department_id: '', status: '' }),
          ariaLabel: t('penalties.title'),
        }}
      >
        <Protected permission={FINE_PERMISSIONS.create}>
          <button
            className="btn-accent"
            type="button"
            disabled={periodLocked}
            onClick={() => setFineForm({ open: true, fine: null })}
          >
            {t('penalties.add')}
          </button>
        </Protected>
      </ListToolbar>

      {periodLocked && <div className="pen-alert">{t('penalties.lockedNotice')}</div>}

      <div className="list-table-wrap responsive-table-wrap">
        <table className="list-table pen-table">
          <thead>
            <tr>
              <SortableTh sortKey="employeeCode" sort={sort}>
                {t('penalties.columns.employeeId')}
              </SortableTh>
              <th>{t('penalties.columns.fullName')}</th>
              <th>{t('penalties.columns.positionDepartment')}</th>
              <th>{t('penalties.columns.fineType')}</th>
              <th className="pen-num">{t('penalties.columns.amount')}</th>
              <th>{t('penalties.columns.status')}</th>
              <th>{t('penalties.columns.note')}</th>
              <th>{t('penalties.columns.date')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="pen-empty">
                  {t('penalties.loading')}
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={9} className="pen-empty">
                  {getApiErrorMessage(error, t('penalties.loadError'))}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="pen-empty">
                  {t('penalties.noData')}
                </td>
              </tr>
            ) : (
              rows.map((fine) => (
                <tr key={fine.id}>
                  <td className="pen-code">{fine.employee_code || '—'}</td>
                  <td className="pen-name">{fine.full_name}</td>
                  <td>
                    <span className="pen-position">{fine.position_name}</span>
                    <span className="pen-sub">
                      {[fine.department_name, fine.branch_name].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="pen-type">{fine.fine_type_name}</td>
                  <td className="pen-num">
                    {formatMoney(fine.amount)} {t('penalties.soum')}
                  </td>
                  <td>
                    <span className={`pen-status ${statusClass(fine.status)}`}>
                      <span className="pen-dot" aria-hidden />
                      {t(statusI18nKey(fine.status))}
                    </span>
                  </td>
                  <td className="pen-note">{fine.note || '—'}</td>
                  <td>{fine.date ? formatDate(fine.date) : '—'}</td>
                  <td>
                    {isEditable(fine.status) && !periodLocked && (
                      <div className="pen-actions">
                        <Protected permission={FINE_PERMISSIONS.accept}>
                          <button
                            className="pen-btn pen-btn--sm pen-btn--success"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setConfirm({ kind: 'decision', fine, action: 'accept' })
                            }
                          >
                            {t('penalties.actions.accept')}
                          </button>
                        </Protected>
                        <Protected permission={FINE_PERMISSIONS.cancel}>
                          <button
                            className="pen-btn pen-btn--sm pen-btn--danger"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setConfirm({ kind: 'decision', fine, action: 'cancel' })
                            }
                          >
                            {t('penalties.actions.cancel')}
                          </button>
                        </Protected>
                        <Protected permission={FINE_PERMISSIONS.edit}>
                          <button
                            className="pen-btn pen-btn--sm pen-btn--ghost"
                            type="button"
                            onClick={() => setFineForm({ open: true, fine })}
                          >
                            {t('penalties.actions.edit')}
                          </button>
                        </Protected>
                      </div>
                    )}
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
            {t('penalties.loading')}
          </div>
        ) : isError ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {getApiErrorMessage(error, t('penalties.loadError'))}
          </div>
        ) : rows.length === 0 ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('penalties.noData')}
          </div>
        ) : (
          rows.map((fine) => (
            <div key={fine.id} className="data-card">
              <div className="data-card__head">
                <span className="data-card__title">{fine.full_name}</span>
                <span className={`pen-status ${statusClass(fine.status)}`}>
                  <span className="pen-dot" aria-hidden />
                  {t(statusI18nKey(fine.status))}
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">
                  {t('penalties.columns.employeeId')}
                </span>
                <span className="data-card__value">{fine.employee_code || '—'}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">
                  {t('penalties.columns.positionDepartment')}
                </span>
                <span className="data-card__value">
                  {[fine.position_name, fine.department_name, fine.branch_name]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('penalties.columns.fineType')}</span>
                <span className="data-card__value">{fine.fine_type_name}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('penalties.columns.amount')}</span>
                <span className="data-card__value">
                  {formatMoney(fine.amount)} {t('penalties.soum')}
                </span>
              </div>
              {fine.note && (
                <div className="data-card__row">
                  <span className="data-card__label">{t('penalties.columns.note')}</span>
                  <span className="data-card__value">{fine.note}</span>
                </div>
              )}
              <div className="data-card__row">
                <span className="data-card__label">{t('penalties.columns.date')}</span>
                <span className="data-card__value">
                  {fine.date ? formatDate(fine.date) : '—'}
                </span>
              </div>
              {isEditable(fine.status) && !periodLocked && (
                <div className="data-card__actions">
                  <Protected permission={FINE_PERMISSIONS.accept}>
                    <button
                      className="pen-btn pen-btn--sm pen-btn--success"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: 'decision', fine, action: 'accept' })}
                    >
                      {t('penalties.actions.accept')}
                    </button>
                  </Protected>
                  <Protected permission={FINE_PERMISSIONS.cancel}>
                    <button
                      className="pen-btn pen-btn--sm pen-btn--danger"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: 'decision', fine, action: 'cancel' })}
                    >
                      {t('penalties.actions.cancel')}
                    </button>
                  </Protected>
                  <Protected permission={FINE_PERMISSIONS.edit}>
                    <button
                      className="pen-btn pen-btn--sm pen-btn--ghost"
                      type="button"
                      onClick={() => setFineForm({ open: true, fine })}
                    >
                      {t('penalties.actions.edit')}
                    </button>
                  </Protected>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {total > 0 && (
        <Pagination
          currentPage={page}
          lastPage={lastPage}
          total={total}
          from={rangeFrom}
          to={rangeTo}
          onPageChange={setPage}
        />
      )}

      {fineForm.open && (
        <FineFormModal
          fine={fineForm.fine}
          fineTypes={fineTypes}
          onClose={() => setFineForm({ open: false, fine: null })}
        />
      )}

      <ConfirmModal
        open={confirm !== null}
        title={texts.title}
        message={texts.message}
        confirmLabel={texts.label}
        cancelLabel={t('penalties.form.cancel')}
        tone={confirm?.kind === 'decision' && confirm.action === 'accept' ? 'success' : 'danger'}
        busy={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

export default Penalties;
