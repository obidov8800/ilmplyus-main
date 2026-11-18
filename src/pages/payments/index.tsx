import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API } from '@/api/api';
import { getLocalized } from '@/utils/getLocalized';
import type { Payment, SavePaymentPayload } from '@/types/payment.types';
import { LID_STATUS } from '@/types/lid.types';
import { advanceLidStatus } from '@/pages/lid/lid.service';
import PaymentModal from './PaymentModal';
import PaymentsFilter from './PaymentsFilter';
import {
  EMPTY_PAYMENT_FILTERS,
  countPaymentFilters,
  paymentFiltersToParams,
  type PaymentFilters,
} from './payments.filters';
import { useTableQuery } from '@/hooks/useTableQuery';
import { normalizePaymentMethod, paymentMethodLabel } from '@/utils/paymentMethod';
import Chek, { buildChekData } from '../chek';
import type { ChekData } from '../chek';
import { Protected } from '@/components/Protected';
import { Pagination } from '@/components/Pagination';
import FilterButton from '@/components/FilterButton';
import { useTableSort } from '@/hooks/useTableSort';
import { useDragScroll } from '@/hooks/useDragScroll';
import SortableTh from '@/components/SortableTh';
import { formatDateTime } from '@/utils/date';
import { formatSum } from '@/api/preschool';
import { cleanPersonName } from '@/utils/personName';
import { useCreateMutation, useUpdateMutation, useDeleteMutation } from '@/hooks/useMutations';
import './payments.css';
import AccessNotice from '@/components/AccessNotice';

function getInitials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

/** To'lov vaqti `created_at` dan olinadi — backend uni UTC da qaytaradi. */
function paymentMoment(p: Payment): string {
  return p.created_at ?? p.payment_date ?? p.paid_at ?? '';
}

/** Jadval kataklarida ham, saralashda ham ishlatiladigan hosila qiymatlar. */
function derivePayment(p: Payment, lang: string) {
  const fn = p.student?.first_name ?? '';
  const ln = p.student?.last_name ?? '';
  return {
    fn,
    ln,
    phone: p.student?.phone ?? '',
    groupName: p.group?.name ?? p.student?.groups?.[0]?.name ?? '—',
    dirName:
      (p.course ? getLocalized(p.course, 'name', lang) : null) ??
      p.direction?.name ??
      p.student?.direction?.name ??
      '—',
    levelName: p.group?.level ? getLocalized(p.group.level, 'name', lang) : null,
    dirColor: p.direction?.color ?? p.student?.direction?.color ?? '#9B59B6',
    teacherName:
      cleanPersonName(p.teacher?.full_name) ||
      cleanPersonName(
        p.teacher?.first_name ? `${p.teacher.last_name ?? ''} ${p.teacher.first_name}` : null,
      ) ||
      cleanPersonName(
        p.student?.teacher?.first_name
          ? `${p.student.teacher.last_name ?? ''} ${p.student.teacher.first_name}`
          : null,
      ) ||
      '—',
    branchName:
      (p.branch ? getLocalized(p.branch, 'name', lang) : null) ??
      (p.student?.branch ? getLocalized(p.student.branch, 'name', lang) : null) ??
      '—',
    dateStr: paymentMoment(p),
    method: normalizePaymentMethod(p.payment_method ?? p.payment_type),
    cashierName: p.cashier?.full_name ?? p.cashier?.username ?? '—',
  };
}

export default function Payments() {
  const { t, i18n } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const queryClient = useQueryClient();
  const [chekData, setChekData] = useState<ChekData | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // Qidiruv va filtrlar serverga yuboriladi — natija butun ma'lumot bo'yicha keladi,
  // faqat joriy sahifa bo'yicha emas.
  const {
    rows: payments,
    search,
    setSearch,
    filters,
    setFilters,
    isLoading,
  } = useTableQuery<Payment, PaymentFilters>({
    key: 'payments',
    url: '/payments',
    initialFilters: EMPTY_PAYMENT_FILTERS,
    toParams: paymentFiltersToParams,
  });

  const createMutation = useCreateMutation<Payment, Error, SavePaymentPayload>(
    (payload) => API.post('/payments', payload).then((r) => r.data),
    [['payments']],
  );

  const updateMutation = useUpdateMutation<Payment, Error, SavePaymentPayload>(
    (payload) => API.put(`/payments/${editingPayment?.id}`, payload).then((r) => r.data),
    [['payments']],
  );

  const deleteMutation = useDeleteMutation(
    (id) => API.delete(`/payments/${id}`).then((r) => r.data),
    [['payments']],
  );

  // Serverdan kelgan sahifani eng yangisi tepada bo'ladigan qilib ko'rsatamiz,
  // ustun sarlavhasi bosilganda esa o'sha ustun bo'yicha saralaymiz.
  const lang = i18n.language;
  const sort = useTableSort<Payment>(payments);
  const sortedPayments = sort.rows;

  // `/payments` `per_page`ni e'tiborsiz qoldiradi — server barcha mos qatorni
  // qaytaradi (qidiruv/filtr baribir serverda ishlaydi). Sahifalash shu qaytgan
  // ro'yxat ustidan klient tomonda qilinadi.
  const [payPage, setPayPage] = useState(1);
  const [payPerPage, setPayPerPage] = useState(20);
  const payTotal = sortedPayments.length;
  const payLastPage = Math.max(1, Math.ceil(payTotal / payPerPage));
  const paySafePage = Math.min(payPage, payLastPage);
  const visiblePayments = sortedPayments.slice(
    (paySafePage - 1) * payPerPage,
    paySafePage * payPerPage,
  );
  const payFrom = payTotal === 0 ? 0 : (paySafePage - 1) * payPerPage + 1;
  const payTo = Math.min(paySafePage * payPerPage, payTotal);

  const activeFilterCount = countPaymentFilters(filters);
  const { ref: tableWrapRef, onMouseDown: onTableWrapMouseDown } = useDragScroll<HTMLDivElement>();

  const handleOpenEdit = (payment: Payment) => {
    setEditingPayment(payment);
    setOpened(true);
  };

  const handleOpenCreate = () => {
    setEditingPayment(null);
    setOpened(true);
  };

  // Backend oylik narxdan oshiq to'lovni 422 bilan rad etsa (masalan boshqa kassir shu oyga to'lagan) — xato toast'da
  // ko'rinadi, oynadagi oylik panel esa yangi qoldiq bilan qayta yuklanadi.
  const refreshMonths = () => queryClient.invalidateQueries({ queryKey: ['payments', 'preschool-months'] });

  const handleSave = (payload: SavePaymentPayload) => {
    if (editingPayment) {
      updateMutation.mutate(payload, { onSuccess: () => setOpened(false), onError: refreshMonths });
    } else {
      createMutation.mutate(payload, {
        onSuccess: (created) => {
          // To'lov lidan yaratilgan o'quvchi uchun bo'lsa (`student.lid_id`),
          // o'sha lidni avtomatik "To'lov" ustuniga o'tkazadi.
          advanceLidStatus(created.student?.lid_id, LID_STATUS.PAID);
          setOpened(false);
        },
        onError: refreshMonths,
      });
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm(t('payments.deleteConfirm'))) {
      deleteMutation.mutate(id);
    }
  };
  // Delete tugmasi izohga olingan; tugma qaytarilganda quyidagi qatorni o'chirish kerak
  void handleDelete;

  const handlePrint = (p: Payment) => {
    setChekData(buildChekData(p, i18n.language));
  };

  return (
    <section className="payments-page container">
      <AccessNotice kind="branch" />
      {/* ── Header row: search | buttons — sarlavha header'da bor, shu yerda takrorlanmaydi ── */}
      <div className="payments-header-row">
        <div className="payments-header-actions">
          <div className="payments-search-wrap">
            <i className="fa-solid fa-magnifying-glass payments-search-icon" />
            <input
              className="payments-search-input"
              placeholder={t('payments.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPayPage(1);
              }}
            />
          </div>
          <FilterButton
            onClick={() => setFilterOpen((v) => !v)}
            active={filterOpen || activeFilterCount > 0}
            expanded={filterOpen}
            count={activeFilterCount}
            label={t('payments.filterBtn')}
          />
          <Protected permission="payments.create">
            <button className="payments-create-btn" onClick={handleOpenCreate}>
              {t('payments.createBtn')}
            </button>
          </Protected>
        </div>
      </div>

      {/* ── Table card ── */}
      <div className="payments-card">
        {filterOpen && (
          <div className="payments-card-header">
            <PaymentsFilter
              filters={filters}
              onChange={(next) => {
                setFilters(next);
                setPayPage(1);
              }}
              onClose={() => setFilterOpen(false)}
            />
          </div>
        )}

        <div
          className="payments-table-wrap drag-scroll responsive-table-wrap"
          ref={tableWrapRef}
          onMouseDown={onTableWrapMouseDown}
        >
          <table className="payments-table data-table">
            <thead>
              <tr>
                <SortableTh sortKey="id" sort={sort}>
                  {t('payments.table.id')}
                </SortableTh>
                <th>{t('payments.table.student')}</th>
                <th>{t('payments.table.amount')}</th>
                <th>{t('payments.table.group')}</th>
                <th>{t('payments.table.teacher')}</th>
                <th>{t('payments.table.branch')}</th>
                <th>{t('payments.table.cashier')}</th>
                <th>{t('payments.table.date')}</th>
                <th>{t('payments.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr className="table-empty-row">
                  <td colSpan={9}>{t('payments.loading')}</td>
                </tr>
              ) : visiblePayments.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={9}>{t('payments.noData')}</td>
                </tr>
              ) : (
                visiblePayments.map((p) => {
                  const {
                    fn,
                    ln,
                    phone,
                    groupName,
                    dirName,
                    levelName,
                    dirColor,
                    teacherName,
                    branchName,
                    dateStr,
                    method,
                    cashierName,
                  } = derivePayment(p, lang);

                  return (
                    <tr key={p.id}>
                      <td className="payment-id-cell">{p.id}</td>
                      <td className="cell-left">
                        <div className="student-cell">
                          <div className="student-avatar">{getInitials(fn, ln)}</div>
                          <div className="student-info">
                            <h4>
                              {fn} {ln}
                            </h4>
                            <span>{phone}</span>
                          </div>
                        </div>
                      </td>
                      <td className="amount-cell">
                        <span className="amount-value">{formatSum(p.amount)}</span>
                        {method && (
                          <span
                            className={`payment-method-badge${method === 'cash' ? ' cash' : ' cashless'}`}
                          >
                            {paymentMethodLabel(method)}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="group-cell">
                          <span className="group-cell__name">{groupName}</span>
                          {/* Maktabga tayyorlov guruhida kurs bo'lmaydi — bo'sh «● —» qatori chiqmaydi */}
                          {dirName !== '—' && (
                            <span className="group-cell__direction">
                              <span className="direction-dot" style={{ background: dirColor }} />
                              {dirName}
                              {levelName && levelName !== '-' && (
                                <span className="level-badge">{levelName}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{teacherName}</td>
                      <td>{branchName}</td>
                      <td>{cashierName}</td>
                      <td>{formatDateTime(dateStr)}</td>
                      <td>
                        <div className="row-actions">
                          <Protected permission="payments.edit">
                            <button
                              className="row-action row-action--edit"
                              title={t('payments.actions.edit')}
                              onClick={() => handleOpenEdit(p)}
                            >
                              <i className="fa-solid fa-pen" />
                            </button>
                          </Protected>
                          {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                          <Protected permission="payments.delete">
                            <button
                              className="row-action row-action--delete"
                              title={t('payments.actions.delete')}
                              onClick={() => handleDelete(p.id)}
                            >
                              <i className="fa-solid fa-trash" />
                            </button>
                          </Protected>
                          */}
                          <button
                            className="row-action row-action--print"
                            title={t('payments.actions.print')}
                            onClick={() => handlePrint(p)}
                          >
                            <i className="fa-solid fa-print" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
        <div className="responsive-cards">
          {isLoading ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('payments.loading')}
            </div>
          ) : visiblePayments.length === 0 ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('payments.noData')}
            </div>
          ) : (
            visiblePayments.map((p) => {
              const d = derivePayment(p, lang);
              return (
                <div key={p.id} className="data-card">
                  <div className="data-card__head">
                    <span className="data-card__title">
                      {d.fn} {d.ln}
                    </span>
                  </div>
                  <div className="data-card__actions">
                      <Protected permission="payments.edit">
                        <button
                          className="row-action row-action--edit"
                          title={t('payments.actions.edit')}
                          onClick={() => handleOpenEdit(p)}
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                      </Protected>
                      <button
                        className="row-action row-action--print"
                        title={t('payments.actions.print')}
                        onClick={() => handlePrint(p)}
                      >
                        <i className="fa-solid fa-print" />
                      </button>
                    </div>
                  <div className="data-card__row">
                    <span className="data-card__label">{t('payments.table.id')}</span>
                    <span className="data-card__value">{p.id}</span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">{t('payments.table.amount')}</span>
                    <span className="data-card__value">
                      {formatSum(p.amount)}
                      {d.method && (
                        <span
                          className={`payment-method-badge${d.method === 'cash' ? ' cash' : ' cashless'}`}
                          style={{ marginLeft: 8 }}
                        >
                          {paymentMethodLabel(d.method)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">{t('payments.table.group')}</span>
                    <span className="data-card__value">
                      {d.groupName}
                      {d.dirName && d.dirName !== '—' ? ` · ${d.dirName}` : ''}
                      {d.levelName && d.levelName !== '-' ? ` · ${d.levelName}` : ''}
                    </span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">{t('payments.table.teacher')}</span>
                    <span className="data-card__value">{d.teacherName}</span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">{t('payments.table.branch')}</span>
                    <span className="data-card__value">{d.branchName}</span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">{t('payments.table.cashier')}</span>
                    <span className="data-card__value">{d.cashierName}</span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">{t('payments.table.date')}</span>
                    <span className="data-card__value">{formatDateTime(d.dateStr)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {payTotal > 0 && (
          <Pagination
            currentPage={paySafePage}
            lastPage={payLastPage}
            total={payTotal}
            from={payFrom}
            to={payTo}
            onPageChange={setPayPage}
            pageSize={payPerPage}
            onPageSizeChange={(size) => {
              setPayPerPage(size);
              setPayPage(1);
            }}
          />
        )}
      </div>

      <PaymentModal
        opened={opened}
        onClose={() => setOpened(false)}
        onSave={handleSave}
        payment={editingPayment}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />

      {chekData && <Chek data={chekData} onClose={() => setChekData(null)} />}
    </section>
  );
}
