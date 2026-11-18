import { useDeferredValue, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import './preschoolContract.css';
import '@/styles/preschool.css';
import { type FilterBarField } from '@/components/FilterBar';
import { type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import ListToolbar from '@/components/ListToolbar';
import { Pagination } from '@/components/Pagination';
import { Protected } from '@/components/Protected';
import { useOptions } from '@/api/options';
import { fetchPreschoolContracts } from '@/api/preschoolContracts';
import { notifySuccess, notifyError } from '@/utils/notify';
import { printPreschoolContract } from '@/utils/preschoolContractPrint';
import { PRESCHOOL_CONTRACT_PERMISSIONS as PERM, type PreschoolContract } from '@/types/preschoolContract.types';
import { branchName, contractRepresentatives, formatContractDate as formatDate, personName } from '@/utils/preschoolContractView';
import PreschoolContractView from './PreschoolContractView';
import { useQueryClient } from '@tanstack/react-query';
import { useContractSms } from '@/hooks/useContractSms';

/*
 * Maktabga tayyorlov shartnomalari ro'yxati: qidiruv, sahifalash, ko'rish.
 * Yaratish — `/preschool-contracts/new`. Tahrirlash va O'CHIRISH bu panelda yo'q (shartnomani o'chirish faqat Admin panelida).
 */

const COLUMNS = 9;

/** Backend `PATCH /student-contracts/{id}/status` qabul qiladigan holatlar. */
const CONTRACT_STATUSES = ['in_progress', 'active', 'completed', 'expired', 'cancelled'] as const;

type FilterKey = 'year' | 'branch' | 'status';

const PreschoolContracts = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const created = (location.state as { created?: string } | null)?.created;

  // «Shartnoma yaratildi» — sahifa ichidagi blok emas, o'ng tepadagi bildirishnoma. Router holati tozalanadi,
  // aks holda sahifa yangilanganda xabar qayta chiqadi.
  useEffect(() => {
    if (!created) return;
    notifySuccess(t('preschoolContracts.created', { number: created }));
    navigate(location.pathname, { replace: true, state: null });
  }, [created, t, navigate, location.pathname]);

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [yearFilter, setYearFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewItem, setViewItem] = useState<PreschoolContract | null>(null);

  const { data: years } = useOptions('academic_years');
  const { data: branches } = useOptions('branches', { type: 'preschool' });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['preschool-contracts', page, pageSize, deferredSearch, yearFilter, branchFilter, statusFilter],
    queryFn: () =>
      fetchPreschoolContracts({
        page,
        perPage: pageSize,
        search: deferredSearch,
        academicYearId: yearFilter,
        branchId: branchFilter,
        status: statusFilter,
      }),
    placeholderData: keepPreviousData,
  });

  const filterValues: FilterBarValues<FilterKey> = { year: yearFilter, branch: branchFilter, status: statusFilter };
  const filterFields: FilterBarField<FilterKey>[] = [
    {
      key: 'year',
      label: t('preschoolContracts.filters.year'),
      type: 'select',
      placeholder: t('preschoolContracts.filters.allYears'),
      options: (years ?? []).map((y) => ({ value: y.id, label: y.label })),
    },
    {
      key: 'branch',
      label: t('preschoolContracts.filters.branch'),
      type: 'select',
      placeholder: t('preschoolContracts.filters.allBranches'),
      options: (branches ?? []).map((b) => ({ value: b.id, label: b.label })),
    },
    {
      key: 'status',
      label: t('preschoolContracts.filters.status'),
      type: 'select',
      placeholder: t('preschoolContracts.filters.allStatuses'),
      options: CONTRACT_STATUSES.map((s) => ({ value: s, label: t(`preschoolContracts.statuses.${s}`) })),
    },
  ];
  const changeFilters = (v: FilterBarValues<FilterKey>) => {
    setYearFilter(v.year);
    setBranchFilter(v.branch);
    setStatusFilter(v.status);
    setPage(1);
  };

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, data?.last_page ?? 1);
  const safePage = Math.min(page, lastPage);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  // Tasdiqlash SMS'ini qayta yuborish — backend birinchi vakil telefoniga yuboradi.
  const queryClient = useQueryClient();
  const contractSms = useContractSms(() => queryClient.invalidateQueries({ queryKey: ['preschool-contracts'] }));
  const smsPhone = (c: PreschoolContract): string => c.representative?.phone || contractRepresentatives(c)[0]?.phone || '';

  const studentOf = (c: PreschoolContract) => personName(c.contract_students?.[0]);
  const representativeOf = (c: PreschoolContract) => personName(contractRepresentatives(c)[0]);
  const groupOf = (c: PreschoolContract) => c.contract_students?.[0]?.group?.name || '—';

  const statusBadge = (c: PreschoolContract) => (
    <span className={`psc-status psc-status--${c.status}`}>
      {t(`preschoolContracts.statuses.${c.status}`, { defaultValue: c.status })}
    </span>
  );

  // Qatordagi «PDF» / «Chop etish» — ro'yxat qatoridagi ma'lumotdan (ko'rish oynasidagi bilan bir xil hujjat).
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const runDocument = async (c: PreschoolContract, mode: 'pdf' | 'print') => {
    setDocBusy(`${c.id}:${mode}`);
    try {
      await printPreschoolContract(c, { mode });
    } catch {
      notifyError(t('preschoolContracts.pdfError'));
    } finally {
      setDocBusy(null);
    }
  };

  const actions = (c: PreschoolContract) => (
    <span className="psc-row-actions">
      <button
        type="button"
        className="psc-icon-btn psc-icon-btn--view"
        title={t('preschoolContracts.view')}
        aria-label={t('preschoolContracts.view')}
        onClick={() => setViewItem(c)}
      >
        <i className="fa-solid fa-eye" />
      </button>
      <button
        type="button"
        className="psc-icon-btn psc-icon-btn--pdf"
        title={t('preschoolContracts.pdf')}
        aria-label={t('preschoolContracts.pdf')}
        disabled={docBusy !== null}
        onClick={() => runDocument(c, 'pdf')}
      >
        <i className={docBusy === `${c.id}:pdf` ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-pdf'} />
      </button>
      <button
        type="button"
        className="psc-icon-btn psc-icon-btn--print"
        title={t('preschoolContracts.print')}
        aria-label={t('preschoolContracts.print')}
        disabled={docBusy !== null}
        onClick={() => runDocument(c, 'print')}
      >
        <i className={docBusy === `${c.id}:print` ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-print'} />
      </button>
      <Protected permission={PERM.edit}>
        <button
          type="button"
          className="psc-icon-btn psc-icon-btn--sms"
          title={t('contractSms.action')}
          aria-label={t('contractSms.action')}
          disabled={contractSms.sendingId === c.id}
          onClick={() =>
            contractSms.ask({ id: c.id, number: c.contract_number, phone: smsPhone(c), confirmed: c.status === 'active' })
          }
        >
          <i className={contractSms.sendingId === c.id ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-paper-plane'} />
        </button>
      </Protected>
    </span>
  );

  return (
    <div className="pp-page list-page container">
      <ListToolbar
        search={{
          value: search,
          onChange: (v) => {
            setSearch(v);
            setPage(1);
          },
          placeholder: t('preschoolContracts.searchPlaceholder'),
        }}
        filter={{
          fields: filterFields,
          values: filterValues,
          onChange: changeFilters,
          onReset: () => changeFilters({ year: '', branch: '', status: '' }),
          ariaLabel: t('preschoolContracts.title'),
        }}
      >
        <Protected permission={PERM.create}>
          <button className="btn-accent" type="button" onClick={() => navigate('/preschool-contracts/new')}>
            {t('preschoolContracts.addNew')}
          </button>
        </Protected>
      </ListToolbar>

      <div className="list-table-wrap responsive-table-wrap">
        <table className="list-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t('preschoolContracts.columns.number')}</th>
              <th>{t('preschoolContracts.columns.student')}</th>
              <th>{t('preschoolContracts.columns.representative')}</th>
              <th>{t('studentsContract.table.group')}</th>
              <th>{t('preschoolContracts.columns.branch')}</th>
              <th>{t('preschoolContracts.columns.date')}</th>
              <th>{t('preschoolContracts.columns.status')}</th>
              <th>{t('preschoolContracts.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={COLUMNS}>{t('preschoolContracts.loading')}</td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={COLUMNS}>{t('preschoolContracts.loadError')}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS}>{t('preschoolContracts.notFound')}</td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.contract_number}</td>
                  <td>{studentOf(c)}</td>
                  <td>{representativeOf(c)}</td>
                  <td>{groupOf(c)}</td>
                  <td>{branchName(c.branch, i18n.language)}</td>
                  <td>{formatDate(c.contract_date)}</td>
                  <td>{statusBadge(c)}</td>
                  <td>{actions(c)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
      <div className="responsive-cards">
        {rows.map((c) => (
          <div key={c.id} className="data-card">
            <div className="data-card__head">
              <span className="data-card__title">{studentOf(c)}</span>
              {statusBadge(c)}
            </div>
            <div className="data-card__row">
              <span className="data-card__label">{t('preschoolContracts.columns.number')}</span>
              <span className="data-card__value">{c.contract_number}</span>
            </div>
            <div className="data-card__row">
              <span className="data-card__label">{t('preschoolContracts.columns.representative')}</span>
              <span className="data-card__value">{representativeOf(c)}</span>
            </div>
            <div className="data-card__row">
              <span className="data-card__label">{t('preschoolContracts.columns.branch')}</span>
              <span className="data-card__value">{branchName(c.branch, i18n.language)}</span>
            </div>
            <div className="data-card__row">
              <span className="data-card__label">{t('preschoolContracts.form.group')}</span>
              <span className="data-card__value">{groupOf(c)}</span>
            </div>
            <div className="data-card__row">
              <span className="data-card__label">{t('preschoolContracts.columns.date')}</span>
              <span className="data-card__value">{formatDate(c.contract_date)}</span>
            </div>
            <div className="data-card__row">{actions(c)}</div>
          </div>
        ))}
        {!isLoading && rows.length === 0 && (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('preschoolContracts.notFound')}
          </div>
        )}
      </div>

      {total > 0 && (
        <Pagination
          currentPage={safePage}
          lastPage={lastPage}
          total={total}
          from={from}
          to={to}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      {viewItem && <PreschoolContractView contract={viewItem} onClose={() => setViewItem(null)} />}
      {contractSms.modal}
    </div>
  );
};

export default PreschoolContracts;
