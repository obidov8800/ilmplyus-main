import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import DateInput from '@/components/DateInput';
import { useOptions } from '@/api/options';
import { usePermission } from '@/hooks/usePermission';
import {
  DASH_PERIODS,
  computeRange,
  useDashboardFilterStore,
  type DashPeriod,
} from './useDashboardFilter';

// prettier-ignore
const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

/**
 * Panelning global filtri: davr (Bugun / Haftalik / Oylik / Yillik / Ixtiyoriy
 * sana) + filial. `dash-tabs` ostida turadi, holatni `useDashboardFilterStore`
 * ga yozadi — har 5 tab shu store'dan o'qib, o'z hisoblovlarini filtrlaydi.
 */
export default function DashboardFilterBar() {
  const { t } = useTranslation();

  const period = useDashboardFilterStore((s) => s.period);
  const branchId = useDashboardFilterStore((s) => s.branchId);
  const fromIso = useDashboardFilterStore((s) => s.fromIso);
  const toIso = useDashboardFilterStore((s) => s.toIso);
  const setPeriod = useDashboardFilterStore((s) => s.setPeriod);
  const setBranch = useDashboardFilterStore((s) => s.setBranch);
  const setFrom = useDashboardFilterStore((s) => s.setFrom);
  const setTo = useDashboardFilterStore((s) => s.setTo);

  const canLookup = usePermission('lookups.view');
  const { data: branches = [] } = useOptions('branches', undefined, { enabled: canLookup });

  const range = useMemo(() => computeRange(period, fromIso, toIso), [period, fromIso, toIso]);

  // `toLocaleDateString('uz', { month: 'short' })` "M09" beradi (ICU'da uz oy
  // nomlari yo'q) — shuning uchun ilovaning o'z `dashboard.months.*` kalitlari.
  const fmt = (d: Date | null) => {
    if (!d) return '—';
    return `${d.getDate()} ${t(`dashboard.months.${MONTH_KEYS[d.getMonth()]}`)} ${d.getFullYear()}`;
  };

  const rangeLabel =
    range.start && range.end
      ? `${fmt(range.start)} – ${fmt(range.end)}`
      : t('dashboard.filter.pickDates');

  return (
    <div className="dash-filter">
      <div className="dash-filter__periods" role="tablist" aria-label={t('dashboard.filter.periodLabel')}>
        {DASH_PERIODS.map((p: DashPeriod) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            className={`dash-filter__chip${period === p ? ' dash-filter__chip--active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {t(`dashboard.filter.${p}`)}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="dash-filter__range">
          <DateInput
            value={fromIso}
            onChange={(e) => setFrom(e.target.value)}
            max={toIso || undefined}
            aria-label={t('dashboard.filter.from')}
          />
          <span className="dash-filter__range-sep">–</span>
          <DateInput
            value={toIso}
            onChange={(e) => setTo(e.target.value)}
            min={fromIso || undefined}
            aria-label={t('dashboard.filter.to')}
          />
        </div>
      )}

      <div className="dash-filter__right">
        <label className="dash-filter__branch">
          <span className="dash-filter__branch-label">{t('dashboard.filter.branchLabel')}</span>
          <select
            className="dash-filter__select"
            value={branchId ?? ''}
            onChange={(e) => setBranch(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('dashboard.filter.allBranches')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <span className="dash-filter__hint" title={t('dashboard.filter.vsPrev')}>
          {rangeLabel}
        </span>
      </div>
    </div>
  );
}
