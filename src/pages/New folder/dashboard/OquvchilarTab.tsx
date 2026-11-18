import { groupDigits } from '@/utils/formatNumber';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import WidgetTab from './widgets/WidgetTab';
import type { SectionIds } from './widgets/registry';
import { useQueries } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import {
  fetchStudentsData,
  fetchGroupsData,
  fetchGroupStudents,
  fetchMonthlyAttendance,
  weeklyAttendanceByDay,
} from './dashboard.service';
import type { GroupStudent } from '@/types/group.types';
import { useGatedQuery } from './useGatedQuery';
import { useDashFilter, pickBranchId } from './useDashboardFilter';
import { useDashboardDetail, type DetailColumn, type DetailRow } from './useDashboardDetail';

type GroupStudentWithGroup = GroupStudent & { groupName?: string };

function ScoreBadge({ pct }: { pct: number }) {
  let bg = '#dcfce7';
  let color = '#16a34a';
  if (pct < 80) {
    bg = '#fef9c3';
    color = '#ca8a04';
  }
  if (pct < 60) {
    bg = '#fee2e2';
    color = '#dc2626';
  }
  return (
    <span className="oquv-badge" style={{ background: bg, color }}>
      {pct}%
    </span>
  );
}

const MEDAL_COLORS = ['#f59e0b', '#94a3b8', '#c47b2b'];

export default function OquvchilarTab({ editing }: { editing: boolean }) {
  const { t } = useTranslation();

  const { data: studentsData } = useGatedQuery(
    ['dash-students'],
    fetchStudentsData,
    'students.view',
  );
  const { data: groupsData } = useGatedQuery(['dash-groups'], fetchGroupsData, 'groups.view');
  const { data: monthlyAttendance } = useGatedQuery(
    ['dash-monthly-attendance'],
    fetchMonthlyAttendance,
    'student_attendance.view',
  );

  const flt = useDashFilter();

  // Tanlangan filialning guruhlari — daraja taqsimoti, guruh-o'quvchilar
  // agregatsiyasi va "top o'quvchilar" shu ro'yxatdan. (Davr filtri bu tabga
  // qo'llanmaydi: ball/davomat kumulyativ ko'rsatkichlar.)
  // BARCHA guruh — ilgari faqat birinchi 5 guruh olinar edi, shu sabab "o'rtacha
  // ball" va "top o'quvchilar" butun maktabni emas, kichik namunani aks
  // ettirardi. Endi hamma guruh (ichki himoya: 120 tagacha). Guruhlar ro'yxati
  // kelmasa (ruxsat yo'q) — ichki so'rovlar ham yuborilmaydi.
  const branchGroups = useMemo(
    () => (groupsData?.list ?? []).filter((g) => flt.branchOk(g)),
    [groupsData, flt],
  );
  const scopedGroups = useMemo(() => branchGroups.slice(0, 120), [branchGroups]);
  const allGroupIds = scopedGroups.map((g) => g.id);
  const groupStudentQueries = useQueries({
    queries: allGroupIds.map((id) => ({
      queryKey: ['dash-group-students', id],
      queryFn: () => fetchGroupStudents(id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const students = useMemo(() => {
    const list = studentsData?.list ?? [];
    if (!flt.hasBranchFilter) return list;
    return list.filter((s) => {
      const bid = pickBranchId(s);
      return bid == null || bid === flt.branchId;
    });
  }, [studentsData, flt]);
  const totalStudents = flt.hasBranchFilter ? students.length : studentsData?.total ?? 0;
  const debtorCount = students.filter((s) => Number(s.balance) < 0).length;
  const activeGroupsCount = flt.hasBranchFilter ? branchGroups.length : groupsData?.total ?? 0;

  const allGroupStudents: GroupStudentWithGroup[] = useMemo(() => {
    const result: GroupStudentWithGroup[] = [];
    groupStudentQueries.forEach((q, i) => {
      const grp = scopedGroups[i];
      (q.data ?? []).forEach((s) => result.push({ ...s, groupName: grp?.name }));
    });
    return result;
  }, [groupStudentQueries, scopedGroups]);

  const avgScore = useMemo(() => {
    if (!allGroupStudents.length) return 0;
    const sum = allGroupStudents.reduce((s, st) => s + (st.course_completion_pct ?? 0), 0);
    return Math.round(sum / allGroupStudents.length);
  }, [allGroupStudents]);

  const topStudents = useMemo(
    () =>
      [...allGroupStudents]
        .sort((a, b) => (b.course_completion_pct ?? 0) - (a.course_completion_pct ?? 0))
        .slice(0, 5),
    [allGroupStudents],
  );

  const levelData = useMemo(() => {
    const counts: Record<string, number> = {};
    branchGroups.forEach((g) => {
      const name = g.level?.name_uz || g.level?.name || 'Boshqa';
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [branchGroups]);

  const weeklyData = useMemo(
    () => weeklyAttendanceByDay(monthlyAttendance ?? {}),
    [monthlyAttendance],
  );

  const ozlashtirishData = useMemo(() => {
    const months = [
      t('dashboard.months.jan'),
      t('dashboard.months.feb'),
      t('dashboard.months.mar'),
      t('dashboard.months.apr'),
      t('dashboard.months.may'),
    ];
    if (!monthlyAttendance) return months.map((m) => ({ month: m, ball: 0 }));
    const monthAgg: Record<string, number[]> = {};
    Object.entries(monthlyAttendance).forEach(([date, records]) => {
      const m = new Date(date).getMonth();
      const key = months[m] ?? null;
      if (!key) return;
      const presentCount = records.filter(
        (r) => r.status === 'present' || r.status === 'late',
      ).length;
      const pct = records.length ? (presentCount / records.length) * 100 : 0;
      if (!monthAgg[key]) monthAgg[key] = [];
      monthAgg[key].push(pct);
    });
    return months.map((m) => {
      const vals = monthAgg[m] ?? [];
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      return { month: m, ball: parseFloat(avg.toFixed(1)) };
    });
  }, [monthlyAttendance, t]);

  const maxBall = Math.max(...ozlashtirishData.map((d) => d.ball), 0);
  const minBall = Math.min(...ozlashtirishData.filter((d) => d.ball > 0).map((d) => d.ball), 100);

  const openDetail = useDashboardDetail((s) => s.openDetail);
  const openStudentsDetail = () =>
    openDetail({
      title: t('dashboard.oquvchi.topStudents'),
      csvName: 'oquvchilar-reyting',
      rows: allGroupStudents.map((s) => ({
        name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || '—',
        group: s.groupName ?? '—',
        score: Number((s.course_completion_pct ?? 0).toFixed(1)),
        attendance: Math.round(s.attendance_pct ?? 0),
        debt: Number(s.debt ?? 0),
      })) as unknown as DetailRow[],
      searchText: (r) => `${r.name} ${r.group}`,
      initialSort: { key: 'score', dir: 'desc' },
      columns: [
        { key: 'name', label: t('dashboard.oquvchi.studentName') },
        { key: 'group', label: t('dashboard.oquvchi.groupDirection') },
        {
          key: 'score',
          label: t('dashboard.oquvchi.avgBall'),
          align: 'right',
          render: (r) => `${r.score}%`,
          sortValue: (r) => r.score as number,
        },
        {
          key: 'attendance',
          label: t('dashboard.oquvchi.weeklyAtt'),
          align: 'right',
          render: (r) => `${r.attendance}%`,
          sortValue: (r) => r.attendance as number,
        },
        {
          key: 'debt',
          label: t('dashboard.moliya.debtorAmount'),
          align: 'right',
          render: (r) =>
            (r.debt as number) > 0 ? (
              <span style={{ color: '#dc2626' }}>
                {groupDigits(Math.round(r.debt as number))}
              </span>
            ) : (
              '—'
            ),
          sortValue: (r) => r.debt as number,
          csv: (r) => r.debt as number,
        },
      ] as DetailColumn[],
    });

  // Eski dizayndagi har bir karta/diagramma/jadval — alohida vidjet (`widgets/registry.ts`).
  const nodes: Record<SectionIds<'oquvchi'>, ReactNode> = {
    'oquvchi.totalStudents': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--blue" />
        <p className="dash-stat-card__label">{t('dashboard.oquvchi.totalStudents')}</p>
        <p className="dash-stat-card__value">{groupDigits(totalStudents)}</p>
      </div>
    ),
    'oquvchi.activeGroups': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--indigo" />
        <p className="dash-stat-card__label">{t('dashboard.oquvchi.activeGroups')}</p>
        <p className="dash-stat-card__value" style={{ color: '#6366f1' }}>
          {activeGroupsCount}
        </p>
      </div>
    ),
    'oquvchi.avgScore': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--green" />
        <p className="dash-stat-card__label">{t('dashboard.oquvchi.avgScore')}</p>
        <p className="dash-stat-card__value dash-stat-card__value--green">{avgScore}%</p>
      </div>
    ),
    'oquvchi.debtors': (
      <div className="dash-stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
        <div className="dash-stat-card__bg dash-stat-card__bg--red" />
        <p className="dash-stat-card__label">{t('dashboard.oquvchi.debtors')}</p>
        <p className="dash-stat-card__value dash-stat-card__value--red">{debtorCount}</p>
      </div>
    ),
    'oquvchi.levelChart': (
      <div className="dash-card">
        <h3 className="dash-card__title">{t('dashboard.oquvchi.levelDistribution')}</h3>
        {levelData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={levelData} margin={{ top: 16, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#f0f4f8" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#94a3b8', fontFamily: 'noto-m' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'noto-m' }}
              />
              <Tooltip
                formatter={(v: number | undefined) => [
                  `${v ?? 0} ta`,
                  t('dashboard.oquvchi.count'),
                ]}
                cursor={{ fill: 'rgba(59,130,246,0.06)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'noto-m' }} />
              <Bar
                dataKey="value"
                name={t('dashboard.oquvchi.count')}
                fill="#3b82f6"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="dash-empty">{t('dashboard.common.noData')}</div>
        )}
      </div>
    ),
    'oquvchi.scoreChart': (
      <div className="dash-card">
        <div className="oquv-chart-header">
          <div>
            <h3 className="dash-card__title" style={{ margin: 0 }}>
              {t('dashboard.oquvchi.scoreDynamics')}
            </h3>
            <p className="dash-card__sub">{t('dashboard.oquvchi.last5months')}</p>
          </div>
          <div className="oquv-chart-legend">
            {maxBall > 0 && (
              <span className="oquv-chart-legend__item oquv-chart-legend__item--green">
                {t('dashboard.oquvchi.maxScore', { pct: maxBall.toFixed(0) })}
              </span>
            )}
            {minBall < 100 && (
              <span className="oquv-chart-legend__item oquv-chart-legend__item--red">
                {t('dashboard.oquvchi.minScore', { pct: minBall.toFixed(0) })}
              </span>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart
            data={ozlashtirishData}
            margin={{ top: 16, right: 16, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="oquvGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
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
              domain={[50, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'noto-m' }}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              formatter={(v: number | undefined) => [
                `${v ?? 0}%`,
                t('dashboard.oquvchi.avgBall'),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'noto-m' }} />
            <Area
              type="monotone"
              dataKey="ball"
              name={t('dashboard.oquvchi.avgBall')}
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#oquvGrad)"
              dot={{ r: 4, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    ),
    'oquvchi.weeklyChart': (
      <div className="dash-card">
        <h3 className="dash-card__title">
          <i
            className="fa-solid fa-calendar-check"
            style={{ marginRight: 8, color: '#6366f1' }}
          />
          {t('dashboard.oquvchi.weeklyAttendance')}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weeklyData} margin={{ top: 16, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#f0f4f8" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#94a3b8', fontFamily: 'noto-m' }}
            />
            <YAxis
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'noto-m' }}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              formatter={(v: number | undefined) => [
                `${v ?? 0}%`,
                t('dashboard.oquvchi.attendancePct'),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'noto-m' }} />
            <Bar
              dataKey="pct"
              name={t('dashboard.oquvchi.attendancePct')}
              fill="#3b82f6"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    ),
    'oquvchi.topStudents': (
      <div className="dash-card">
        <div className="dash-card__title-row">
          <h3 className="dash-card__title">
            <i className="fa-solid fa-star" style={{ marginRight: 8, color: '#f59e0b' }} />
            {t('dashboard.oquvchi.topStudents')}
          </h3>
          {allGroupStudents.length > 0 && (
            <button className="dash-detail-btn" onClick={openStudentsDetail}>
              <i className="fa-solid fa-up-right-from-square" /> {t('dashboard.detail.btn')}
            </button>
          )}
        </div>
        {topStudents.length > 0 ? (
          <table className="oquv-table">
            <thead>
              <tr>
                <th>{t('dashboard.oquvchi.studentName')}</th>
                <th>{t('dashboard.oquvchi.groupDirection')}</th>
                <th>{t('dashboard.oquvchi.weeklyAtt')}</th>
                <th>{t('dashboard.oquvchi.avgBall')}</th>
              </tr>
            </thead>
            <tbody>
              {topStudents.map((s, i) => (
                // Bir o'quvchi bir nechta guruhda bo'lsa ro'yxatda har guruh uchun alohida chiqadi —
                // `s.id` yolg'iz kalit sifatida takrorlanardi.
                <tr key={`${s.id}-${i}`}>
                  <td>
                    <span className="oquv-medal" style={{ color: MEDAL_COLORS[i] ?? '#64748b' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                    </span>
                    {s.first_name} {s.last_name}
                  </td>
                  <td className="oquv-table__group">{s.groupName ?? '—'}</td>
                  <td>
                    <ScoreBadge pct={Math.round(s.attendance_pct ?? 0)} />
                  </td>
                  <td className="oquv-table__score">
                    {(s.course_completion_pct ?? 0).toFixed(1)}
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

  return <WidgetTab tab="oquvchi" nodes={nodes} editing={editing} />;
}
