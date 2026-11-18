import { groupDigits } from '@/utils/formatNumber';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import WidgetTab from './widgets/WidgetTab';
import type { SectionIds } from './widgets/registry';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import {
  fetchStudentsData,
  fetchGroupsData,
  fetchRoomsData,
  fetchPaymentsData,
  fetchExpensesData,
  fetchLidsData,
  fetchEmployeesData,
  fetchMonthlyAttendance,
  weeklyAttendanceByDay,
  aggregateByMonth,
} from './dashboard.service';
import { useGatedQuery } from './useGatedQuery';
import { useDashFilter, pickBranchId, pctChange } from './useDashboardFilter';
import GrowthBadge from './GrowthBadge';
import { useDashboardDetail, type DetailColumn, type DetailRow } from './useDashboardDetail';
import useDashboardSettings from '@/store/useDashboardSettings';

// Sahifa ochilgan payt — "faol guruh" sana oralig'ini tekshirishda ishlatiladi
// (render ichida `Date.now()` chaqirmaslik uchun modul darajasida, xuddi
// `SotuvTab` kabi).
const NOW_MS = Date.now();

function fmtMln(val: number) {
  if (val >= 1000) return `${(val / 1000).toFixed(0)}Mlrd`;
  if (val >= 1) return `${val.toFixed(0)}M`;
  return `${(val * 1000).toFixed(0)}K`;
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
          {p.name}: <b>{p.value} M</b>
        </span>
      ))}
    </div>
  );
};

export default function UmumiyTab({ editing }: { editing: boolean }) {
  const { t } = useTranslation();
  // Maqsadlar admin sozlamalaridan (`dashboard-settings.goals`) — ilgari
  // qattiq kodlangan edi.
  const { goals: GOALS } = useDashboardSettings();

  const { data: students } = useGatedQuery(['dash-students'], fetchStudentsData, 'students.view');
  const { data: groups } = useGatedQuery(['dash-groups'], fetchGroupsData, 'groups.view');
  const { data: rooms } = useGatedQuery(['dash-rooms'], fetchRoomsData, 'rooms.view');
  const { data: payments } = useGatedQuery(['dash-payments'], fetchPaymentsData, 'payments.view');
  const { data: expenses } = useGatedQuery(['dash-expenses'], fetchExpensesData, 'expenses.view');
  const { data: lids } = useGatedQuery(['dash-lids'], fetchLidsData, 'lids.view');
  const { data: employees = [] } = useGatedQuery(
    ['dash-employees'],
    fetchEmployeesData,
    'users.view',
  );
  const { data: monthlyAttendance } = useGatedQuery(
    ['dash-monthly-attendance'],
    fetchMonthlyAttendance,
    'student_attendance.view',
  );

  const flt = useDashFilter();

  // Filial bo'yicha (imkoni bo'lsa) — o'quvchi holati snapshot, davr filtri
  // qo'llanmaydi (hozirgi holat), lekin filial bo'yicha toraytiriladi.
  const branchStudents = useMemo(() => {
    const list = students?.list ?? [];
    if (!flt.hasBranchFilter) return list;
    return list.filter((s) => {
      const bid = pickBranchId(s);
      return bid == null || bid === flt.branchId;
    });
  }, [students, flt]);
  const branchGroups = useMemo(
    () => (groups?.list ?? []).filter((g) => flt.branchOk(g)),
    [groups, flt],
  );

  // To'lov / xarajat — filial + tanlangan davr.
  const periodPayments = useMemo(
    () =>
      (payments?.list ?? []).filter(
        (p) => flt.branchOk(p) && flt.dateOk(p.paid_at || p.payment_date || p.created_at),
      ),
    [payments, flt],
  );
  const periodExpenses = useMemo(
    () => (expenses?.list ?? []).filter((e) => flt.branchOk(e) && flt.dateOk(e.created_at)),
    [expenses, flt],
  );
  const prevPayments = useMemo(
    () =>
      (payments?.list ?? []).filter(
        (p) => flt.branchOk(p) && flt.datePrevOk(p.paid_at || p.payment_date || p.created_at),
      ),
    [payments, flt],
  );
  const prevExpenses = useMemo(
    () => (expenses?.list ?? []).filter((e) => flt.branchOk(e) && flt.datePrevOk(e.created_at)),
    [expenses, flt],
  );

  const totalStudents = branchStudents.length;
  const totalRooms = rooms?.length ?? 0;

  // "Faol guruh" = boshlangan va hali tugamagan guruh. Backendda guruh statusi
  // yo'q, shu sabab sana oralig'i bo'yicha aniqlanadi. Ilgari BARCHA guruh
  // (kelajakdagi/tugaganlari ham) "faol" deb sanalardi — bu son, xona bandligi
  // va guruh to'ldirilishi ko'rsatkichlarini oshirib yuborardi.
  const activeGroups = useMemo(() => {
    return branchGroups.filter((g) => {
      const startTs = g.start_date ? new Date(g.start_date).getTime() : NaN;
      const endTs = g.end_date ? new Date(g.end_date).getTime() : NaN;
      const started = Number.isNaN(startTs) || startTs <= NOW_MS;
      const notEnded = Number.isNaN(endTs) || endTs >= NOW_MS;
      return started && notEnded;
    });
  }, [branchGroups]);
  // Backend status enum: active/frozen/dropped/graduated (+ eski 'Aktiv'/'Noaktiv').
  // Ilgari faqat `=== 'Aktiv'` tekshirilardi — yangi 'active' qiymati faol emas
  // deb sanalib, "faol o'quvchilar" past, "churn" haddan tashqari yuqori chiqardi.
  const statusCounts = useMemo(() => {
    const c = { active: 0, frozen: 0, dropped: 0, graduated: 0, other: 0 };
    for (const s of branchStudents) {
      if (s.status === 'active' || s.status === 'Aktiv') c.active++;
      else if (s.status === 'frozen') c.frozen++;
      else if (s.status === 'dropped' || s.status === 'Noaktiv') c.dropped++;
      else if (s.status === 'graduated') c.graduated++;
      else c.other++;
    }
    return c;
  }, [branchStudents]);
  const activeStudents = statusCounts.active;
  // "Nofaol" = muzlatilgan + tark etgan (bitirganlar bundan mustasno — ular
  // o'qishni muvaffaqiyatli yakunlagan).
  const inactiveStudents = statusCounts.frozen + statusCounts.dropped;
  // Churn = butunlay tark etganlar ulushi.
  // Churn = tark etganlar / (bitirganlardan tashqari barcha o'quvchi). Bitirgan
  // o'quvchi o'qishni muvaffaqiyatli yakunlagan — u "ketgan" deb sanalmaydi,
  // shuning uchun maxrajdan chiqariladi.
  const churnBase = totalStudents - statusCounts.graduated;
  const churnPct =
    churnBase > 0 ? ((statusCounts.dropped / churnBase) * 100).toFixed(1) : '0.0';

  // Umumiy dinamika grafigi — filialga bo'ysunadi, oxirgi 6 oy (davrdan qat'i nazar).
  const chartData = useMemo(() => {
    const bp = (payments?.list ?? []).filter((p) => flt.branchOk(p));
    const be = (expenses?.list ?? []).filter((e) => flt.branchOk(e));
    if (!bp.length && !be.length) return [];
    return aggregateByMonth(bp, be);
  }, [payments, expenses, flt]);

  const tushum = periodPayments.reduce((s, p) => s + Number(p.amount), 0);
  const xarajat = periodExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const sof = tushum - xarajat;

  const prevTushum = prevPayments.reduce((s, p) => s + Number(p.amount), 0);
  const prevXarajat = prevExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const incomeGrowth = flt.hasPrev ? pctChange(tushum, prevTushum) : NaN;
  const profitGrowth = flt.hasPrev ? pctChange(sof, prevTushum - prevXarajat) : NaN;

  const activeGroupsCount = activeGroups.length;

  const contractCount = branchStudents.length;
  const tushum_mln = tushum / 1_000_000;
  // Retention — faol / (faol + tark etgan): "qolgan yoki ketganlar orasida
  // qanchasi qoldi". Muzlatilgan/bitirganlar maxrajga kiritilmaydi (standart).
  const retention =
    activeStudents + statusCounts.dropped > 0
      ? parseFloat(((activeStudents / (activeStudents + statusCounts.dropped)) * 100).toFixed(1))
      : 0;

  const contractPct = Math.min(100, Math.round((contractCount / GOALS.shartnoma) * 100));
  const tushumPct = Math.min(100, Math.round((tushum_mln / GOALS.tushum_mln) * 100));
  const retentionPct = retention;

  const debtorRows = branchStudents.filter((s) => Number(s.balance) < 0);
  const debtorCount = debtorRows.length;
  const totalDebtSum = debtorRows.reduce((s, st) => s + Math.abs(Number(st.balance)), 0);
  const paymentCountPeriod = periodPayments.length;

  // Davrdagi yangi lidlar (filial + `created_at`) + oldingi davr bilan solishtiruv.
  const newLeads = useMemo(
    () =>
      (lids?.list ?? []).filter((l) => flt.branchOk(l) && flt.dateOk(l.created_at)).length,
    [lids, flt],
  );
  const prevNewLeads = useMemo(
    () =>
      (lids?.list ?? []).filter((l) => flt.branchOk(l) && flt.datePrevOk(l.created_at)).length,
    [lids, flt],
  );
  const leadsGrowth = flt.hasPrev ? pctChange(newLeads, prevNewLeads) : NaN;

  // ── Operatsion ko'rsatkichlar ─────────────────────────────────────────────
  const teacherCount = useMemo(() => {
    if (!flt.hasBranchFilter) return employees.length;
    return employees.filter((e) => {
      const bid = pickBranchId(e);
      return bid == null || bid === flt.branchId;
    }).length;
  }, [employees, flt]);

  // Haftalik davomat — kunlik foizlar o'rtachasi (faqat 0 dan katta kunlar).
  const weeklyAttendancePct = useMemo(() => {
    const days = weeklyAttendanceByDay(monthlyAttendance ?? {}).filter((d) => d.pct > 0);
    if (!days.length) return 0;
    return Math.round(days.reduce((s, d) => s + d.pct, 0) / days.length);
  }, [monthlyAttendance]);

  // Xonalar bandligi — faol guruh biriktirilgan noyob xonalar ulushi.
  const { roomUtilPct, roomsInUse } = useMemo(() => {
    if (!totalRooms) return { roomUtilPct: 0, roomsInUse: 0 };
    const inUse = new Set(
      activeGroups.map((g) => g.room?.id).filter((id): id is number => id != null),
    ).size;
    return {
      roomUtilPct: Math.min(100, Math.round((inUse / totalRooms) * 100)),
      roomsInUse: inUse,
    };
  }, [activeGroups, totalRooms]);

  // O'rtacha guruh to'ldirilishi — faqat faol guruhlar bo'yicha
  // `students_count / max_students`.
  const avgGroupFillPct = useMemo(() => {
    const withCap = activeGroups.filter((g) => (g.max_students ?? 0) > 0);
    if (!withCap.length) return 0;
    const sum = withCap.reduce(
      (s, g) => s + Math.min(100, ((g.students_count ?? 0) / g.max_students) * 100),
      0,
    );
    return Math.round(sum / withCap.length);
  }, [activeGroups]);

  // ── Aqlli ogohlantirishlar ───────────────────────────────────────────────
  // Har bir tavsiya faqat haqiqiy muammo bo'lganda chiqadi (chegara asosida).
  // Hech biri ishga tushmasa — bitta "hammasi joyida" holati ko'rsatiladi.
  type AlertTone = 'red' | 'green' | 'blue';
  const alertItems = useMemo(() => {
    const items: { key: string; tone: AlertTone; icon: string; title: string; body: string }[] = [];

    if (debtorCount > 0) {
      items.push({
        key: 'debtors',
        tone: 'red',
        icon: 'fa-circle-exclamation',
        title: t('dashboard.umumiy.debtorStudents'),
        body: t('dashboard.umumiy.alertDebtorBody', {
          count: debtorCount,
          sum: fmtMln(totalDebtSum / 1_000_000),
        }),
      });
    }
    if (sof < 0) {
      items.push({
        key: 'loss',
        tone: 'red',
        icon: 'fa-arrow-trend-down',
        title: t('dashboard.umumiy.alertLossTitle'),
        body: t('dashboard.umumiy.alertLossBody', { sum: fmtMln(Math.abs(sof) / 1_000_000) }),
      });
    }
    if (parseFloat(churnPct) >= 10) {
      items.push({
        key: 'churn',
        tone: 'red',
        icon: 'fa-user-minus',
        title: t('dashboard.umumiy.churnRate'),
        body: t('dashboard.umumiy.alertChurnBody', {
          pct: churnPct,
          count: statusCounts.dropped,
        }),
      });
    }
    if (weeklyAttendancePct > 0 && weeklyAttendancePct < 75) {
      items.push({
        key: 'attendance',
        tone: 'red',
        icon: 'fa-calendar-xmark',
        title: t('dashboard.umumiy.weeklyAttendance'),
        body: t('dashboard.umumiy.alertAttendanceBody', { pct: weeklyAttendancePct }),
      });
    }
    if (avgGroupFillPct > 0 && avgGroupFillPct < 60) {
      items.push({
        key: 'fill',
        tone: 'blue',
        icon: 'fa-users',
        title: t('dashboard.umumiy.groupFill'),
        body: t('dashboard.umumiy.alertFillBody', { pct: avgGroupFillPct }),
      });
    }
    if (totalRooms > 0 && roomUtilPct < 50) {
      items.push({
        key: 'rooms',
        tone: 'blue',
        icon: 'fa-desktop',
        title: t('dashboard.umumiy.roomsLoad'),
        body: t('dashboard.umumiy.alertRoomsBody', {
          free: totalRooms - roomsInUse,
          total: totalRooms,
        }),
      });
    }
    if (activeGroupsCount === 0) {
      items.push({
        key: 'nogroups',
        tone: 'blue',
        icon: 'fa-layer-group',
        title: t('dashboard.umumiy.activeGroupsAlert'),
        body: t('dashboard.umumiy.alertNoGroupsBody'),
      });
    }
    return items;
  }, [
    debtorCount,
    totalDebtSum,
    sof,
    churnPct,
    statusCounts.dropped,
    weeklyAttendancePct,
    avgGroupFillPct,
    totalRooms,
    roomUtilPct,
    roomsInUse,
    activeGroupsCount,
    t,
  ]);

  const openDetail = useDashboardDetail((s) => s.openDetail);
  const fmtSum0 = (n: number) => groupDigits(Math.round(n));
  const openDebtorsDetail = () =>
    openDetail({
      title: t('dashboard.umumiy.debtorStudents'),
      csvName: 'qarzdor-oquvchilar',
      rows: branchStudents
        .filter((s) => Number(s.balance) < 0)
        .map((s) => ({
          name: [s.last_name, s.first_name].filter(Boolean).join(' ') || '—',
          phone: s.phone || '—',
          balance: Number(s.balance),
          lastPayment: s.last_payment_date || '',
        })) as unknown as DetailRow[],
      searchText: (r) => `${r.name} ${r.phone}`,
      initialSort: { key: 'balance', dir: 'asc' },
      columns: [
        { key: 'name', label: t('dashboard.moliya.debtorName') },
        { key: 'phone', label: t('dashboard.moliya.debtorPhone') },
        {
          key: 'lastPayment',
          label: t('dashboard.moliya.debtorLastPayment'),
          render: (r) => {
            const d = new Date(String(r.lastPayment));
            return r.lastPayment && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('uz-UZ') : '—';
          },
          sortValue: (r) => new Date(String(r.lastPayment) || 0).getTime(),
        },
        {
          key: 'balance',
          label: t('dashboard.moliya.debtorAmount'),
          align: 'right',
          render: (r) => (
            <span style={{ color: '#dc2626' }}>{fmtSum0(r.balance as number)}</span>
          ),
          sortValue: (r) => r.balance as number,
          csv: (r) => r.balance as number,
        },
      ] as DetailColumn[],
    });

  // Eski dizayndagi har bir karta/diagramma/jadval — alohida vidjet (`widgets/registry.ts`).
  const nodes: Record<SectionIds<'umumiy'>, ReactNode> = {
    'umumiy.activeStudents': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--blue" />
        <p className="dash-stat-card__label">{t('dashboard.umumiy.activeStudents')}</p>
        <p className="dash-stat-card__value">{groupDigits(activeStudents)}</p>
        <p className="dash-stat-card__sub">
          {t('dashboard.umumiy.totalStudents', { count: totalStudents })}
        </p>
      </div>
    ),
    'umumiy.monthlyProfit': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--green" />
        <p className="dash-stat-card__label">{t('dashboard.umumiy.monthlyProfit')}</p>
        <p className="dash-stat-card__value dash-stat-card__value--green">
          {fmtMln(sof / 1_000_000)}
          <GrowthBadge value={profitGrowth} label={t('dashboard.filter.vsPrev')} />
        </p>
        <p className="dash-stat-card__sub dash-stat-card__sub--green">
          {t('dashboard.umumiy.incomeExpense', {
            income: fmtMln(tushum / 1_000_000),
            expense: fmtMln(xarajat / 1_000_000),
          })}
          <GrowthBadge value={incomeGrowth} label={t('dashboard.filter.vsPrev')} />
        </p>
      </div>
    ),
    'umumiy.lessonsRooms': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--indigo" />
        <p className="dash-stat-card__label">{t('dashboard.umumiy.currentLessonsRooms')}</p>
        <p className="dash-stat-card__value">{activeGroupsCount}</p>
        <p className="dash-stat-card__sub">
          {t('dashboard.umumiy.totalRooms', { count: totalRooms })}
        </p>
      </div>
    ),
    'umumiy.churn': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--red" />
        <p className="dash-stat-card__label">{t('dashboard.umumiy.churnRate')}</p>
        <p className="dash-stat-card__value dash-stat-card__value--red">{churnPct}%</p>
        <p className="dash-stat-card__sub">
          {t('dashboard.umumiy.inactiveStudents', { count: inactiveStudents })}
        </p>
      </div>
    ),
    'umumiy.totalStudents': (
      <div className="dash-stat-card">
        <p className="dash-stat-card__label">{t('dashboard.umumiy.totalStudentsAll')}</p>
        <p className="dash-stat-card__value" style={{ color: '#3b82f6' }}>
          {groupDigits(totalStudents)}
        </p>
        <p className="dash-stat-card__sub">
          {t('dashboard.umumiy.statusBreakdown', {
            frozen: statusCounts.frozen,
            graduated: statusCounts.graduated,
          })}
        </p>
      </div>
    ),
    'umumiy.newLeads': (
      <div className="dash-stat-card">
        <p className="dash-stat-card__label">{t('dashboard.umumiy.newLeads')}</p>
        <p className="dash-stat-card__value" style={{ color: '#a855f7' }}>
          {groupDigits(newLeads)}
          <GrowthBadge value={leadsGrowth} label={t('dashboard.filter.vsPrev')} />
        </p>
      </div>
    ),
    'umumiy.periodIncome': (
      <div className="dash-stat-card">
        <p className="dash-stat-card__label">{t('dashboard.umumiy.periodIncome')}</p>
        <p className="dash-stat-card__value" style={{ color: '#16a34a' }}>
          {fmtMln(tushum / 1_000_000)}
          <GrowthBadge value={incomeGrowth} label={t('dashboard.filter.vsPrev')} />
        </p>
        <p className="dash-stat-card__sub">
          {t('dashboard.moliya.paymentCount')}: {groupDigits(paymentCountPeriod)}
        </p>
      </div>
    ),
    'umumiy.debtStat': (
      <div className="dash-stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <p className="dash-stat-card__label">{t('dashboard.moliya.debts')}</p>
        <p className="dash-stat-card__value" style={{ color: '#f59e0b' }}>
          {fmtMln(totalDebtSum / 1_000_000)}
        </p>
        <p className="dash-stat-card__sub">
          {t('dashboard.moliya.debtorsSub', { count: debtorCount })}
        </p>
      </div>
    ),
    'umumiy.weeklyAttendance': (
      <div className="dash-stat-card">
        <p className="dash-stat-card__label">{t('dashboard.umumiy.weeklyAttendance')}</p>
        <p
          className="dash-stat-card__value"
          style={{ color: weeklyAttendancePct >= 80 ? '#16a34a' : '#f59e0b' }}
        >
          {weeklyAttendancePct}%
        </p>
      </div>
    ),
    'umumiy.roomUtil': (
      <div className="dash-stat-card">
        <p className="dash-stat-card__label">{t('dashboard.umumiy.roomUtil')}</p>
        <p className="dash-stat-card__value" style={{ color: '#6366f1' }}>
          {roomUtilPct}%
        </p>
        <p className="dash-stat-card__sub">
          {t('dashboard.umumiy.totalRooms', { count: totalRooms })}
        </p>
      </div>
    ),
    'umumiy.groupFill': (
      <div className="dash-stat-card">
        <p className="dash-stat-card__label">{t('dashboard.umumiy.groupFill')}</p>
        <p
          className="dash-stat-card__value"
          style={{ color: avgGroupFillPct >= 70 ? '#16a34a' : '#f59e0b' }}
        >
          {avgGroupFillPct}%
        </p>
        <p className="dash-stat-card__sub">
          {t('dashboard.umumiy.activeGroupsAlert')}: {activeGroupsCount}
        </p>
      </div>
    ),
    'umumiy.teachers': (
      <div className="dash-stat-card">
        <p className="dash-stat-card__label">{t('dashboard.umumiy.teachers')}</p>
        <p className="dash-stat-card__value" style={{ color: '#a855f7' }}>
          {groupDigits(teacherCount)}
        </p>
      </div>
    ),
    'umumiy.yearlyChart': (
      <div className="dash-card dash-mid-row__chart">
        <h3 className="dash-card__title">{t('dashboard.umumiy.yearlyDynamics')}</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 16, right: 16, left: -10, bottom: 0 }}>
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
                tickFormatter={(v) => `${v}M`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'noto-m', paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="tushum"
                name={t('dashboard.umumiy.chartIncome')}
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="xarajat"
                name={t('dashboard.umumiy.chartExpense')}
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="dash-empty">{t('dashboard.common.loading')}</div>
        )}
      </div>
    ),
    'umumiy.goals': (
      <div className="dash-card dash-mid-row__goals">
        <h3 className="dash-card__title">{t('dashboard.umumiy.monthlyGoals')}</h3>
        <div className="dash-goals">
          <div className="dash-goal">
            <div className="dash-goal__header">
              <span className="dash-goal__name">{t('dashboard.umumiy.salesContracts')}</span>
              <span className="dash-goal__pct" style={{ color: '#22c55e' }}>
                {contractPct}%
              </span>
            </div>
            <div className="dash-goal__track">
              <div
                className="dash-goal__fill"
                style={{ width: `${contractPct}%`, background: '#22c55e' }}
              />
            </div>
            <p className="dash-goal__meta">
              {t('dashboard.umumiy.goalDone', { goal: GOALS.shartnoma, done: contractCount })}
            </p>
          </div>
          <div className="dash-goal">
            <div className="dash-goal__header">
              <span className="dash-goal__name">{t('dashboard.umumiy.incomeRevenue')}</span>
              <span className="dash-goal__pct" style={{ color: '#3b82f6' }}>
                {tushumPct}%
              </span>
            </div>
            <div className="dash-goal__track">
              <div
                className="dash-goal__fill"
                style={{ width: `${tushumPct}%`, background: '#3b82f6' }}
              />
            </div>
            <p className="dash-goal__meta">
              {t('dashboard.umumiy.goalMln', {
                goal: GOALS.tushum_mln,
                done: tushum_mln.toFixed(0),
              })}
            </p>
          </div>
          <div className="dash-goal">
            <div className="dash-goal__header">
              <span className="dash-goal__name">{t('dashboard.umumiy.retention')}</span>
              <span className="dash-goal__pct" style={{ color: '#f59e0b' }}>
                {retentionPct}%
              </span>
            </div>
            <div className="dash-goal__track">
              <div
                className="dash-goal__fill"
                style={{
                  width: `${retentionPct}%`,
                  background: retentionPct < GOALS.retention ? '#ef4444' : '#f59e0b',
                }}
              />
            </div>
            <p className="dash-goal__meta">
              {t('dashboard.umumiy.retentionNote', { pct: GOALS.retention })}
            </p>
          </div>
        </div>
      </div>
    ),
    'umumiy.alerts': (
      <div className="dash-card">
        <div className="dash-card__title-row">
          <h3 className="dash-card__title">
            <span style={{ marginRight: 8 }}>⚠️</span>
            {t('dashboard.umumiy.alerts')}
          </h3>
          {debtorCount > 0 && (
            <button className="dash-detail-btn" onClick={openDebtorsDetail}>
              <i className="fa-solid fa-up-right-from-square" /> {t('dashboard.umumiy.debtorStudents')}
            </button>
          )}
        </div>
        <div className="dash-alerts">
          {alertItems.length > 0 ? (
            alertItems.map((a) => (
              <div key={a.key} className={`dash-alert dash-alert--${a.tone}`}>
                <div className="dash-alert__icon">
                  <i className={`fa-solid ${a.icon}`} />
                </div>
                <div>
                  <p className="dash-alert__title">{a.title}</p>
                  <p className="dash-alert__body">{a.body}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="dash-alert dash-alert--green">
              <div className="dash-alert__icon">
                <i className="fa-solid fa-circle-check" />
              </div>
              <div>
                <p className="dash-alert__title">
                  {t('dashboard.umumiy.alertAllGoodTitle')}
                </p>
                <p className="dash-alert__body">{t('dashboard.umumiy.alertAllGoodBody')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    ),
  };

  return <WidgetTab tab="umumiy" nodes={nodes} editing={editing} />;
}
