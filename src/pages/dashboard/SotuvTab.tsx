import { groupDigits } from '@/utils/formatNumber';
import { useState, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import WidgetTab from './widgets/WidgetTab';
import type { SectionIds } from './widgets/registry';
import { useGatedQuery } from './useGatedQuery';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { fetchLidsData, fetchStudentContractsTotal } from './dashboard.service';
import { useDashFilter, pctChange } from './useDashboardFilter';
import GrowthBadge from './GrowthBadge';
import { useDashboardDetail, type DetailColumn, type DetailRow } from './useDashboardDetail';
import TelephonyStats from './TelephonyStats';
import { LID_STATUS, LID_INTEREST_COLORS, normalizeInterestColor } from '@/types/lid.types';
import type { Lid, LidStatus } from '@/types/lid.types';
import useAuthStore from '@/store/useAuthStore';
import useDashboardSettings from '@/store/useDashboardSettings';
import { isAdminUser } from '@/utils/isAdminUser';

type VoronkaTab = 'holat' | 'kurslar' | 'manba' | 'daraja' | 'hudud' | 'rang' | 'rad';

const HOLAT_STATUS_MAP: { status: LidStatus; key: string }[] = [
  { status: LID_STATUS.NEW_ONLINE, key: 'online' },
  { status: LID_STATUS.NEW_OFFLINE, key: 'offline' },
  { status: LID_STATUS.DEMO_SCHEDULED, key: 'coming' },
  { status: LID_STATUS.DEMO_ATTENDED, key: 'came' },
  { status: LID_STATUS.CONTACTED, key: 'contacted' },
  { status: LID_STATUS.CONTRACT_SIGNED, key: 'contract' },
  { status: LID_STATUS.PAID, key: 'paid' },
  { status: LID_STATUS.NOT_INTERESTED, key: 'notInterested' },
  { status: LID_STATUS.DEMO_MISSED, key: 'missed' },
  { status: LID_STATUS.NOT_CONTACTED, key: 'notContacted' },
];

const RAD_STATUSES: LidStatus[] = [
  LID_STATUS.NOT_INTERESTED,
  LID_STATUS.DEMO_MISSED,
  LID_STATUS.NOT_CONTACTED,
];

const VORONKA_COLORS = [
  '#06b6d4',
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#a78bfa',
  '#c084fc',
  '#e879f9',
  '#f472b6',
  '#fb7185',
  '#fda4af',
];
const RAD_COLORS = ['#fb7185', '#f472b6', '#ec4899', '#db2777', '#be185d'];
/** Rang belgilanmagan lidlar qatori rangi («Ranglar» kesimi). */
const NO_COLOR_HEX = '#94a3b8';

/**
 * Rang ustidagi yozuv rangi (WCAG kontrasti): yorqin ranglarda (sariq, havorang, yashil,
 * to'q sariq) oq yozuv o'qilmaydi — to'q yozuv, qolganlarida oq.
 */
function labelOn(hex: string): string {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05) < 3 ? '#0f172a' : '#fff';
}

/**
 * Qatorlarning umumiy sondagi ulushi, 0,1% aniqlikda. Oddiy yaxlitlash yig'indini 99,9 yoki 100,1 qilib
 * qo'yishi mumkin — shuning uchun eng katta qoldiq usuli: yig'indi har doim aynan 100,0%.
 */
function sharePercents(values: number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 1000);
  const tenths = raw.map(Math.floor);
  let left = 1000 - tenths.reduce((sum, v) => sum + v, 0);
  const byRemainder = raw.map((r, i) => ({ i, rem: r - tenths[i] })).sort((a, b) => b.rem - a.rem);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    tenths[i] += 1;
    left -= 1;
  }
  return tenths.map((v) => v / 10);
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  fill?: string;
  showFoiz?: boolean;
  maxValue?: number;
  /** Recharts qatorning ma'lumotini shu yerga beradi (`labelColor` — yozuv rangi). */
  payload?: { labelColor?: string };
}

const CustomBar = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  fill,
  showFoiz,
  maxValue = 0,
  payload,
}: BarShapeProps) => {
  if (!height || !maxValue) return null;

  // Bar x-axis domain'i [0, maxValue] bo'lgani uchun eng katta bar butun
  // maydonni egallaydi -> maydon kengligini shu nisbatdan hisoblaymiz va
  // barni voronka ko'rinishida markazga suramiz. Qiymati 0 bo'lgan barda kenglik 0 —
  // maydon kengligi ilgari (kattaroq) barlardan eslab qolinadi.
  if (width > 0 && value) lastPlotWidth = width / (value / maxValue);
  const plotWidth = lastPlotWidth;
  const barX = x + (plotWidth - width) / 2;
  const text = showFoiz ? `${value ?? 0}%` : `${value ?? 0} ta`;

  // Yozuv bar ichiga sig'masa (kichik/nol qiymat) — barning o'ng tomoniga (nol bo'lsa markazga) to'q rangda chiqadi.
  const fitsInside = width >= text.length * 7 + 20;
  const labelProps = fitsInside
    ? { x: barX + width - 8, textAnchor: 'end' as const, fill: payload?.labelColor ?? '#fff' }
    : width > 0
      ? { x: barX + width + 6, textAnchor: 'start' as const, fill: '#334155' }
      : { x: barX, textAnchor: 'middle' as const, fill: '#64748b' };

  return (
    <g>
      {width > 0 && <rect x={barX} y={y} width={width} height={height} fill={fill} rx={5} />}
      <text
        {...labelProps}
        y={y + height / 2}
        dominantBaseline="middle"
        fontSize={12}
        fontFamily="noto-m"
      >
        {text}
      </text>
    </g>
  );
};

/** Oxirgi nolmas bar asosida hisoblangan chizma maydoni kengligi (nol qiymatli barlar markazlanishi uchun). */
let lastPlotWidth = 0;

const NOW_MS = Date.now();

export default function SotuvTab({ editing }: { editing: boolean }) {
  const { t } = useTranslation();
  const [voronkaTab, setVoronkaTab] = useState<VoronkaTab>('holat');
  const [showFoiz, setShowFoiz] = useState(false);

  const user = useAuthStore((s) => s.user);
  const { hasFeature } = useDashboardSettings();
  const canSeeTelephony = isAdminUser(user) || hasFeature('ip_telephone.view');

  const { data: lidsData, isLoading } = useGatedQuery(['dash-lids'], fetchLidsData, 'lids.view');

  const { data: studentContractsTotal = 0 } = useGatedQuery(
    ['dash-student-contracts-total'],
    fetchStudentContractsTotal,
    'student_contracts.view',
  );

  const flt = useDashFilter();

  // Lidlar — tanlangan davr (`created_at`) + filial bo'yicha. Barcha voronka
  // kesimlari, demografiya va yosh taqsimoti shu ro'yxatdan hisoblanadi.
  const lids = useMemo(
    () => (lidsData?.list ?? []).filter((l) => flt.branchOk(l) && flt.dateOk(l.created_at)),
    [lidsData, flt],
  );
  const prevLidCount = useMemo(
    () => (lidsData?.list ?? []).filter((l) => flt.branchOk(l) && flt.datePrevOk(l.created_at)).length,
    [lidsData, flt],
  );
  const lidGrowth = flt.hasPrev ? pctChange(lids.length, prevLidCount) : NaN;

  // Barcha lid raqamlari (davrdan qat'i nazar) — qo'ng'iroqni lidga bog'lash uchun.
  const leadPhones = useMemo(() => {
    const s = new Set<string>();
    for (const l of lidsData?.list ?? []) {
      const d = (l.phone || '').replace(/\D/g, '');
      if (!d) continue;
      s.add(d);
      if (d.length >= 9) s.add(d.slice(-9));
    }
    return s;
  }, [lidsData]);

  const demoAttended = useMemo(
    () => lids.filter((l) => l.status === LID_STATUS.DEMO_ATTENDED).length,
    [lids],
  );

  const TABS: { key: VoronkaTab; label: string }[] = [
    { key: 'holat', label: t('dashboard.sotuv.tabs.holat') },
    { key: 'kurslar', label: t('dashboard.sotuv.tabs.kurslar') },
    { key: 'manba', label: t('dashboard.sotuv.tabs.manba') },
    { key: 'daraja', label: t('dashboard.sotuv.tabs.daraja') },
    { key: 'hudud', label: t('dashboard.sotuv.tabs.hudud') },
    { key: 'rang', label: t('dashboard.sotuv.tabs.rang') },
    { key: 'rad', label: t('dashboard.sotuv.tabs.rad') },
  ];

  // ── Voronka aggregation ──────────────────────────────────────────────────
  const voronkaHolat = useMemo(() => {
    const counts: Record<number, number> = {};
    lids.forEach((l) => {
      counts[l.status] = (counts[l.status] ?? 0) + 1;
    });
    return HOLAT_STATUS_MAP.map((h) => ({
      name: t(`dashboard.sotuv.holat.${h.key}`),
      value: counts[h.status] ?? 0,
    })).sort((a, b) => b.value - a.value);
  }, [lids, t]);

  const voronkaKurslar = useMemo(() => {
    const counts: Record<string, number> = {};
    lids.forEach((l) => {
      const name = l.course?.name_uz || l.course?.name || 'Boshqa';
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [lids]);

  const voronkaManba = useMemo(() => {
    const counts: Record<string, number> = {};
    lids.forEach((l) => {
      const name = l.source?.name_uz || l.source?.name || 'Boshqa';
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [lids]);

  const voronkaDaraja = useMemo(() => {
    const counts: Record<string, number> = {};
    lids.forEach((l) => {
      const name = l.level?.name_uz || l.level?.name || 'Boshqa';
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [lids]);

  const voronkaHudud = useMemo(() => {
    const counts: Record<string, number> = {};
    lids.forEach((l) => {
      const name = l.region?.name_uz || 'Boshqa';
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [lids]);

  // Lidning «qiziqish rangi» (backend `color`) bo'yicha: har rang — mijoz turi (`lid.interest.<kalit>`
  // nomi, `...Desc` ma'nosi). Rang belgilanmagan lidlar «Belgilanmagan» qatorida.
  const voronkaRang = useMemo(() => {
    const counts = new Map<string, number>();
    lids.forEach((l) => {
      const key = normalizeInterestColor(l.color) ?? 'none';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, value]) => {
        const meta = LID_INTEREST_COLORS.find((c) => c.key === key);
        const color = meta?.hex ?? NO_COLOR_HEX;
        return {
          name: meta ? t(meta.labelKey) : t('lid.interest.none'),
          value,
          color,
          labelColor: labelOn(color),
          desc: meta ? t(meta.descKey) : '',
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [lids, t]);

  const voronkaRad = useMemo(() => {
    const radLids = lids.filter((l) => RAD_STATUSES.includes(l.status));
    const counts: Record<string, number> = {};
    radLids.forEach((l) => {
      const h = HOLAT_STATUS_MAP.find((h) => h.status === l.status);
      const name = h ? t(`dashboard.sotuv.holat.${h.key}`) : 'Boshqa';
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [lids, t]);

  const VORONKA_MAP: Record<
    VoronkaTab,
    { name: string; value: number; color?: string; labelColor?: string; desc?: string }[]
  > = {
    holat: voronkaHolat,
    kurslar: voronkaKurslar,
    manba: voronkaManba,
    daraja: voronkaDaraja,
    hudud: voronkaHudud,
    rang: voronkaRang,
    rad: voronkaRad,
  };

  const isRad = voronkaTab === 'rad';
  const rawData = VORONKA_MAP[voronkaTab];
  // Foiz — har qatorning umumiy sondagi ulushi: barcha qatorlar yig'indisi 100% bo'ladi
  // (ilgari eng katta qatorga nisbatan hisoblanardi, shuning uchun birinchi qator doim 100% chiqardi).
  const shares = sharePercents(rawData.map((d) => d.value));
  const chartData = rawData.map((d, i) => ({
    ...d,
    display: showFoiz ? shares[i] : d.value,
  }));
  const maxDisplay = Math.max(...chartData.map((d) => d.display), 1);

  // ── Demographics ─────────────────────────────────────────────────────────
  const maleCount = lids.filter((l) => l.gender === 'male').length;
  const femaleCount = lids.filter((l) => l.gender === 'female').length;
  const total = maleCount + femaleCount || 1;
  const malePct = Math.round((maleCount / total) * 100);

  const yoshData = useMemo(() => {
    const yoshLabels = [
      { name: t('dashboard.sotuv.age712'), value: 0, color: '#f59e0b' },
      { name: t('dashboard.sotuv.age1317'), value: 0, color: '#3b82f6' },
      { name: t('dashboard.sotuv.age1824'), value: 0, color: '#6366f1' },
      { name: t('dashboard.sotuv.age25'), value: 0, color: '#94a3b8' },
    ];
    const getAge = (birthDate: string | null): number | null => {
      if (!birthDate) return null;
      const diff = NOW_MS - new Date(birthDate).getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    };
    const counts = [0, 0, 0, 0];
    lids.forEach((l) => {
      const age = getAge(l.birth_date);
      if (age === null) return;
      if (age <= 12) counts[0]++;
      else if (age <= 17) counts[1]++;
      else if (age <= 24) counts[2]++;
      else counts[3]++;
    });
    return yoshLabels.map((d, i) => ({ ...d, value: counts[i] }));
  }, [lids, t]);

  const successContracts = studentContractsTotal;
  // Lid → shartnoma konversiyasi (%). `successContracts` — butun davr
  // (`/student-contracts` filtrlanmaydi), `lids` — tanlangan davr.
  const conversionRate = lids.length > 0 ? (successContracts / lids.length) * 100 : 0;

  const openDetail = useDashboardDetail((s) => s.openDetail);
  const statusLabel = (st: LidStatus) => {
    const h = HOLAT_STATUS_MAP.find((x) => x.status === st);
    return h ? t(`dashboard.sotuv.holat.${h.key}`) : String(st);
  };
  const colorMeta = (l: Lid) =>
    LID_INTEREST_COLORS.find((c) => c.key === normalizeInterestColor(l.color));
  const colorLabel = (l: Lid) => {
    const meta = colorMeta(l);
    return meta ? t(meta.labelKey) : '—';
  };
  const openLidsDetail = () =>
    openDetail({
      title: `${t('dashboard.sotuv.tabs.holat')} — ${t('dashboard.sotuv.totalLids')}`,
      csvName: 'lidlar',
      rows: lids.map((l) => ({
        name: [l.last_name, l.first_name].filter(Boolean).join(' ') || '—',
        phone: l.phone || '—',
        status: statusLabel(l.status),
        source: l.source?.name_uz || l.source?.name || '—',
        course: l.course?.name_uz || l.course?.name || '—',
        region: l.region?.name_uz || '—',
        color: colorLabel(l),
        colorHex: colorMeta(l)?.hex ?? '',
        date: l.created_at || '',
      })) as unknown as DetailRow[],
      searchText: (r) =>
        `${r.name} ${r.phone} ${r.status} ${r.source} ${r.course} ${r.region} ${r.color}`,
      initialSort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'name', label: t('dashboard.sotuv.demographics') },
        { key: 'phone', label: t('dashboard.moliya.debtorPhone') },
        { key: 'status', label: t('dashboard.sotuv.tabs.holat') },
        { key: 'source', label: t('dashboard.sotuv.tabs.manba') },
        { key: 'course', label: t('dashboard.sotuv.tabs.kurslar') },
        { key: 'region', label: t('dashboard.sotuv.tabs.hudud') },
        {
          key: 'color',
          label: t('dashboard.sotuv.tabs.rang'),
          render: (r) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {r.colorHex ? (
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: String(r.colorHex),
                    flexShrink: 0,
                  }}
                />
              ) : null}
              {String(r.color)}
            </span>
          ),
          sortValue: (r) => String(r.color),
          csv: (r) => String(r.color),
        },
        {
          key: 'date',
          label: t('dashboard.moliya.debtorLastPayment'),
          render: (r) => {
            const d = new Date(String(r.date));
            return r.date && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('uz-UZ') : '—';
          },
          sortValue: (r) => new Date(String(r.date) || 0).getTime(),
        },
      ] as DetailColumn[],
    });

  if (isLoading) return <div className="dash-loading">{t('dashboard.common.loading')}</div>;

  // Eski dizayndagi har bir karta/diagramma/jadval — alohida vidjet (`widgets/registry.ts`).
  const nodes: Record<SectionIds<'sotuv'>, ReactNode> = {
    'sotuv.totalLids': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--blue" />
        <p className="dash-stat-card__label">{t('dashboard.sotuv.totalLids')}</p>
        <p className="dash-stat-card__value">
          {groupDigits(lids.length)}
          <GrowthBadge value={lidGrowth} label={t('dashboard.filter.vsPrev')} />
        </p>
      </div>
    ),
    'sotuv.successContracts': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--green" />
        <p className="dash-stat-card__label">{t('dashboard.sotuv.successContracts')}</p>
        <p className="dash-stat-card__value dash-stat-card__value--green">
          {groupDigits(successContracts)}
        </p>
      </div>
    ),
    'sotuv.conversion': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--indigo" />
        <p className="dash-stat-card__label">{t('dashboard.metrics.conversion')}</p>
        <p
          className="dash-stat-card__value"
          style={{ color: conversionRate >= 20 ? '#16a34a' : '#f59e0b' }}
        >
          {conversionRate.toFixed(1)}%
        </p>
      </div>
    ),
    'sotuv.demoAttended': (
      <div className="dash-stat-card">
        <div className="dash-stat-card__bg dash-stat-card__bg--red" />
        <p className="dash-stat-card__label">{t('dashboard.sotuv.holat.came')}</p>
        <p className="dash-stat-card__value" style={{ color: '#a855f7' }}>
          {groupDigits(demoAttended)}
        </p>
      </div>
    ),
    'sotuv.voronka': (
      <div className="dash-card dash-mid-row__voronka">
        <div className="voronka-controls">
          <div className="voronka-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`voronka-tab${voronkaTab === tab.key ? ' voronka-tab--active' : ''}${tab.key === 'rad' ? ' voronka-tab--rad' : ''}`}
                onClick={() => setVoronkaTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="voronka-toggle">
            <span
              className={`voronka-toggle__label${!showFoiz ? ' voronka-toggle__label--active' : ''}`}
            >
              {t('dashboard.sotuv.soni')}
            </span>
            <button
              role="switch"
              aria-checked={showFoiz}
              className={`voronka-switch${showFoiz ? ' voronka-switch--on' : ''}`}
              onClick={() => setShowFoiz(!showFoiz)}
            >
              <span className="voronka-switch__knob" />
            </button>
            <span
              className={`voronka-toggle__label${showFoiz ? ' voronka-toggle__label--active' : ''}`}
            >
              {t('dashboard.sotuv.foiz')}
            </span>
          </div>
        </div>

        <div className="dash-card__title-row" style={{ marginTop: 16 }}>
          <h3 className="dash-card__title">{t('dashboard.sotuv.voronkaTitle')}</h3>
          {lids.length > 0 && (
            <button className="dash-detail-btn" onClick={openLidsDetail}>
              <i className="fa-solid fa-up-right-from-square" /> {t('dashboard.detail.btn')}
            </button>
          )}
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(chartData.length * 52, 200)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              barCategoryGap={8}
            >
              <XAxis type="number" domain={[0, maxDisplay]} hide />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fill: '#475569', fontFamily: 'noto-m' }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                formatter={(val: number | undefined, _name, item) => {
                  if (!showFoiz) return [`${val ?? 0} ta`, ''];
                  const count = (item?.payload as { value?: number } | undefined)?.value;
                  return [`${val ?? 0}%${count !== undefined ? ` (${count} ta)` : ''}`, ''];
                }}
                  labelFormatter={(label, items) => {
                    const desc = (items?.[0]?.payload as { desc?: string } | undefined)?.desc;
                    return desc ? `${label} — ${desc}` : label;
                  }}
                  wrapperStyle={{ maxWidth: 280 }}
                  contentStyle={{ whiteSpace: 'normal' }}
              />
              <Bar
                dataKey="display"
                shape={(p: unknown) => (
                  <CustomBar {...(p as BarShapeProps)} showFoiz={showFoiz} maxValue={maxDisplay} />
                )}
                isAnimationActive
              >
                {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.color ??
                        (isRad
                          ? RAD_COLORS[i % RAD_COLORS.length]
                          : VORONKA_COLORS[i % VORONKA_COLORS.length])
                      }
                    />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="dash-empty">{t('dashboard.common.noData')}</div>
        )}
      </div>
    ),
    'sotuv.side': (
      <div className="dash-sotuv-right">
        <div className="dash-card">
          <h3 className="dash-card__title">{t('dashboard.sotuv.demographics')}</h3>

          <div className="demo-gender">
            <div className="demo-gender__labels">
              <span className="demo-gender__male">
                <i className="fa-solid fa-mars" /> {t('dashboard.sotuv.boys')}
              </span>
              <span className="demo-gender__female">
                {t('dashboard.sotuv.girls')} <i className="fa-solid fa-venus" />
              </span>
            </div>
            <div className="demo-gender__track">
              <div className="demo-gender__fill--male" style={{ width: `${malePct}%` }} />
              <div className="demo-gender__fill--female" style={{ width: `${100 - malePct}%` }} />
            </div>
            <div className="demo-gender__counts">
              <span>
                {maleCount} {t('dashboard.common.nafar')}
              </span>
              <span>
                {femaleCount} {t('dashboard.common.nafar')}
              </span>
            </div>
          </div>

          <p className="demo-subtitle">{t('dashboard.sotuv.ageGroups')}</p>
          <div className="demo-donut-row">
            <PieChart width={160} height={160}>
              <Pie
                data={yoshData}
                cx={75}
                cy={75}
                innerRadius={50}
                outerRadius={72}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                paddingAngle={2}
              >
                {yoshData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
            <ul className="demo-legend">
              {yoshData.map((d, i) => (
                <li key={i} className="demo-legend__item">
                  <span className="demo-legend__dot" style={{ background: d.color }} />
                  {d.name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="dash-card dash-contracts-card">
          <p className="dash-contracts-card__label">{t('dashboard.sotuv.successContracts')}</p>
          <p className="dash-contracts-card__value">
            {successContracts} {t('dashboard.sotuv.taContract')}
          </p>
          <div className="dash-contracts-card__row">
            <span>{t('dashboard.sotuv.totalLids')}</span>
            <span className="dash-contracts-card__cac">
              {lids.length} {t('dashboard.common.ta')}
              <GrowthBadge value={lidGrowth} label={t('dashboard.filter.vsPrev')} />
            </span>
          </div>
          <div className="dash-contracts-card__row">
            <span>{t('dashboard.metrics.conversion')}</span>
            <span
              className="dash-contracts-card__cac"
              style={{ color: conversionRate >= 20 ? '#16a34a' : '#f59e0b' }}
            >
              {conversionRate.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    ),
    // Telefoniya bloki faqat ruxsati borlarga (admin yoki `ip_telephone.view`).
    'sotuv.telephonyStats': canSeeTelephony ? <TelephonyStats leadPhones={leadPhones} /> : null,
  };

  return <WidgetTab tab="sotuv" nodes={nodes} editing={editing} />;
}
