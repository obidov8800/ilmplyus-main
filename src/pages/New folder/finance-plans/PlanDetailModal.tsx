import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import ConfirmModal from '@/components/ConfirmModal';
import { Protected } from '@/components/Protected';
import { formatDateTime } from '@/utils/date';
import { getApiErrorMessage } from '@/utils/apiError';
import { usePlanAction, usePlanLogs, useUpdatePlan, type PlanAction } from './api';
import {
  ACTION_PERMISSION,
  calculateBep,
  formatMoney,
  formatPercent,
  isActionAvailable,
  isEditable,
  logFieldLabel,
  logValueLabel,
  monthI18nKey,
  overPercentFlags,
  PLAN_PERMISSIONS,
  statusClass,
  statusI18nKey,
  syncItemValue,
  totalPercent,
} from './helpers';
import type { CalculationType, DistributionMode, FinancialPlan, PlanItem, PlanPayload } from './types';
import './financePlans.css';

interface Props {
  plan: FinancialPlan | null;
  onClose: () => void;
  onSaved: () => void;
}

const PlanDetailModal = ({ plan, onClose, onSaved }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const action = usePlanAction();
  const updatePlan = useUpdatePlan();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<Exclude<PlanAction, 'send'> | null>(null);

  const [plannedIncome, setPlannedIncome] = useState('');
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('month_end');
  const [items, setItems] = useState<PlanItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: logs = [] } = usePlanLogs(plan?.id ?? null, !!plan);

  useEffect(() => {
    if (!plan) return;
    setPlannedIncome(String(plan.planned_income || ''));
    setDistributionMode(plan.distribution_mode ?? 'month_end');
    setItems(plan.items);
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id]);

  if (!plan) return null;

  const editable = isEditable(plan.status);
  const income = Number(plannedIncome) || 0;
  const percentSum = totalPercent(items);
  const bep = calculateBep(items);
  const overPercent = percentSum > 100;
  const overFlags = overPercentFlags(items);
  const totalAllocated = items.reduce((sum, i) => sum + i.amount, 0);
  const remaining = Math.max(0, 100 - percentSum);
  const busy = updatePlan.isPending || action.isPending;

  const updateItem = (jamgarmaId: number, patch: Partial<PlanItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.jamgarma_id !== jamgarmaId) return item;
        const next = { ...item, ...patch };
        return syncItemValue(next, income);
      }),
    );
  };

  const buildPayload = (): PlanPayload => ({
    branch_id: plan.branch_id,
    year: plan.year,
    month: plan.month,
    planned_income: income,
    distribution_mode: distributionMode,
    items: items.map((i) => ({
      jamgarma_id: i.jamgarma_id,
      calculation_type: i.calculation_type,
      percent: i.percent,
      amount: i.amount,
    })),
  });

  const runAction = (act: Exclude<PlanAction, 'send'>, reason?: string) => {
    action.mutate(
      { id: plan.id, action: act, reason },
      {
        onSuccess: () => {
          notifications.show({
            title: t('financePlans.savedTitle'),
            message: t(`financePlans.actionDone.${act}`),
            color: act === 'reject' || act === 'cancel' ? 'orange' : 'green',
          });
          onSaved();
        },
        onError: (err) => {
          notifications.show({
            title: t('financePlans.errorTitle'),
            message: getApiErrorMessage(err, t('financePlans.form.saveError')),
            color: 'red',
          });
        },
        onSettled: () => setConfirmAction(null),
      },
    );
  };

  const handleSave = () => {
    setFormError(null);
    if (overPercent) {
      setFormError(t('financePlans.form.overPercent', { percent: formatPercent(percentSum) }));
      return;
    }
    updatePlan.mutate(
      { id: plan.id, body: buildPayload() },
      {
        onSuccess: () => {
          notifications.show({
            title: t('financePlans.savedTitle'),
            message: t('financePlans.form.updated'),
            color: 'green',
          });
          onSaved();
        },
        onError: (err) => {
          notifications.show({
            title: t('financePlans.errorTitle'),
            message: getApiErrorMessage(err, t('financePlans.form.saveError')),
            color: 'red',
          });
        },
      },
    );
  };

  const handleSend = () => {
    setFormError(null);
    if (overPercent) {
      setFormError(t('financePlans.form.overPercent', { percent: formatPercent(percentSum) }));
      return;
    }
    updatePlan.mutate(
      { id: plan.id, body: buildPayload() },
      {
        onSuccess: () => {
          action.mutate(
            { id: plan.id, action: 'send', distribution_mode: distributionMode },
            {
              onSuccess: () => {
                notifications.show({
                  title: t('financePlans.savedTitle'),
                  message: t('financePlans.actionDone.send'),
                  color: 'green',
                });
                onSaved();
              },
              onError: (err) => {
                notifications.show({
                  title: t('financePlans.errorTitle'),
                  message: getApiErrorMessage(err, t('financePlans.form.saveError')),
                  color: 'red',
                });
              },
            },
          );
        },
        onError: (err) => {
          notifications.show({
            title: t('financePlans.errorTitle'),
            message: getApiErrorMessage(err, t('financePlans.form.saveError')),
            color: 'red',
          });
        },
      },
    );
  };

  return (
    <>
      <div className="fp-overlay" onClick={() => !busy && onClose()}>
        <div className="fp-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="fp-modal-head">
            <h2>
              {plan.doc_number} — {t(monthI18nKey(plan.month))} {plan.year}
            </h2>
            <button className="fp-modal-close" type="button" onClick={onClose} disabled={busy}>
              ×
            </button>
          </div>

          <div className="fp-modal-body">
            <dl className="fp-info">
              <div className="fp-info-row">
                <dt>{t('financePlans.columns.branch')}</dt>
                <dd>{plan.branch_name ?? '—'}</dd>
              </div>
              <div className="fp-info-row">
                <dt>{t('financePlans.columns.status')}</dt>
                <dd>
                  <span className={`fp-status ${statusClass(plan.status)}`}>
                    <span className="fp-dot" aria-hidden />
                    {t(statusI18nKey(plan.status))}
                  </span>
                </dd>
              </div>
              {plan.status === 'rejected' && plan.reject_reason && (
                <div className="fp-info-row">
                  <dt>{t('financePlans.confirm.reasonLabel')}</dt>
                  <dd>{plan.reject_reason}</dd>
                </div>
              )}
            </dl>

            <div className="fp-form-grid">
              <div className="fp-form-field">
                <label>{t('financePlans.form.plannedIncome')} ({t('financePlans.form.soum')})</label>
                <input
                  type="number"
                  min={0}
                  disabled={!editable || busy}
                  value={plannedIncome}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPlannedIncome(value);
                    const nextIncome = Number(value) || 0;
                    setItems((prev) => prev.map((item) => syncItemValue(item, nextIncome)));
                  }}
                />
              </div>
              <div className="fp-form-field">
                <label>{t('financePlans.form.chooseDistribution')}</label>
                <select
                  value={distributionMode}
                  disabled={!editable || busy}
                  onChange={(e) => setDistributionMode(e.target.value as DistributionMode)}
                >
                  <option value="month_end">{t('financePlans.distributionMode.month_end')}</option>
                  <option value="during_month">{t('financePlans.distributionMode.during_month')}</option>
                </select>
              </div>
            </div>

            <div className="fp-table-scroll">
              <table className="fp-items-table">
                <thead>
                  <tr>
                    <th>{t('financePlans.form.jamgarma')}</th>
                    <th>{t('financePlans.form.calcType')}</th>
                    <th>{t('financePlans.form.percent')}</th>
                    <th>{t('financePlans.form.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const rowOver = item.calculation_type === 'percent' && overFlags[idx];
                    return (
                    <tr key={item.jamgarma_id} className={rowOver ? 'fp-items-row--over' : ''}>
                      <td>{item.jamgarma_name ?? item.jamgarma_id}</td>
                      <td>
                        <select
                          value={item.calculation_type}
                          disabled={!editable || busy}
                          onChange={(e) =>
                            updateItem(item.jamgarma_id, { calculation_type: e.target.value as CalculationType })
                          }
                        >
                          <option value="percent">{t('financePlans.form.percent')}</option>
                          <option value="amount">{t('financePlans.form.amount')}</option>
                        </select>
                      </td>
                      <td className={rowOver ? 'fp-items-cell--over' : ''}>
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          value={
                            item.calculation_type === 'percent'
                              ? item.percent === 0
                                ? ''
                                : item.percent
                              : Math.round(item.percent * 10) / 10
                          }
                          disabled={!editable || busy || item.calculation_type !== 'percent'}
                          onChange={(e) => updateItem(item.jamgarma_id, { percent: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={
                            item.calculation_type === 'amount'
                              ? item.amount === 0
                                ? ''
                                : item.amount
                              : Math.round(item.amount)
                          }
                          disabled={!editable || busy || item.calculation_type !== 'amount'}
                          onChange={(e) => updateItem(item.jamgarma_id, { amount: Number(e.target.value) || 0 })}
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="fp-items-total-row">
                    <td>{t('financePlans.form.total')}</td>
                    <td />
                    <td className={overPercent ? 'fp-total-percent--over' : ''}>{formatPercent(percentSum)}</td>
                    <td>{formatMoney(totalAllocated)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div>
              <div className="fp-progress">
                <div
                  className="fp-progress-fill"
                  style={{ width: `${Math.min(percentSum, 100)}%` }}
                />
              </div>
              <p className="fp-progress-hint">
                {t('financePlans.form.remainingHint', { percent: formatPercent(remaining) })}
              </p>
            </div>

            {bep !== null && (
              <div className="fp-totals-row">
                <span>
                  {t('financePlans.form.bep')}: <strong>{formatMoney(bep)} {t('financePlans.form.soum')}</strong>
                </span>
              </div>
            )}

            {formError && <div className="fp-alert fp-alert--danger">{formError}</div>}

            <div className="fp-accordion">
              <button
                type="button"
                className="fp-accordion-toggle"
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <span className={`fp-accordion-chevron ${historyOpen ? 'fp-accordion-chevron--open' : ''}`}>
                  ▶
                </span>
                {t('financePlans.history.button')} ({logs.length})
              </button>
              {historyOpen && (
                logs.length === 0 ? (
                  <p className="fp-empty">{t('financePlans.history.empty')}</p>
                ) : (
                  <ul className="fp-timeline">
                    {logs.map((log, i) => (
                      <li className="fp-timeline-item" key={i}>
                        <span className="fp-timeline-dot" aria-hidden />
                        <div>
                          <div className="fp-timeline-action">
                            {t(`financePlans.log.${log.action}`, { defaultValue: log.action })}
                          </div>
                          {log.field && (
                            <div className="fp-timeline-diff">
                              {logFieldLabel(log.field, t)}:{' '}
                              <span className="fp-timeline-old">{logValueLabel(log.field, log.old_value, t)}</span>
                              {' → '}
                              <span className="fp-timeline-new">{logValueLabel(log.field, log.new_value, t)}</span>
                            </div>
                          )}
                          <div className="fp-timeline-meta">
                            {log.user ?? '—'} · {formatDateTime(log.created_at)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </div>

          <div className="fp-modal-foot">
            <span className="fp-subtitle">{editable ? t('financePlans.form.hint') : ''}</span>
            <div className="fp-modal-foot-actions">
              {editable && (
                <Protected permission={PLAN_PERMISSIONS.update}>
                  <button className="fp-btn fp-btn--ghost" type="button" onClick={handleSave} disabled={busy}>
                    {t('financePlans.form.save')}
                  </button>
                </Protected>
              )}
              {isActionAvailable('send', plan.status) && (
                <Protected permission={ACTION_PERMISSION.send}>
                  <button className="fp-btn fp-btn--primary" type="button" onClick={handleSend} disabled={busy}>
                    {t('financePlans.actions.send')}
                  </button>
                </Protected>
              )}
              {isActionAvailable('approve', plan.status) && (
                <Protected permission={ACTION_PERMISSION.approve}>
                  <button
                    className="fp-btn fp-btn--success"
                    type="button"
                    onClick={() => setConfirmAction('approve')}
                    disabled={busy}
                  >
                    {t('financePlans.actions.approve')}
                  </button>
                </Protected>
              )}
              {isActionAvailable('reject', plan.status) && (
                <Protected permission={ACTION_PERMISSION.reject}>
                  <button
                    className="fp-btn fp-btn--danger"
                    type="button"
                    onClick={() => setConfirmAction('reject')}
                    disabled={busy}
                  >
                    {t('financePlans.actions.reject')}
                  </button>
                </Protected>
              )}
              {isActionAvailable('cancel', plan.status) && (
                <Protected permission={ACTION_PERMISSION.cancel}>
                  <button
                    className="fp-btn fp-btn--ghost"
                    type="button"
                    onClick={() => setConfirmAction('cancel')}
                    disabled={busy}
                  >
                    {t('financePlans.actions.cancel')}
                  </button>
                </Protected>
              )}
              {plan.status === 'approved' && (
                <Protected permission={PLAN_PERMISSIONS.analysis}>
                  <button
                    className="fp-btn fp-btn--primary"
                    type="button"
                    onClick={() => navigate(`/month-end-analysis?plan_id=${plan.id}`)}
                  >
                    {t('financePlans.actions.analysis')}
                  </button>
                </Protected>
              )}
              <button className="fp-btn fp-btn--ghost" type="button" onClick={onClose} disabled={busy}>
                {t('financePlans.actions.close')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmAction !== null}
        title={confirmAction ? t(`financePlans.confirm.${confirmAction}.title`) : ''}
        message={confirmAction ? t(`financePlans.confirm.${confirmAction}.message`) : ''}
        confirmLabel={confirmAction ? t(`financePlans.actions.${confirmAction}`) : ''}
        cancelLabel={t('financePlans.cancel')}
        tone={confirmAction === 'reject' ? 'danger' : confirmAction === 'cancel' ? 'danger' : 'success'}
        busy={action.isPending}
        reasonRequired={confirmAction === 'reject' || confirmAction === 'cancel'}
        reasonLabel={t('financePlans.confirm.reasonLabel')}
        onConfirm={(reason) => confirmAction && runAction(confirmAction, reason)}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
};

export default PlanDetailModal;
