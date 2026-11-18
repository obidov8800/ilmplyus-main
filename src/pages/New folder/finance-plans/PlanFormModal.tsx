import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { useOptions, type Option } from '@/api/options';
import { getApiErrorMessage } from '@/utils/apiError';
import { useCreatePlan, usePrefillPlan, useUpdatePlan } from './api';
import {
  PLAN_SECTIONS,
  calculateBep,
  formatMoney,
  formatPercent,
  itemSection,
  type PlanSection,
  monthValue,
  nextMonthValue,
  overPercentFlags,
  parseMonthValue,
  syncItemValue,
  totalPercent,
} from './helpers';
import type { CalculationType, FinancialPlan, PlanItem, PlanPayload } from './types';
import './financePlans.css';

interface Props {
  open: boolean;
  /** Berilsa — tahrirlash rejimi (faqat draft/rejected uchun ochiladi). */
  plan?: FinancialPlan | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Har jamg'arma uchun bitta qator — jamg'armalar ro'yxati bilan mavjud qatorlarni birlashtiradi.
 * Qatorlar jamg'arma bo'limi bo'yicha tartiblanadi (zararsiz nuqta → marjinal daromad → MD), bo'lim ichida server
 * tartibi saqlanadi (`sort` barqaror) — shunda jadvaldagi tartib va kumulyativ 100% tekshiruvi bir xil bo'ladi.
 */
function buildItems(jamgarmas: Option[], existing: PlanItem[]): PlanItem[] {
  const items = jamgarmas.map((j): PlanItem => {
    const found = existing.find((i) => i.jamgarma_id === j.id);
    return {
      ...(found ?? {
        jamgarma_id: j.id,
        jamgarma_name: j.label,
        calculation_type: 'percent' as CalculationType,
        percent: 0,
        amount: 0,
      }),
      fund_type: j.jamgarma_fund_type ?? null,
    };
  });
  return items.sort(
    (a, b) => PLAN_SECTIONS.indexOf(itemSection(a)) - PLAN_SECTIONS.indexOf(itemSection(b)),
  );
}

const PlanFormModal = ({ open, plan, onClose, onSaved }: Props) => {
  const { t } = useTranslation();
  const { data: branches = [] } = useOptions('branches');
  // `/options/jamgarmas` (faqat `lookups.view`): faol jamg'armalar + filial + bo'lim (`jamgarma_fund_type`) — `/jamgarmas`
  // (`jamgarmas.view`) ruxsati bo'lmagan xodim ham bo'limlarni ko'radi.
  const { data: jamgarmas = [] } = useOptions('jamgarmas');
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const prefill = usePrefillPlan();

  const isEdit = !!plan;

  const [branchId, setBranchId] = useState('');
  const [monthVal, setMonthVal] = useState(nextMonthValue());
  const [plannedIncome, setPlannedIncome] = useState<string>('');
  const [items, setItems] = useState<PlanItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedFromPlanId, setCopiedFromPlanId] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<PlanSection | null>(null);

  // Reja filialniki: qatorlar faqat TANLANGAN filialning jamg'armalaridan iborat (`/options/jamgarmas` har
  // jamg'armada `branch_id` qaytaradi). Ilgari hamma filialning jamg'armalari ko'rinardi va filial tanlovi hech narsani o'zgartirmasdi.
  const jamgarmasOfBranch = (id: string) =>
    jamgarmas.filter((j) => id !== '' && String(j.branch_id) === id);

  useEffect(() => {
    if (!open) return;
    if (plan) {
      setBranchId(String(plan.branch_id));
      setMonthVal(monthValue(plan.year, plan.month));
      setPlannedIncome(String(plan.planned_income || ''));
      setItems(buildItems(jamgarmasOfBranch(String(plan.branch_id)), plan.items));
    } else {
      const firstBranch = branches[0] ? String(branches[0].id) : '';
      setBranchId(firstBranch);
      setMonthVal(nextMonthValue());
      setPlannedIncome('');
      setItems(buildItems(jamgarmasOfBranch(firstBranch), []));
    }
    setCopiedFromPlanId(null);
    setFormError(null);
    setActiveSection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan, jamgarmas.length, branches.length]);

  // Filial almashganda qatorlar yangi filialning jamg'armalariga o'tadi (kiritilgan qiymatlar boshqa filialniki edi).
  const handleBranchChange = (value: string) => {
    setBranchId(value);
    setItems(buildItems(jamgarmasOfBranch(value), []));
    setCopiedFromPlanId(null);
    setFormError(null);
  };

  const income = Number(plannedIncome) || 0;
  const percentSum = totalPercent(items);
  const bep = calculateBep(items);
  const overPercent = percentSum > 100;
  const overFlags = overPercentFlags(items);
  // Jamg'arma bo'limi (`jamgarma_fund_type`) bo'yicha qatorlar alohida tablarda ko'rsatiladi; bo'limi yo'q bo'lsa — tabsiz oddiy ro'yxat.
  const showSections = items.some((i) => i.fund_type);
  const sections = showSections ? PLAN_SECTIONS.filter((s) => items.some((i) => itemSection(i) === s)) : [];
  // Tanlangan tab filial almashganda yo'qolishi mumkin — shunda birinchi mavjud bo'lim ochiladi.
  const currentSection = activeSection && sections.includes(activeSection) ? activeSection : sections[0];

  const updateItem = (jamgarmaId: number, patch: Partial<PlanItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.jamgarma_id !== jamgarmaId) return item;
        const next = { ...item, ...patch };
        return syncItemValue(next, income);
      }),
    );
  };

  const handlePrefill = () => {
    const { year, month } = parseMonthValue(monthVal);
    if (!branchId) return;
    prefill.mutate(
      { branch_id: Number(branchId), year, month },
      {
        onSuccess: (data) => {
          if (!data) {
            notifications.show({
              title: t('financePlans.form.prefillTitle'),
              message: t('financePlans.form.prefillEmpty'),
              color: 'yellow',
            });
            return;
          }
          setPlannedIncome(String(data.planned_income || ''));
          setItems(buildItems(jamgarmasOfBranch(branchId), data.items));
          setCopiedFromPlanId(data.id);
        },
        onError: (err) => {
          notifications.show({
            title: t('financePlans.errorTitle'),
            message: getApiErrorMessage(err, t('financePlans.form.prefillError')),
            color: 'red',
          });
        },
      },
    );
  };

  const handleSave = () => {
    setFormError(null);
    if (percentSum > 100) {
      setFormError(t('financePlans.form.overPercent', { percent: formatPercent(percentSum) }));
      return;
    }
    if (!branchId || income <= 0) {
      setFormError(t('financePlans.form.required'));
      return;
    }
    const { year, month } = parseMonthValue(monthVal);
    const payload: PlanPayload = {
      branch_id: Number(branchId),
      year,
      month,
      planned_income: income,
      items: items.map((i) => ({
        jamgarma_id: i.jamgarma_id,
        calculation_type: i.calculation_type,
        percent: i.percent,
        amount: i.amount,
      })),
      ...(copiedFromPlanId && !isEdit ? { copied_from_plan_id: copiedFromPlanId } : {}),
    };

    const onSuccess = () => {
      notifications.show({
        title: t('financePlans.savedTitle'),
        message: t(isEdit ? 'financePlans.form.updated' : 'financePlans.form.created'),
        color: 'green',
      });
      onSaved();
      onClose();
    };
    const onError = (err: unknown) => {
      notifications.show({
        title: t('financePlans.errorTitle'),
        message: getApiErrorMessage(err, t('financePlans.form.saveError')),
        color: 'red',
      });
    };

    if (isEdit && plan) {
      updatePlan.mutate({ id: plan.id, body: payload }, { onSuccess, onError });
    } else {
      createPlan.mutate(payload, { onSuccess, onError });
    }
  };

  if (!open) return null;
  const busy = createPlan.isPending || updatePlan.isPending;

  return (
    <div className="fp-overlay" onClick={() => !busy && onClose()}>
      <div className="fp-modal fp-modal--form" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="fp-modal-head">
          <h2>{t(isEdit ? 'financePlans.form.editTitle' : 'financePlans.form.createTitle')}</h2>
          <button className="fp-modal-close" type="button" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>

        <div className="fp-modal-body">
          <div className="fp-form-grid">
            <div className="fp-form-field">
              <label>{t('financePlans.form.branch')}</label>
              <select
                value={branchId}
                disabled={isEdit}
                onChange={(e) => handleBranchChange(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="fp-form-field">
              <label>{t('financePlans.form.month')}</label>
              <input
                type="month"
                value={monthVal}
                disabled={isEdit}
                onChange={(e) => setMonthVal(e.target.value)}
              />
            </div>
            <div className="fp-form-field">
              <label>{t('financePlans.form.plannedIncome')}</label>
              <input
                type="number"
                min={0}
                value={plannedIncome}
                onChange={(e) => {
                  const value = e.target.value;
                  setPlannedIncome(value);
                  const nextIncome = Number(value) || 0;
                  setItems((prev) => prev.map((item) => syncItemValue(item, nextIncome)));
                }}
              />
            </div>
          </div>

          <div className="fp-prefill-row">
            <button
              className="fp-btn fp-btn--ghost fp-btn--sm"
              type="button"
              disabled={prefill.isPending || !branchId}
              onClick={handlePrefill}
            >
              {t('financePlans.form.prefill')}
            </button>
          </div>

          {showSections && (
            <div className="fp-tabs" role="tablist">
              {sections.map((s) => {
                const sectionItems = items.filter((i) => itemSection(i) === s);
                const active = s === currentSection;
                return (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`fp-tab fp-sec--${s}${active ? ' fp-tab--active' : ''}`}
                    onClick={() => setActiveSection(s)}
                  >
                    <span className="fp-tab-title">{t(`financePlans.form.section.${s}`)}</span>
                    <span className="fp-tab-meta">
                      <span className="fp-tab-chip">{t('financePlans.form.sectionCount', { count: sectionItems.length })}</span>
                      <span className="fp-tab-chip fp-tab-chip--percent">{formatPercent(totalPercent(sectionItems))}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className={`fp-table-scroll${showSections && currentSection ? ` fp-sec--${currentSection}` : ''}`}>
            <table className="fp-items-table">
              <colgroup>
                <col />
                <col className="fp-col-type" />
                <col className="fp-col-num" />
                <col className="fp-col-sum" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('financePlans.form.jamgarma')}</th>
                  <th>{t('financePlans.form.calcType')}</th>
                  <th>{t('financePlans.form.percent')}</th>
                  <th>{t('financePlans.form.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="fp-items-empty">
                      {t('financePlans.form.noJamgarmas')}
                    </td>
                  </tr>
                )}
                {items.map((item, idx) => {
                  // `idx` butun ro'yxatdagi o'rni (`overFlags` kumulyativ 100% tekshiruvi shunga bog'liq) — tab faqat ko'rinishni filtrlaydi.
                  if (showSections && itemSection(item) !== currentSection) return null;
                  const rowOver = item.calculation_type === 'percent' && overFlags[idx];
                  return (
                  <tr key={item.jamgarma_id} className={rowOver ? 'fp-items-row--over' : ''}>
                    <td className="fp-item-name">{item.jamgarma_name}</td>
                    <td>
                      <div className="fp-type-toggle">
                        <button
                          type="button"
                          className={item.calculation_type === 'percent' ? 'fp-type-toggle--active' : ''}
                          onClick={() => updateItem(item.jamgarma_id, { calculation_type: 'percent' })}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          className={item.calculation_type === 'amount' ? 'fp-type-toggle--active' : ''}
                          onClick={() => updateItem(item.jamgarma_id, { calculation_type: 'amount' })}
                        >
                          {t('financePlans.form.soum')}
                        </button>
                      </div>
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
                        disabled={item.calculation_type !== 'percent'}
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
                        disabled={item.calculation_type !== 'amount'}
                        onChange={(e) => updateItem(item.jamgarma_id, { amount: Number(e.target.value) || 0 })}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="fp-totals-row">
            <span>
              {t('financePlans.form.totalPercent')}:{' '}
              <strong className={overPercent ? 'fp-total-percent--over' : ''}>
                {formatPercent(percentSum)}
              </strong>
            </span>
            <span>
              {t('financePlans.form.bep')}:{' '}
              <strong>{bep === null ? '—' : `${formatMoney(bep)} ${t('financePlans.form.soum')}`}</strong>
            </span>
          </div>

          {formError && <div className="fp-alert fp-alert--danger">{formError}</div>}
        </div>

        <div className="fp-modal-foot">
          <span className="fp-subtitle">{t('financePlans.form.hint')}</span>
          <div className="fp-modal-foot-actions">
            <button className="fp-btn fp-btn--primary" type="button" onClick={handleSave} disabled={busy}>
              {t('financePlans.form.save')}
            </button>
            <button className="fp-btn fp-btn--ghost" type="button" onClick={onClose} disabled={busy}>
              {t('financePlans.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanFormModal;
