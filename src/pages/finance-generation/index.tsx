import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useOptions } from '@/api/options';
import { Protected } from '@/components/Protected';
import { usePermission } from '@/hooks/usePermission';
import { getApiErrorMessage } from '@/utils/apiError';
import { useGenerateSheet, useSheet, useSheetRows } from '../payroll-sheets/api';
import {
  SHEET_PERMISSIONS,
  currentMonth,
  formatMoney,
  monthI18nKey,
  monthOptions,
  monthValue,
  parseMonthValue,
  statusClass,
  statusI18nKey,
  sumRows,
} from '../payroll-sheets/helpers';
import type { FundCheck, SheetType } from '../payroll-sheets/types';
import '../payroll-sheets/payrollSheets.css';

/* ------------------------------------------------------------------ *
 * Oylik / Avans generatsiyasi.
 *
 * «Generatsiya qilish» bosilgach shakllangan jadval natijasi karta bo'lib
 * chiqadi (xodimlar soni, jami netto, soliqlar) va «Jadvalga o'tish» tugmasi
 * turiga mos sahifaga olib boradi: avans → Avans jadvali, oylik → Oylik jadvali.
 * ------------------------------------------------------------------ */

const MONTHS = monthOptions();

/** Generatsiya qilingan davr — natija kartasi shu bo'yicha yuklanadi. */
interface GeneratedRef {
  type: SheetType;
  branch_id: number;
  year: number;
  month: number;
}

const FinanceGeneration = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: branches = [] } = useOptions('branches');
  const generate = useGenerateSheet();

  const canView = usePermission(SHEET_PERMISSIONS.view);

  const [type, setType] = useState<SheetType>('advance');
  const [branchId, setBranchId] = useState('');
  const [period, setPeriod] = useState(() => {
    const now = currentMonth();
    return monthValue(now.year, now.month);
  });
  const [generated, setGenerated] = useState<GeneratedRef | null>(null);
  const [fundCheck, setFundCheck] = useState<FundCheck | null>(null);

  const effectiveBranchId = branchId ? Number(branchId) : (branches[0]?.id ?? null);

  // Natija kartasi vedomostning o'zidan o'qiladi — generatsiya javobining
  // shakliga bog'lanib qolmaslik uchun.
  const { data: sheet, isLoading: sheetLoading } = useSheet(
    generated ?? { type, branch_id: null, year: 0, month: 0 },
    generated !== null,
  );
  const { data: rowsData } = useSheetRows(sheet?.id ?? null, {});

  const rows = rowsData?.rows ?? [];
  const totals = sumRows(rows, generated?.type ?? type);
  const branchName =
    sheet?.branch_name ?? branches.find((b) => b.id === generated?.branch_id)?.label ?? '—';

  const onGenerate = () => {
    if (effectiveBranchId == null) return;
    const { year, month } = parseMonthValue(period);
    // Backend faqat shu to'rt maydonni kutadi; naqd puldan soliq olinishi
    // (`tax_on_cash`) filial sozlamasida turadi — `/payroll/settings`.
    generate.mutate({ branch_id: effectiveBranchId, year, month, type }, {
      onSuccess: (res) => {
        setFundCheck(res.fundCheck);
        setGenerated({ type, branch_id: effectiveBranchId, year, month });
        notifications.show({
          title: t('financeGeneration.doneTitle'),
          message: t(`financeGeneration.done.${type}`),
          color: 'green',
        });
      },
      onError: (error) => {
        notifications.show({
          title: t('financeGeneration.errorTitle'),
          message: getApiErrorMessage(error, t('financeGeneration.error')),
          color: 'red',
        });
      },
    });
  };

  const openSheet = () => {
    if (!generated) return;
    // Turiga mos jadval: avans → Avans jadvali, oylik → Oylik jadvali.
    const path = generated.type === 'advance' ? '/advance-schedule' : '/salary-schedule';
    navigate(
      `${path}?branch_id=${generated.branch_id}&year=${generated.year}&month=${generated.month}`,
    );
  };

  if (!canView) {
    return (
      <div className="ps-container container">
        <p className="ps-empty">{t('payrollSheets.forbidden')}</p>
      </div>
    );
  }

  return (
    <div className="ps-container container">
      <div className="ps-header">
        <div>
          <p className="ps-subtitle">{t('financeGeneration.subtitle')}</p>
        </div>
      </div>

      <div className="ps-card">
        <div className="ps-filters">
          <div className="ps-field">
            <label htmlFor="fg-type">{t('financeGeneration.fields.type')}</label>
            <select
              id="fg-type"
              value={type}
              onChange={(e) => setType(e.target.value as SheetType)}
            >
              <option value="advance">{t('payrollSheets.type.advance')}</option>
              <option value="salary">{t('payrollSheets.type.salary')}</option>
            </select>
          </div>

          <div className="ps-field">
            <label htmlFor="fg-branch">{t('financeGeneration.fields.branch')}</label>
            <select
              id="fg-branch"
              value={branchId || String(effectiveBranchId ?? '')}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ps-field">
            <label htmlFor="fg-month">{t('financeGeneration.fields.month')}</label>
            <select id="fg-month" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {MONTHS.map((m) => (
                <option key={monthValue(m.year, m.month)} value={monthValue(m.year, m.month)}>
                  {t(monthI18nKey(m.month))} {m.year}
                </option>
              ))}
            </select>
          </div>

          <Protected permission={SHEET_PERMISSIONS.generate}>
            <button
              className="ps-btn ps-btn--primary ps-btn--generate"
              type="button"
              onClick={onGenerate}
              disabled={generate.isPending || effectiveBranchId == null}
            >
              ⚡ {t('financeGeneration.generate')}
            </button>
          </Protected>
        </div>

        <p className="ps-info-banner">
          ℹ {t('financeGeneration.rule')}
          <br />ℹ {t('financeGeneration.ruleApproved')}
        </p>
      </div>

      {/* Jamg'arma pul yetishmasligi haqida ogohlantirish — bloklamaydi. */}
      {generated && fundCheck && fundCheck.jamgarma_id == null && (
        <div className="ps-alert ps-alert--warning">
          ⚠ {t('financeGeneration.fundWarn.noFund')}
        </div>
      )}
      {generated && fundCheck && fundCheck.jamgarma_id != null && !fundCheck.sufficient && (
        <div className="ps-alert ps-alert--warning">
          ⚠{' '}
          {t('financeGeneration.fundWarn.shortfall', {
            fund: fundCheck.jamgarma_name,
            cash: formatMoney(fundCheck.shortfall_cash),
            nonCash: formatMoney(fundCheck.shortfall_non_cash),
          })}
        </div>
      )}

      {/* Natija kartasi — generatsiyadan keyin */}
      {generated && (
        <div className="ps-card">
          <div className="ps-card-head">
            <div className="ps-card-title">
              <h2>
                {t(`payrollSheets.type.${generated.type}`)} — {branchName}
              </h2>
              <span className="ps-card-meta">
                {t(monthI18nKey(generated.month))} {generated.year}
                {rowsData
                  ? ` · ${t('payrollSheets.filters.totalEmployees', { n: rowsData.total })}`
                  : ''}
              </span>
            </div>
            <div className="ps-card-actions">
              {sheet && (
                <span className={`ps-status ${statusClass(sheet.status)}`}>
                  <span className="ps-dot" aria-hidden />
                  {t(statusI18nKey(sheet.status))}
                </span>
              )}
              <button className="ps-btn ps-btn--primary" type="button" onClick={openSheet}>
                {t('financeGeneration.openSheet')} →
              </button>
            </div>
          </div>

          {sheetLoading ? (
            <p className="ps-empty">{t('payrollSheets.loading')}</p>
          ) : !sheet ? (
            <p className="ps-empty">{t('payrollSheets.notGenerated')}</p>
          ) : (
            <div className="ps-stats">
              <div className="ps-stat">
                <span className="ps-stat-label">{t('financeGeneration.stats.employees')}</span>
                <span className="ps-stat-value">{rowsData?.total ?? rows.length}</span>
              </div>
              <div className="ps-stat">
                <span className="ps-stat-label">{t('financeGeneration.stats.net')}</span>
                <span className="ps-stat-value">
                  {formatMoney(totals.total)} {t('payrollSheets.soum')}
                </span>
              </div>
              <div className="ps-stat">
                <span className="ps-stat-label">{t('payrollSheets.details.incomeTax')}</span>
                <span className="ps-stat-value">
                  {formatMoney(totals.income_tax)} {t('payrollSheets.soum')}
                </span>
              </div>
              <div className="ps-stat">
                <span className="ps-stat-label">{t('payrollSheets.details.pensionTax')}</span>
                <span className="ps-stat-value">
                  {formatMoney(totals.pension_fund)} {t('payrollSheets.soum')}
                </span>
              </div>
              <div className="ps-stat">
                <span className="ps-stat-label">{t('payrollSheets.details.socialTax')}</span>
                <span className="ps-stat-value">
                  {formatMoney(totals.social_tax)} {t('payrollSheets.soum')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinanceGeneration;
