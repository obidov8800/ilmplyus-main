import { groupDigits } from '@/utils/formatNumber';
import { categoryBelongsToFund, hasCategoryAssignment, type CategoryAssignment } from '@/utils/expenseCategoryAssignment';
import { formBranches, selectedFormBranch } from '@/utils/formBranches';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API } from '../../api/api';
import { useOptions } from '../../api/options';
import './users.css';
import './expenses.css';
import '../payments/payments.css';
import { useTranslation } from 'react-i18next';
import { getLocalized } from '../../utils/getLocalized';
import { Protected } from '../../components/Protected';
import { Pagination } from '@/components/Pagination';
import FilterBar, { type FilterBarField } from '@/components/FilterBar';
import { countFilterBarValues, type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import FilterButton from '@/components/FilterButton';
import SortableTh from '@/components/SortableTh';
import { useTableSort } from '@/hooks/useTableSort';
import { formatDateTime } from '@/utils/date';
import useAuthStore from '@/store/useAuthStore';
import { readJamgarmaPayment, type PaymentKind } from './jamgarmaPayment';
import { useJamgarmas } from './jamgarma.service';
import { jamgarmaLabelWithBranch } from '@/utils/jamgarmaLabel';
import { usePermission } from '@/hooks/usePermission';
import AccessNotice from '@/components/AccessNotice';

type ExpenseFilterKey = 'category' | 'subcategory' | 'fromDate' | 'toDate';

/** Bir sahifada ko'rsatiladigan qatorlar soni (to'lovlar sahifasidagidek). */
const PER_PAGE = 15;

interface Category extends CategoryAssignment {
  id: number;
  name_uz: string;
  name_ru?: string;
  name_en?: string;
  jamgarmas?: { id: number }[];
}

interface Subcategory {
  id: number;
  name_uz: string;
  name_ru?: string;
  name_en?: string;
  expense_category_id: number;
}

interface Cashier {
  id: number;
  full_name: string;
}

interface Branch {
  id: number;
  address: string;
}

interface Expense {
  id: number;
  amount: string;
  expense_date: string;
  info: string;
  created_at: string;
  updated_at: string;
  category?: Category;
  subcategory?: Subcategory;
  cashier?: Cashier;
  branch?: Branch;
}

/** Bugungi sana `YYYY-MM-DD` ko'rinishida (mahalliy vaqt bo'yicha). */
const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toApiDateTime = (dt: string) => {
  if (!dt) return undefined;
  const base = dt.replace('T', ' ');
  return base.length === 16 ? base + ':00' : base;
};

const Expenses = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<Expense | null>(null);
  /** «Ko'rish» oynasi — chiqim tafsilotlari, faqat o'qish uchun. */
  const [viewItem, setViewItem] = useState<Expense | null>(null);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [subcategoryFilter, setSubcategoryFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE);

  const [formData, setFormData] = useState({
    jamgarma_id: '',
    expense_category_id: '',
    expense_subcategory_id: '',
    user_id: '',
    amount: '',
    expense_date: '',
    branch_id: '',
    info: '',
    created_at: '',
    updated_at: '',
  });

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses'],
    queryFn: async () => (await API.get('/expenses')).data,
  });

  /** Kassir — chiqimni kiritayotgan xodim. */
  const autoUserId = String(currentUser?.id ?? '');
  const needsCashierField = !autoUserId;

  /** Chiqim naqddanmi yoki naqdsizdanmi — ikkalasiga ruxsat bo'lsa tanlanadi. */
  const [paymentKind, setPaymentKind] = useState<PaymentKind>('cash');

  const { data: jamgarmas } = useJamgarmas(i18n.language);
  const { data: subcategories } = useOptions('expense-subcategories');
  const { data: branchOptions } = useOptions('branches');
  const branches = formBranches(currentUser, branchOptions);
  /*
   * Xodimlar ro'yxati doim olinadi: kassir maydonidan tashqari, kirgan
   * xodimning filialini aniqlashda ham kerak (pastdagi `autoBranchId`).
   * Bu yengil lookup — `lookups.view` bilan hamma xodimda ochiq.
   */
  const { data: cashiers } = useOptions('users');

  /** Tanlangan jamg'arma — balans, filial va naqd/naqdsiz ruxsati shundan olinadi. */
  // Filial tanlansa jamg'armalar ro'yxati shu filialniki bilan cheklanadi (nomi bir xil jamg'arma har filialda bor).
  const [fundBranch, setFundBranch] = useState('');
  const activeFundBranch = selectedFormBranch(branches, fundBranch);
  const fundOptions = (jamgarmas ?? []).filter((j) => !!activeFundBranch && String(j.branch_id) === activeFundBranch);
  const handleFundBranchChange = (branchId: string) => {
    setFundBranch(branchId);
    setFormData((prev) => ({ ...prev, jamgarma_id: '', expense_category_id: '', expense_subcategory_id: '' }));
  };

  const selectedJamgarma = fundOptions.find((j) => String(j.id) === formData.jamgarma_id);
  const payment = readJamgarmaPayment(selectedJamgarma, currentUser?.id);

  /*
   * Filial hech qachon qo'lda tanlanmaydi. Manbalar ketma-ketligi:
   *   1) tanlangan jamg'armaga biriktirilgan filial
   *   2) kirgan xodimga biriktirilgan filial (`/me` javobidan)
   *   3) xodimlar ro'yxatidagi o'sha xodimning filiali
   *   4) xodimning shartnomasidagi filial (employees so'rovi orqali)
   *
   * Jamg'arma birinchi turadi: chiqim aynan o'sha jamg'armadan chiqadi,
   * shuning uchun uning filiali aniqroq.
   *
   * Uchinchi manba kerak, chunki `/me` javobida filial har doim ham bo'lmaydi,
   * `/jamgarmas` esa `jamgarmas.view` ruxsatisiz 403 qaytaradi. `/options/users`
   * esa `lookups.view` bilan ochiq va unda `branch_id` bor.
   */


  // Xodimning shartnomasi orqali filial olish
  // `/employees` — `employees.view` ruxsatini talab qiladi: ruxsati yo'q foydalanuvchi uchun so'ralmaydi (403 va
  // qizil xabar chiqmasin); filial boshqa manbalardan olinadi (jamg'arma, `/me` filiallari, `/options/users`).
  const canViewEmployees = usePermission('employees.view');
  const { data: employeeData } = useQuery({
    queryKey: ['employee-branch', currentUser?.id, canViewEmployees],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      try {
        // Avval employees ro'yxatidan user_id bo'yicha qidiramiz
        const { data: employeesData } = await API.get('/employees', {
          params: { user_id: currentUser.id },
        });

        const employees = Array.isArray(employeesData)
          ? employeesData
          : employeesData?.data || [];

        if (employees.length > 0) {
          return employees[0];
        }

        // User and employee IDs belong to different tables.
        return null;
      } catch {
        return null;
      }
    },
    enabled: !!currentUser?.id && canViewEmployees,
    staleTime: 15 * 1000,
  });

  const canViewContracts = usePermission('employee_contracts.view');
  const { data: employeeContracts } = useQuery({
    queryKey: ['expense-employee-contracts', currentUser?.id, employeeData?.id],
    queryFn: async () => {
      const { data } = await API.get('/contracts');
      const rows: { employee_id: number; status?: string; branch_id?: number; branch?: { id: number } }[] = Array.isArray(data) ? data : (data?.data ?? []);
      return rows.filter((row) => String(row.employee_id) === String(employeeData.id));
    },
    enabled: canViewContracts && !!employeeData?.id,
    staleTime: 15 * 1000,
  });
  const activeContracts = employeeContracts?.filter((row) => row.status === 'active');
  const contractBranchIds = [...new Set((activeContracts ?? []).map((row) => row.branch_id ?? row.branch?.id).filter(Boolean))];
  // Never choose arbitrarily between multiple contract branches.

  const branchMissingKey = employeeContracts?.length === 0
    ? 'expenses.employeeContractMissing'
    : activeContracts?.length && contractBranchIds.length === 0
      ? 'expenses.contractBranchMissing'
      : 'expenses.branchMissing';

  const autoBranchId = activeFundBranch;

  // Ruxsat bittagina bo'lsa tanlov ko'rsatilmaydi — o'sha tur avtomatik ketadi.
  const activeKind: PaymentKind | null = payment.needsChoice
    ? paymentKind
    : (payment.onlyKind ?? null);
  const showPaymentKind = payment.needsChoice || (payment.known && payment.onlyKind !== null);

  /*
   * Kategoriyalar jamg'arma bo'yicha filtrlanadi.
   *
   * Ilgari bu filtr faqat mijoz tomonida, `c.jamgarmas` ro'yxati bo'yicha
   * qilinardi — lekin `/options/expense-categories` javobida bu bog'liqlik
   * yo'q. Natijada `c.jamgarmas?.some(...)` doim `undefined` qaytarib,
   * jamg'arma tanlangach kategoriya ro'yxati butunlay bo'shab qolardi.
   *
   * Endi `jamgarma_id` serverga yuboriladi (server qo'llab-quvvatlasa o'zi
   * filtrlaydi), mijoz tomonida esa filtr faqat bog'liqlik haqiqatan kelgan
   * yozuvlarga qo'llanadi. Ikkala holatda ham ro'yxat bo'sh qolmaydi.
   */
  const { data: categories } = useQuery<Category[]>({
    queryKey: ['expense-categories', activeFundBranch, formData.jamgarma_id],
    queryFn: async () => {
      const { data } = await API.get('/options/expense-categories', {
        params: formData.jamgarma_id ? { jamgarma_id: formData.jamgarma_id, branch_id: activeFundBranch } : undefined,
      });
      return data.data ?? data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const lang = i18n.language;

  /** Qidiruv butun ro'yxat ustidan ketadi — ma'lumot bir marta yuklab olinadi. */
  const searchText = search.trim().toLowerCase();

  const matchedExpenses = expenses?.filter((e) => {
    const matchCategory = categoryFilter ? String(e.category?.id) === categoryFilter : true;

    const matchSubcategory = subcategoryFilter
      ? String(e.subcategory?.id) === subcategoryFilter
      : true;

    const matchDate =
      (!fromDate || e.expense_date >= fromDate) && (!toDate || e.expense_date <= toDate);

    const matchSearch =
      !searchText ||
      [
        String(e.id),
        e.category ? getLocalized(e.category, 'name', lang) : '',
        e.subcategory ? getLocalized(e.subcategory, 'name', lang) : '',
        e.cashier?.full_name ?? '',
        e.branch?.address ?? '',
        e.amount ?? '',
        e.info ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchText);

    return matchCategory && matchSubcategory && matchDate && matchSearch;
  });

  const sort = useTableSort(matchedExpenses);
  const filteredExpenses = sort.rows;

  // Sahifalash mijoz tomonida: filtr yoki qidiruvdan keyin qatorlar kamayib
  // ketsa, joriy sahifa raqami chegaradan chiqib bo'sh jadval ko'rsatmasin.
  const total = filteredExpenses.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, lastPage);
  const pageRows = filteredExpenses.slice((currentPage - 1) * perPage, currentPage * perPage);
  const from = total ? (currentPage - 1) * perPage + 1 : 0;
  const to = Math.min(currentPage * perPage, total);

  const filterValues: FilterBarValues<ExpenseFilterKey> = {
    category: categoryFilter,
    subcategory: subcategoryFilter,
    fromDate,
    toDate,
  };

  const filterFields: FilterBarField<ExpenseFilterKey>[] = [
    {
      key: 'category',
      label: t('expenses.category'),
      placeholder: t('expenses.category'),
      options: (categories ?? []).map((c) => ({
        value: String(c.id),
        label: getLocalized(c, 'name', lang),
      })),
    },
    {
      key: 'subcategory',
      label: t('expenses.subCategory'),
      placeholder: t('expenses.subCategory'),
      disabled: !categoryFilter,
      options: (subcategories ?? [])
        .filter((s) => !categoryFilter || String(s.expense_category_id) === categoryFilter)
        .map((s) => ({ value: String(s.id), label: s.label })),
    },
    {
      key: 'fromDate',
      label: `${t('expenses.date')} ${t('course.from')}`,
      type: 'date',
    },
    {
      key: 'toDate',
      label: `${t('expenses.date')} ${t('course.to')}`,
      type: 'date',
    },
  ];

  const activeFilterCount = countFilterBarValues(filterValues);

  const handleFiltersChange = (next: FilterBarValues<ExpenseFilterKey>) => {
    setCategoryFilter(next.category);
    // Kategoriya almashsa, oldingi kategoriyaning subkategoriyasi tanlovda qolib ketmasin.
    setSubcategoryFilter(next.category !== categoryFilter ? '' : next.subcategory);
    setFromDate(next.fromDate);
    setToDate(next.toDate);
    setPage(1);
  };

  const handleFiltersReset = () => {
    setCategoryFilter('');
    setSubcategoryFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  /**
   * Oynada ko'rsatilmaydigan maydonlarni to'ldiradi.
   *
   * Kassir — chiqimni kiritayotgan xodim, Filial — o'sha xodimning filiali,
   * Sana — bugungi kun. Backend izoh (`info`) ni ham talab qiladi, shu sabab
   * forma bu maydonni ko'rsatmasa ham mazmunli qiymat yuborilishi kerak.
   */
  const buildCreatePayload = () => {
    const selectedCategory = formCategories?.find(
      (c) => String(c.id) === formData.expense_category_id,
    );
    // Kategoriya nomi `label` yoki ko'p tilli `name_*` ustunida kelishi mumkin.
    const categoryLabel = selectedCategory
      ? ((selectedCategory as Category & { label?: string }).label ??
        getLocalized(selectedCategory, 'name', lang))
      : '';

    const subcategoryLabel =
      filteredSubcategories?.find((s) => String(s.id) === formData.expense_subcategory_id)?.label ??
      '';

    const fallbackInfo = [categoryLabel, subcategoryLabel].filter(Boolean).join(' / ');

    /*
     * So'rov backend kutgan ko'rinishda tuziladi:
     *
     *   {
     *     "jamgarma_id": 9,
     *     "branch_id": 1,
     *     "expense_category_id": 2,
     *     "cash_amount": 10000,
     *     "source": "cash",
     *     "expense_date": "2026-08-11"
     *   }
     *
     * Ikki muhim jihat:
     *   1) id va summa — **raqam**, satr emas (forma holati satrda saqlanadi);
     *   2) `source` chiqim yo'lini bildiradi, summa esa unga mos maydonda
     *      (`cash_amount` yoki `non_cash_amount`) ketadi.
     */
    const source: PaymentKind = activeKind ?? 'cash';
    const amountField = source === 'non_cash' ? 'non_cash_amount' : 'cash_amount';

    const payload: Record<string, string | number> = {
      jamgarma_id: Number(formData.jamgarma_id),
      branch_id: Number(autoBranchId),
      expense_category_id: Number(formData.expense_category_id),
      [amountField]: Number(formData.amount),
      source,
      expense_date: formData.expense_date || todayIso(),
    };

    // Podkategoriya tanlangan bo'lsa qo'shiladi — kontraktda majburiy emas.
    if (formData.expense_subcategory_id) {
      payload.expense_subcategory_id = Number(formData.expense_subcategory_id);
    }

    // Izoh faqat mazmuni bo'lsa yuboriladi.
    const info = formData.info.trim() || fallbackInfo;
    if (info) payload.info = info;

    /*
     * Bo'sh va noto'g'ri qiymatlar umuman yuborilmaydi.
     *
     * Ilgari butun `formData` ketardi: ishlatilmaydigan `created_at`,
     * `updated_at` va tanlanmagan maydonlar bo'sh satr bo'lib borardi. Raqam
     * kutayotgan ustunga `""` yoki `NaN` tushganda backend tekshiruvdan
     * o'tkazmay 500 bilan yiqilishi mumkin.
     */
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) =>
        typeof value === 'number' ? Number.isFinite(value) : value !== '',
      ),
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => API.post('/expenses', buildCreatePayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      closeModal();
    },
    /*
     * Alohida `onError` kerak emas: `api.ts` dagi umumiy interceptor 422
     * javobidagi barcha maydon xatolarini ro'yxat qilib chiqaradi va uni
     * bildirishnomada ko'rsatadi. Bu yerda takrorlansa, foydalanuvchi bir xil
     * xatoni ikki marta — ustiga `alert()` oynasida ham — ko'rardi.
     */
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: typeof formData }) => {
      const body: Record<string, string | undefined> = { ...payload };
      if (body.created_at) body.created_at = toApiDateTime(body.created_at);
      if (body.updated_at) body.updated_at = toApiDateTime(body.updated_at);
      return API.put(`/expenses/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => API.delete(`/expenses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  });

  /*
   * Tahrirlash oynasini ochadigan `openEditModal` olib tashlandi: chiqimlarda
   * «Harakatlar» ustunida faqat ko'rish bor. Forma va `editingItem` shoxobchasi
   * joyida — chiqimni tahrirlash staffda kerak bo'lsa, faqat shu funksiyani
   * (va `expenses.edit` bilan o'ralgan tugmani) tiklash kifoya.
   */

  const closeModal = () => {
    setFundBranch('');
    setShowAddModal(false);
    setEditingItem(null);
    setFormData({
      jamgarma_id: '',
      expense_category_id: '',
      expense_subcategory_id: '',
      user_id: '',
      amount: '',
      expense_date: '',
      branch_id: '',
      info: '',
      created_at: '',
      updated_at: '',
    });
  };

  const confirmDelete = () => {
    if (typeof deleteTarget === 'number') {
      deleteMutation.mutate(deleteTarget);
    }

    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  /*
   * Bog'liqlik maydoni javobda kelmasa, filtr qo'llanmaydi.
   *
   * Aks holda bitta yetishmayotgan maydon butun ro'yxatni bo'shatib yuboradi va
   * foydalanuvchi hech narsa tanlay olmaydi. Ma'lumot bor bo'lsa — filtr
   * avvalgidek aniq ishlaydi.
   */
  const { data: formSubcategories } = useOptions('expense-subcategories', {
    jamgarma_id: formData.jamgarma_id, expense_category_id: formData.expense_category_id, branch_id: activeFundBranch,
  }, { enabled: !!selectedJamgarma && !!formData.expense_category_id });
  const filteredSubcategories = !selectedJamgarma || !formData.expense_category_id ? [] : formSubcategories?.filter((s) =>
    s.expense_category_id == null
      ? true
      : String(s.expense_category_id) === formData.expense_category_id,
  );

  const canViewCategories = usePermission('expense_categories.view');
  const { data: assignedCategories = [], isError: categoryAssignmentError, isFetching: categoryAssignmentLoading } = useQuery<Category[]>({
    queryKey: ['expense-categories', 'verified-assignment', canViewCategories, currentUser?.id, activeFundBranch, formData.jamgarma_id],
    enabled: showAddModal && !!selectedJamgarma,
    queryFn: async () => {
      // Ask the lookup endpoint to scope categories to the selected fund.
      // Some older API responses omit the assignment list, so if the user has
      // category access, fall back to the full resource where `jamgarmas` is
      // included and filter that relationship below.
      const params = { jamgarma_id: formData.jamgarma_id, branch_id: activeFundBranch };
      const { data } = await API.get('/options/expense-categories', { params });
      const options: Category[] = Array.isArray(data) ? data : (data?.data ?? []);
      if (options.length > 0 && options.every(hasCategoryAssignment)) return options;

      if (canViewCategories) {
        try {
          const { data: resourceData } = await API.get('/expense-categories');
          const resourceRows: Category[] = Array.isArray(resourceData)
            ? resourceData
            : (resourceData?.data ?? []);
          if (resourceRows.some(hasCategoryAssignment)) return resourceRows;
        } catch {
          // Keep the lookup result; category management access is optional.
        }
      }

      // The options endpoint has already received `jamgarma_id`; trust its
      // server-side relation filter when assignment metadata is unavailable.
      return options;
    },
    staleTime: 0,
  });
  const formCategories = selectedJamgarma
    ? assignedCategories.filter((category) => hasCategoryAssignment(category)
      ? categoryBelongsToFund(category, formData.jamgarma_id)
      : true)
    : [];
  const categoryAssignmentUnavailable = !!selectedJamgarma && !categoryAssignmentLoading &&
    (categoryAssignmentError || assignedCategories.length === 0);

  return (
    <section className="payments-page container">
      <AccessNotice kind="branch" />
      {showAddModal && (
        <div className="modal-overlay">
          <div className="expenses-create">
            <h1>{t('expenses.addNewExpense')}</h1>

            <form
              className="expenses-create-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!autoBranchId || !selectedJamgarma || !formCategories?.some((c) => String(c.id) === formData.expense_category_id) || !filteredSubcategories?.some((c) => String(c.id) === formData.expense_subcategory_id)) return;
                if (editingItem) {
                  updateMutation.mutate({
                    id: editingItem.id,
                    payload: formData,
                  });
                } else {
                  createMutation.mutate();
                }
              }}
            >
              <div className="create-form">
                {/* Bitta filial avtomatik; bir nechta filial bo‘lsa tanlanadi. */}
                {(branches?.length ?? 0) > 1 && (
                  <div className="form-group">
                    <label>{t('expenses.branch')}</label>
                    <select
                      className="create-form-input"
                      value={activeFundBranch}
                      onChange={(e) => handleFundBranchChange(e.target.value)}
                    >
                      <option value="">{t('expenses.choose')}</option>
                      {branches?.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label>{t('expenses.fund')}</label>
                  <select
                    className="create-form-input"
                    value={formData.jamgarma_id} disabled={!activeFundBranch}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        jamgarma_id: e.target.value,
                        expense_category_id: '',
                        expense_subcategory_id: '',
                      })
                    }
                    required
                  >
                    <option value="">{t('expenses.chooseFund')}</option>
                    {fundOptions.map((j) => (
                      <option key={j.id} value={j.id}>
                        {fundBranch ? j.label : jamgarmaLabelWithBranch(j.label, j.branch_id, branches)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Jamg'arma tanlangach balansi ko'rinadi — qaysi puldan
                  yechilayotgani darrov bilinsin. Balans ma'lumoti kelmagan
                  bo'lsa (zaxira manba) blok umuman chizilmaydi: noto'g'ri
                  «0» ko'rsatgandan ko'ra ko'rsatmagan ma'qul. */}
              {selectedJamgarma && payment.hasBalanceData && (
                <div className="jamgarma-balance">
                  {/* Ruxsat aniq bo'lsa faqat ochiq yo'l ko'rsatiladi; aniq
                      bo'lmasa ikkalasi ham chiqadi — balans baribir foydali. */}
                  {(!payment.known || payment.allowsCash) && (
                    <div
                      className={`jamgarma-balance__item${
                        activeKind === 'cash' ? ' jamgarma-balance__item--active' : ''
                      }`}
                    >
                      <span>{t('expenses.cashBalance')}</span>
                      <b>{groupDigits(payment.cashBalance)}</b>
                    </div>
                  )}
                  {(!payment.known || payment.allowsNonCash) && (
                    <div
                      className={`jamgarma-balance__item${
                        activeKind === 'non_cash' ? ' jamgarma-balance__item--active' : ''
                      }`}
                    >
                      <span>{t('expenses.nonCashBalance')}</span>
                      <b>{groupDigits(payment.nonCashBalance)}</b>
                    </div>
                  )}
                </div>
              )}

              <div className="create-form">
                <div className="form-group">
                  <label>{t('expenses.expenseCategory')}</label>
                  <select
                    className="create-form-input"
                    value={formData.expense_category_id} disabled={!selectedJamgarma}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        expense_category_id: e.target.value,
                        expense_subcategory_id: '',
                      })
                    }
                    required
                  >
                    <option value="">{t('expenses.choose')}</option>
                    {formCategories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {getLocalized(c, 'label', lang) || getLocalized(c, 'name', lang)}
                      </option>
                    ))}
                  </select>
                  {categoryAssignmentUnavailable && <p className="expenses-hint">{t('expenses.categoryAssignmentUnavailable')}</p>}
                </div>

                <div className="form-group">
                  <label>{t('expenses.expenseSubCategory')}</label>
                  <select
                    className="create-form-input"
                    value={formData.expense_subcategory_id} disabled={!selectedJamgarma || !formData.expense_category_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        expense_subcategory_id: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">{t('expenses.choose')}</option>
                    {filteredSubcategories?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Kassir, Sana va Filial oynada so'ralmaydi: kassir kirgan
                  xodimdan, sana bugungi kundan, filial esa tanlangan
                  jamg'armadan olinadi (`buildCreatePayload`). */}
              <div className="create-form">
                <div className="form-group">
                  <label>{t('expenses.amount')}</label>
                  <input
                    type="number"
                    className="create-form-input"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                  />
                </div>

                {/* Ruxsatli chiqim turi har doim ko'rinadi; bitta bo'lsa faqat o'sha tugma chiqadi. */}
                {showPaymentKind && (
                  <div className="form-group">
                    <label>{t('expenses.paymentKind')}</label>
                    <div className="payment-kind">
                      {(!payment.known || payment.allowsCash) && (
                        <button
                          type="button"
                          className={`payment-kind__btn${
                            activeKind === 'cash' ? ' payment-kind__btn--active' : ''
                          }`}
                          onClick={() => setPaymentKind('cash')}
                        >
                          {t('expenses.cash')}
                        </button>
                      )}
                      {(!payment.known || payment.allowsNonCash) && (
                        <button
                          type="button"
                          className={`payment-kind__btn${
                            activeKind === 'non_cash' ? ' payment-kind__btn--active' : ''
                          }`}
                          onClick={() => setPaymentKind('non_cash')}
                        >
                          {t('expenses.nonCash')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Kassirni avtomatik aniqlab bo'lmagan holat — backend uni
                  majburiy talab qiladi. Filial esa hech qachon so'ralmaydi:
                  u jamg'arma yoki xodimga biriktirilgan filialdan olinadi. */}
              {needsCashierField && (
                <div className="create-form">
                  <div className="form-group">
                    <label>{t('expenses.cashier')}</label>
                    <select
                      value={formData.user_id}
                      className="create-form-input"
                      onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                      required
                    >
                      <option value="">{t('expenses.choose')}</option>
                      {cashiers?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Filial hech qaysi manbadan chiqmagan holat. So'rov baribir
                  rad etilardi, shuning uchun sababi oldindan aytiladi va
                  saqlash to'siladi — bo'sh 422 xatosidan ko'ra tushunarli. */}
              {!autoBranchId && branches.length === 0 && <p className="expenses-hint">{t(branchMissingKey)}</p>}

              {editingItem && (
                <div className="create-form">
                  <div className="form-group">
                    <label>{t('expenses.createdAt')}</label>
                    <input
                      type="datetime-local"
                      className="create-form-input"
                      value={formData.created_at}
                      onChange={(e) => setFormData({ ...formData, created_at: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('expenses.updatedAt')}</label>
                    <input
                      type="datetime-local"
                      className="create-form-input"
                      value={formData.updated_at}
                      onChange={(e) => setFormData({ ...formData, updated_at: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  className="primary"
                  disabled={
                    createMutation.isPending ||
                    updateMutation.isPending ||
                    // Filialsiz so'rov backendda baribir rad etiladi.
                    (!editingItem && (!autoBranchId || !selectedJamgarma || !formCategories?.some((c) => String(c.id) === formData.expense_category_id) || !filteredSubcategories?.some((c) => String(c.id) === formData.expense_subcategory_id)))
                  }
                >
                  {t('expenses.save')}
                </button>
                <button type="button" className="cancel" onClick={closeModal}>
                  {t('expenses.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewItem && (
        <div className="modal-overlay">
          <div className="modal small">
            <h3>{t('expenses.detailsTitle')}</h3>

            <dl className="expense-details">
              <dt>{t('expenses.category')}</dt>
              <dd>{viewItem.category ? getLocalized(viewItem.category, 'name', lang) : '—'}</dd>

              <dt>{t('expenses.subCategory')}</dt>
              <dd>
                {viewItem.subcategory ? getLocalized(viewItem.subcategory, 'name', lang) : '—'}
              </dd>

              <dt>{t('expenses.amount')}</dt>
              <dd>{groupDigits(viewItem.amount)}</dd>

              <dt>{t('expenses.comment')}</dt>
              <dd>{viewItem.info || '—'}</dd>

              <dt>{t('expenses.branch')}</dt>
              <dd>{viewItem.branch?.address || '—'}</dd>

              <dt>{t('expenses.cashier')}</dt>
              <dd>{viewItem.cashier?.full_name || '—'}</dd>

              <dt>{t('expenses.createdAt')}</dt>
              <dd>{formatDateTime(viewItem.created_at)}</dd>
            </dl>

            <div className="modal-actions">
              <button className="cancel" onClick={() => setViewItem(null)}>
                {t('expenses.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal small">
            <h3>{t('expenses.confirmDelete')}</h3>

            <div className="modal-actions">
              <button className="danger" onClick={confirmDelete}>
                {t('expenses.delete')}
              </button>

              <button className="cancel" onClick={() => setShowDeleteModal(false)}>
                {t('expenses.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header row: search | buttons — sarlavha header'da bor, shu yerda takrorlanmaydi ── */}
      <div className="payments-header-row">
        <div className="payments-header-actions">
          <div className="payments-search-wrap">
            <i className="fa-solid fa-magnifying-glass payments-search-icon" />
            <input
              className="payments-search-input"
              placeholder={t('expenses.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <FilterButton
            onClick={() => setFilterOpen((v) => !v)}
            active={filterOpen || activeFilterCount > 0}
            expanded={filterOpen}
            count={activeFilterCount}
            label={t('expenses.filterBtn')}
          />

          <Protected permission="expenses.create">
            <button className="payments-create-btn" onClick={() => setShowAddModal(true)}>
              {t('expenses.addBtn')}
            </button>
          </Protected>
        </div>
      </div>

      {/* ── Table card ── */}
      <div className="payments-card">
        {filterOpen && (
          <div className="payments-card-header">
            <FilterBar
              fields={filterFields}
              values={filterValues}
              onChange={handleFiltersChange}
              onReset={handleFiltersReset}
              onClose={() => setFilterOpen(false)}
            />
          </div>
        )}

        <div className="payments-table-wrap responsive-table-wrap">
          <table className="payments-table data-table">
            <thead>
              <tr>
                <th>{t('expenses.id')}</th>
                <th>{t('expenses.category')}</th>
                <th>{t('expenses.subCategory')}</th>
                <SortableTh sortKey="amount" sort={sort}>
                  {t('expenses.amount')}
                </SortableTh>
                <th>{t('expenses.comment')}</th>
                <th>{t('expenses.branch')}</th>
                <th>{t('expenses.cashier')}</th>
                <th>{t('expenses.createdAt')}</th>
                <th>{t('expenses.actions')}</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr className="table-empty-row">
                  <td colSpan={9}>{t('expenses.loading')}</td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={9}>{t('expenses.notFound')}</td>
                </tr>
              ) : (
                pageRows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.category ? getLocalized(item.category, 'name', lang) : '—'}</td>
                    <td>{item.subcategory ? getLocalized(item.subcategory, 'name', lang) : '—'}</td>
                    <td className="amount-cell">
                      <span className="amount-value">{groupDigits(item.amount)}</span>
                    </td>
                    <td>{item.info || '—'}</td>
                    <td>{item.branch?.address || '—'}</td>
                    <td>{item.cashier?.full_name || '—'}</td>
                    <td>{formatDateTime(item.created_at)}</td>

                    <td>
                      <div className="row-actions">
                        {/* Chiqimlarda staffda faqat ko'rish bor (tahrirlash/o'chirish — Admin panelda). */}
                        <Protected permission="expenses.show">
                          <button
                            className="row-action row-action--view"
                            title={t('expenses.view')}
                            onClick={() => setViewItem(item)}
                          >
                            <i className="fa-solid fa-eye" />
                          </button>
                        </Protected>
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
              {t('expenses.loading')}
            </div>
          ) : pageRows.length === 0 ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('expenses.notFound')}
            </div>
          ) : (
            pageRows.map((item) => (
              <div key={item.id} className="data-card">
                <div className="data-card__head">
                  <span className="data-card__title">
                    {item.category ? getLocalized(item.category, 'name', lang) : '—'}
                    {item.subcategory
                      ? ` · ${getLocalized(item.subcategory, 'name', lang)}`
                      : ''}
                  </span>
                  <Protected permission="expenses.show">
                    <button
                      className="row-action row-action--view"
                      title={t('expenses.view')}
                      onClick={() => setViewItem(item)}
                    >
                      <i className="fa-solid fa-eye" />
                    </button>
                  </Protected>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('expenses.id')}</span>
                  <span className="data-card__value">{item.id}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('expenses.amount')}</span>
                  <span className="data-card__value amount-value">
                    {groupDigits(item.amount)}
                  </span>
                </div>
                {item.info && (
                  <div className="data-card__row">
                    <span className="data-card__label">{t('expenses.comment')}</span>
                    <span className="data-card__value">{item.info}</span>
                  </div>
                )}
                <div className="data-card__row">
                  <span className="data-card__label">{t('expenses.branch')}</span>
                  <span className="data-card__value">{item.branch?.address || '—'}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('expenses.cashier')}</span>
                  <span className="data-card__value">{item.cashier?.full_name || '—'}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('expenses.createdAt')}</span>
                  <span className="data-card__value">{formatDateTime(item.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {total > 0 && (
          <Pagination
            currentPage={currentPage}
            lastPage={lastPage}
            total={total}
            from={from}
            to={to}
            onPageChange={setPage}
            pageSize={perPage}
            onPageSizeChange={(size) => {
              setPerPage(size);
              setPage(1);
            }}
          />
        )}
      </div>
    </section>
  );
};

export default Expenses;
