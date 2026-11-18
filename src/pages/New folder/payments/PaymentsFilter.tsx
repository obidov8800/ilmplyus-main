import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useOptions } from '@/api/options';
import { compareMethods, isUsableCommission, useBranchesCommissions } from '@/api/commissions';
import { normalizePaymentMethod, paymentMethodLabel } from '@/utils/paymentMethod';
import DateInput, { type DateInputChangeEvent } from '@/components/DateInput';
import useAuthStore from '@/store/useAuthStore';
import {
  EMPTY_PAYMENT_FILTERS,
  countPaymentFilters,
  type PaymentFilters,
} from './payments.filters';

interface PaymentsFilterProps {
  filters: PaymentFilters;
  onChange: (filters: PaymentFilters) => void;
  onClose: () => void;
}

/** Jadval sarlavhasi o'rnida chiqadigan saralash qatori. */
export default function PaymentsFilter({ filters, onChange, onClose }: PaymentsFilterProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const activeCount = countPaymentFilters(filters);

  const { data: branches = [] } = useOptions('branches');
  const { data: groups = [] } = useOptions('groups');
  const { data: cashiers = [] } = useOptions('users');

  // To'lov turlari filialga bog'liq: filial tanlangan bo'lsa o'shaniki,
  // aks holda operatorning o'z filiali bo'yicha.
  const commissionBranchId = filters.branch ?? user?.branch_id ?? null;
  const { data: commissions } = useBranchesCommissions(
    commissionBranchId ? [commissionBranchId] : [],
  );

  const methods = [
    ...new Set(
      commissions.filter(isUsableCommission).map((c) => normalizePaymentMethod(c.payment_method)),
    ),
  ].sort(compareMethods);

  // Filial tanlangan bo'lsa, guruh va kassirlar ham faqat o'sha filialdan.
  const visibleGroups = filters.branch
    ? groups.filter((g) => g.branch_id === filters.branch)
    : groups;

  const visibleCashiers = filters.branch
    ? cashiers.filter((c) => c.branch_id === filters.branch)
    : cashiers;

  const handleBranchChange = useCallback(
    (value: string) => {
      const branch = value ? Number(value) : null;
      // Filial almashsa, boshqa filialning guruhi/kassiri va to'lov turi tanlovda qolib ketmasin.
      const groupStillValid =
        !branch || groups.some((g) => g.id === filters.group && g.branch_id === branch);
      const cashierStillValid =
        !branch || cashiers.some((c) => c.id === filters.cashier && c.branch_id === branch);
      onChange({
        ...filters,
        branch,
        group: groupStillValid ? filters.group : null,
        cashier: cashierStillValid ? filters.cashier : null,
        method: '',
      });
    },
    [filters, groups, cashiers, onChange],
  );

  return (
    <div className="pf-bar" role="group" aria-label={t('payments.filterBtn')}>
      <div className="pf-field">
        <label className="pf-label" htmlFor="pf-branch">
          {t('payments.table.branch')}
        </label>
        <select
          id="pf-branch"
          className="pf-select"
          value={filters.branch ?? ''}
          onChange={(e) => handleBranchChange(e.target.value)}
        >
          <option value="">{t('payments.filter.selectBranch')}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <div className="pf-field">
        <label className="pf-label" htmlFor="pf-group">
          {t('payments.table.group')}
        </label>
        <select
          id="pf-group"
          className="pf-select"
          value={filters.group ?? ''}
          onChange={(e) =>
            onChange({ ...filters, group: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">{t('payments.filter.selectGroup')}</option>
          {visibleGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div className="pf-field">
        <label className="pf-label" htmlFor="pf-method">
          {t('payments.modal.paymentType')}
        </label>
        <select
          id="pf-method"
          className="pf-select"
          value={filters.method}
          onChange={(e) => onChange({ ...filters, method: e.target.value })}
        >
          <option value="">{t('payments.filter.selectMethod')}</option>
          {methods.map((m) => (
            <option key={m} value={m}>
              {paymentMethodLabel(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="pf-field">
        <label className="pf-label" htmlFor="pf-cashier">
          {t('payments.table.cashier')}
        </label>
        <select
          id="pf-cashier"
          className="pf-select"
          value={filters.cashier ?? ''}
          onChange={(e) =>
            onChange({ ...filters, cashier: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">{t('payments.filter.selectCashier')}</option>
          {visibleCashiers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="pf-field">
        <label className="pf-label" htmlFor="pf-date">
          {t('payments.table.date')}
        </label>
        <DateInput
          id="pf-date"
          name="date"
          value={filters.date}
          onChange={(e: DateInputChangeEvent) => onChange({ ...filters, date: e.target.value })}
          aria-label={t('payments.table.date')}
        />
      </div>

      <button
        type="button"
        className="pf-reset-btn"
        onClick={() => onChange(EMPTY_PAYMENT_FILTERS)}
        disabled={activeCount === 0}
      >
        {t('filterDropdown.clear')}
      </button>

      <button
        type="button"
        className="pf-close-btn"
        onClick={onClose}
        aria-label={t('payments.filter.close')}
      >
        ×
      </button>
    </div>
  );
}
