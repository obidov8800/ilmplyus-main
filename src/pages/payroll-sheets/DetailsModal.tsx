import { useTranslation } from 'react-i18next';
import { formatDate } from '@/utils/date';
import {
  contractPeriodParts,
  contractVacationPay,
  formatMoney,
  monthI18nKey,
  rateSuffix,
  rowCash,
  rowGrandTotal,
  rowNonCash,
  salaryTypeI18nKey,
  sheetRates,
} from './helpers';
import type { PayrollSheet, SheetContract, SheetRow, SheetType } from './types';

interface Props {
  sheet: PayrollSheet;
  row: SheetRow | null;
  type: SheetType;
  /** Xodimning shu oyga tegishli shartnomasi (Oylik jadvali, `employee_contracts.view`). */
  contract?: SheetContract | null;
  /** Shartnomalar ro'yxati yuklangan (ruxsat bor va so'rov muvaffaqiyatli). */
  contractsAvailable?: boolean;
  /** Daromad solig'i + pensiya kimning hisobidan (tasdiqlangan taqsimlash); noma'lum bo'lsa null. */
  taxPayer?: 'employee' | 'organization' | null;
  onClose: () => void;
}

/** «Batafsil» — bitta xodimning avans/oylik tafsiloti. */
const DetailsModal = ({ sheet, row, type, contract, contractsAvailable, taxPayer = null, onClose }: Props) => {
  const { t } = useTranslation();
  if (!row) return null;

  const rates = sheetRates(sheet);
  const typeWord = t(`payrollSheets.type.${type}`);
  const soum = t('payrollSheets.soum');
  const money = (value: number) => `${formatMoney(value)} ${soum}`;

  const info: { label: string; value: string; strong?: boolean }[] = [
    { label: t('payrollSheets.details.fullName'), value: row.employee_name },
    { label: t('payrollSheets.details.position'), value: row.position_name || '—' },
    { label: t('payrollSheets.details.department'), value: row.department_name || '—' },
    {
      label: t('payrollSheets.details.period'),
      value: `${t(monthI18nKey(sheet.month))} ${sheet.year}`,
    },
    { label: t('payrollSheets.details.enteredAt'), value: formatDate(row.created_at) },
    { label: t('payrollSheets.details.oklad'), value: money(row.oklad) },
    {
      label: t('payrollSheets.details.nonCash', { type: typeWord }),
      value: money(rowNonCash(row, type)),
    },
    {
      label: t('payrollSheets.details.cash', { type: typeWord }),
      value: money(rowCash(row, type)),
    },
    // Tuzatish / KPI faqat oylik vedomostida bo'ladi.
    ...(type === 'salary'
      ? [
          { label: t('payrollSheets.details.adjustment'), value: money(row.adjustment_amount) },
          { label: t('payrollSheets.details.kpi'), value: money(row.kpi_amount) },
          {
            label: t('payrollSheets.details.vacationPay'),
            value: contract ? money(contractVacationPay(contract) ?? 0) : '—',
          },
        ]
      : []),
    // Jarima — ikkala turda ham (Avans va Oylik) ko'rinadi.
    { label: t('payrollSheets.details.fines'), value: money(row.fines_amount) },
    { label: t('payrollSheets.details.type'), value: typeWord },
    {
      label: t('payrollSheets.details.net'),
      value: money(rowGrandTotal(row, contract)),
      strong: true,
    },
  ];

  // Soliqlar bloki: stavkalar, soliq bazasi (summa / stavka), kimdan va qaysi summadan hisoblangani.
  const taxPairs: [number | null, number][] = [
    [rates.income, row.income_tax_amount],
    [rates.pension, row.pension_fund_amount],
    [rates.social, row.social_tax_amount],
  ];
  const basePair = taxPairs.find(([rate, amount]) => rate && rate > 0 && amount > 0);
  const taxBase = basePair ? Math.round(((basePair[1] / (basePair[0] as number)) * 100) * 100) / 100 : 0;
  const taxTotal = row.income_tax_amount + row.pension_fund_amount + row.social_tax_amount;
  const withheld = taxPayer === 'employee' ? row.income_tax_amount + row.pension_fund_amount : 0;
  const taxInfo: { label: string; value: string; strong?: boolean }[] = [
    { label: t('payrollSheets.details.taxTaxpayer'), value: row.employee_name },
    {
      label: t('payrollSheets.details.taxPayer'),
      value:
        taxPayer === 'employee'
          ? t('payrollSheets.details.taxPayerEmployee')
          : taxPayer === 'organization'
            ? t('payrollSheets.details.taxPayerOrganization')
            : t('payrollSheets.details.taxPayerUnknown'),
    },
    {
      label: t('payrollSheets.details.taxBaseKind'),
      value: sheet.tax_on_cash
        ? t('payrollSheets.details.taxBaseWithCash')
        : t('payrollSheets.details.taxBaseCashless'),
    },
    { label: t('payrollSheets.details.taxBase'), value: money(taxBase) },
    {
      label: t('payrollSheets.details.incomeTax') + rateSuffix(rates.income),
      value: `${taxPayer === 'employee' ? '−' : ''}${money(row.income_tax_amount)}`,
    },
    {
      label: t('payrollSheets.details.pensionTax') + rateSuffix(rates.pension),
      value: `${taxPayer === 'employee' ? '−' : ''}${money(row.pension_fund_amount)}`,
    },
    {
      label: t('payrollSheets.details.socialTax') + rateSuffix(rates.social),
      value: `${money(row.social_tax_amount)} (${t('payrollSheets.details.alwaysOrganization')})`,
    },
    { label: t('payrollSheets.details.taxTotal'), value: money(taxTotal), strong: true },
    ...(taxPayer === 'employee'
      ? [
          {
            label: t('payrollSheets.details.withheldFromEmployee'),
            value: `−${money(withheld)}`,
          },
          {
            label: t('payrollSheets.details.takeHome'),
            value: money(rowGrandTotal(row, contract) - withheld),
            strong: true,
          },
        ]
      : []),
  ];

  // Shartnoma bloki — faqat Oylik jadvalida va shartnomalar yuklangan bo'lsa.
  const contractInfo: { label: string; value: string }[] = [];
  if (type === 'salary' && contractsAvailable) {
    if (contract) {
      const period = contractPeriodParts(contract);
      const salaryTypeKey = salaryTypeI18nKey(contract.salary_type);
      const vacationGiven = contract.vacation_type !== 'berilmaydi';
      contractInfo.push(
        {
          label: t('payrollSheets.details.contractNo'),
          value: `№ ${contract.contract_number || contract.id}`,
        },
        {
          label: t('payrollSheets.details.contractPeriod'),
          value: `${period.start || '—'} — ${period.end ?? t('payrollSheets.details.indefinite')}`,
        },
        ...(salaryTypeKey
          ? [{ label: t('contractsCreate.salaryType'), value: t(salaryTypeKey) }]
          : []),
        { label: t('contractsCreate.baseSalary'), value: money(contract.base_salary) },
        { label: t('contractsCreate.totalSalary'), value: money(contract.total_monthly_salary) },
        {
          label: t('contractsCreate.workingHours'),
          value: contract.working_hours_monthly ? String(contract.working_hours_monthly) : '—',
        },
        { label: t('contractsCreate.hourlyRate'), value: money(contract.hourly_rate) },
        {
          label: t('contractsCreate.vacationType'),
          value: vacationGiven
            ? t('contractsCreate.vacationOptions.given')
            : t('contractsCreate.vacationOptions.notGiven'),
        },
        ...(vacationGiven && contract.vacation_days > 0
          ? [{ label: t('contractsCreate.vacationDays'), value: String(contract.vacation_days) }]
          : []),
        ...(contract.probation_period
          ? [{ label: t('contractsCreate.probation'), value: contract.probation_period }]
          : []),
      );
    } else {
      contractInfo.push({
        label: t('payrollSheets.details.contractNo'),
        value: t('payrollSheets.details.noContract'),
      });
    }
  }

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div
        className="ps-modal"
        role="dialog"
        aria-modal="true"
        aria-label={row.employee_name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ps-modal-head">
          <h2>
            {t('payrollSheets.actions.details')} — {row.employee_name}
          </h2>
          <button
            className="ps-modal-close"
            type="button"
            onClick={onClose}
            aria-label={t('modalPattern.close')}
          >
            ×
          </button>
        </div>

        <div className="ps-modal-body">
          <dl className="ps-info">
            {info.map((item) => (
              <div
                className={`ps-info-row ${item.strong ? 'ps-info-row--strong' : ''}`}
                key={item.label}
              >
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="ps-info-heading">{t('payrollSheets.details.taxSection')}</h3>
          <dl className="ps-info">
            {taxInfo.map((item) => (
              <div
                className={`ps-info-row ${item.strong ? 'ps-info-row--strong' : ''}`}
                key={item.label}
              >
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          {contractInfo.length > 0 && (
            <>
              <h3 className="ps-info-heading">{t('payrollSheets.details.contractSection')}</h3>
              <dl className="ps-info">
                {contractInfo.map((item) => (
                  <div className="ps-info-row" key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {row.note && <p className="ps-modal-note">{row.note}</p>}
          {row.not_in_sheet && (
            <p className="ps-modal-note">{t('payrollSheets.notInSheetHint')}</p>
          )}
          {type === 'salary' && contract && (contractVacationPay(contract) ?? 0) > 0 && (
            <p className="ps-modal-note">{t('payrollSheets.totalWithVacation')}</p>
          )}
          <p className="ps-modal-note">
            {taxPayer === 'employee'
              ? t('payrollSheets.details.taxNoteEmployee')
              : taxPayer === 'organization'
                ? t('payrollSheets.details.taxNoteOrganization')
                : t('payrollSheets.details.taxNoteUnknown')}
          </p>
          <p className="ps-modal-note">
            {sheet.tax_on_cash
              ? t('payrollSheets.details.noteWithCash')
              : t('payrollSheets.details.note')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default DetailsModal;
