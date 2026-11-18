import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBullseye,
  faChartLine,
  faCoins,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import ListToolbar from '@/components/ListToolbar';
import { usePermission } from '@/hooks/usePermission';
import { usePlanAnalysis, usePlans } from '../finance-plans/api';
import {
  formatMoney,
  formatPercent,
  monthI18nKey,
  PLAN_PERMISSIONS,
} from '../finance-plans/helpers';
import { diffClass, fulfillmentClass } from './helpers';
import './monthEndAnalysis.css';

/* ------------------------------------------------------------------ *
 * Oy yakuni tahlili — tasdiqlangan reja va amaldagi natijalarni
 * solishtirish (zararsiz ishlash nuqtasi nazorati). `/financial-plans/{id}/analysis`.
 * ------------------------------------------------------------------ */

const MonthEndAnalysis = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const canView = usePermission(PLAN_PERMISSIONS.analysis);

  // Rejalar ro'yxati (`/financial-plans`) — `financial_plans.view`; yo'q bo'lsa so'ralmaydi (manzildagi `plan_id` ishlaydi).
  const canViewPlans = usePermission(PLAN_PERMISSIONS.view);
  const { data: approvedPlans = [] } = usePlans({ status: 'approved' }, canView && canViewPlans);
  const sortedPlans = useMemo(
    () => [...approvedPlans].sort((a, b) => (b.year - a.year) * 12 + (b.month - a.month)),
    [approvedPlans],
  );

  const [planId, setPlanId] = useState<string>(searchParams.get('plan_id') ?? '');
  // Tanlanmagan bo'lsa — eng so'nggi tasdiqlangan reja avtomatik ko'rsatiladi.
  const effectivePlanId = planId || (sortedPlans[0] ? String(sortedPlans[0].id) : '');

  const selectedId = effectivePlanId ? Number(effectivePlanId) : null;
  const { data: analysis, isLoading, isError } = usePlanAnalysis(selectedId, canView);

  if (!canView) {
    return (
      <div className="mea-container container">
        <p className="mea-forbidden">{t('monthEndAnalysis.forbidden')}</p>
      </div>
    );
  }

  const fulfillment = analysis?.income_fulfillment_percent ?? 0;
  const netResult = analysis?.net_result ?? 0;
  const monthLabel = analysis
    ? `${t(monthI18nKey(analysis.plan.month))} ${analysis.plan.year}`
    : '';

  return (
    <div className="mea-container list-page container">
      <div className="mea-header">
        <div>
          <p className="mea-subtitle">{t('monthEndAnalysis.subtitle')}</p>
        </div>
      </div>

      {/* Reja tanlash — tahlil kontekstini belgilaydi (doim tanlangan), shu sabab
          "Saralash" paneli emas, toolbar'ning chap qismida. */}
      <ListToolbar
        left={
          <select
            id="mea-plan"
            className="page-toolbar__select"
            aria-label={t('monthEndAnalysis.filters.plan')}
            value={effectivePlanId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            {sortedPlans.length === 0 && (
              <option value="">{t('monthEndAnalysis.filters.none')}</option>
            )}
            {sortedPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {t(monthI18nKey(p.month))} {p.year}
              </option>
            ))}
          </select>
        }
      />

      {sortedPlans.length === 0 ? (
        <div className="list-table-wrap">
          <p className="mea-empty">{t('monthEndAnalysis.noPlan')}</p>
        </div>
      ) : isLoading ? (
        <div className="list-table-wrap">
          <p className="mea-empty">{t('monthEndAnalysis.loading')}</p>
        </div>
      ) : isError || !analysis ? (
        <div className="list-table-wrap">
          <p className="mea-empty">{t('monthEndAnalysis.loadError')}</p>
        </div>
      ) : (
        <>
          <div className="mea-stats">
            <div className="mea-stat">
              <span className="mea-stat-icon mea-stat-icon--purple">
                <FontAwesomeIcon icon={faBullseye} />
              </span>
              <div className="mea-stat-body">
                <span className="mea-stat-value">
                  {formatMoney(analysis.planned_income)} {t('financePlans.form.soum')}
                </span>
                <span className="mea-stat-label">{t('monthEndAnalysis.stats.plannedIncome')}</span>
              </div>
            </div>

            <div className="mea-stat">
              <span className="mea-stat-icon mea-stat-icon--blue">
                <FontAwesomeIcon icon={faChartLine} />
              </span>
              <div className="mea-stat-body">
                <span className="mea-stat-value">
                  {formatMoney(analysis.actual_income)} {t('financePlans.form.soum')}
                </span>
                <span className="mea-stat-label">{t('monthEndAnalysis.stats.actualIncome')}</span>
                <span className="mea-stat-sub">
                  {t('monthEndAnalysis.stats.fulfillment', { percent: formatPercent(fulfillment) })}
                </span>
              </div>
            </div>

            <div className="mea-stat">
              <span className="mea-stat-icon mea-stat-icon--green">
                <FontAwesomeIcon icon={faCoins} />
              </span>
              <div className="mea-stat-body">
                <span className="mea-stat-value">
                  {formatMoney(analysis.actual_spent)} {t('financePlans.form.soum')}
                </span>
                <span className="mea-stat-label">{t('monthEndAnalysis.stats.actualSpent')}</span>
              </div>
            </div>

            <div className="mea-stat">
              <span className="mea-stat-icon mea-stat-icon--red">
                <FontAwesomeIcon icon={faTriangleExclamation} />
              </span>
              <div className="mea-stat-body">
                <span className={`mea-stat-value ${diffClass(netResult)}`}>
                  {formatMoney(netResult)} {t('financePlans.form.soum')}
                </span>
                <span className="mea-stat-label">{t('monthEndAnalysis.stats.netResult')}</span>
              </div>
            </div>
          </div>

          <section className="mea-section">
            <h2>{t('monthEndAnalysis.tableTitle', { month: monthLabel })}</h2>
            <div className="list-table-wrap">
              <table className="list-table mea-table">
                <thead>
                  <tr>
                    <th>{t('monthEndAnalysis.columns.jamgarma')}</th>
                    <th className="mea-num">{t('monthEndAnalysis.columns.plannedPercent')}</th>
                    <th className="mea-num">{t('monthEndAnalysis.columns.actualPercent')}</th>
                    <th className="mea-num">{t('monthEndAnalysis.columns.plannedAmount')}</th>
                    <th className="mea-num">{t('monthEndAnalysis.columns.actualAllocated')}</th>
                    <th className="mea-num">{t('monthEndAnalysis.columns.spent')}</th>
                    <th className="mea-num">{t('monthEndAnalysis.columns.balance')}</th>
                    <th className="mea-num">{t('monthEndAnalysis.columns.diffAmount')}</th>
                    <th className="mea-num">{t('monthEndAnalysis.columns.diffPercent')}</th>
                    <th>{t('monthEndAnalysis.columns.fulfillment')}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="mea-empty">
                        {t('monthEndAnalysis.noRows')}
                      </td>
                    </tr>
                  ) : (
                    analysis.rows.map((row) => (
                      <tr key={row.jamgarma_id}>
                        <td className="mea-strong">{row.jamgarma_name}</td>
                        <td className="mea-num">{formatPercent(row.planned_percent)}</td>
                        <td className="mea-num">{formatPercent(row.actual_percent)}</td>
                        <td className="mea-num">{formatMoney(row.planned_amount)}</td>
                        <td className="mea-num">{formatMoney(row.actual_allocated)}</td>
                        <td className="mea-num">{formatMoney(row.spent)}</td>
                        <td className="mea-num">{formatMoney(row.balance)}</td>
                        <td className={`mea-num ${diffClass(row.diff_amount)}`}>
                          {formatMoney(row.diff_amount)}
                        </td>
                        <td className={`mea-num ${diffClass(row.diff_percent)}`}>
                          {formatPercent(row.diff_percent)}
                        </td>
                        <td>
                          <div className="mea-progress-cell">
                            <div className="mea-progress-track">
                              <div
                                className={`mea-progress-fill ${fulfillmentClass(row.fulfillment_percent)}`}
                                style={{ width: `${Math.min(100, Math.max(0, row.fulfillment_percent))}%` }}
                              />
                            </div>
                            <span className="mea-progress-label">
                              {formatPercent(row.fulfillment_percent)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default MonthEndAnalysis;
