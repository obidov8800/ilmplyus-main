import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useOptions } from '@/api/options';
import ConfirmModal from '@/components/ConfirmModal';
import { type FilterBarField } from '@/components/FilterBar';
import { type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import ListToolbar from '@/components/ListToolbar';
import { Protected } from '@/components/Protected';
import { usePermission } from '@/hooks/usePermission';
import { formatDateTime } from '@/utils/date';
import { getApiErrorMessage } from '@/utils/apiError';
import { useApprovedDistributions } from '../payroll-distribution-requests/api';
import {
  useEmployeeContracts,
  useGenerateSheet,
  useSheet,
  useSheetAction,
  useSheetLogs,
  useSheetPostings,
  useSheetRows,
} from './api';
import DetailsModal from './DetailsModal';
import HistoryModal from './HistoryModal';
import PdfPreviewModal from './PdfPreviewModal';
import {
  ACTION_PERMISSION,
  CONTRACT_VIEW_PERMISSION,
  SHEET_PERMISSIONS,
  contractVacationPay,
  contractsByEmployee,
  currentMonth,
  docNumber,
  formatMoney,
  hasSalaryColumns,
  isActionAvailable,
  monthI18nKey,
  monthOptions,
  monthValue,
  parseMonthValue,
  placeholderRow,
  rowCash,
  rowNonCash,
  statusClass,
  statusI18nKey,
  sumRows,
} from './helpers';
import type { PayrollSheet, SheetAction, SheetRow, SheetType } from './types';
import './payrollSheets.css';

interface Props {
  type: SheetType;
}

/* ------------------------------------------------------------------ *
 * Avans jadvali / Oylik jadvali — bitta komponent, `type` bilan farqlanadi.
 *
 * Zanjir: Xodimlar bo'limi «Tayyorlandi deb yuborish» → Buxgalter
 * «Direktorga yuborish» → Direktor «Tasdiqlash» / «Rad etish».
 * Bo'lim va FISh filtrlari serverda bajariladi (`{id}/rows`).
 * ------------------------------------------------------------------ */

const MONTHS = monthOptions();

type FilterKey = 'department_id' | 'employees';

/** Zanjir tugmalarining ko'rinishi. */
const ACTION_STYLE: Record<SheetAction, { cls: string; icon: string }> = {
  prepare: { cls: 'ps-btn--success', icon: '✓' },
  send: { cls: 'ps-btn--primary', icon: '→' },
  approve: { cls: 'ps-btn--success', icon: '✓' },
  reject: { cls: 'ps-btn--danger', icon: '✗' },
};

const PayrollSheetPage = ({ type }: Props) => {
  const { t } = useTranslation();
  const { data: branches = [] } = useOptions('branches');
  const { data: departments = [] } = useOptions('departments');
  const action = useSheetAction();

  const canView = usePermission(SHEET_PERMISSIONS.view);
  // Qatorlar/tarix so'rovlari faqat shu ruxsat bilan yuboriladi (aks holda 403) — yo'q bo'lsa jadval o'rnida xabar.
  const canShowRows = usePermission(SHEET_PERMISSIONS.show);
  const canPrint = usePermission(SHEET_PERMISSIONS.print);
  const canViewContracts = usePermission(CONTRACT_VIEW_PERMISSION);
  const canGenerate = usePermission(SHEET_PERMISSIONS.generate);
  const canViewDistributions = usePermission('payroll_distributions.view');
  const generate = useGenerateSheet();

  // Generatsiya sahifasi filial/oyni URL orqali uzatadi.
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState(() => {
    const y = Number(searchParams.get('year'));
    const m = Number(searchParams.get('month'));
    const now = currentMonth();
    return y && m ? monthValue(y, m) : monthValue(now.year, now.month);
  });
  const [branchId, setBranchId] = useState<string>(() => searchParams.get('branch_id') ?? '');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [search, setSearch] = useState('');
  // Oylik jadvalida standart holatda faqat shartnomasi bor xodimlar chiqadi.
  const [contractOnly, setContractOnly] = useState(true);

  const [selected, setSelected] = useState<number[]>([]);
  const [detailsRow, setDetailsRow] = useState<SheetRow | null>(null);
  const navigate = useNavigate();
  const canAddAdjustment = usePermission('payroll_adjustments.create');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<SheetAction | null>(null);
  // "Tasdiqlandi" ma'lumoti + PDF eslatmasi — endi doim ko'rinmaydi, faqat
  // shu "!" tugmasi bosilganda popoverda chiqadi.
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showInfo) return;
    const handleClick = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setShowInfo(false);
    };
    const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowInfo(false);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showInfo]);

  const effectiveBranchId = branchId ? Number(branchId) : (branches[0]?.id ?? null);
  const { year, month } = parseMonthValue(period);

  const {
    data: sheet,
    isLoading,
    isError,
    error,
  } = useSheet({ type, branch_id: effectiveBranchId, year, month });

  /**
   * Soliq kimning hisobidan: tasdiqlangan taqsimlashdagi tanlov (xodim / tashkilot) — daromad solig'i va
   * pensiyaga qo'llanadi; ijtimoiy soliqni doim tashkilot to'laydi. Xodim hisobidan bo'lsa jadvalda
   * ushlanadigan summa minus bilan chiqadi.
   */
  const canViewDistributionsForTax = usePermission('payroll_distributions.view');
  const { data: taxDistributions } = useApprovedDistributions(
    { branch_id: effectiveBranchId, year, month },
    canViewDistributionsForTax,
  );
  const taxPayerByEmployee = useMemo(() => {
    const map = new Map<number, 'employee' | 'organization'>();
    (taxDistributions ?? []).forEach((d) => {
      const ok =
        type === 'advance'
          ? d.kind === 'advance' || d.kind === 'combined'
          : d.kind === 'salary' || d.kind === 'combined';
      if (!ok || d.employee_id == null) return;
      if (d.income_tax_payer === 'employee' || d.income_tax_payer === 'organization') {
        map.set(d.employee_id, d.income_tax_payer);
      }
    });
    return map;
  }, [taxDistributions, type]);
  /** Xodim hisobidan soliq bo'lsa: ushlanadigan summa naqdsiz summadan (yetmasa naqddan) ayriladi. */
  const shownPayout = (row: SheetRow) => {
    const nonCash = rowNonCash(row, type);
    const cash = rowCash(row, type);
    const withheld =
      taxPayerByEmployee.get(row.employee_id) === 'employee'
        ? row.income_tax_amount + row.pension_fund_amount
        : 0;
    const fromNonCash = Math.min(withheld, Math.max(0, nonCash));
    const fromCash = Math.min(withheld - fromNonCash, Math.max(0, cash));
    return { nonCash: nonCash - fromNonCash, cash: cash - fromCash, fromNonCash, fromCash };
  };
  const taxPayerTitle = (payer: 'employee' | 'organization' | undefined) =>
    payer === 'employee'
      ? t('payrollSheets.details.taxPayerEmployee')
      : payer === 'organization'
        ? t('payrollSheets.details.taxPayerOrganization')
        : undefined;

  /*
   * Taqsimlash tasdiqlanganda backend vedomostni o'zi yangilamaydi — summalar
   * faqat vedomost (qayta) generatsiya qilinganda tushadi. Shu sabab: shu davr
   * va filial uchun TASDIQLANGAN taqsimlash bor-u, vedomost yo'q yoki undan
   * KEYIN tasdiqlangan bo'lsa — foydalanuvchiga aytiladi va generatsiya tugmasi
   * beriladi. Avans vedomosti `advance|combined`, oylik — `salary|combined` ga qaraydi.
   */
  const { data: approvedDistributions } = useApprovedDistributions(
    { branch_id: effectiveBranchId, year, month },
    canViewDistributions,
  );
  const sheetGeneratedAt = sheet?.generated_at ? Date.parse(sheet.generated_at) : null;
  const pendingDistributions = useMemo(() => {
    const relevant = (approvedDistributions ?? []).filter((d) =>
      type === 'advance'
        ? d.kind === 'advance' || d.kind === 'combined'
        : d.kind === 'salary' || d.kind === 'combined',
    );
    if (!sheet) return relevant.length;
    if (sheetGeneratedAt === null) return 0;
    return relevant.filter((d) => d.approved_at && Date.parse(d.approved_at) > sheetGeneratedAt)
      .length;
  }, [approvedDistributions, type, sheet, sheetGeneratedAt]);
  // Qayta generatsiya faqat tahrirlanadigan (qoralama / rad etilgan) vedomostda mumkin.
  const sheetRegenerable = !sheet || sheet.status === 'draft' || sheet.status === 'rejected';

  // Qatorlar alohida endpointdan; filtrlash serverda.
  const {
    data: rowsData,
    isLoading: rowsLoading,
    isError: rowsError,
    error: rowsErrorObj,
  } = useSheetRows(sheet?.id ?? null, {
    department_id: departmentId,
    last_name: search.trim(),
  }, canShowRows);

  const { data: logs = [] } = useSheetLogs(sheet?.id ?? null, historyOpen && canShowRows);
  const { data: postingsData } = useSheetPostings(
    sheet?.id ?? null,
    sheet?.status === 'approved',
  );

  // `?? []` har renderда yangi massiv yasaydi — useMemo bog'liqligi uchun
  // barqaror qiymat kerak, shuning uchun `rowsData?.rows` ning o'zi kuzatiladi.
  const allRows = useMemo(() => rowsData?.rows ?? [], [rowsData?.rows]);
  const showSalaryColumns = hasSalaryColumns(type);

  // Shartnomalar (faqat Oylik jadvalida va `employee_contracts.view` bo'lsa).
  // So'rov muvaffaqiyatsiz bo'lsa filtr qo'llanmaydi — hech kim "yo'qolib" qolmasin.
  const contractsEnabled = showSalaryColumns && canViewContracts;
  const contractsQuery = useEmployeeContracts(contractsEnabled);
  const contractMap = useMemo(
    () =>
      contractsQuery.data
        ? contractsByEmployee(contractsQuery.data, year, month, effectiveBranchId)
        : null,
    [contractsQuery.data, year, month, effectiveBranchId],
  );
  const contractsLoading = contractsEnabled && contractsQuery.isLoading;
  const filterByContract = contractsEnabled && contractOnly && contractMap !== null;

  const sheetRows = useMemo(
    () =>
      filterByContract && contractMap
        ? allRows.filter((r) => contractMap.has(r.employee_id))
        : allRows,
    [allRows, contractMap, filterByContract],
  );
  const hiddenNoContract = allRows.length - sheetRows.length;

  // Shartnomasi bor, lekin vedomostda yo'q xodimlar (vedomost generatsiya
  // qilinmagan yoki ish haqi hali taqsimlanmagan) ham jadvalda turadi — summalar 0.
  // Vedomost bor-u qatorlari hali kelmagan (yoki xato) bo'lsa — qo'shilmaydi.
  const rowsSettled = !sheet || rowsData !== undefined;
  const pendingRows = useMemo(() => {
    if (!contractMap || !rowsSettled || effectiveBranchId == null) return [];
    const inSheet = new Set(allRows.map((r) => r.employee_id));
    const needle = search.trim().toLowerCase();
    return [...contractMap.values()]
      .filter(
        (c) =>
          !inSheet.has(c.employee_id) &&
          c.branch_id === effectiveBranchId &&
          (!departmentId || String(c.department_id ?? '') === departmentId) &&
          (!needle || c.employee_name.toLowerCase().includes(needle)),
      )
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
      .map((c) => {
        const row = placeholderRow(c);
        // Vedomost yaratilmaguncha — shu xodimning TASDIQLANGAN taqsimlash summalari ko'rinib turadi.
        const mine = (approvedDistributions ?? []).filter((d) => d.employee_id === c.employee_id);
        if (mine.length === 0) return row;
        const sum = (pick: (d: (typeof mine)[number]) => number) =>
          mine.reduce((acc, d) => acc + pick(d), 0);
        row.advance_cashless = sum((d) => d.advance_cashless);
        row.advance_cash = sum((d) => d.advance_cash);
        row.salary_cashless = sum((d) => d.payout_cashless);
        row.salary_cash = sum((d) => d.payout_cash);
        const total =
          row.advance_cashless + row.advance_cash + row.salary_cashless + row.salary_cash;
        row.oklad = c.total_monthly_salary || total;
        return row;
      });
  }, [
    allRows,
    contractMap,
    rowsSettled,
    effectiveBranchId,
    departmentId,
    search,
    approvedDistributions,
  ]);
  const rows = useMemo(
    () => (pendingRows.length > 0 ? [...sheetRows, ...pendingRows] : sheetRows),
    [sheetRows, pendingRows],
  );
  // Tanlash/chop etish faqat vedomostda bor qatorlar uchun.
  const selectableRows = useMemo(() => rows.filter((r) => !r.not_in_sheet), [rows]);

  const totalEmployees =
    filterByContract || pendingRows.length > 0 ? rows.length : (rowsData?.total ?? 0);
  const totals = useMemo(() => sumRows(rows, type), [rows, type]);
  const vacationTotal = useMemo(
    () =>
      rows.reduce(
        (sum, r) => sum + (contractVacationPay(contractMap?.get(r.employee_id)) ?? 0),
        0,
      ),
    [rows, contractMap],
  );

  const branchName =
    sheet?.branch_name ?? branches.find((b) => b.id === effectiveBranchId)?.label ?? '—';

  // Vedomost generatsiya qilinmagan bo'lsa ham «Batafsil» ochilishi uchun vaqtinchalik qobiq.
  const detailsSheet: PayrollSheet | null =
    sheet ??
    (pendingRows.length > 0
      ? {
          id: 0,
          type,
          branch_id: effectiveBranchId ?? 0,
          branch_name: branchName,
          year,
          month,
          status: 'draft',
          income_tax_percent: null,
          pension_fund_percent: null,
          social_tax_percent: null,
          tax_on_cash: false,
          approved_at: null,
          generated_at: null,
          director_name: null,
          reject_reason: null,
        }
      : null);

  /**
   * Ro'yxat: keyingi 3 oy, joriy oy va 12 oy orqaga. URL orqali undan ham eski/yangi
   * oy kelsa u ro'yxatda bo'lmaydi — selectda bo'sh ko'rinmasligi uchun boshiga qo'shamiz.
   */
  const monthChoices = useMemo(() => {
    const known = MONTHS.some((m) => monthValue(m.year, m.month) === period);
    return known ? MONTHS : [parseMonthValue(period), ...MONTHS];
  }, [period]);

  const isApproved = sheet?.status === 'approved';
  // Tanlash va chop etish faqat tasdiqlangan vedomostda (backend ham shunday).
  const showSelection = isApproved && canPrint;

  const allChecked =
    selectableRows.length > 0 && selectableRows.every((r) => selected.includes(r.employee_id));
  const toggleAll = () =>
    setSelected(allChecked ? [] : selectableRows.map((r) => r.employee_id));
  const toggleRow = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const documentNumber = docNumber(type, year, month, effectiveBranchId);

  const runAction = (reason?: string) => {
    if (!sheet || !confirmAction) return;
    action.mutate(
      { id: sheet.id, action: confirmAction, reason },
      {
        onSuccess: () => {
          notifications.show({
            title: t('payrollSheets.savedTitle'),
            message: t(`payrollSheets.actionDone.${confirmAction}`),
            color: confirmAction === 'reject' ? 'orange' : 'green',
          });
        },
        onError: (err) => {
          notifications.show({
            title: t('payrollSheets.errorTitle'),
            message: getApiErrorMessage(err, t('payrollSheets.actionError')),
            color: 'red',
          });
        },
        onSettled: () => setConfirmAction(null),
      },
    );
  };

  /**
   * Shu davr/filial/tur uchun vedomostni (qayta) generatsiya qiladi — qatorlar
   * qayta hisoblanadi, qo'lda kiritilgan KPI va izoh saqlanadi (backend).
   * Xato (masalan tasdiqlash jarayonidagi vedomost) umumiy interceptor orqali chiqadi.
   */
  const regenerate = () => {
    if (effectiveBranchId == null) return;
    generate.mutate(
      { branch_id: effectiveBranchId, year, month, type },
      {
        onSuccess: ({ fundCheck }) => {
          notifications.show({
            title: t('financeGeneration.doneTitle'),
            message: t(`financeGeneration.done.${type}`),
            color: 'green',
          });
          // Jamg'armada pul yetmasligi bloklamaydi — Generatsiya sahifasidagi kabi ogohlantiriladi.
          if (fundCheck && fundCheck.jamgarma_id == null) {
            notifications.show({
              title: t('financeGeneration.doneTitle'),
              message: `⚠ ${t('financeGeneration.fundWarn.noFund')}`,
              color: 'yellow',
              autoClose: 10000,
            });
          } else if (fundCheck && !fundCheck.sufficient) {
            notifications.show({
              title: t('financeGeneration.doneTitle'),
              message: `⚠ ${t('financeGeneration.fundWarn.shortfall', {
                fund: fundCheck.jamgarma_name,
                cash: formatMoney(fundCheck.shortfall_cash),
                nonCash: formatMoney(fundCheck.shortfall_non_cash),
              })}`,
              color: 'yellow',
              autoClose: 10000,
            });
          }
        },
      },
    );
  };

  const typeWord = t(`payrollSheets.type.${type}`);

  const actionButton = (act: SheetAction) =>
    sheet &&
    isActionAvailable(act, sheet.status) && (
      <Protected key={act} permission={ACTION_PERMISSION[act]}>
        <button
          type="button"
          className={`ps-btn ${ACTION_STYLE[act].cls}`}
          disabled={action.isPending}
          onClick={() => setConfirmAction(act)}
        >
          {ACTION_STYLE[act].icon} {t(`payrollSheets.actions.${act}`)}
        </button>
      </Protected>
    );

  if (!canView) {
    return (
      <div className="ps-container container">
        <p className="ps-empty">{t('payrollSheets.forbidden')}</p>
      </div>
    );
  }

  /**
   * Ustunlar soni — bo'sh holat qatorining colSpan'i uchun.
   * Jarima endi ikkala turda ham ko'rinadi (bazaviy 12 ga kiradi), Tuzatish/KPI
   * va avans ustunlari hamon faqat oylikda (`showSalaryColumns` — 4 qo'shimcha),
   * shuningdek «Shartnoma» va «Ta'til maoshi» (oylikda +2).
   */
  const columnCount = 11 + (showSalaryColumns ? 5 : 0) + (showSelection ? 1 : 0);

  // Oy va filial — vedomostning o'zini belgilaydi (doim tanlangan), shuning uchun
  // toolbar'da turadi; bo'lim va shartnoma filtri "Saralash" panelida.
  // «Xodimlar» filtri standart (bo'sh) holatda faqat shartnomalilarni ko'rsatadi —
  // belgi (badge) faqat standartdan chetga chiqilganda chiqadi.
  const filterFields: FilterBarField<FilterKey>[] = [
    {
      key: 'department_id',
      label: t('payrollSheets.filters.department'),
      type: 'select',
      placeholder: t('payrollSheets.filters.all'),
      options: departments.map((d) => ({ value: d.id, label: d.label })),
    },
    {
      key: 'employees',
      label: t('payrollSheets.filters.employees'),
      type: 'select',
      placeholder: t('payrollSheets.filters.contractOnly'),
      options: [{ value: 'all', label: t('payrollSheets.filters.allEmployees') }],
      // Shartnomalar yuklanmagan bo'lsa (ruxsat yo'q / xato) filtr ham ko'rinmaydi.
      hidden: contractMap === null,
    },
  ];
  const filterValues: FilterBarValues<FilterKey> = {
    department_id: departmentId,
    employees: contractOnly ? '' : 'all',
  };
  const changeFilters = (v: FilterBarValues<FilterKey>) => {
    setDepartmentId(v.department_id);
    setContractOnly(v.employees !== 'all');
    setSelected([]);
  };

  return (
    <div className="ps-container list-page container">
      <div className="ps-header">
        <div>
          <p className="ps-subtitle">{t('payrollSheets.subtitle')}</p>
        </div>
      </div>

      <ListToolbar
        left={
          <>
            <select
              className="page-toolbar__select"
              aria-label={t('payrollSheets.filters.month')}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {monthChoices.map((m) => (
                <option key={monthValue(m.year, m.month)} value={monthValue(m.year, m.month)}>
                  {t(monthI18nKey(m.month))} {m.year}
                </option>
              ))}
            </select>
            <select
              className="page-toolbar__select"
              aria-label={t('payrollSheets.filters.branch')}
              value={branchId || String(effectiveBranchId ?? '')}
              onChange={(e) => {
                setBranchId(e.target.value);
                setSelected([]);
              }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </>
        }
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t('payrollSheets.filters.searchPlaceholder'),
        }}
        filter={{
          fields: filterFields,
          values: filterValues,
          onChange: changeFilters,
          onReset: () => changeFilters({ department_id: '', employees: '' }),
          ariaLabel: t(`payrollSheets.type.${type}`),
        }}
      />

      {/* Vedomost */}
      <div className="ps-card ps-card--flat">
        <div className="ps-card-head">
          <div className="ps-card-title">
            <h2>
              {t(monthI18nKey(month))} {year} — {branchName}
            </h2>
      {sheet && (
              <span className={`ps-status ${statusClass(sheet.status)}`}>
                <span className="ps-dot" aria-hidden />
                {t(statusI18nKey(sheet.status))}
              </span>
            )}
            {isApproved && (
              <div className="ps-info-wrap" ref={infoRef}>
                <button
                  type="button"
                  className="ps-info-btn"
                  onClick={() => setShowInfo((v) => !v)}
                  aria-label={t('payrollSheets.infoButton')}
                  title={t('payrollSheets.infoButton')}
                >
                  !
                </button>
                {showInfo && (
                  <div className="ps-info-popover" role="dialog">
                    <p>
                      ✓ <strong>{t('payrollSheets.alert.approved', { type: typeWord })}</strong>
                      {sheet.director_name || sheet.approved_at
                        ? ` — ${sheet.director_name ?? '—'}, ${formatDateTime(sheet.approved_at)}.`
                        : '.'}{' '}
                      {t('payrollSheets.alert.locked')}
                    </p>
                    {canPrint && <p>{t('payrollSheets.printHint')}</p>}
                  </div>
                )}
              </div>
            )}
            <span className="ps-card-meta">
              {/* `count` emas `n` — i18next `count` ni ko'rsa ko'plik shakllarini
                  izlaydi, uzbek tilida esa ular aniqlanmagan. */}
              {t('payrollSheets.filters.totalEmployees', { n: totalEmployees })}
              {hiddenNoContract > 0 &&
                ` · ${t('payrollSheets.filters.hiddenNoContract', { n: hiddenNoContract })}`}
            </span>
          </div>
          {sheet && (
            <div className="ps-card-actions">
              {actionButton('prepare')}
              {actionButton('send')}
              {actionButton('approve')}
              {actionButton('reject')}
              <button
                className="ps-btn ps-btn--ghost"
                type="button"
                onClick={() => setHistoryOpen(true)}
              >
                🕐 {t('payrollSheets.history.button')}
              </button>
            </div>
          )}
        </div>

        {/* Tasdiqlangan taqsimlash bor-u, vedomostda yo'q — generatsiya kerak. */}
        {!isLoading && !isError && pendingDistributions > 0 && (
          <div className="ps-alert ps-alert--warning ps-alert--action">
            <span>
              {sheet
                ? t('payrollSheets.stale.outdated', { n: pendingDistributions })
                : t('payrollSheets.stale.noSheet', { n: pendingDistributions })}
              {!sheetRegenerable && ` ${t('payrollSheets.stale.locked')}`}
            </span>
            {canGenerate && sheetRegenerable && (
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                disabled={generate.isPending}
                onClick={regenerate}
              >
                {generate.isPending
                  ? t('payrollSheets.stale.generating')
                  : sheet
                    ? t('payrollSheets.stale.regenerate')
                    : t('payrollSheets.stale.generate')}
              </button>
            )}
          </div>
        )}

        {isLoading || (!sheet && contractsLoading) ? (
          <div className="list-table-wrap">
            <p className="ps-empty">{t('payrollSheets.loading')}</p>
          </div>
        ) : isError ? (
          <div className="list-table-wrap">
            <p className="ps-empty">{getApiErrorMessage(error, t('payrollSheets.loadError'))}</p>
          </div>
        ) : !sheet && rows.length === 0 ? (
          <div className="list-table-wrap">
            <p className="ps-empty">{t('payrollSheets.notGenerated')}</p>
          </div>
        ) : (
          <>
            {!sheet && (
              <div className="ps-alert ps-alert--warning">
                {t('payrollSheets.notGeneratedHint')}
              </div>
            )}

            {sheet?.status === 'rejected' && (
              <div className="ps-alert ps-alert--danger">
                <strong>{t('payrollSheets.alert.rejected')}</strong>
                {sheet.reject_reason ? ` — ${sheet.reject_reason}` : ''}
              </div>
            )}

            {showSelection && (
              <div className="ps-toolbar">
                <button
                  className="ps-btn ps-btn--primary"
                  type="button"
                  onClick={() => setPdfOpen(true)}
                  disabled={selectableRows.length === 0}
                >
                  🖨 {t('payrollSheets.printButton')}
                </button>
              </div>
            )}

            <div className="list-table-wrap">
              <table className="list-table ps-table">
                <thead>
                  <tr>
                    {showSelection && (
                      <th className="ps-check">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={toggleAll}
                          aria-label={t('payrollSheets.selectAll')}
                        />
                      </th>
                    )}
                    <th>№</th>
                    <th className="list-left">{t('payrollSheets.columns.fullName')}</th>
                    <th>{t('payrollSheets.columns.position')}</th>
                    <th className="ps-num">{t('payrollSheets.columns.oklad')}</th>
                    {showSalaryColumns && (
                      <>
                        <th className="ps-num">{t('payrollSheets.columns.advanceNonCash')}</th>
                        <th className="ps-num">{t('payrollSheets.columns.advanceCash')}</th>
                      </>
                    )}
                    <th className="ps-num">
                      {t('payrollSheets.columns.nonCash', { type: typeWord })}
                    </th>
                    <th className="ps-num">
                      {t('payrollSheets.columns.cash', { type: typeWord })}
                    </th>
                    {showSalaryColumns && (
                      <>
                        <th className="ps-num">{t('payrollSheets.columns.adjustment')}</th>
                        <th className="ps-num">{t('payrollSheets.columns.kpi')}</th>
                        <th className="ps-num">{t('payrollSheets.columns.vacationPay')}</th>
                      </>
                    )}
                    {/* Jarima — ikkala turda ham (Avans va Oylik) ko'rinadi. */}
                    <th className="ps-num">{t('payrollSheets.columns.fines')}</th>
                    <th className="ps-num">
                      {t('payrollSheets.columns.incomeTax')}
                    </th>
                    <th className="ps-num">
                      {t('payrollSheets.columns.pensionTax')}
                    </th>
                    <th className="ps-num">
                      {t('payrollSheets.columns.socialTax')}
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {!canShowRows ? (
                    <tr>
                      <td colSpan={columnCount} className="ps-empty">
                        {t('payrollSheets.needShow')}
                      </td>
                    </tr>
                  ) : rowsLoading || contractsLoading ? (
                    <tr>
                      <td colSpan={columnCount} className="ps-empty">
                        {t('payrollSheets.loading')}
                      </td>
                    </tr>
                  ) : rowsError ? (
                    <tr>
                      <td colSpan={columnCount} className="ps-empty">
                        {getApiErrorMessage(rowsErrorObj, t('payrollSheets.loadError'))}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={columnCount} className="ps-empty">
                        {t('payrollSheets.noRows')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => {
                      const contract = contractMap?.get(row.employee_id) ?? null;
                      const vacationPay = contractVacationPay(contract);
                      return (
                        <tr key={row.id} className={row.not_in_sheet ? 'ps-row--pending' : undefined}>
                          {showSelection && (
                            <td className="ps-check">
                              {!row.not_in_sheet && (
                                <input
                                  type="checkbox"
                                  checked={selected.includes(row.employee_id)}
                                  onChange={() => toggleRow(row.employee_id)}
                                  aria-label={row.employee_name}
                                />
                              )}
                            </td>
                          )}
                          <td>{i + 1}</td>
                          <td className="list-left">
                            <span className="ps-name">
                              {row.employee_name}
                              {row.is_pedagog && (
                                <span className="ps-badge" title={t('payrollSheets.pedagog')}>
                                  P
                                </span>
                              )}
                              {row.not_in_sheet &&
                                !(
                                  row.advance_cashless ||
                                  row.advance_cash ||
                                  row.salary_cashless ||
                                  row.salary_cash
                                ) && (
                                <span
                                  className="ps-badge ps-badge--pending"
                                  title={t('payrollSheets.notInSheetHint')}
                                >
                                  {t('payrollSheets.notInSheet')}
                                </span>
                              )}
                              {row.fines_amount > 0 && (
                                <span
                                  className="ps-badge ps-badge--fine"
                                  title={t('payrollSheets.badges.fine')}
                                >
                                  Ж
                                </span>
                              )}
                              {showSalaryColumns && row.adjustment_amount > 0 && (
                                <span
                                  className="ps-badge ps-badge--plus"
                                  title={t('payrollSheets.badges.adjustmentPlus')}
                                >
                                  +
                                </span>
                              )}
                              {showSalaryColumns && row.adjustment_amount < 0 && (
                                <span
                                  className="ps-badge ps-badge--minus"
                                  title={t('payrollSheets.badges.adjustmentMinus')}
                                >
                                  −
                                </span>
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="ps-position">{row.position_name}</span>
                          </td>
                          <td className="ps-num">{formatMoney(row.oklad)}</td>
                          {showSalaryColumns && (
                            <>
                              <td className="ps-num">{formatMoney(row.advance_cashless)}</td>
                              <td className="ps-num">{formatMoney(row.advance_cash)}</td>
                            </>
                          )}
                          <td className="ps-num" title={shownPayout(row).fromNonCash > 0 ? `−${formatMoney(shownPayout(row).fromNonCash)}` : undefined}>
                            {formatMoney(shownPayout(row).nonCash)}
                          </td>
                          <td className="ps-num" title={shownPayout(row).fromCash > 0 ? `−${formatMoney(shownPayout(row).fromCash)}` : undefined}>
                            {formatMoney(shownPayout(row).cash)}
                          </td>
                          {showSalaryColumns && (
                            <>
                              <td className="ps-num">{formatMoney(row.adjustment_amount)}</td>
                              <td className="ps-num">{formatMoney(row.kpi_amount)}</td>
                              <td className="ps-num">
                                {vacationPay === null ? '—' : formatMoney(vacationPay)}
                              </td>
                            </>
                          )}
                          {/* Jarima — ikkala turda ham (Avans va Oylik) ko'rinadi. */}
                          <td className="ps-num ps-negative">
                            {row.fines_amount > 0 ? `−${formatMoney(row.fines_amount)}` : '0'}
                          </td>
                          <td
                            className={`ps-num${taxPayerByEmployee.get(row.employee_id) === 'employee' ? ' ps-negative' : ''}`}
                            title={taxPayerTitle(taxPayerByEmployee.get(row.employee_id))}
                          >
                            {taxPayerByEmployee.get(row.employee_id) === 'employee' && row.income_tax_amount > 0
                              ? `−${formatMoney(row.income_tax_amount)}`
                              : formatMoney(row.income_tax_amount)}
                          </td>
                          <td
                            className={`ps-num${taxPayerByEmployee.get(row.employee_id) === 'employee' ? ' ps-negative' : ' ps-muted'}`}
                            title={taxPayerTitle(taxPayerByEmployee.get(row.employee_id))}
                          >
                            {taxPayerByEmployee.get(row.employee_id) === 'employee' && row.pension_fund_amount > 0
                              ? `−${formatMoney(row.pension_fund_amount)}`
                              : formatMoney(row.pension_fund_amount)}
                          </td>
                          <td className="ps-num">{formatMoney(row.social_tax_amount)}</td>
                          <td className="ps-actions-cell">
                            <div className="ps-row-actions">
                            {canAddAdjustment && (

                              <button

                                className="ps-btn ps-btn--sm ps-btn--ghost ps-action-btn"

                                type="button"

                            
                                onClick={() =>
                                  navigate('/payroll-adjustments/create', {
                                    state: {
                                      employeeId: row.employee_id,
                                      fullName: row.employee_name,
                                      department: row.department_name,
                                      position: row.position_name,
                                      branch: branchName || undefined,
                                    },
                                  })
                                }

                              >

                                {t('payrollSheets.actions.adjust')}

                              </button>

                            )}
                            <button
                              className="ps-btn ps-btn--sm ps-btn--ghost ps-action-btn"
                              type="button"
                              onClick={() => setDetailsRow(row)}
                            >
                              {t('payrollSheets.actions.details')}
                            </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td
                        className="list-left"
                        style={{ textAlign: 'center' }}
                        colSpan={showSelection ? 4 : 3}
                      >
                        {t('payrollSheets.total')}
                      </td>
                      <td className="ps-num">{formatMoney(totals.oklad)}</td>
                      {showSalaryColumns && (
                        <>
                          <td className="ps-num">{formatMoney(totals.advance_non_cash)}</td>
                          <td className="ps-num">{formatMoney(totals.advance_cash)}</td>
                        </>
                      )}
                      <td className="ps-num">{formatMoney(rows.reduce((a, r) => a + shownPayout(r).nonCash, 0))}</td>
                      <td className="ps-num">{formatMoney(rows.reduce((a, r) => a + shownPayout(r).cash, 0))}</td>
                      {showSalaryColumns && (
                        <>
                          <td className="ps-num">{formatMoney(totals.adjustment)}</td>
                          <td className="ps-num">{formatMoney(totals.kpi)}</td>
                          <td className="ps-num">{formatMoney(vacationTotal)}</td>
                        </>
                      )}
                      {/* Jarima — ikkala turda ham (Avans va Oylik) ko'rinadi. */}
                      <td className="ps-num">{formatMoney(totals.fines)}</td>
                      <td className="ps-num">{formatMoney(totals.income_tax)}</td>
                      <td className="ps-num">{formatMoney(totals.pension_fund)}</td>
                      <td className="ps-num">{formatMoney(totals.social_tax)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>

      {sheet?.status === 'approved' && postingsData?.is_posted && postingsData.postings.length > 0 && (
        <div className="ps-card">
          <div className="ps-card-head">
            <div className="ps-card-title">
              <h2>{t('payrollSheets.postings.title')}</h2>
            </div>
          </div>
          <ul className="ps-postings">
            {postingsData.postings.map((p, i) => {
              const reversed = p.status === 'reversed';
              const amount =
                p.direction === 'net_pay'
                  ? p.cash_amount + p.non_cash_amount
                  : p.non_cash_amount;
              const label =
                p.direction === 'net_pay'
                  ? t('payrollSheets.postings.netPay')
                  : t('payrollSheets.postings.taxTransfer');
              return (
                <li
                  key={`${p.direction}-${i}`}
                  className={`ps-posting${reversed ? ' ps-posting--reversed' : ''}`}
                >
                  <span className="ps-posting__label">{label}</span>
                  <span className="ps-posting__amount">
                    {formatMoney(amount)} {t('payrollSheets.soum')}
                  </span>
                  {p.direction === 'net_pay' && p.expense && (
                    <Link className="ps-posting__link" to={`/expenses?id=${p.expense.id}`}>
                      {t('payrollSheets.postings.expenseLink', { id: p.expense.id })}
                    </Link>
                  )}
                  {reversed && (
                    <span className="ps-posting__reversed">
                      {t('payrollSheets.postings.reversed')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {detailsSheet && (
        <DetailsModal
          sheet={detailsSheet}
          row={detailsRow}
          type={type}
          contract={detailsRow ? (contractMap?.get(detailsRow.employee_id) ?? null) : null}
          contractsAvailable={contractMap !== null}
          taxPayer={detailsRow ? (taxPayerByEmployee.get(detailsRow.employee_id) ?? null) : null}
          onClose={() => setDetailsRow(null)}
        />
      )}

      {sheet && (
        <>
          {historyOpen && (
            <HistoryModal
              logs={logs}
              documentNumber={documentNumber}
              onClose={() => setHistoryOpen(false)}
            />
          )}
          {pdfOpen && (
            <PdfPreviewModal
              sheetId={sheet.id}
              employeeIds={
                selected.length > 0 || hiddenNoContract === 0
                  ? selected
                  : selectableRows.map((r) => r.employee_id)
              }
              departmentId={departmentId}
              type={type}
              onClose={() => setPdfOpen(false)}
            />
          )}
          <ConfirmModal
            open={confirmAction !== null}
            title={confirmAction ? t(`payrollSheets.confirm.${confirmAction}.title`) : ''}
            message={confirmAction ? t(`payrollSheets.confirm.${confirmAction}.message`) : ''}
            confirmLabel={confirmAction ? t(`payrollSheets.actions.${confirmAction}`) : ''}
            cancelLabel={t('payrollSheets.confirm.cancel')}
            tone={confirmAction === 'reject' ? 'danger' : 'success'}
            busy={action.isPending}
            reasonRequired={confirmAction === 'reject'}
            reasonLabel={t('payrollSheets.confirm.reasonLabel')}
            onConfirm={runAction}
            onCancel={() => setConfirmAction(null)}
          />
        </>
      )}
    </div>
  );
};

export default PayrollSheetPage;
