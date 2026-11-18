import { groupDigits } from '@/utils/formatNumber';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import WidgetTab from './widgets/WidgetTab';
import type { SectionIds } from './widgets/registry';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { fetchPaymentsData, fetchExpensesData, fetchStudentsData } from './dashboard.service';
import { useGatedQuery } from './useGatedQuery';
import { useDashFilter, pickBranchId, pctChange } from './useDashboardFilter';
import GrowthBadge from './GrowthBadge';
import { useDashboardDetail, type DetailColumn, type DetailRow } from './useDashboardDetail';
import { getLocalized } from '@/utils/getLocalized';
import type { Payment } from '@/types/payment.types';

/*
 * Moliya bo'limi — faqat asosiy ko'rsatkichlar:
 *   • Tushum / Xarajat / Sof foyda / Debitor qarzdorlik (tanlangan davr)
 *   • Oylik trend (tushum, xarajat, sof foyda — oxirgi 12 oy)
 *   • Xarajatlar strukturasi (kategoriya bo'yicha)
 *   • Eng ko'p qarzdor o'quvchilar
 * Ilgari bu yerda ARPU/LTV/MRR/marja qatori va kassir/kurs/filial/shlyuz
 * ikkilamchi jadvallari ham bor edi — ular olib tashlandi (panel sodda va
 * tez o'qiladigan bo'lishi uchun). Barcha son real `/payments`, `/expenses`
 * (qarzdorlik uchun `/students`) ma'lumotidan hisoblanadi; query-kalitlari
 * `UmumiyTab`/`SotuvTab` bilan bir xil — kesh ulashiladi.
 */

interface ExpenseCategory {
  id: number;
  name_uz: string;
  name_ru?: string;
  name_en?: string;
}
interface ExpenseBranch {
  id: number;
  name_uz?: string;
  name_ru?: string;
  name_en?: string;
  address?: string;
}
interface ExpenseDetailed {
  id: number;
  amount: string | number;
  expense_date?: string;
  created_at: string;
  info?: string;
  category?: ExpenseCategory;
  subcategory?: ExpenseCategory;
  branch?: ExpenseBranch;
}

const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

const PIE_COLORS = ['#3b82f6', '#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#94a3b8'];

function fmtSum(val: number) {
  const sign = val < 0 ? '−' : '+';
  const abs = groupDigits(Math.round(Math.abs(val)));
  return `${sign} ${abs}`;
}

// To'liq, yaxlitlangan summa — qisqartmasiz aniq raqam (masalan "450 000 000").
function fmtFull(val: number) {
  return groupDigits(Math.round(Math.abs(val)));
}

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-tooltip">
      <span className="dash-tooltip__label">{label}</span>
      {payload.map((p, i) => (
        <span key={i} className="dash-tooltip__row">
          <span className="dash-tooltip__dot" style={{ background: p.color }} />
          {p.name}: <b>{p.value} MLN</b>
        </span>
      ))}
    </div>
  );
};

const paymentDate = (p: Payment) => p.paid_at || p.payment_date || p.created_at;
const expenseDate = (e: ExpenseDetailed) => e.expense_date || e.created_at;

export default function MoliyaTab({ editing }: { editing: boolean }) {
  const { t, i18n } = useTranslation();

  // Ruxsati yo'q manba so'ralmaydi (aks holda backend 403 qaytarib, har safar «Ruxsat yo'q» xabari chiqardi):
  // shu blok shunchaki bo'sh ko'rsatiladi.
  const { data: paymentsData, isLoading: paymentsLoading } = useGatedQuery(
    ['dash-payments'],
    fetchPaymentsData,
    'payments.view',
  );
  const { data: expensesData, isLoading: expensesLoading } = useGatedQuery(
    ['dash-expenses'],
    fetchExpensesData,
    'expenses.view',
  );
  const { data: studentsData, isLoading: studentsLoading } = useGatedQuery(
    ['dash-students'],
    fetchStudentsData,
    'students.view',
  );

  const flt = useDashFilter();

  // Filial bo'yicha (sana filtrisiz) — 12 oylik trend shu ustidan chiziladi,
  // hamda "oldingi davr" solishtiruvi shu ro'yxatdan hisoblanadi.
  const bPayments = useMemo(
    () => (paymentsData?.list ?? []).filter((p) => flt.branchOk(p)),
    [paymentsData, flt],
  );
  const bExpenses = useMemo(
    () =>
      ((expensesData?.list ?? []) as unknown as ExpenseDetailed[]).filter((e) => flt.branchOk(e)),
    [expensesData, flt],
  );

  // Tanlangan davr + filial — KPI'lar va xarajat strukturasi shu ro'yxatdan.
  const payments = useMemo(
    () => bPayments.filter((p) => flt.dateOk(paymentDate(p))),
    [bPayments, flt],
  );
  const expenses = useMemo(
    () => bExpenses.filter((e) => flt.dateOk(expenseDate(e))),
    [bExpenses, flt],
  );

  // O'quvchilar (qarzdorlik uchun) — imkoni bo'lsa filial bo'yicha.
  const students = useMemo(() => {
    const list = studentsData?.list ?? [];
    if (!flt.hasBranchFilter) return list;
    return list.filter((s) => {
      const bid = pickBranchId(s);
      return bid == null || bid === flt.branchId;
    });
  }, [studentsData, flt]);

  const isLoading = paymentsLoading || expensesLoading || studentsLoading;

  // ── Umumiy summalar (tanlangan davr) ─────────────────────────────────────
  const totalIncome = useMemo(
    () => payments.reduce((s, p) => s + Number(p.amount), 0),
    [payments],
  );
  const totalExpense = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount), 0),
    [expenses],
  );
  const netProfit = totalIncome - totalExpense;

  // Oldingi teng davr — o'sish badge'i uchun.
  const prevIncome = useMemo(
    () =>
      bPayments
        .filter((p) => flt.datePrevOk(paymentDate(p)))
        .reduce((s, p) => s + Number(p.amount), 0),
    [bPayments, flt],
  );
  const prevExpense = useMemo(
    () =>
      bExpenses
        .filter((e) => flt.datePrevOk(expenseDate(e)))
        .reduce((s, e) => s + Number(e.amount), 0),
    [bExpenses, flt],
  );

  const incomeGrowth = flt.hasPrev ? pctChange(totalIncome, prevIncome) : NaN;
  const expenseGrowth = flt.hasPrev ? pctChange(totalExpense, prevExpense) : NaN;
  const profitGrowth = flt.hasPrev ? pctChange(netProfit, prevIncome - prevExpense) : NaN;

  const debtorStudents = useMemo(
    () => students.filter((s) => Number(s.balance) < 0),
    [students],
  );
  const totalDebt = useMemo(
    () => debtorStudents.reduce((s, st) => s + Math.abs(Number(st.balance)), 0),
    [debtorStudents],
  );

  // ── Oylik trend: tushum / xarajat / sof foyda (oxirgi 12 oy) ─────────────
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; month: string; tushum: number; xarajat: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: t(`dashboard.months.${MONTH_KEYS[d.getMonth()]}`),
        tushum: 0,
        xarajat: 0,
      });
    }
    // Trend — SANA filtridan qat'i nazar oxirgi 12 oy (faqat filialga bo'ysunadi).
    bPayments.forEach((p) => {
      const d = new Date(paymentDate(p) || '');
      const bucket = buckets.find((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) bucket.tushum += Number(p.amount);
    });
    bExpenses.forEach((e) => {
      const d = new Date(expenseDate(e) || '');
      const bucket = buckets.find((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) bucket.xarajat += Number(e.amount);
    });
    return buckets.map((b) => ({
      month: b.month,
      tushum: parseFloat((b.tushum / 1_000_000).toFixed(1)),
      xarajat: parseFloat((b.xarajat / 1_000_000).toFixed(1)),
      sof: parseFloat(((b.tushum - b.xarajat) / 1_000_000).toFixed(1)),
    }));
  }, [bPayments, bExpenses, t]);

  // ── Xarajatlar strukturasi: kategoriya bo'yicha (top 5 + "Boshqa") ──────
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => {
      const localized = getLocalized(e.category, 'name', i18n.language);
      const label =
        localized !== '-' ? localized : e.category?.name_uz || t('dashboard.moliya.otherCategory');
      map.set(label, (map.get(label) ?? 0) + Number(e.amount));
    });
    const entries = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const total = entries.reduce((s, e) => s + e.value, 0) || 1;

    const TOP_N = 5;
    const top = entries.slice(0, TOP_N);
    const restSum = entries.slice(TOP_N).reduce((s, e) => s + e.value, 0);
    const combined =
      restSum > 0 ? [...top, { name: t('dashboard.moliya.otherCategory'), value: restSum }] : top;

    return combined.map((d, i) => ({
      ...d,
      pct: Math.round((d.value / total) * 100),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [expenses, i18n.language, t]);

  // ── Eng ko'p qarzdor o'quvchilar (qarzi eng katta birinchi) ─────────────
  const topDebtors = useMemo(
    () =>
      [...debtorStudents]
        .sort((a, b) => Number(a.balance) - Number(b.balance))
        .map((s) => ({
          name: [s.last_name, s.first_name].filter(Boolean).join(' ') || '-',
          phone: s.phone || '-',
          lastPayment: s.last_payment_date,
          amount: Math.abs(Number(s.balance)),
        })),
    [debtorStudents],
  );

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('uz-UZ');
  };

  const openDetail = useDashboardDetail((s) => s.openDetail);
  const openDebtorsDetail = () =>
    openDetail({
      title: t('dashboard.moliya.debtorsTitle'),
      csvName: 'qarzdorlar',
      rows: topDebtors as unknown as DetailRow[],
      searchText: (r) => `${r.name} ${r.phone}`,
      initialSort: { key: 'amount', dir: 'desc' },
      columns: [
        { key: 'name', label: t('dashboard.moliya.debtorName') },
        { key: 'phone', label: t('dashboard.moliya.debtorPhone') },
        {
          key: 'lastPayment',
          label: t('dashboard.moliya.debtorLastPayment'),
          render: (r) => formatDate(r.lastPayment as string),
          sortValue: (r) => new Date((r.lastPayment as string) || 0).getTime(),
          csv: (r) => formatDate(r.lastPayment as string),
        },
        {
          key: 'amount',
          label: t('dashboard.moliya.debtorAmount'),
          align: 'right',
          render: (r) => <span style={{ color: '#dc2626' }}>{fmtSum(-(r.amount as number))}</span>,
          sortValue: (r) => r.amount as number,
          csv: (r) => -(r.amount as number),
        },
      ] as DetailColumn[],
    });

  if (isLoading) {
    return <div className="dash-loading">{t('dashboard.common.loading')}</div>;
  }

  // Eski dizayndagi har bir karta/diagramma/jadval — alohida vidjet (`widgets/registry.ts`).
  const nodes: Record<SectionIds<'moliya'>, ReactNode> = {
    'moliya.totalIncome': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--green" />
        <p className="dash-stat-card__label">{t('dashboard.moliya.totalIncome')}</p>
        <p className="dash-stat-card__value dash-stat-card__value--green">
          {fmtFull(totalIncome)}
        </p>
        <p className="dash-stat-card__sub dash-stat-card__sub--green">
          {flt.hasPrev && (
            <>
              {t('dashboard.moliya.prevPeriod')}: {fmtFull(prevIncome)}
            </>
          )}
          <GrowthBadge value={incomeGrowth} label={t('dashboard.filter.vsPrev')} />
        </p>
      </div>
    ),
    'moliya.totalExpense': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--red" />
        <p className="dash-stat-card__label">{t('dashboard.moliya.totalExpense')}</p>
        <p className="dash-stat-card__value dash-stat-card__value--red">
          {fmtFull(totalExpense)}
        </p>
        <p className="dash-stat-card__sub">
          {flt.hasPrev && (
            <>
              {t('dashboard.moliya.prevPeriod')}: {fmtFull(prevExpense)}
            </>
          )}
          <GrowthBadge value={expenseGrowth} invert label={t('dashboard.filter.vsPrev')} />
        </p>
      </div>
    ),
    'moliya.netProfit': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--blue" />
        <p className="dash-stat-card__label">{t('dashboard.moliya.netProfit')}</p>
        <p
          className="dash-stat-card__value"
          style={{ color: netProfit < 0 ? '#dc2626' : '#3b82f6' }}
        >
          {netProfit < 0 ? '−' : ''}
          {fmtFull(netProfit)}
        </p>
        <p className="dash-stat-card__sub">
          {flt.hasPrev && (
            <>
              {t('dashboard.moliya.prevPeriod')}: {prevIncome - prevExpense < 0 ? '−' : ''}
              {fmtFull(prevIncome - prevExpense)}
            </>
          )}
          <GrowthBadge value={profitGrowth} label={t('dashboard.filter.vsPrev')} />
        </p>
      </div>
    ),
    'moliya.debtStat': (
      <div className="dash-stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <p className="dash-stat-card__label">{t('dashboard.moliya.debts')}</p>
        <p className="dash-stat-card__value" style={{ color: '#f59e0b' }}>
          {fmtFull(totalDebt)}
        </p>
        <p className="dash-stat-card__sub">
          {t('dashboard.moliya.debtorsSub', { count: debtorStudents.length })}
        </p>
      </div>
    ),
    'moliya.profitTrend': (
      <div className="dash-card">
        <h3 className="dash-card__title">{t('dashboard.moliya.profitTrend')}</h3>
        {monthlyTrend.some((m) => m.tushum || m.xarajat) ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={monthlyTrend} margin={{ top: 16, right: 16, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f0f4f8" strokeDasharray="4 4" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#94a3b8', fontFamily: 'noto-m' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'noto-m' }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'noto-m', paddingTop: 8 }} />
              <Area
                type="monotone"
                dataKey="tushum"
                name={t('dashboard.umumiy.chartIncome')}
                stroke="#3b82f6"
                strokeWidth={2}
                fill="transparent"
                dot={{ r: 3, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="xarajat"
                name={t('dashboard.umumiy.chartExpense')}
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="transparent"
                dot={{ r: 3, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="sof"
                name={t('dashboard.moliya.netProfitMln')}
                stroke="#22c55e"
                strokeWidth={2.5}
                fill="url(#greenGrad)"
                dot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="dash-empty">{t('dashboard.common.noData')}</div>
        )}
      </div>
    ),
    'moliya.expenseStructure': (
      <div className="dash-card">
        <h3 className="dash-card__title">{t('dashboard.moliya.expenseStructure')}</h3>
        {expenseByCategory.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <PieChart width={200} height={200}>
              <Pie
                data={expenseByCategory}
                cx={95}
                cy={95}
                outerRadius={85}
                dataKey="value"
                paddingAngle={2}
              >
                {expenseByCategory.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number | undefined, name: string | undefined) => [
                  fmtFull(v ?? 0),
                  name ?? '',
                ]}
              />
            </PieChart>
            <ul className="demo-legend">
              {expenseByCategory.map((d, i) => (
                <li key={i} className="demo-legend__item">
                  <span className="demo-legend__dot" style={{ background: d.color }} />
                  {d.name} — {d.pct}%
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="dash-empty">{t('dashboard.common.noData')}</div>
        )}
      </div>
    ),
    'moliya.debtors': (
      <div className="dash-card">
        <div className="dash-card__title-row">
          <h3 className="dash-card__title">{t('dashboard.moliya.debtorsTitle')}</h3>
          {topDebtors.length > 0 && (
            <button className="dash-detail-btn" onClick={openDebtorsDetail}>
              <i className="fa-solid fa-up-right-from-square" /> {t('dashboard.detail.btn')}
            </button>
          )}
        </div>
        {topDebtors.length > 0 ? (
          <table className="moliya-table">
            <thead>
              <tr>
                <th>{t('dashboard.moliya.debtorName')}</th>
                <th>{t('dashboard.moliya.debtorPhone')}</th>
                <th>{t('dashboard.moliya.debtorLastPayment')}</th>
                <th style={{ textAlign: 'right' }}>{t('dashboard.moliya.debtorAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {topDebtors.slice(0, 12).map((d, i) => (
                <tr key={i}>
                  <td>{d.name}</td>
                  <td>{d.phone}</td>
                  <td>{formatDate(d.lastPayment)}</td>
                  <td style={{ textAlign: 'right', color: '#dc2626', fontFamily: 'noto-m' }}>
                    {fmtSum(-d.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="dash-empty">{t('dashboard.common.noData')}</div>
        )}
      </div>
    ),
  };

  return <WidgetTab tab="moliya" nodes={nodes} editing={editing} />;
}
