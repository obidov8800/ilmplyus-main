import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { API } from '@/api/api';
import { useOptions } from '@/api/options';
import './finance.css';
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

// ─── Local Type Definitions ──────────────────────────────────────────────────

type FinanceFilterKey = 'jamgarmaId' | 'cashierId' | 'status' | 'date';

const EMPTY_FINANCE_FILTERS: Record<FinanceFilterKey, string> = {
  jamgarmaId: '',
  cashierId: '',
  status: '',
  date: '',
};

interface FinanceAccount {
  id: number;
  branch_id?: number;
  account_type: string; // "0001" | "0002"
  account_type_name?: string; // "Naqt (Cash)"
  account_number: string;
  /** `/chart-of-accounts` beradi; `/options/chart-of-accounts` (zaxira manba) bermaydi — shunda `undefined`. */
  balance?: number;
  status: 'active' | 'inactive';
  is_active?: boolean;
  description_uz?: string;
  created_at?: string;
  updated_at?: string;
  branch?: Branch;
}

interface PersonRef {
  id: number | null;
  full_name: string | null;
  username?: string | null;
}

interface TransferAccountRef {
  id: number;
  account_number: string;
  account_type?: string;
  account_type_name?: string;
  balance: number;
}

interface JamgarmaRef {
  id: number;
  name?: string | null;
  name_uz?: string | null;
  cash_balance: number;
  non_cash_balance: number;
  total_balance: number;
}

interface AccountTransferApi {
  id: number;
  source_account: TransferAccountRef;
  destination_account: TransferAccountRef;
  amount: number;
  notes?: string | null;
  status: string;
  status_name: string;
  sent_by: PersonRef;
  sent_at: string;
  approved_by: PersonRef;
  approved_at: string | null;
  cancelled_by: PersonRef;
  cancelled_at: string | null;
  rejected_by: PersonRef;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface JamgarmaTransferApi {
  id: number;
  source_account: TransferAccountRef;
  destination_jamgarma: JamgarmaRef;
  amount: number;
  account_type_name?: string;
  notes?: string | null;
  status: string;
  status_name: string;
  sent_by: PersonRef;
  sent_at: string;
  approved_by: PersonRef;
  approved_at: string | null;
  cancelled_by: PersonRef;
  cancelled_at: string | null;
  rejected_by: PersonRef;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UnifiedTransfer {
  id: number;
  kind: 'account' | 'jamgarma';
  source_account: TransferAccountRef;
  destination_account?: TransferAccountRef;
  destination_jamgarma?: JamgarmaRef;
  destination_type_name?: string;
  amount: number;
  notes?: string | null;
  status: string;
  sent_by: PersonRef;
  sent_at: string;
  approved_by: PersonRef;
  approved_at: string | null;
  cancelled_by: PersonRef;
  cancelled_at: string | null;
  rejected_by: PersonRef;
  rejected_at: string | null;
}

interface Jamgarma {
  id: number;
  name_uz?: string;
  name_ru?: string;
  name_en?: string;
  status: 'active' | 'inactive' | 'frozen';
  /** Balanslar `/jamgarmas` dan keladi; `/options/jamgarmas` (zaxira manba) bermaydi — shunda `undefined`. */
  cash_balance?: number;
  non_cash_balance?: number;
  total_balance?: number;
  branch_id?: number;
  branch?: Branch;
  created_at?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 10;

// Each transfer kind maps to its own backend permission resource.
const TRANSFER_PERMISSION: Record<UnifiedTransfer['kind'], string> = {
  account: 'chart_of_accounts_transfers',
  jamgarma: 'account_to_jamgarma_transfers',
};

type TransferView = 'list' | 'select-type' | 'create' | 'savings';

// ─── Main Component ──────────────────────────────────────────────────────────

const Finances = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  // ── Permissions ─────────────────────────────────────────────────
  const canCreateAccountTransfer = usePermission('chart_of_accounts_transfers.create');
  const canCreateSavingsTransfer = usePermission('account_to_jamgarma_transfers.create');
  const canCreateAnyTransfer = canCreateAccountTransfer || canCreateSavingsTransfer;

  // ── View state ──────────────────────────────────────────────────
  const [transferView, setTransferView] = useState<TransferView>('list');

  // ── Transfers UI state ──────────────────────────────────────────
  const [transferSearch, setTransferSearch] = useState('');
  const [transferPage, setTransferPage] = useState(1);
  const [showConfirmTransfer, setShowConfirmTransfer] = useState(false);

  // ── Filter state ────────────────────────────────────────────────
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<Record<FinanceFilterKey, string>>(EMPTY_FINANCE_FILTERS);

  // ── Transfer form state ────────────────────────────────────────
  const [transferForm, setTransferForm] = useState({
    sender_account_id: '',
    receiver_account_id: '',
    amount: '',
    description: '',
  });

  // ── Savings transfer form state ────────────────────────────────
  const [savingsForm, setSavingsForm] = useState({
    sender_account_id: '',
    jamgarma_id: '',
    amount: '',
    description: '',
  });
  const [showConfirmSavings, setShowConfirmSavings] = useState(false);

  // ─── API Queries ──────────────────────────────────────────────────────────

  // O'tkazma formasi hisobning `balance`, `branch`, `status`, `account_number` larini
  // ko'rsatadi va balansni tekshiradi — /options/chart-of-accounts bularni bermaydi.
  // `/chart-of-accounts` — `chart_of_accounts.view` talab qiladi. Sahifa faqat o'tkazma ruxsati bor
  // foydalanuvchiga ham ochiladi (`FINANCE_ACCOUNTS_VIEW` — «anyOf»), unda bu so'rov 403 berib,
  // «Ruxsat yo'q» chiqarardi va hisob/filial nomlari bo'sh qolardi. Ruxsati yo'q bo'lsa so'ralmaydi —
  // hisoblar `/options/chart-of-accounts` + `/options/branches` dan yig'iladi (balanssiz).
  const canViewAccounts = usePermission('chart_of_accounts.view');
  const { data: fullAccounts = [] } = useQuery<FinanceAccount[]>({
    queryKey: ['chart-of-accounts', canViewAccounts],
    queryFn: async () => {
      const { data } = await API.get('/chart-of-accounts');
      return Array.isArray(data) ? data : data?.data || [];
    },
    enabled: canViewAccounts,
    placeholderData: keepPreviousData,
  });

  // Filial nomlari — hisob / jamg'arma tanlovlarida «(Filial)» belgisi uchun (hamma uchun ochiq `lookups.view`).
  const { data: branchOptions = [] } = useOptions('branches');
  const branchById = useMemo(() => {
    const map = new Map<number, Branch>();
    branchOptions.forEach((b) => map.set(Number(b.id), { id: Number(b.id), name_uz: b.label }));
    return map;
  }, [branchOptions]);

  const { data: accountOptions = [] } = useOptions('chart-of-accounts', undefined, {
    enabled: !canViewAccounts,
  });
  const accounts: FinanceAccount[] = useMemo(() => {
    if (canViewAccounts) {
      // Ba'zi javoblarda `branch` faqat `{ id }` bo'ladi. Nomi bo'lmasa, filial ro'yxatidan to'ldiramiz.
      return fullAccounts.map((a) => {
        const branchId = Number(a.branch_id ?? a.branch?.id);
        const branchHasName = Boolean(
          a.branch?.name_uz || a.branch?.name_ru || a.branch?.name_en,
        );
        return {
          ...a,
          branch_id: Number.isFinite(branchId) ? branchId : undefined,
          branch: branchHasName ? a.branch : branchById.get(branchId),
        };
      });
    }
    return accountOptions.map((o) => ({
      id: o.id,
      branch_id: Number(o.branch_id ?? 0),
      account_type: o.account_type ?? '',
      account_number: o.label,
      status: 'active' as const,
      branch: o.branch_id == null ? undefined : branchById.get(Number(o.branch_id)),
    }));
  }, [canViewAccounts, fullAccounts, accountOptions, branchById]);

  // Sahifa bir nechta bo'lim ruxsatidan biri bilan ochiladi («anyOf») — har ro'yxat faqat o'z ruxsati bo'lsa so'raladi.
  const canViewAccountTransfers = usePermission('chart_of_accounts_transfers.view');
  const canViewSavingsTransfers = usePermission('account_to_jamgarma_transfers.view');
  const { data: accountTransfers = [], isLoading: accountTransfersLoading } = useQuery<
    AccountTransferApi[]
  >({
    queryKey: ['chart-of-accounts-transfers'],
    queryFn: async () => {
      const { data } = await API.get('/chart-of-accounts-transfers');
      return Array.isArray(data) ? data : data?.data || [];
    },
    enabled: canViewAccountTransfers,
    placeholderData: keepPreviousData,
  });

  const { data: jamgarmaTransfers = [], isLoading: jamgarmaTransfersLoading } = useQuery<
    JamgarmaTransferApi[]
  >({
    queryKey: ['account-to-jamgarma-transfers'],
    queryFn: async () => {
      const { data } = await API.get('/account-to-jamgarma-transfers');
      return Array.isArray(data) ? data : data?.data || [];
    },
    enabled: canViewSavingsTransfers,
    placeholderData: keepPreviousData,
  });

  const transfersLoading = accountTransfersLoading || jamgarmaTransfersLoading;

  const transfers: UnifiedTransfer[] = useMemo(() => {
    const fromAccounts: UnifiedTransfer[] = accountTransfers.map((tr) => ({
      id: tr.id,
      kind: 'account',
      source_account: tr.source_account,
      destination_account: tr.destination_account,
      amount: tr.amount,
      notes: tr.notes,
      status: tr.status,
      sent_by: tr.sent_by,
      sent_at: tr.sent_at,
      approved_by: tr.approved_by,
      approved_at: tr.approved_at,
      cancelled_by: tr.cancelled_by,
      cancelled_at: tr.cancelled_at,
      rejected_by: tr.rejected_by,
      rejected_at: tr.rejected_at,
    }));
    const fromJamgarma: UnifiedTransfer[] = jamgarmaTransfers.map((tr) => ({
      id: tr.id,
      kind: 'jamgarma',
      source_account: tr.source_account,
      destination_jamgarma: tr.destination_jamgarma,
      destination_type_name: tr.account_type_name,
      amount: tr.amount,
      notes: tr.notes,
      status: tr.status,
      sent_by: tr.sent_by,
      sent_at: tr.sent_at,
      approved_by: tr.approved_by,
      approved_at: tr.approved_at,
      cancelled_by: tr.cancelled_by,
      cancelled_at: tr.cancelled_at,
      rejected_by: tr.rejected_by,
      rejected_at: tr.rejected_at,
    }));
    return [...fromAccounts, ...fromJamgarma].sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
    );
  }, [accountTransfers, jamgarmaTransfers]);

  const { data: transferableOptions = [] } = useOptions('chart-of-accounts', { transferable: 1 });
  const transferableIds = new Set(transferableOptions.map((option) => String(option.id)));
  const sourceAccounts = accounts.filter((account) => transferableIds.has(String(account.id)));

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Jamg'arma kartochkasi `cash_balance` / `non_cash_balance` / `branch` ni ko'rsatadi —
  // /options/jamgarmas bularni bermaydi.
  // `/jamgarmas` — `jamgarmas.view` talab qiladi; ruxsati yo'q foydalanuvchi uchun so'ralmaydi (403 chiqmasin).
  // `jamgarmas.view` bo'lmasa, faqat foydalanuvchiga chiqim uchun biriktirilgan jamg'armalar tanlanadi.
  const canViewJamgarmas = usePermission('jamgarmas.view');
  const { data: fullJamgarmas = [] } = useQuery<Jamgarma[]>({
    queryKey: ['jamgarmas', canViewJamgarmas],
    queryFn: async () => {
      const { data } = await API.get('/jamgarmas');
      return Array.isArray(data) ? data : data?.data || [];
    },
    enabled: canViewJamgarmas,
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });
  const { data: jamgarmaOptions = [] } = useOptions('jamgarmas', { withdrawable: 1 }, {
    enabled: !canViewJamgarmas,
  });
  const jamgarmas: Jamgarma[] = useMemo(() => {
    if (canViewJamgarmas) {
      return fullJamgarmas.map((j) =>
        j.branch || j.branch_id == null ? j : { ...j, branch: branchById.get(Number(j.branch_id)) },
      );
    }
    return jamgarmaOptions.map((o) => ({
      id: o.id,
      name_uz: o.label,
      status: 'active' as const,
      branch_id: o.branch_id == null ? undefined : Number(o.branch_id),
      branch: o.branch_id == null ? undefined : branchById.get(Number(o.branch_id)),
    }));
  }, [canViewJamgarmas, fullJamgarmas, jamgarmaOptions, branchById]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createTransferMutation = useMutation({
    mutationFn: async (payload: object) => {
      const { data } = await API.post('/chart-of-accounts-transfers', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      setShowConfirmTransfer(false);
      setTransferView('list');
      setTransferForm({
        sender_account_id: '',
        receiver_account_id: '',
        amount: '',
        description: '',
      });
    },
  });

  const createSavingsTransferMutation = useMutation({
    mutationFn: async (payload: object) => {
      const { data } = await API.post('/account-to-jamgarma-transfers', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['jamgarmas'] });
      setShowConfirmSavings(false);
      setTransferView('list');
      setSavingsForm({ sender_account_id: '', jamgarma_id: '', amount: '', description: '' });
    },
  });

  const transferEndpointBase = (kind: UnifiedTransfer['kind']) =>
    kind === 'jamgarma' ? '/account-to-jamgarma-transfers' : '/chart-of-accounts-transfers';

  const invalidateTransferQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['chart-of-accounts-transfers'] });
    queryClient.invalidateQueries({ queryKey: ['account-to-jamgarma-transfers'] });
    queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['jamgarmas'] });
  };

  const approveTransferMutation = useMutation({
    mutationFn: async ({ id, kind }: { id: number; kind: UnifiedTransfer['kind'] }) => {
      const { data } = await API.post(`${transferEndpointBase(kind)}/${id}/approve`);
      return data;
    },
    onSuccess: invalidateTransferQueries,
  });

  const rejectTransferMutation = useMutation({
    mutationFn: async ({ id, kind }: { id: number; kind: UnifiedTransfer['kind'] }) => {
      const { data } = await API.post(`${transferEndpointBase(kind)}/${id}/reject`);
      return data;
    },
    onSuccess: invalidateTransferQueries,
  });

  const cancelTransferMutation = useMutation({
    mutationFn: async ({ id, kind }: { id: number; kind: UnifiedTransfer['kind'] }) => {
      const { data } = await API.post(`${transferEndpointBase(kind)}/${id}/cancel`);
      return data;
    },
    onSuccess: invalidateTransferQueries,
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

  const getAccountStatusLabel = (status: string) => {
    if (status === 'active') return t('finance.statusActive');
    if (status === 'inactive') return t('finance.statusInactive');
    return status;
  };

  const getTransferStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      approved: t('finance.statusApproved'),
      pending: t('finance.statusPending'),
      sent: t('finance.statusPending'),
      rejected: t('finance.statusRejected'),
      cancelled: t('finance.statusCancelled'),
    };
    return map[status] || status;
  };

  const getAccountTypeName = (type: string, typeName?: string) => {
    if (typeName) return typeName;
    if (type === '0001') return '0001 - Naqd';
    if (type === '0002') return '0002 - Naqdsiz';
    return type;
  };

  const getBranchLabel = (branch?: Branch) => {
    if (!branch) return '-';
    return getLocalized(branch, 'name', i18n.language) || branch.name_uz || '-';
  };

  const isCashAccountType = (type?: string) => type === '0001';

  const isCashTypeName = (name?: string) => name === 'Naqd';

  // Tanlov ro'yxatida faqat raqam emas, tur matni ham: «202000010001 — Naqd (Parvoz)».
  const accountOptionLabel = (a: FinanceAccount) =>
    `${a.account_number} — ${
      isCashAccountType(a.account_type) ? t('jamgarma.cashShort') : t('jamgarma.nonCashShort')
    } (${getBranchLabel(a.branch)})`;

  const getJamgarmaDisplayName = (j?: JamgarmaRef) => {
    if (!j) return '-';
    return getLocalized(j, 'name', i18n.language) || j.name_uz || `Jam'garma #${j.id}`;
  };

  // ─── Transfer Logic ────────────────────────────────────────────────────────

  const senderAccount = accounts.find((a) => a.id === Number(transferForm.sender_account_id));
  const receiverAccount = accounts.find((a) => a.id === Number(transferForm.receiver_account_id));

  const savingsSenderAccount = accounts.find((a) => a.id === Number(savingsForm.sender_account_id));
  const selectedJamgarma = jamgarmas.find((j) => j.id === Number(savingsForm.jamgarma_id));

  // Jamg'armaga o'tkazma: hisob raqam alohida tanlanmaydi — jamg'arma filialining naqd va naqdsiz hisoblaridan biri
  // tanlanadi. Backend o'tkazmani manba hisob turiga qarab jamg'armaning naqd yoki naqdsiz balansiga qo'shadi.
  // Ro'yxat javobida `branch_id` bo'lmasligi mumkin (faqat `branch` obyekti) — ikkalasiga ham qaraymiz.
  const branchIdOf = (x?: { branch?: { id?: number }; branch_id?: number }) => x?.branch?.id ?? x?.branch_id;
  const savingsBranchId = selectedJamgarma ? branchIdOf(selectedJamgarma) : undefined;
  const savingsBranchAccounts =
    savingsBranchId == null
      ? []
      : sourceAccounts.filter(
          (a) =>
            String(branchIdOf(a)) === String(savingsBranchId) &&
            a.status !== 'inactive' &&
            a.is_active !== false,
        );
  const savingsSourceOptions = [
    { key: 'cash', label: t('jamgarma.cashShort'), account: savingsBranchAccounts.find((a) => isCashAccountType(a.account_type)) },
    { key: 'noncash', label: t('jamgarma.nonCashShort'), account: savingsBranchAccounts.find((a) => !isCashAccountType(a.account_type)) },
  ];

  const getJamgarmaName = (j: Jamgarma) =>
    getLocalized(j, 'name', i18n.language) || j.name_uz || `Jam'garma #${j.id}`;

  // Jamg'armalar filialma-filial bor (bir xil nom bir necha filialda takrorlanadi) — tanlovda «Nom (Filial)».
  const jamgarmaOptionLabel = (j: Jamgarma) => {
    const branch = getBranchLabel(j.branch);
    return branch === '-' ? getJamgarmaName(j) : `${getJamgarmaName(j)} (${branch})`;
  };

  // Balans zaxira manbadan (`/options/*`) kelganda yo'q — «0 UZS» deb yolg'on ko'rsatmaymiz.
  const formatBalance = (val?: number | null) => (val == null ? '—' : `${formatAmount(val)} UZS`);
  // Mablag' hisob balansidan oshadimi? Balans noma'lum bo'lsa mijozda tekshirilmaydi (backend tekshiradi).
  const exceedsBalance = (account: FinanceAccount | undefined, amount: string) =>
    !!account && account.balance != null && !!amount && Number(amount.replace(/\s/g, '')) > account.balance;

  const handleTransferSubmit = () => {
    if (
      !transferForm.sender_account_id ||
      !transferForm.receiver_account_id ||
      !transferForm.amount
    )
      return;
    setShowConfirmTransfer(true);
  };

  const confirmTransfer = () => {
    createTransferMutation.mutate({
      source_account_id: Number(transferForm.sender_account_id),
      destination_account_id: Number(transferForm.receiver_account_id),
      amount: Number(transferForm.amount.replace(/\s/g, '')),
      currency: 'UZS',
      notes: transferForm.description,
    });
  };

  // ─── Filter Options & Logic ────────────────────────────────────────────────

  // Cashiers (responsible persons) are derived from the transfers themselves.
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

  const filterFields: FilterBarField<FinanceFilterKey>[] = [
    {
      key: 'jamgarmaId',
      label: t('finance.filterByFund'),
      placeholder: t('finance.filterAll'),
      options: jamgarmas.map((j) => ({ value: j.id, label: jamgarmaOptionLabel(j) })),
    },
    {
      key: 'cashierId',
      label: t('finance.filterByCashier'),
      placeholder: t('finance.filterAll'),
      options: cashierOptions.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      key: 'status',
      label: t('finance.filterByStatus'),
      placeholder: t('finance.filterAll'),
      options: [
        { value: 'pending', label: t('finance.statusPending') },
        { value: 'approved', label: t('finance.statusApproved') },
        { value: 'rejected', label: t('finance.statusRejected') },
        { value: 'cancelled', label: t('finance.statusCancelled') },
      ],
    },
    {
      key: 'date',
      label: t('finance.filterByDate'),
      type: 'date',
    },
  ];

  const handleFilterChange = (next: Record<FinanceFilterKey, string>) => {
    setFilters(next);
    setTransferPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FINANCE_FILTERS);
    setTransferPage(1);
  };

  // ─── Filtered & Paginated Data ─────────────────────────────────────────────

  const filteredTransfers = useMemo(() => {
    const q = transferSearch.trim().toLowerCase();
    return transfers.filter((tr) => {
      // Fund filter — matches transfers whose destination is the selected jamgarma.
      if (filters.jamgarmaId && String(tr.destination_jamgarma?.id) !== filters.jamgarmaId) {
        return false;
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
        if (filters.status === 'pending'
          ? tr.status !== 'pending' && tr.status !== 'sent'
          : tr.status !== filters.status) {
          return false;
        }
      }

      // Date filter — match transfers created on the selected day.
      if (filters.date) {
        const start = new Date(filters.date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.date);
        end.setHours(23, 59, 59, 999);
        const created = new Date(tr.sent_at);
        if (created < start || created > end) return false;
      }

      // Search filter — matches sender/receiver account (number + branch) & notes.
      if (q) {
        const destBranch =
          tr.kind === 'account'
            ? getBranchLabel(accountsById.get(tr.destination_account!.id)?.branch)
            : getJamgarmaDisplayName(tr.destination_jamgarma);
        const matches =
          tr.notes?.toLowerCase().includes(q) ||
          tr.source_account?.account_number?.toLowerCase().includes(q) ||
          getBranchLabel(accountsById.get(tr.source_account.id)?.branch).toLowerCase().includes(q) ||
          tr.destination_account?.account_number?.toLowerCase().includes(q) ||
          destBranch.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers, filters, transferSearch, accountsById, i18n.language]);

  // Default — eng oxirgi o'tkazma tepada; ID ustuni bosilsa asc/desc almashadi.
  //
  // `useTableSort`ning o'ZI ichki default (`compareByNewest`) `created_at`/`id`ga
  // qaraydi — lekin `UnifiedTransfer`da `created_at` yo'q, `id` esa ikki xil
  // manbadan (`account` va `jamgarma` o'tkazmalari, har birining o'z id
  // ketma-ketligi) birlashtirilgan, shu sabab ular orasida solishtirish
  // ma'nosiz aralashib chiqardi (masalan bugungi yozuv o'rtada ko'rinardi).
  // Ikkala turda ham umumiy va haqiqiy vaqt maydoni — `sent_at`, shu bo'yicha
  // aniq belgilaymiz.
  const sort = useTableSort(
    filteredTransfers,
    undefined,
    (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
  );

  const paginatedTransfers = (() => {
    const start = (transferPage - 1) * ITEMS_PER_PAGE;
    return sort.rows.slice(start, start + ITEMS_PER_PAGE);
  })();

  const transferLastPage = Math.max(1, Math.ceil(filteredTransfers.length / ITEMS_PER_PAGE));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="finances container">
      {/* ── Confirm Transfer Modal ────────────────────────────── */}
      {showConfirmTransfer && (
        <div className="fin-modal-overlay" onClick={() => setShowConfirmTransfer(false)}>
          <div className="fin-modal fin-modal-sm" onClick={(e) => e.stopPropagation()}>
            <p className="fin-confirm-text">{t('finance.confirmTransfer')}</p>
            <div className="fin-modal-actions">
              <WriteGuard>
                <button
                  className="fin-btn-save"
                  onClick={confirmTransfer}
                  disabled={createTransferMutation.isPending}
                >
                  {createTransferMutation.isPending ? t('finance.saving') : t('finance.confirm')}
                </button>
              </WriteGuard>
              <button className="fin-btn-cancel" onClick={() => setShowConfirmTransfer(false)}>
                {t('finance.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TRANSFER LIST VIEW ─────────────────────────────────── */}
      {transferView === 'list' && (
        <>
          {/* Toolbar */}
          <div className="fin-toolbar">
            <div className="fin-search-box">
              <input
                placeholder={t('finance.searchPlaceholder')}
                value={transferSearch}
                onChange={(e) => {
                  setTransferSearch(e.target.value);
                  setTransferPage(1);
                }}
              />
              <i className="fa-solid fa-magnifying-glass" />
            </div>
            <FilterButton
              onClick={() => setShowFilter((v) => !v)}
              active={showFilter || activeFilterCount > 0}
              expanded={showFilter}
              count={activeFilterCount}
              label={t('finance.filter')}
            />
            {canCreateAnyTransfer && (
              <WriteGuard>
                <button className="fin-btn-add" onClick={() => setTransferView('select-type')}>
                  {t('finance.createTransfer')}
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
                ariaLabel={t('finance.filterTitle')}
              />
            </div>
          )}

          {/* Transfers Table */}
          <div className="fin-table-wrapper responsive-table-wrap">
            <table className="fin-table fin-transfers-table">
              <thead>
                <tr>
                  <SortableTh sortKey="id" sort={sort}>
                    {t('finance.id')}
                  </SortableTh>
                  <th>{t('finance.senderAccount')}</th>
                  <th>{t('finance.receiverAccount')}</th>
                  <th>{t('finance.amount')}</th>
                  <th>{t('finance.responsiblePersons')}</th>
                  <th>{t('finance.description')}</th>
                  <th>{t('finance.status')}</th>
                  <th>{t('finance.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {transfersLoading ? (
                  <TableSkeleton rowCount={10} columnCount={8} />
                ) : paginatedTransfers.length > 0 ? (
                  paginatedTransfers.map((tr, idx) => {
                    const rowKey = `${tr.kind}-${tr.id}`;
                    const destBranchLabel =
                      tr.kind === 'account'
                        ? getBranchLabel(accountsById.get(tr.destination_account!.id)?.branch)
                        : getJamgarmaDisplayName(tr.destination_jamgarma);
                    const destAccountNumber =
                      tr.kind === 'account' ? tr.destination_account!.account_number : '-';
                    const destIsCash =
                      tr.kind === 'account'
                        ? isCashAccountType(tr.destination_account!.account_type)
                        : isCashTypeName(tr.destination_type_name);
                    const destTypeLabel =
                      tr.kind === 'account'
                        ? destIsCash
                          ? t('finance.typeCash')
                          : t('finance.typeNonCash')
                        : tr.destination_type_name || '-';

                    const respEntries: {
                      label: string;
                      name: string | null;
                      date: string | null;
                    }[] = [
                      {
                        label: t('finance.senderPerson'),
                        name: tr.sent_by?.full_name || null,
                        date: tr.sent_at,
                      },
                    ];
                    if (tr.approved_at) {
                      respEntries.push({
                        label: t('finance.approverPerson'),
                        name: tr.approved_by?.full_name || null,
                        date: tr.approved_at,
                      });
                    }
                    if (tr.rejected_at) {
                      respEntries.push({
                        label: t('finance.rejecterPerson'),
                        name: tr.rejected_by?.full_name || null,
                        date: tr.rejected_at,
                      });
                    }
                    if (tr.cancelled_at) {
                      respEntries.push({
                        label: t('finance.cancellerPerson'),
                        name: tr.cancelled_by?.full_name || null,
                        date: tr.cancelled_at,
                      });
                    }

                    const isAwaitingAction = tr.status === 'pending' || tr.status === 'sent';

                    return (
                      <tr key={rowKey}>
                        <td>
                          {String((transferPage - 1) * ITEMS_PER_PAGE + idx + 1).padStart(2, '0')}
                        </td>

                        {/* Sender Account */}
                        <td>
                          <div className="fin-account-cell">
                            <span className="fin-branch-name">
                              {getBranchLabel(accountsById.get(tr.source_account.id)?.branch)}
                            </span>
                            <span className="fin-acct-row">
                              <span className="fin-acct-number">
                                {tr.source_account.account_number || '-'}
                              </span>
                              <span
                                className={`fin-type-badge ${
                                  isCashAccountType(tr.source_account.account_type)
                                    ? 'fin-badge-cash'
                                    : 'fin-badge-noncash'
                                }`}
                              >
                                {isCashAccountType(tr.source_account.account_type)
                                  ? t('finance.typeCash')
                                  : t('finance.typeNonCash')}
                              </span>
                            </span>
                          </div>
                        </td>

                        {/* Receiver Account / Jamgarma */}
                        <td>
                          <div className="fin-account-cell">
                            <span className="fin-branch-name">{destBranchLabel}</span>
                            <span className="fin-acct-row">
                              <span className="fin-acct-number">{destAccountNumber}</span>
                              <span
                                className={`fin-type-badge ${
                                  destIsCash ? 'fin-badge-cash' : 'fin-badge-noncash'
                                }`}
                              >
                                {destTypeLabel}
                              </span>
                            </span>
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="fin-amount-cell fin-text-orange">
                          {formatAmount(tr.amount)} UZS
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
                                : tr.status === 'cancelled' || tr.status === 'rejected'
                                  ? ' fin-text-red'
                                  : ' fin-text-orange'
                            }`}
                          >
                            {getTransferStatusLabel(tr.status)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td>
                          {isAwaitingAction && (
                            <div className="fin-transfer-action-btns">
                              <Protected permission={`${TRANSFER_PERMISSION[tr.kind]}.approve`}>
                                <button
                                  className="fin-btn-approve"
                                  onClick={() =>
                                    approveTransferMutation.mutate({ id: tr.id, kind: tr.kind })
                                  }
                                  disabled={approveTransferMutation.isPending}
                                >
                                  {t('finance.approve')}
                                </button>
                              </Protected>
                              <Protected permission={`${TRANSFER_PERMISSION[tr.kind]}.reject`}>
                                <button
                                  className="fin-btn-reject"
                                  onClick={() =>
                                    rejectTransferMutation.mutate({ id: tr.id, kind: tr.kind })
                                  }
                                  disabled={rejectTransferMutation.isPending}
                                >
                                  {t('finance.reject')}
                                </button>
                              </Protected>
                              <Protected permission={`${TRANSFER_PERMISSION[tr.kind]}.cancel`}>
                                <button
                                  className="fin-btn-cancel-transfer"
                                  onClick={() =>
                                    cancelTransferMutation.mutate({ id: tr.id, kind: tr.kind })
                                  }
                                  disabled={cancelTransferMutation.isPending}
                                >
                                  {t('finance.cancelTransfer')}
                                </button>
                              </Protected>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <EmptyState colSpan={8} message={t('finance.noTransfers')} />
                )}
              </tbody>
            </table>
          </div>

          {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
          <div className="responsive-cards">
            {transfersLoading ? (
              <div className="data-card" style={{ textAlign: 'center' }}>
                ...
              </div>
            ) : paginatedTransfers.length === 0 ? (
              <div className="data-card" style={{ textAlign: 'center' }}>
                {t('finance.noTransfers')}
              </div>
            ) : (
              paginatedTransfers.map((tr, idx) => {
                const rowKey = `${tr.kind}-${tr.id}`;
                const destBranchLabel =
                  tr.kind === 'account'
                    ? getBranchLabel(accountsById.get(tr.destination_account!.id)?.branch)
                    : getJamgarmaDisplayName(tr.destination_jamgarma);
                const destAccountNumber =
                  tr.kind === 'account' ? tr.destination_account!.account_number : '-';
                const destIsCash =
                  tr.kind === 'account'
                    ? isCashAccountType(tr.destination_account!.account_type)
                    : isCashTypeName(tr.destination_type_name);
                const destTypeLabel =
                  tr.kind === 'account'
                    ? destIsCash
                      ? t('finance.typeCash')
                      : t('finance.typeNonCash')
                    : tr.destination_type_name || '-';
                const respEntries: { label: string; name: string | null; date: string | null }[] =
                  [
                    {
                      label: t('finance.senderPerson'),
                      name: tr.sent_by?.full_name || null,
                      date: tr.sent_at,
                    },
                  ];
                if (tr.approved_at)
                  respEntries.push({
                    label: t('finance.approverPerson'),
                    name: tr.approved_by?.full_name || null,
                    date: tr.approved_at,
                  });
                if (tr.rejected_at)
                  respEntries.push({
                    label: t('finance.rejecterPerson'),
                    name: tr.rejected_by?.full_name || null,
                    date: tr.rejected_at,
                  });
                if (tr.cancelled_at)
                  respEntries.push({
                    label: t('finance.cancellerPerson'),
                    name: tr.cancelled_by?.full_name || null,
                    date: tr.cancelled_at,
                  });
                const isAwaitingAction = tr.status === 'pending' || tr.status === 'sent';
                return (
                  <div key={rowKey} className="data-card">
                    <div className="data-card__head">
                      <span className="data-card__title">
                        №{String((transferPage - 1) * ITEMS_PER_PAGE + idx + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`fin-status-text${
                          tr.status === 'approved'
                            ? ' fin-text-green'
                            : tr.status === 'cancelled' || tr.status === 'rejected'
                              ? ' fin-text-red'
                              : ' fin-text-orange'
                        }`}
                      >
                        {getTransferStatusLabel(tr.status)}
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('finance.senderAccount')}</span>
                      <span className="data-card__value">
                        {getBranchLabel(accountsById.get(tr.source_account.id)?.branch)} ·{' '}
                        {tr.source_account.account_number || '-'} (
                        {isCashAccountType(tr.source_account.account_type)
                          ? t('finance.typeCash')
                          : t('finance.typeNonCash')}
                        )
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('finance.receiverAccount')}</span>
                      <span className="data-card__value">
                        {destBranchLabel} · {destAccountNumber} ({destTypeLabel})
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('finance.amount')}</span>
                      <span className="data-card__value fin-text-orange">
                        {formatAmount(tr.amount)} UZS
                      </span>
                    </div>
                    {respEntries.some((e) => e.name) && (
                      <div className="data-card__row">
                        <span className="data-card__label">
                          {t('finance.responsiblePersons')}
                        </span>
                        <span className="data-card__value">
                          {respEntries
                            .filter((e) => e.name)
                            .map(
                              (e) =>
                                `${e.label}: ${e.name}${e.date ? ` (${formatDate(e.date)})` : ''}`,
                            )
                            .join('; ')}
                        </span>
                      </div>
                    )}
                    {tr.notes && (
                      <div className="data-card__row">
                        <span className="data-card__label">{t('finance.description')}</span>
                        <span className="data-card__value">{tr.notes}</span>
                      </div>
                    )}
                    {isAwaitingAction && (
                      <div className="data-card__actions">
                        <Protected permission={`${TRANSFER_PERMISSION[tr.kind]}.approve`}>
                          <button
                            className="fin-btn-approve"
                            onClick={() =>
                              approveTransferMutation.mutate({ id: tr.id, kind: tr.kind })
                            }
                            disabled={approveTransferMutation.isPending}
                          >
                            {t('finance.approve')}
                          </button>
                        </Protected>
                        <Protected permission={`${TRANSFER_PERMISSION[tr.kind]}.reject`}>
                          <button
                            className="fin-btn-reject"
                            onClick={() =>
                              rejectTransferMutation.mutate({ id: tr.id, kind: tr.kind })
                            }
                            disabled={rejectTransferMutation.isPending}
                          >
                            {t('finance.reject')}
                          </button>
                        </Protected>
                        <Protected permission={`${TRANSFER_PERMISSION[tr.kind]}.cancel`}>
                          <button
                            className="fin-btn-cancel-transfer"
                            onClick={() =>
                              cancelTransferMutation.mutate({ id: tr.id, kind: tr.kind })
                            }
                            disabled={cancelTransferMutation.isPending}
                          >
                            {t('finance.cancelTransfer')}
                          </button>
                        </Protected>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Transfers Pagination */}
          {filteredTransfers.length > 0 && (
            <Pagination
              currentPage={transferPage}
              lastPage={transferLastPage}
              from={(transferPage - 1) * ITEMS_PER_PAGE + 1}
              to={Math.min(transferPage * ITEMS_PER_PAGE, filteredTransfers.length)}
              total={filteredTransfers.length}
              onPageChange={setTransferPage}
            />
          )}
        </>
      )}

      {/* ── SELECT TRANSFER TYPE MODAL ───────────────────────── */}
      {transferView === 'select-type' && (
        <div className="fin-modal-overlay" onClick={() => setTransferView('list')}>
          <div className="fin-transfer-type-select" onClick={(e) => e.stopPropagation()}>
            <h3 className="fin-type-select-title">{t('finance.selectTransferType')}</h3>
            <WriteGuard>
              {canCreateAccountTransfer && (
                <button className="fin-type-btn" onClick={() => setTransferView('create')}>
                  {t('finance.typeAccountToAccount')}
                </button>
              )}
              {canCreateSavingsTransfer && (
                <button className="fin-type-btn" onClick={() => setTransferView('savings')}>
                  {t('finance.typeAccountToSavings')}
                </button>
              )}
            </WriteGuard>
          </div>
        </div>
      )}

      {/* ── TRANSFER CREATE VIEW ──────────────────────────────── */}
      {transferView === 'create' && (
        <div className="fin-transfer-create">
          <button
            className="fin-back-btn"
            onClick={() => {
              setTransferView('select-type');
              setTransferForm({
                sender_account_id: '',
                receiver_account_id: '',
                amount: '',
                description: '',
              });
            }}
          >
            <i className="fa-solid fa-arrow-left" />
            {t('finance.back')}
          </button>

          <div className="fin-transfer-layout">
            {/* Left: Account Cards */}
            <div className="fin-transfer-cards">
              {/* Sender Card */}
              <div className="fin-account-card">
                <div className="fin-card-header">
                  <i className="fa-solid fa-building-columns fin-card-icon" />
                  <h4>{t('finance.senderAccountCard')}</h4>
                </div>
                {senderAccount ? (
                  <div className="fin-card-details">
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.id')}</span>
                      <span className="fin-card-value">{senderAccount.id}</span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.branch')}</span>
                      <span className="fin-card-value">{getBranchLabel(senderAccount.branch)}</span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.accountType')}</span>
                      <span className="fin-card-value">
                        {getAccountTypeName(
                          senderAccount.account_type,
                          senderAccount.account_type_name,
                        )}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.accountNumber')}</span>
                      <span className="fin-card-value fin-mono">
                        {senderAccount.account_number}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.currentBalance')}</span>
                      <span className="fin-card-value fin-text-green">
                        {formatBalance(senderAccount.balance)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.status')}</span>
                      <span className="fin-card-value fin-text-green">
                        {getAccountStatusLabel(senderAccount.status)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.createdAt')}</span>
                      <span className="fin-card-value">{formatDate(senderAccount.created_at)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="fin-card-empty">{t('finance.selectSenderFirst')}</p>
                )}
              </div>

              {/* Receiver Card */}
              <div className="fin-account-card">
                <div className="fin-card-header">
                  <i className="fa-solid fa-building-columns fin-card-icon" />
                  <h4>{t('finance.receiverAccountCard')}</h4>
                </div>
                {receiverAccount ? (
                  <div className="fin-card-details">
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.id')}</span>
                      <span className="fin-card-value">{receiverAccount.id}</span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.branch')}</span>
                      <span className="fin-card-value">
                        {getBranchLabel(receiverAccount.branch)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.accountType')}</span>
                      <span className="fin-card-value">
                        {getAccountTypeName(
                          receiverAccount.account_type,
                          receiverAccount.account_type_name,
                        )}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.accountNumber')}</span>
                      <span className="fin-card-value fin-mono">
                        {receiverAccount.account_number}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.currentBalance')}</span>
                      <span className="fin-card-value fin-text-green">
                        {formatBalance(receiverAccount.balance)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.status')}</span>
                      <span className="fin-card-value fin-text-green">
                        {getAccountStatusLabel(receiverAccount.status)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.createdAt')}</span>
                      <span className="fin-card-value">
                        {formatDate(receiverAccount.created_at)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="fin-card-empty">{t('finance.selectReceiverFirst')}</p>
                )}
              </div>
            </div>

            {/* Right: Transfer Form */}
            <div className="fin-transfer-form-card">
              <div className="fin-card-header">
                <i className="fa-solid fa-building-columns fin-card-icon" />
                <h4>{t('finance.newTransfer')}</h4>
              </div>

              <div className="fin-form-group">
                <label>{t('finance.senderAccountLabel')}</label>
                <select
                  value={transferForm.sender_account_id}
                  onChange={(e) =>
                    setTransferForm({ ...transferForm, sender_account_id: e.target.value })
                  }
                >
                  <option value="">{t('finance.choose')}</option>
                  {sourceAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fin-form-group">
                <label>{t('finance.receiverAccountLabel')}</label>
                <select
                  value={transferForm.receiver_account_id}
                  onChange={(e) =>
                    setTransferForm({ ...transferForm, receiver_account_id: e.target.value })
                  }
                >
                  <option value="">{t('finance.choose')}</option>
                  {accounts
                    .filter((a) => a.id !== Number(transferForm.sender_account_id))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {accountOptionLabel(a)}
                      </option>
                    ))}
                </select>
              </div>

              <div className="fin-form-group">
                <label>{t('finance.amount')}</label>
                <div className="fin-amount-input-wrap">
                  <input
                    type="text"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    placeholder="0"
                    className={exceedsBalance(senderAccount, transferForm.amount) ? 'fin-input-error' : ''}
                  />
                  <span className="fin-currency-badge">UZS</span>
                </div>
                {exceedsBalance(senderAccount, transferForm.amount) && (
                  <span className="fin-field-error">
                    {t('finance.amountExceedsBalance')}: {formatBalance(senderAccount?.balance)}
                  </span>
                )}
              </div>

              <div className="fin-form-group">
                <label>{t('finance.description')}</label>
                <textarea
                  value={transferForm.description}
                  onChange={(e) =>
                    setTransferForm({ ...transferForm, description: e.target.value })
                  }
                  rows={4}
                  placeholder={t('finance.descriptionPlaceholder')}
                />
              </div>

              <WriteGuard>
                <button
                  className="fin-btn-transfer"
                  onClick={handleTransferSubmit}
                  disabled={
                    !transferForm.sender_account_id ||
                    !transferForm.receiver_account_id ||
                    !transferForm.amount ||
                    exceedsBalance(senderAccount, transferForm.amount)
                  }
                >
                  {t('finance.sendTransfer')}
                </button>
              </WriteGuard>
            </div>
          </div>
        </div>
      )}
      {/* ── SAVINGS TRANSFER CREATE VIEW ─────────────────────── */}
      {transferView === 'savings' && (
        <div className="fin-transfer-create">
          <button
            className="fin-back-btn"
            onClick={() => {
              setTransferView('select-type');
              setSavingsForm({
                sender_account_id: '',
                jamgarma_id: '',
                amount: '',
                description: '',
              });
            }}
          >
            <i className="fa-solid fa-arrow-left" />
            {t('finance.back')}
          </button>

          {/* Confirm savings transfer modal */}
          {showConfirmSavings && (
            <div className="fin-modal-overlay" onClick={() => setShowConfirmSavings(false)}>
              <div className="fin-modal fin-modal-sm" onClick={(e) => e.stopPropagation()}>
                <p className="fin-confirm-text">{t('finance.confirmTransfer')}</p>
                <div className="fin-modal-actions">
                  <WriteGuard>
                    <button
                      className="fin-btn-save"
                      onClick={() => {
                        createSavingsTransferMutation.mutate({
                          source_account_id: Number(savingsForm.sender_account_id),
                          destination_jamgarma_id: Number(savingsForm.jamgarma_id),
                          amount: Number(savingsForm.amount.replace(/\s/g, '')),
                          currency: 'UZS',
                          notes: savingsForm.description,
                        });
                      }}
                      disabled={createSavingsTransferMutation.isPending}
                    >
                      {createSavingsTransferMutation.isPending
                        ? t('finance.saving')
                        : t('finance.confirm')}
                    </button>
                  </WriteGuard>
                  <button className="fin-btn-cancel" onClick={() => setShowConfirmSavings(false)}>
                    {t('finance.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="fin-transfer-layout">
            {/* Left: Cards */}
            <div className="fin-transfer-cards">
              {/* Sender Account Card */}
              <div className="fin-account-card">
                <div className="fin-card-header">
                  <i className="fa-solid fa-building-columns fin-card-icon" />
                  <h4>{t('finance.senderAccountCard')}</h4>
                </div>
                {savingsSenderAccount ? (
                  <div className="fin-card-details">
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.id')}</span>
                      <span className="fin-card-value">{savingsSenderAccount.id}</span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.branch')}</span>
                      <span className="fin-card-value">
                        {getBranchLabel(savingsSenderAccount.branch)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.accountType')}</span>
                      <span className="fin-card-value">
                        {getAccountTypeName(
                          savingsSenderAccount.account_type,
                          savingsSenderAccount.account_type_name,
                        )}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.accountNumber')}</span>
                      <span className="fin-card-value fin-mono">
                        {savingsSenderAccount.account_number}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.currentBalance')}</span>
                      <span className="fin-card-value fin-text-green">
                        {formatBalance(savingsSenderAccount.balance)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.status')}</span>
                      <span className="fin-card-value fin-text-green">
                        {getAccountStatusLabel(savingsSenderAccount.status)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.createdAt')}</span>
                      <span className="fin-card-value">
                        {formatDate(savingsSenderAccount.created_at)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="fin-card-empty">{t('finance.selectSenderFirst')}</p>
                )}
              </div>

              {/* Receiver Jamgarma Card */}
              <div className="fin-account-card">
                <div className="fin-card-header">
                  <h4>{t('finance.receiverSavingsCard')}</h4>
                </div>
                {selectedJamgarma ? (
                  <div className="fin-card-details">
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.id')}</span>
                      <span className="fin-card-value">{selectedJamgarma.id}</span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.savingsName')}</span>
                      <span className="fin-card-value">{getJamgarmaName(selectedJamgarma)}</span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.branch')}</span>
                      <span className="fin-card-value">{getBranchLabel(selectedJamgarma.branch)}</span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.cashBalance')}</span>
                      <span className="fin-card-value fin-text-green">
                        {formatBalance(selectedJamgarma.cash_balance)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.nonCashBalance')}</span>
                      <span className="fin-card-value fin-text-green">
                        {formatBalance(selectedJamgarma.non_cash_balance)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.status')}</span>
                      <span
                        className={`fin-card-value ${selectedJamgarma.status === 'active' ? 'fin-text-green' : 'fin-text-red'}`}
                      >
                        {getAccountStatusLabel(selectedJamgarma.status)}
                      </span>
                    </div>
                    <div className="fin-card-row">
                      <span className="fin-card-label">{t('finance.createdAt')}</span>
                      <span className="fin-card-value">
                        {formatDate(selectedJamgarma.created_at)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="fin-card-empty">{t('finance.selectSavingsFirst')}</p>
                )}
              </div>
            </div>

            {/* Right: Savings Transfer Form */}
            <div className="fin-transfer-form-card">
              <div className="fin-card-header">
                <i className="fa-solid fa-piggy-bank fin-card-icon" />
                <h4>{t('finance.newTransfer')}</h4>
              </div>

              <div className="fin-form-group">
                <label>{t('finance.savingsLabel')}</label>
                <select
                  value={savingsForm.jamgarma_id}
                  onChange={(e) =>
                    setSavingsForm({ ...savingsForm, jamgarma_id: e.target.value, sender_account_id: '' })
                  }
                >
                  <option value="">{t('finance.choose')}</option>
                  {jamgarmas.map((j) => (
                    <option key={j.id} value={j.id}>
                      {jamgarmaOptionLabel(j)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fin-form-group">
                <label>{t('finance.savingsSource')}</label>
                <select
                  value={savingsForm.sender_account_id}
                  disabled={!selectedJamgarma}
                  onChange={(e) =>
                    setSavingsForm({ ...savingsForm, sender_account_id: e.target.value })
                  }
                >
                  <option value="">
                    {selectedJamgarma ? t('finance.choose') : t('finance.savingsSourceFirst')}
                  </option>
                  {savingsSourceOptions.map((o) => (
                    <option key={o.key} value={o.account?.id ?? ''} disabled={!o.account}>
                      {o.account
                        ? `${accountOptionLabel(o.account)}${
                            o.account.balance == null ? '' : ` — ${formatBalance(o.account.balance)}`
                          }`
                        : `${o.label} — ${t('finance.noAccountOfType')}`}
                    </option>
                  ))}
                </select>
                {selectedJamgarma && savingsBranchAccounts.length === 0 && (
                  <span className="fin-field-error">{t('finance.noBranchAccounts')}</span>
                )}
              </div>

              <div className="fin-form-group">
                <label>{t('finance.amount')}</label>
                <div className="fin-amount-input-wrap">
                  <input
                    type="text"
                    value={savingsForm.amount}
                    onChange={(e) => setSavingsForm({ ...savingsForm, amount: e.target.value })}
                    placeholder="0"
                    className={
                      exceedsBalance(savingsSenderAccount, savingsForm.amount) ? 'fin-input-error' : ''
                    }
                  />
                  <span className="fin-currency-badge">UZS</span>
                </div>
                {exceedsBalance(savingsSenderAccount, savingsForm.amount) && (
                  <span className="fin-field-error">
                    {t('finance.amountExceedsBalance')}: {formatBalance(savingsSenderAccount?.balance)}
                  </span>
                )}
              </div>

              <div className="fin-form-group">
                <label>{t('finance.description')}</label>
                <textarea
                  value={savingsForm.description}
                  onChange={(e) => setSavingsForm({ ...savingsForm, description: e.target.value })}
                  rows={4}
                  placeholder={t('finance.descriptionPlaceholder')}
                />
              </div>

              <WriteGuard>
                <button
                  className="fin-btn-transfer"
                  onClick={() => setShowConfirmSavings(true)}
                  disabled={
                    !savingsForm.sender_account_id ||
                    !savingsForm.jamgarma_id ||
                    !savingsForm.amount ||
                    exceedsBalance(savingsSenderAccount, savingsForm.amount)
                  }
                >
                  {t('finance.sendTransfer')}
                </button>
              </WriteGuard>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Finances;
