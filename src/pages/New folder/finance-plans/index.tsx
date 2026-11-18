import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOptions } from '@/api/options';
import { type FilterBarField } from '@/components/FilterBar';
import ListToolbar from '@/components/ListToolbar';
import { Protected } from '@/components/Protected';
import { usePermission } from '@/hooks/usePermission';
import useAuthStore from '@/store/useAuthStore';
import { usePlans, type PlanFilters } from './api';
import {
  distributionModeI18nKey,
  formatMoney,
  formatPercent,
  monthI18nKey,
  PLAN_PERMISSIONS,
  statusClass,
  statusI18nKey,
} from './helpers';
import type { FinancialPlan } from './types';
import PlanDetailModal from './PlanDetailModal';
import PlanFormModal from './PlanFormModal';
import './financePlans.css';

/* ------------------------------------------------------------------ *
 * Rejalar — Moliyaviy rejalashtirish (zararsiz ishlash nuqtasi nazorati).
 * Ro'yxat + yaratish/tahrirlash + tasdiqlash zanjiri `/financial-plans` ga ulangan.
 * ------------------------------------------------------------------ */

const FinancePlans = () => {
  const { t } = useTranslation();
  const { data: branches = [] } = useOptions('branches');

  const canView = usePermission(PLAN_PERMISSIONS.view);
  const canCreate = usePermission(PLAN_PERMISSIONS.create);
  // Filial tanlovi faqat bir nechta filialga biriktirilgan foydalanuvchida (`/options/branches` allaqachon shu filiallar bilan cheklangan).
  const canPickBranch = branches.length > 1;
  const ownBranchId = useAuthStore((s) => s.user?.branch_id);

  const [branchId, setBranchId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailPlan, setDetailPlan] = useState<FinancialPlan | null>(null);

  const effectiveBranchId = canPickBranch ? branchId : (branches[0] ? String(branches[0].id) : ownBranchId ? String(ownBranchId) : '');

  const filters: PlanFilters = useMemo(
    () => ({ branch_id: effectiveBranchId || undefined }),
    [effectiveBranchId],
  );

  const { data: plans = [], isLoading, isError, refetch } = usePlans(filters);

  // Yangi ro'yxatdan eng yangisi tepada — yil/oy bo'yicha kamayish tartibida.
  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => (b.year - a.year) * 12 + (b.month - a.month)),
    [plans],
  );

  const openDetail = (plan: FinancialPlan) => setDetailPlan(plan);

  const openCreate = () => setFormOpen(true);

  // Filial filtri faqat barcha filiallarni ko'ra oladiganlar uchun — qolganlarda
  // ro'yxat o'z filialiga qotirilgan, "Saralash" tugmasi ham chiqmaydi.
  const filterFields: FilterBarField<'branch_id'>[] = [
    {
      key: 'branch_id',
      label: t('financePlans.filters.branch'),
      type: 'select',
      placeholder: t('financePlans.filters.allBranches'),
      options: branches.map((b) => ({ value: b.id, label: b.label })),
    },
  ];

  if (!canView) {
    return (
      <div className="fp-container container">
        <p className="fp-forbidden">{t('financePlans.forbidden')}</p>
      </div>
    );
  }

  return (
    <div className="fp-container list-page container">
      <div className="fp-header">
        <div>
          <p className="fp-subtitle">{t('financePlans.subtitle')}</p>
        </div>
      </div>

      <ListToolbar
        filter={
          canPickBranch
            ? {
                fields: filterFields,
                values: { branch_id: branchId },
                onChange: (v) => setBranchId(v.branch_id),
                onReset: () => setBranchId(''),
                ariaLabel: t('financePlans.listTitle'),
              }
            : undefined
        }
      >
        <Protected permission={PLAN_PERMISSIONS.create}>
          <button type="button" className="btn-accent" onClick={openCreate}>
            {t('financePlans.newPlan')}
          </button>
        </Protected>
      </ListToolbar>

      <div className="list-table-wrap responsive-table-wrap">
        <table className="list-table fp-table">
          <thead>
            <tr>
              <th>{t('financePlans.columns.plan')}</th>
              <th>{t('financePlans.columns.month')}</th>
              <th className="fp-num">{t('financePlans.columns.plannedIncome')}</th>
              <th className="fp-num">{t('financePlans.columns.totalPercent')}</th>
              <th>{t('financePlans.columns.distribution')}</th>
              <th>{t('financePlans.columns.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="fp-empty">
                  {t('financePlans.loading')}
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={7} className="fp-empty">
                  {t('financePlans.loadError')}
                </td>
              </tr>
            ) : sortedPlans.length === 0 ? (
              <tr>
                <td colSpan={7} className="fp-empty">
                  {t('financePlans.empty')}
                </td>
              </tr>
            ) : (
              sortedPlans.map((plan) => (
                <tr key={plan.id}>
                  <td className="fp-doc">{plan.doc_number}</td>
                  <td>
                    {t(monthI18nKey(plan.month))} {plan.year}
                  </td>
                  <td className="fp-num">{formatMoney(plan.planned_income)}</td>
                  <td className="fp-num">{formatPercent(plan.total_percent)}</td>
                  <td>{t(distributionModeI18nKey(plan.distribution_mode))}</td>
                  <td>
                    <span className={`fp-status ${statusClass(plan.status)}`}>
                      <span className="fp-dot" aria-hidden />
                      {t(statusI18nKey(plan.status))}
                    </span>
                  </td>
                  <td>
                    <button
                      className="fp-btn fp-btn--sm fp-btn--ghost"
                      type="button"
                      onClick={() => openDetail(plan)}
                    >
                      {t('financePlans.actions.open')}
                    </button>
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
            {t('financePlans.loading')}
          </div>
        ) : isError ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('financePlans.loadError')}
          </div>
        ) : sortedPlans.length === 0 ? (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('financePlans.empty')}
          </div>
        ) : (
          sortedPlans.map((plan) => (
            <div key={plan.id} className="data-card">
              <div className="data-card__head">
                <span className="data-card__title">{plan.doc_number}</span>
                <span className={`fp-status ${statusClass(plan.status)}`}>
                  <span className="fp-dot" aria-hidden />
                  {t(statusI18nKey(plan.status))}
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('financePlans.columns.month')}</span>
                <span className="data-card__value">
                  {t(monthI18nKey(plan.month))} {plan.year}
                </span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">
                  {t('financePlans.columns.plannedIncome')}
                </span>
                <span className="data-card__value">{formatMoney(plan.planned_income)}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">
                  {t('financePlans.columns.totalPercent')}
                </span>
                <span className="data-card__value">{formatPercent(plan.total_percent)}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">
                  {t('financePlans.columns.distribution')}
                </span>
                <span className="data-card__value">
                  {t(distributionModeI18nKey(plan.distribution_mode))}
                </span>
              </div>
              <div className="data-card__actions">
                <button
                  className="fp-btn fp-btn--sm fp-btn--ghost"
                  type="button"
                  onClick={() => openDetail(plan)}
                >
                  {t('financePlans.actions.open')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {canCreate && (
        <PlanFormModal
          open={formOpen}
          plan={null}
          onClose={() => setFormOpen(false)}
          onSaved={() => refetch()}
        />
      )}
      <PlanDetailModal
        plan={detailPlan}
        onClose={() => setDetailPlan(null)}
        onSaved={() => refetch()}
      />
    </div>
  );
};

export default FinancePlans;
