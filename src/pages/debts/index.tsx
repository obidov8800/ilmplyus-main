import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { API } from '@/api/api';
import '../finance/finance.css';
import './debts.css';
import { useTranslation } from 'react-i18next';
import { getLocalized } from '@/utils/getLocalized';
import TableSkeleton from '@/components/TableSkeleton';
import EmptyState from '@/components/EmptyState';
import { Protected, WriteGuard } from '@/components/Protected';
import { Pagination } from '@/components/Pagination';
import FilterButton from '@/components/FilterButton';
import FilterBar, { type FilterBarField } from '@/components/FilterBar';
import { countFilterBarValues } from '@/components/FilterBar/filterBar.utils';
import { usePermission } from '@/hooks/usePermission';
import SortableTh from '@/components/SortableTh';
import { useTableSort } from '@/hooks/useTableSort';
import type { Branch } from '@/types/common.types';
import { useOptions } from '@/api/options';

// ─── Local Type Definitions ──────────────────────────────────────────────────

type DebtFilterKey = 'jamgarmaId' | 'cashierId' | 'status' | 'date';

const EMPTY_DEBT_FILTERS: Record<DebtFilterKey, string> = {
  jamgarmaId: '',
  cashierId: '',
  status: '',
  date: '',
};

interface Jamgarma {
  id: number;
  name_uz?: string;
  name_ru?: string;
  name_en?: string;
  section_uz?: string;
  jamgarma_fund_type?: string;
  status: 'active' | 'inactive' | 'frozen';
  /** Balanslar faqat `jamgarmas.view` bilan (`/jamgarmas`) keladi; `/options` zaxirasida yo'q. */
  cash_balance?: number;
  non_cash_balance?: number;
  total_balance?: number;
  branch_id?: number;
  branch?: Branch;
  created_at?: string;
}

type DebtType = 'give' | 'return' | 'forgive';
type DebtStatus = 'pending' | 'sent' | 'approved' | 'rejected' | 'cancelled';

interface PersonRef {
  id: number | null;
  full_name: string | null;
  username?: string | null;
}

interface DebtTransferRecord {
  id: number;
  lender_jamgarma?: Jamgarma;
  borrower_jamgarma?: Jamgarma;
  repayer_jamgarma?: Jamgarma;
  receiver_jamgarma?: Jamgarma;
  forgiver_jamgarma?: Jamgarma;
  forgiven_jamgarma?: Jamgarma;
  cash_amount: number;
  non_cash_amount: number;
  total_amount: number;
  notes?: string | null;
  status: DebtStatus;
  sent_by?: PersonRef;
  sent_at?: string;
  approved_by?: PersonRef;
  approved_at?: string | null;
  cancelled_by?: PersonRef;
  cancelled_at?: string | null;
  rejected_by?: PersonRef;
  rejected_at?: string | null;
  created_at: string;
}

interface DebtTransfer extends DebtTransferRecord {
  type: DebtType;
}

const ITEMS_PER_PAGE = 10;

const SECTION_OPTIONS: Record<string, string> = {
  harmless_point: "Zararsiz ishlash nuqtasi",
  marginal_income: "Marjinal daromad",
  adjusted_income: "Muvofiqlashtirilgan daromad (MD)",
};

// Real backend resources — each debt "type" maps to its own endpoint group.
const ENDPOINT_MAP: Record<DebtType, string> = {
  give: '/jamgarma-loans',
  return: '/jamgarma-loan-repayments',
  forgive: '/jamgarma-loan-forfeitures',
};

// Backend permission resource per debt type (mirrors ENDPOINT_MAP).
const PERMISSION_MAP: Record<DebtType, string> = {
  give: 'jamgarma_loans',
  return: 'jamgarma_loan_repayments',
  forgive: 'jamgarma_loan_forfeitures',
};

const isPendingStatus = (status: DebtStatus) => status === 'pending' || status === 'sent';

type DebtsView = 'list' | 'select-type' | 'create';

// ─── Main Component ──────────────────────────────────────────────────────────

const DebtsPage = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  // ── Permissions ─────────────────────────────────────────────────
  const canCreateGive = usePermission('jamgarma_loans.create');
  const canCreateReturn = usePermission('jamgarma_loan_repayments.create');
  const canCreateForgive = usePermission('jamgarma_loan_forfeitures.create');
  const canCreateAny = canCreateGive || canCreateReturn || canCreateForgive;

  // ── View state ──────────────────────────────────────────────────
  const [view, setView] = useState<DebtsView>('list');
  const [transferType, setTransferType] = useState<DebtType>('give');

  // ── List UI state ───────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Filter state ────────────────────────────────────────────────
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<Record<DebtFilterKey, string>>(EMPTY_DEBT_FILTERS);

  // ── Form state ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    giver_jamgarma_id: '',
    receiver_jamgarma_id: '',
    loan_id: '',
    cash_amount: '',
    non_cash_amount: '',
    description: '',
  });
  const [giverBranchId, setGiverBranchId] = useState('');
  const [receiverBranchId, setReceiverBranchId] = useState('');

  // ─── API Queries ──────────────────────────────────────────────────────────

  // Qarz formasi jamg'armaning `cash_balance` / `non_cash_balance` / `branch` / `status`
  // larini ko'rsatadi va limitni tekshiradi — /options/jamgarmas bularni bermaydi.
  // `/jamgarmas` — `jamgarmas.view` talab qiladi; ruxsati yo'q foydalanuvchi uchun so'ralmaydi (403 chiqmasin).
  const canViewJamgarmas = usePermission('jamgarmas.view');
  const { data: branchOptions = [] } = useOptions('branches');
  const { data: fullJamgarmas = [] } = useQuery<Jamgarma[]>({
    queryKey: ['jamgarmas', canViewJamgarmas],
    queryFn: async () => {
      const { data } = await API.get('/jamgarmas');
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    enabled: canViewJamgarmas,
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });
  // `jamgarmas.view` yo'q — jamg'armalar tanlov ro'yxatidan (`lookups.view`), BALANSSIZ: sahifa xato bermaydi.
  const { data: jamgarmaOptions = [] } = useOptions('jamgarmas', undefined, { enabled: !canViewJamgarmas });
  const jamgarmas: Jamgarma[] = useMemo(
    () =>
      canViewJamgarmas
        ? fullJamgarmas
        : jamgarmaOptions.map((o) => ({
            id: o.id,
            name_uz: o.label,
            jamgarma_fund_type: o.jamgarma_fund_type ?? undefined,
            status: 'active' as const,
            branch_id: o.branch_id == null ? undefined : Number(o.branch_id),
          })),
    [canViewJamgarmas, fullJamgarmas, jamgarmaOptions],
  );

  // Uch ro'yxat — har biri o'z ruxsati bilan (sahifa ulardan bittasi bilan ochiladi; qolganiga so'rov yuborilmaydi).
  const canViewLoans = usePermission('jamgarma_loans.view');
  const canViewRepayments = usePermission('jamgarma_loan_repayments.view');
  const canViewForfeitures = usePermission('jamgarma_loan_forfeitures.view');

  const { data: loans = [], isLoading: loansLoading } = useQuery<DebtTransferRecord[]>({
    queryKey: ['jamgarma-loans'],
    queryFn: async () => {
      const { data } = await API.get('/jamgarma-loans');
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    enabled: canViewLoans,
    placeholderData: keepPreviousData,
  });

  const { data: repayments = [], isLoading: repaymentsLoading } = useQuery<DebtTransferRecord[]>({
    queryKey: ['jamgarma-loan-repayments'],
    queryFn: async () => {
      const { data } = await API.get('/jamgarma-loan-repayments');
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    enabled: canViewRepayments,
    placeholderData: keepPreviousData,
  });

  const { data: forfeitures = [], isLoading: forfeituresLoading } = useQuery<DebtTransferRecord[]>({
    queryKey: ['jamgarma-loan-forfeitures'],
    queryFn: async () => {
      const { data } = await API.get('/jamgarma-loan-forfeitures');
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    enabled: canViewForfeitures,
    placeholderData: keepPreviousData,
  });

  // `enabled: false` so'rov `isLoading` bermaydi (faqat haqiqatan yuklanayotganlari hisoblanadi).
  const transfersLoading = loansLoading || repaymentsLoading || forfeituresLoading;

  const transfers: DebtTransfer[] = [
    ...loans.map((r) => ({ ...r, type: 'give' as const })),
    ...repayments.map((r) => ({ ...r, type: 'return' as const })),
    ...forfeitures.map((r) => ({ ...r, type: 'forgive' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ─── Mutations ────────────────────────────────────────────────────────────

  const resetForm = () => {
    setForm({
      giver_jamgarma_id: '',
      receiver_jamgarma_id: '',
      loan_id: '',
      cash_amount: '',
      non_cash_amount: '',
      description: '',
    });
    setGiverBranchId('');
    setReceiverBranchId('');
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['jamgarma-loans'] });
    queryClient.invalidateQueries({ queryKey: ['jamgarma-loan-repayments'] });
    queryClient.invalidateQueries({ queryKey: ['jamgarma-loan-forfeitures'] });
    queryClient.invalidateQueries({ queryKey: ['jamgarmas'] });
  };

  const createTransferMutation = useMutation({
    mutationFn: async (payload: object) => {
      const { data } = await API.post(ENDPOINT_MAP[transferType], payload);
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      setShowConfirm(false);
      setView('list');
      resetForm();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, type }: { id: number; type: DebtType }) => {
      const { data } = await API.post(`${ENDPOINT_MAP[type]}/${id}/approve`);
      return data;
    },
    onSuccess: () => invalidateAll(),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, type }: { id: number; type: DebtType }) => {
      const { data } = await API.post(`${ENDPOINT_MAP[type]}/${id}/reject`);
      return data;
    },
    onSuccess: () => invalidateAll(),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, type }: { id: number; type: DebtType }) => {
      const { data } = await API.post(`${ENDPOINT_MAP[type]}/${id}/cancel`);
      return data;
    },
    onSuccess: () => invalidateAll(),
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const formatAmount = (val: number | string) =>
    Number(val)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${hh}:${mm} ${dd}.${mo}.${d.getFullYear()}`;
  };

  const getStatusLabel = (status: DebtStatus) => {
    const map: Record<DebtStatus, string> = {
      pending: t('debts.statusPending'),
      sent: t('debts.statusPending'),
      approved: t('debts.statusApproved'),
      rejected: t('debts.statusRejected'),
      cancelled: t('debts.statusCancelled'),
    };
    return map[status] || status;
  };

  const getGiverJamgarma = (tr: DebtTransfer): Jamgarma | undefined => {
    if (tr.type === 'give') return tr.lender_jamgarma;
    if (tr.type === 'return') return tr.repayer_jamgarma;
    return tr.forgiver_jamgarma;
  };

  const getReceiverJamgarma = (tr: DebtTransfer): Jamgarma | undefined => {
    if (tr.type === 'give') return tr.borrower_jamgarma;
    if (tr.type === 'return') return tr.receiver_jamgarma;
    return tr.forgiven_jamgarma;
  };

  const getBranchLabel = (branch?: Branch, branchId?: number) => {
    const id = Number(branch?.id ?? branchId);
    const optionLabel = branchOptions.find((option) => Number(option.id) === id)?.label;
    if (!branch) return optionLabel || '-';
    const localizedName = getLocalized(branch, 'name', i18n.language);
    return localizedName !== '-' ? localizedName : optionLabel || branch.name_uz || '-';
  };

  const getJamgarmaBranchId = (jamgarma?: Jamgarma) =>
    Number(jamgarma?.branch_id ?? jamgarma?.branch?.id ?? 0);

  const giverJamgarmaOptions = jamgarmas.filter(
    (jamgarma) =>
      Boolean(giverBranchId) && getJamgarmaBranchId(jamgarma) === Number(giverBranchId),
  );
  const receiverJamgarmaOptions = jamgarmas.filter(
    (jamgarma) =>
      Boolean(receiverBranchId) &&
      getJamgarmaBranchId(jamgarma) === Number(receiverBranchId) &&
      jamgarma.id !== Number(form.giver_jamgarma_id),
  );

  const getJamgarmaName = (j?: Jamgarma) => {
    if (!j) return '-';
    return getLocalized(j, 'name', i18n.language) || j.name_uz || `Jam'garma #${j.id}`;
  };

  const getSectionLabel = (j?: Jamgarma) => {
    const value = j?.jamgarma_fund_type || j?.section_uz;
    if (!value) return '';
    return SECTION_OPTIONS[value] || value;
  };

  const getGiverLabel = (type: DebtType) => {
    if (type === 'give') return t('debts.giverLabelGive');
    if (type === 'return') return t('debts.giverLabelReturn');
    return t('debts.giverLabelForgive');
  };

  const getReceiverLabel = (type: DebtType) => {
    if (type === 'give') return t('debts.receiverLabelGive');
    if (type === 'return') return t('debts.receiverLabelReturn');
    return t('debts.receiverLabelForgive');
  };

  const getGiverTag = (type: DebtType) => {
    if (type === 'give') return t('debts.giverTagGive');
    if (type === 'return') return t('debts.giverTagReturn');
    return t('debts.giverTagForgive');
  };

  const getReceiverTag = (type: DebtType) => {
    if (type === 'give') return t('debts.receiverTagGive');
    if (type === 'return') return t('debts.receiverTagReturn');
    return t('debts.receiverTagForgive');
  };

  // ─── Transfer Create Logic ─────────────────────────────────────────────────

  // Repayments/forgiveness settle an existing approved loan — the backend
  // derives the two jamgarmas from the loan itself, so only outstanding
  // (approved) loans can be picked here.
  const approvedLoans = loans.filter((l) => l.status === 'approved');
  const selectedLoan = approvedLoans.find((l) => l.id === Number(form.loan_id));

  const giverJamgarma =
    transferType === 'give'
      ? jamgarmas.find((j) => j.id === Number(form.giver_jamgarma_id))
      : transferType === 'return'
        ? selectedLoan?.borrower_jamgarma
        : selectedLoan?.lender_jamgarma;

  const receiverJamgarma =
    transferType === 'give'
      ? jamgarmas.find((j) => j.id === Number(form.receiver_jamgarma_id))
      : transferType === 'return'
        ? selectedLoan?.lender_jamgarma
        : selectedLoan?.borrower_jamgarma;

  const cashAmountNum = Number(form.cash_amount.replace(/\s/g, '')) || 0;
  const nonCashAmountNum = Number(form.non_cash_amount.replace(/\s/g, '')) || 0;
  const totalAmountNum = cashAmountNum + nonCashAmountNum;

  const maxCash = transferType === 'give' ? giverJamgarma?.cash_balance : selectedLoan?.cash_amount;
  const maxNonCash =
    transferType === 'give' ? giverJamgarma?.non_cash_balance : selectedLoan?.non_cash_amount;

  const cashExceeds = maxCash !== undefined && cashAmountNum > maxCash;
  const nonCashExceeds = maxNonCash !== undefined && nonCashAmountNum > maxNonCash;

  const openTypeSelect = () => setView('select-type');

  const startCreate = (type: DebtType) => {
    setTransferType(type);
    resetForm();
    setView('create');
  };

  const backToTypeSelect = () => {
    setView('select-type');
    resetForm();
  };

  const handleTransferSubmit = () => {
    if (transferType === 'give') {
      if (!form.giver_jamgarma_id || !form.receiver_jamgarma_id) return;
    } else if (!form.loan_id) {
      return;
    }
    if (totalAmountNum <= 0 || cashExceeds || nonCashExceeds) return;
    setShowConfirm(true);
  };

  const confirmTransfer = () => {
    const base = {
      cash_amount: cashAmountNum,
      non_cash_amount: nonCashAmountNum,
      amount: totalAmountNum,
      notes: form.description,
    };
    if (transferType === 'give') {
      createTransferMutation.mutate({
        ...base,
        lender_jamgarma_id: Number(form.giver_jamgarma_id),
        borrower_jamgarma_id: Number(form.receiver_jamgarma_id),
      });
      return;
    }
    createTransferMutation.mutate({
      ...base,
      loan_id: Number(form.loan_id),
    });
  };

  // ─── Filter Options & Logic ────────────────────────────────────────────────

  // Cashiers (responsible persons) are derived from the transfers themselves —
  // any person who sent / approved / rejected / cancelled a transfer.
  const cashierOptions = useMemo(() => {
    const map = new Map<number, string>();
    transfers.forEach((tr) => {
      [tr.sent_by, tr.approved_by, tr.rejected_by, tr.cancelled_by].forEach((p) => {
        if (p?.id != null && p.full_name) map.set(p.id, p.full_name);
      });
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [transfers]);

  const activeFilterCount = countFilterBarValues(filters);

  const filterFields: FilterBarField<DebtFilterKey>[] = [
    {
      key: 'jamgarmaId',
      label: t('debts.filterByFund'),
      placeholder: t('debts.filterAll'),
      options: jamgarmas.map((j) => ({ value: j.id, label: getJamgarmaName(j) })),
    },
    {
      key: 'cashierId',
      label: t('debts.filterByCashier'),
      placeholder: t('debts.filterAll'),
      options: cashierOptions.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      key: 'status',
      label: t('debts.filterByStatus'),
      placeholder: t('debts.filterAll'),
      options: [
        { value: 'pending', label: t('debts.statusPending') },
        { value: 'approved', label: t('debts.statusApproved') },
        { value: 'rejected', label: t('debts.statusRejected') },
        { value: 'cancelled', label: t('debts.statusCancelled') },
      ],
    },
    {
      key: 'date',
      label: t('debts.filterByDate'),
      type: 'date',
    },
  ];

  const handleFilterChange = (next: Record<DebtFilterKey, string>) => {
    setFilters(next);
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_DEBT_FILTERS);
    setPage(1);
  };

  // ─── Filtered & Paginated Data ─────────────────────────────────────────────

  const filteredTransfers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transfers.filter((tr) => {
      // Fund filter — match either the giver or receiver jamgarma.
      if (filters.jamgarmaId) {
        const giverId = getGiverJamgarma(tr)?.id;
        const receiverId = getReceiverJamgarma(tr)?.id;
        if (String(giverId) !== filters.jamgarmaId && String(receiverId) !== filters.jamgarmaId) {
          return false;
        }
      }

      // Cashier filter — match any responsible person on the transfer.
      if (filters.cashierId) {
        const personIds = [tr.sent_by?.id, tr.approved_by?.id, tr.rejected_by?.id, tr.cancelled_by?.id]
          .filter((id) => id != null)
          .map(String);
        if (!personIds.includes(filters.cashierId)) return false;
      }

      // Status filter — 'pending' also covers the 'sent' backend status.
      if (filters.status) {
        if (filters.status === 'pending' ? !isPendingStatus(tr.status) : tr.status !== filters.status) {
          return false;
        }
      }

      // Date filter — match transfers created on the selected day.
      if (filters.date) {
        const start = new Date(filters.date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.date);
        end.setHours(23, 59, 59, 999);
        const created = new Date(tr.created_at);
        if (created < start || created > end) return false;
      }

      // Search filter.
      if (q) {
        const matches =
          tr.notes?.toLowerCase().includes(q) ||
          getJamgarmaName(getGiverJamgarma(tr)).toLowerCase().includes(q) ||
          getJamgarmaName(getReceiverJamgarma(tr)).toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers, filters, search, i18n.language]);

  // Default — eng oxirgi yozuv tepada; ID ustuni bosilsa asc/desc almashadi.
  const sort = useTableSort(filteredTransfers);

  const paginatedTransfers = (() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sort.rows.slice(start, start + ITEMS_PER_PAGE);
  })();

  const lastPage = Math.max(1, Math.ceil(filteredTransfers.length / ITEMS_PER_PAGE));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="finances debts container">
      {/* ── Confirm Transfer Modal ────────────────────────────────── */}
      {showConfirm && (
        <div className="fin-modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="fin-modal fin-modal-sm" onClick={(e) => e.stopPropagation()}>
            <p className="fin-confirm-text">{t('debts.confirmTransfer')}</p>
            <div className="fin-modal-actions">
              <WriteGuard>
                <button
                  className="fin-btn-save"
                  onClick={confirmTransfer}
                  disabled={createTransferMutation.isPending}
                >
                  {createTransferMutation.isPending ? t('debts.saving') : t('debts.confirm')}
                </button>
              </WriteGuard>
              <button className="fin-btn-cancel" onClick={() => setShowConfirm(false)}>
                {t('debts.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LIST VIEW
         ══════════════════════════════════════════════════════════════ */}
      {view === 'list' && (
        <>
          <div className="fin-toolbar">
            <div className="fin-search-box">
              <input
                placeholder={t('debts.searchPlaceholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <i className="fa-solid fa-magnifying-glass" />
            </div>
            <FilterButton
              onClick={() => setShowFilter((v) => !v)}
              active={showFilter || activeFilterCount > 0}
              expanded={showFilter}
              count={activeFilterCount}
              label={t('debts.filter')}
            />
            {canCreateAny && (
              <WriteGuard>
                <button className="fin-btn-add" onClick={openTypeSelect}>
                  {t('debts.createTransfer')}
                </button>
              </WriteGuard>
            )}
          </div>

          {showFilter && (
            <div className="fin-filter-card">
              <FilterBar
                fields={filterFields}
                values={filters}
                onChange={handleFilterChange}
                onReset={resetFilters}
                onClose={() => setShowFilter(false)}
                ariaLabel={t('debts.filterTitle')}
              />
            </div>
          )}

          <div className="fin-table-wrapper responsive-table-wrap">
            <table className="fin-table fin-transfers-table debts-transfers-table">
              <thead>
                <tr>
                  <SortableTh sortKey="id" sort={sort}>
                    {t('debts.id')}
                  </SortableTh>
                  <th>{t('debts.giverFund')}</th>
                  <th>{t('debts.receiverFund')}</th>
                  <th>{t('debts.amount')}</th>
                  <th>{t('debts.responsiblePersons')}</th>
                  <th>{t('debts.description')}</th>
                  <th>{t('debts.status')}</th>
                  <th>{t('debts.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {transfersLoading ? (
                  <TableSkeleton rowCount={10} columnCount={8} />
                ) : paginatedTransfers.length > 0 ? (
                  paginatedTransfers.map((tr, idx) => {
                    const giver = getGiverJamgarma(tr);
                    const receiver = getReceiverJamgarma(tr);

                    const respEntries: {
                      label: string;
                      name: string | null;
                      date: string | null | undefined;
                    }[] = [
                      { label: t('debts.senderPerson'), name: tr.sent_by?.full_name || null, date: tr.sent_at },
                    ];
                    if (tr.approved_at) {
                      respEntries.push({
                        label: t('debts.approverPerson'),
                        name: tr.approved_by?.full_name || null,
                        date: tr.approved_at,
                      });
                    }
                    if (tr.rejected_at) {
                      respEntries.push({
                        label: t('debts.rejecterPerson'),
                        name: tr.rejected_by?.full_name || null,
                        date: tr.rejected_at,
                      });
                    }
                    if (tr.cancelled_at) {
                      respEntries.push({
                        label: t('debts.cancellerPerson'),
                        name: tr.cancelled_by?.full_name || null,
                        date: tr.cancelled_at,
                      });
                    }

                    return (
                      <tr key={`${tr.type}-${tr.id}`}>
                        <td>{String((page - 1) * ITEMS_PER_PAGE + idx + 1).padStart(2, '0')}</td>

                        {/* Giver fund */}
                        <td>
                          <div className="debts-fund-cell">
                            <span className="debts-fund-name">{getJamgarmaName(giver)}</span>
                            {getSectionLabel(giver) && (
                              <span className="debts-fund-section">{getSectionLabel(giver)}</span>
                            )}
                            <span className="debts-fund-tag">{getGiverTag(tr.type)}</span>
                          </div>
                        </td>

                        {/* Receiver fund */}
                        <td>
                          <div className="debts-fund-cell">
                            <span className="debts-fund-name">{getJamgarmaName(receiver)}</span>
                            {getSectionLabel(receiver) && (
                              <span className="debts-fund-section">{getSectionLabel(receiver)}</span>
                            )}
                            <span className="debts-fund-tag">{getReceiverTag(tr.type)}</span>
                          </div>
                        </td>

                        {/* Amount */}
                        <td>
                          <div className="fin-balance-cards">
                            <span className="fin-balance-card-total fin-text-orange">
                              {formatAmount(tr.total_amount)} UZS
                            </span>
                            <span className="fin-balance-card fin-balance-card--cash">
                              <i className="fa-solid fa-money-bill" />
                              {formatAmount(tr.cash_amount)} UZS
                            </span>
                            <span className="fin-balance-card fin-balance-card--noncash">
                              <i className="fa-solid fa-credit-card" />
                              {formatAmount(tr.non_cash_amount)} UZS
                            </span>
                          </div>
                        </td>

                        {/* Responsible Persons */}
                        <td className="fin-responsible-cell">
                          {respEntries.map((entry) =>
                            entry.name ? (
                              <div className="fin-resp-row" key={entry.label}>
                                <span className="fin-resp-label">{entry.label}:</span>
                                <span className="fin-resp-name">{entry.name}</span>
                                {entry.date && (
                                  <span className="fin-resp-date">{formatDate(entry.date)}</span>
                                )}
                              </div>
                            ) : null,
                          )}
                        </td>

                        {/* Description */}
                        <td className="fin-description-cell">{tr.notes || '-'}</td>

                        {/* Status */}
                        <td>
                          <span
                            className={`fin-status-text${
                              tr.status === 'approved'
                                ? ' fin-text-green'
                                : tr.status === 'rejected' || tr.status === 'cancelled'
                                  ? ' fin-text-red'
                                  : ' fin-text-orange'
                            }`}
                          >
                            {getStatusLabel(tr.status)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td>
                          {isPendingStatus(tr.status) && (
                            <div className="fin-transfer-action-btns">
                              <Protected permission={`${PERMISSION_MAP[tr.type]}.approve`}>
                                <button
                                  className="fin-btn-approve"
                                  onClick={() => approveMutation.mutate({ id: tr.id, type: tr.type })}
                                  disabled={approveMutation.isPending}
                                >
                                  {t('debts.approve')}
                                </button>
                              </Protected>
                              <Protected permission={`${PERMISSION_MAP[tr.type]}.reject`}>
                                <button
                                  className="fin-btn-reject"
                                  onClick={() => rejectMutation.mutate({ id: tr.id, type: tr.type })}
                                  disabled={rejectMutation.isPending}
                                >
                                  {t('debts.reject')}
                                </button>
                              </Protected>
                              <Protected permission={`${PERMISSION_MAP[tr.type]}.cancel`}>
                                <button
                                  className="fin-btn-cancel-transfer"
                                  onClick={() => cancelMutation.mutate({ id: tr.id, type: tr.type })}
                                  disabled={cancelMutation.isPending}
                                >
                                  {t('debts.cancelTransfer')}
                                </button>
                              </Protected>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <EmptyState colSpan={8} message={t('debts.noTransfers')} />
                )}
              </tbody>
            </table>
          </div>

          {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
          <div className="responsive-cards">
            {transfersLoading ? (
              <div className="data-card" style={{ textAlign: 'center' }}>
                {t('debts.loading', '...')}
              </div>
            ) : paginatedTransfers.length === 0 ? (
              <div className="data-card" style={{ textAlign: 'center' }}>
                {t('debts.noTransfers')}
              </div>
            ) : (
              paginatedTransfers.map((tr, idx) => {
                const giver = getGiverJamgarma(tr);
                const receiver = getReceiverJamgarma(tr);
                const respEntries: { label: string; name: string | null; date?: string | null }[] =
                  [
                    {
                      label: t('debts.senderPerson'),
                      name: tr.sent_by?.full_name || null,
                      date: tr.sent_at,
                    },
                  ];
                if (tr.approved_at)
                  respEntries.push({
                    label: t('debts.approverPerson'),
                    name: tr.approved_by?.full_name || null,
                    date: tr.approved_at,
                  });
                if (tr.rejected_at)
                  respEntries.push({
                    label: t('debts.rejecterPerson'),
                    name: tr.rejected_by?.full_name || null,
                    date: tr.rejected_at,
                  });
                if (tr.cancelled_at)
                  respEntries.push({
                    label: t('debts.cancellerPerson'),
                    name: tr.cancelled_by?.full_name || null,
                    date: tr.cancelled_at,
                  });
                return (
                  <div key={`${tr.type}-${tr.id}`} className="data-card">
                    <div className="data-card__head">
                      <span className="data-card__title">
                        №{String((page - 1) * ITEMS_PER_PAGE + idx + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`fin-status-text${
                          tr.status === 'approved'
                            ? ' fin-text-green'
                            : tr.status === 'rejected' || tr.status === 'cancelled'
                              ? ' fin-text-red'
                              : ' fin-text-orange'
                        }`}
                      >
                        {getStatusLabel(tr.status)}
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('debts.giverFund')}</span>
                      <span className="data-card__value">
                        {getJamgarmaName(giver)}
                        {getSectionLabel(giver) ? ` · ${getSectionLabel(giver)}` : ''} (
                        {getGiverTag(tr.type)})
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('debts.receiverFund')}</span>
                      <span className="data-card__value">
                        {getJamgarmaName(receiver)}
                        {getSectionLabel(receiver) ? ` · ${getSectionLabel(receiver)}` : ''} (
                        {getReceiverTag(tr.type)})
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('debts.amount')}</span>
                      <span className="data-card__value">
                        {formatAmount(tr.total_amount)} UZS
                        <br />
                        <small>
                          <i className="fa-solid fa-money-bill" /> {formatAmount(tr.cash_amount)} ·{' '}
                          <i className="fa-solid fa-credit-card" /> {formatAmount(tr.non_cash_amount)}
                        </small>
                      </span>
                    </div>
                    {respEntries.some((e) => e.name) && (
                      <div className="data-card__row">
                        <span className="data-card__label">{t('debts.responsiblePersons')}</span>
                        <span className="data-card__value">
                          {respEntries
                            .filter((e) => e.name)
                            .map((e) => `${e.label}: ${e.name}${e.date ? ` (${formatDate(e.date)})` : ''}`)
                            .join('; ')}
                        </span>
                      </div>
                    )}
                    {tr.notes && (
                      <div className="data-card__row">
                        <span className="data-card__label">{t('debts.description')}</span>
                        <span className="data-card__value">{tr.notes}</span>
                      </div>
                    )}
                    {isPendingStatus(tr.status) && (
                      <div className="data-card__actions">
                        <Protected permission={`${PERMISSION_MAP[tr.type]}.approve`}>
                          <button
                            className="fin-btn-approve"
                            onClick={() => approveMutation.mutate({ id: tr.id, type: tr.type })}
                            disabled={approveMutation.isPending}
                          >
                            {t('debts.approve')}
                          </button>
                        </Protected>
                        <Protected permission={`${PERMISSION_MAP[tr.type]}.reject`}>
                          <button
                            className="fin-btn-reject"
                            onClick={() => rejectMutation.mutate({ id: tr.id, type: tr.type })}
                            disabled={rejectMutation.isPending}
                          >
                            {t('debts.reject')}
                          </button>
                        </Protected>
                        <Protected permission={`${PERMISSION_MAP[tr.type]}.cancel`}>
                          <button
                            className="fin-btn-cancel-transfer"
                            onClick={() => cancelMutation.mutate({ id: tr.id, type: tr.type })}
                            disabled={cancelMutation.isPending}
                          >
                            {t('debts.cancelTransfer')}
                          </button>
                        </Protected>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {filteredTransfers.length > 0 && (
            <Pagination
              currentPage={page}
              lastPage={lastPage}
              from={(page - 1) * ITEMS_PER_PAGE + 1}
              to={Math.min(page * ITEMS_PER_PAGE, filteredTransfers.length)}
              total={filteredTransfers.length}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SELECT TRANSFER TYPE
         ══════════════════════════════════════════════════════════════ */}
      {view === 'select-type' && (
        <div className="fin-modal-overlay" onClick={() => setView('list')}>
          <div className="fin-transfer-type-select" onClick={(e) => e.stopPropagation()}>
            <h3 className="fin-type-select-title">{t('debts.selectTransferType')}</h3>
            <WriteGuard>
              {canCreateGive && (
                <button className="fin-type-btn" onClick={() => startCreate('give')}>
                  {t('debts.typeGive')}
                </button>
              )}
              {canCreateReturn && (
                <button className="fin-type-btn" onClick={() => startCreate('return')}>
                  {t('debts.typeReturn')}
                </button>
              )}
              {canCreateForgive && (
                <button className="fin-type-btn" onClick={() => startCreate('forgive')}>
                  {t('debts.typeForgive')}
                </button>
              )}
            </WriteGuard>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          CREATE TRANSFER
         ══════════════════════════════════════════════════════════════ */}
      {view === 'create' && (
        <div className="fin-transfer-create">
          <button className="fin-back-btn" onClick={backToTypeSelect}>
            <i className="fa-solid fa-arrow-left" />
            {t('debts.back')}
          </button>

          <div className="fin-transfer-layout">
            {/* Left: Fund Cards */}
            <div className="fin-transfer-cards">
              {/* Giver Card */}
              <div className="fin-account-card">
                <div className="fin-card-header">
                  <i className="fa-solid fa-circle-info fin-card-icon" />
                  <h4>{t('debts.giverCard')}</h4>
                </div>
                {giverJamgarma ? (
                  <div className="fin-card-details">
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.id')}</span>
                      <span className="fin-card-value">{giverJamgarma.id}</span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.branch')}</span>
                      <span className="fin-card-value">
                        {getBranchLabel(giverJamgarma.branch, giverJamgarma.branch_id)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.fundName')}</span>
                      <span className="fin-card-value">{getJamgarmaName(giverJamgarma)}</span>
                    </div>
                    {getSectionLabel(giverJamgarma) && (
                      <div className="fin-card-row">
                        <span className="fin-card-label">{t('debts.section')}</span>
                        <span className="fin-card-value">{getSectionLabel(giverJamgarma)}</span>
                      </div>
                    )}
                    {/* Balans — faqat `jamgarmas.view` bilan; tanlov ro'yxatidan kelgan jamg'armada yo'q. */}
                    {canViewJamgarmas && (
                      <div className="fin-card-row">
                        <span className="fin-card-label">{t('debts.currentBalance')}</span>
                        <span className="fin-card-value">
                          <span className="fin-balance-card fin-balance-card--cash">
                            <i className="fa-solid fa-money-bill" />
                            {formatAmount(giverJamgarma.cash_balance ?? 0)} UZS
                          </span>{' '}
                          <span className="fin-balance-card fin-balance-card--noncash">
                            <i className="fa-solid fa-credit-card" />
                            {formatAmount(giverJamgarma.non_cash_balance ?? 0)} UZS
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.status')}</span>
                      <span
                        className={`fin-card-value ${
                          giverJamgarma.status === 'active' ? 'fin-text-green' : 'fin-text-red'
                        }`}
                      >
                        {giverJamgarma.status === 'active'
                          ? t('debts.statusActive')
                          : giverJamgarma.status === 'frozen'
                            ? t('debts.statusFrozen')
                            : t('debts.statusInactive')}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.createdAt')}</span>
                      <span className="fin-card-value">{formatDate(giverJamgarma.created_at)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="fin-card-empty">{t('debts.selectGiverFirst')}</p>
                )}
              </div>

              {/* Receiver Card */}
              <div className="fin-account-card">
                <div className="fin-card-header">
                  <i className="fa-solid fa-circle-info fin-card-icon" />
                  <h4>{t('debts.receiverCard')}</h4>
                </div>
                {receiverJamgarma ? (
                  <div className="fin-card-details">
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.id')}</span>
                      <span className="fin-card-value">{receiverJamgarma.id}</span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.branch')}</span>
                      <span className="fin-card-value">
                        {getBranchLabel(receiverJamgarma.branch, receiverJamgarma.branch_id)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.fundName')}</span>
                      <span className="fin-card-value">{getJamgarmaName(receiverJamgarma)}</span>
                    </div>
                    {getSectionLabel(receiverJamgarma) && (
                      <div className="fin-card-row">
                        <span className="fin-card-label">{t('debts.section')}</span>
                        <span className="fin-card-value">{getSectionLabel(receiverJamgarma)}</span>
                      </div>
                    )}
                    {/* Balans — faqat `jamgarmas.view` bilan; tanlov ro'yxatidan kelgan jamg'armada yo'q. */}
                    {canViewJamgarmas && (
                      <div className="fin-card-row">
                        <span className="fin-card-label">{t('debts.currentBalance')}</span>
                        <span className="fin-card-value">
                          <span className="fin-balance-card fin-balance-card--cash">
                            <i className="fa-solid fa-money-bill" />
                            {formatAmount(receiverJamgarma.cash_balance ?? 0)} UZS
                          </span>{' '}
                          <span className="fin-balance-card fin-balance-card--noncash">
                            <i className="fa-solid fa-credit-card" />
                            {formatAmount(receiverJamgarma.non_cash_balance ?? 0)} UZS
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.status')}</span>
                      <span
                        className={`fin-card-value ${
                          receiverJamgarma.status === 'active' ? 'fin-text-green' : 'fin-text-red'
                        }`}
                      >
                        {receiverJamgarma.status === 'active'
                          ? t('debts.statusActive')
                          : receiverJamgarma.status === 'frozen'
                            ? t('debts.statusFrozen')
                            : t('debts.statusInactive')}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('debts.createdAt')}</span>
                      <span className="fin-card-value">
                        {formatDate(receiverJamgarma.created_at)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="fin-card-empty">{t('debts.selectReceiverFirst')}</p>
                )}
              </div>
            </div>

            {/* Right: Transfer Form */}
            <div className="fin-transfer-form-card">
              <div className="fin-card-header">
                <i className="fa-solid fa-right-left fin-card-icon" />
                <h4>{t('debts.newTransfer')}</h4>
              </div>

              {transferType === 'give' ? (
                <>
                  <div className="fin-form-group">
                    <label>{t('debts.branch')}</label>
                    <select
                      value={giverBranchId}
                      onChange={(e) => {
                        setGiverBranchId(e.target.value);
                        setForm((current) => ({ ...current, giver_jamgarma_id: '' }));
                      }}
                    >
                      <option value="">{t('debts.choose')}</option>
                      {branchOptions.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fin-form-group">
                    <label>{getGiverLabel(transferType)}</label>
                    <select
                      value={form.giver_jamgarma_id}
                      disabled={!giverBranchId}
                      onChange={(e) => {
                        const nextGiverId = e.target.value;
                        setForm((current) => ({
                          ...current,
                          giver_jamgarma_id: nextGiverId,
                          receiver_jamgarma_id:
                            current.receiver_jamgarma_id === nextGiverId
                              ? ''
                              : current.receiver_jamgarma_id,
                        }));
                      }}
                    >
                      <option value="">{t('debts.choose')}</option>
                      {giverJamgarmaOptions.map((j) => (
                        <option key={j.id} value={j.id}>
                          {getJamgarmaName(j)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fin-form-group">
                    <label>{t('debts.branch')}</label>
                    <select
                      value={receiverBranchId}
                      onChange={(e) => {
                        setReceiverBranchId(e.target.value);
                        setForm((current) => ({ ...current, receiver_jamgarma_id: '' }));
                      }}
                    >
                      <option value="">{t('debts.choose')}</option>
                      {branchOptions.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fin-form-group">
                    <label>{getReceiverLabel(transferType)}</label>
                    <select
                      value={form.receiver_jamgarma_id}
                      disabled={!receiverBranchId}
                      onChange={(e) =>
                        setForm((current) => ({ ...current, receiver_jamgarma_id: e.target.value }))
                      }
                    >
                      <option value="">{t('debts.choose')}</option>
                      {receiverJamgarmaOptions.map((j) => (
                        <option key={j.id} value={j.id}>
                          {getJamgarmaName(j)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div className="fin-form-group">
                  <label>{t('debts.loanLabel')}</label>
                  <select
                    value={form.loan_id}
                    onChange={(e) => setForm({ ...form, loan_id: e.target.value })}
                  >
                    <option value="">{t('debts.choose')}</option>
                    {approvedLoans.map((loan) => (
                      <option key={loan.id} value={loan.id}>
                        {getBranchLabel(
                          loan.lender_jamgarma?.branch,
                          loan.lender_jamgarma?.branch_id,
                        )}{' '}
                        · {getJamgarmaName(loan.lender_jamgarma)} →{' '}
                        {getBranchLabel(
                          loan.borrower_jamgarma?.branch,
                          loan.borrower_jamgarma?.branch_id,
                        )}{' '}
                        · {getJamgarmaName(loan.borrower_jamgarma)}:{' '}
                        {formatAmount(loan.total_amount)} UZS
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="fin-form-group">
                <label>{t('debts.cashAmount')}</label>
                <div className="fin-amount-input-wrap">
                  <input
                    type="text"
                    value={form.cash_amount}
                    onChange={(e) => setForm({ ...form, cash_amount: e.target.value })}
                    placeholder="0"
                    className={cashExceeds ? 'fin-input-error' : ''}
                  />
                  <span className="fin-currency-badge">UZS</span>
                </div>
                {cashExceeds && maxCash !== undefined && (
                  <span className="fin-field-error">
                    {t('debts.amountExceedsBalance')}: {formatAmount(maxCash)} UZS
                  </span>
                )}
              </div>

              <div className="fin-form-group">
                <label>{t('debts.nonCashAmount')}</label>
                <div className="fin-amount-input-wrap">
                  <input
                    type="text"
                    value={form.non_cash_amount}
                    onChange={(e) => setForm({ ...form, non_cash_amount: e.target.value })}
                    placeholder="0"
                    className={nonCashExceeds ? 'fin-input-error' : ''}
                  />
                  <span className="fin-currency-badge">UZS</span>
                </div>
                {nonCashExceeds && maxNonCash !== undefined && (
                  <span className="fin-field-error">
                    {t('debts.amountExceedsBalance')}: {formatAmount(maxNonCash)} UZS
                  </span>
                )}
              </div>

              <div className="fin-form-group">
                <label>{t('debts.totalAmount')}</label>
                <input type="text" readOnly value={`${formatAmount(totalAmountNum)} UZS`} className="fin-readonly-input" />
              </div>

              <div className="fin-form-group">
                <label>{t('debts.description')}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  placeholder={t('debts.descriptionPlaceholder')}
                />
              </div>

              <WriteGuard>
                <button
                  className="fin-btn-transfer"
                  onClick={handleTransferSubmit}
                  disabled={
                    (transferType === 'give'
                      ? !form.giver_jamgarma_id || !form.receiver_jamgarma_id
                      : !form.loan_id) ||
                    totalAmountNum <= 0 ||
                    cashExceeds ||
                    nonCashExceeds
                  }
                >
                  {t('debts.sendTransfer')}
                </button>
              </WriteGuard>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DebtsPage;
