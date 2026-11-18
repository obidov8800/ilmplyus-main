import { groupDigits } from '@/utils/formatNumber';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { fetchCallHistory, fetchIpTelefonOperators } from './dashboard.service';
import { useDashFilter } from './useDashboardFilter';
import { useDashboardDetail, type DetailColumn, type DetailRow } from './useDashboardDetail';
import {
  getCallInfo,
  resolveOperatorLogin,
  parseCallDate,
  formatDuration,
  type CallRecord,
} from '@/pages/ip-telephone/callRecord';

interface Props {
  /** Lid telefon raqamlari (faqat raqamlar) — "lidga bog'langan qo'ng'iroq" uchun. */
  leadPhones: Set<string>;
}

const digitsOf = (s: string) => (s || '').replace(/\D/g, '');

/**
 * "Sotuv va Lidlar" tabining IP telefon statistikasi bloki — tashqi PBX
 * qo'ng'iroqlar tarixidan (`mainoffice.uz`). Panelning global davr + filial
 * filtriga bo'ysunadi (filial — operatorning ichki raqami orqali).
 */
export default function TelephonyStats({ leadPhones }: Props) {
  const { t } = useTranslation();
  const flt = useDashFilter();
  const openDetail = useDashboardDetail((s) => s.openDetail);

  const { data: calls = [], isLoading: callsLoading } = useQuery({
    queryKey: ['dash-calls'],
    queryFn: () => fetchCallHistory(1500),
    staleTime: 5 * 60 * 1000,
  });
  const { data: operators = [] } = useQuery({
    queryKey: ['dash-ipt-operators'],
    queryFn: fetchIpTelefonOperators,
    staleTime: 5 * 60 * 1000,
  });

  // login → { branchId, name }
  const opInfo = useMemo(() => {
    const m = new Map<string, { branchId: number | null; name: string }>();
    for (const o of operators) {
      const login = String(o.login ?? '');
      if (!login) continue;
      const branchId = o.branch_id ?? o.branch?.id ?? null;
      const name = o.user?.full_name || o.name || login;
      m.set(login, { branchId: branchId == null ? null : Number(branchId), name });
    }
    return m;
  }, [operators]);

  const rows = useMemo(() => {
    return calls
      .map((r: CallRecord) => {
        const login = resolveOperatorLogin(r);
        const info = login ? opInfo.get(String(login)) : undefined;
        const { client, direction } = getCallInfo(r);
        const d = parseCallDate(r.vaqt);
        return {
          rec: r,
          ts: d ? d.getTime() : NaN,
          login: login ?? '',
          operatorName: info?.name ?? (login || '—'),
          branchId: info?.branchId ?? null,
          client,
          clientDigits: digitsOf(client),
          direction,
        };
      })
      .filter((x) => {
        if (!flt.tsOk(x.ts)) return false;
        if (flt.branchId != null) {
          // Filial tanlangan — operatori (demak filiali) noma'lum qo'ng'iroq chiqarib tashlanadi.
          if (x.branchId == null || x.branchId !== flt.branchId) return false;
        }
        return true;
      });
  }, [calls, opInfo, flt]);

  const stats = useMemo(() => {
    let answered = 0;
    let noAnswer = 0;
    let failed = 0;
    let inbound = 0;
    let outbound = 0;
    let talkSec = 0;
    let withLead = 0;
    for (const x of rows) {
      if (x.rec.status === 'ANSWERED') {
        answered++;
        talkSec += Number(x.rec.davomiyligi) || 0;
      } else if (x.rec.status === 'NO ANSWER') noAnswer++;
      else failed++;
      if (x.direction === 'in') inbound++;
      else if (x.direction === 'out') outbound++;
      const dg = x.clientDigits;
      if (dg && (leadPhones.has(dg) || (dg.length >= 9 && leadPhones.has(dg.slice(-9))))) withLead++;
    }
    const total = rows.length;
    return {
      total,
      answered,
      noAnswer,
      failed,
      inbound,
      outbound,
      talkSec,
      withLead,
      answerRate: total ? Math.round((answered / total) * 100) : 0,
      avgTalk: answered ? Math.round(talkSec / answered) : 0,
      leadRate: total ? Math.round((withLead / total) * 100) : 0,
    };
  }, [rows, leadPhones]);

  const byOperator = useMemo(() => {
    const m = new Map<string, { name: string; calls: number; answered: number; talkSec: number }>();
    for (const x of rows) {
      // Javob berilmagan kiruvchi qo'ng'iroqni hech kim bajarmagan — operator
      // jadvaliga tushmaydi (umumiy statistikada hisoblanadi).
      if (!x.login) continue;
      const key = x.operatorName;
      const cur = m.get(key) ?? { name: key, calls: 0, answered: 0, talkSec: 0 };
      cur.calls++;
      if (x.rec.status === 'ANSWERED') {
        cur.answered++;
        cur.talkSec += Number(x.rec.davomiyligi) || 0;
      }
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.calls - a.calls);
  }, [rows]);

  const dirLabel = (d: string) =>
    d === 'in'
      ? t('dashboard.telephony.inbound')
      : d === 'out'
        ? t('dashboard.telephony.outbound')
        : '—';
  const statusLabel = (s: string) =>
    s === 'ANSWERED'
      ? t('dashboard.telephony.answered')
      : s === 'NO ANSWER'
        ? t('dashboard.telephony.noAnswer')
        : t('dashboard.telephony.failed');

  const openCallsDetail = () =>
    openDetail({
      title: t('dashboard.telephony.title'),
      csvName: 'qongiroqlar',
      rows: rows.map((x) => ({
        vaqt: x.rec.vaqt,
        ts: x.ts,
        direction: dirLabel(x.direction),
        number: x.client || '—',
        operator: x.operatorName,
        status: statusLabel(x.rec.status),
        rawStatus: x.rec.status,
        duration: Number(x.rec.davomiyligi) || 0,
      })) as unknown as DetailRow[],
      searchText: (r) => `${r.number} ${r.operator} ${r.status} ${r.direction}`,
      initialSort: { key: 'ts', dir: 'desc' },
      columns: [
        {
          key: 'vaqt',
          label: t('dashboard.telephony.colTime'),
          render: (r) => {
            const m = String(r.vaqt).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
            return m ? `${m[4]}:${m[5]} ${m[3]}.${m[2]}.${m[1]}` : String(r.vaqt);
          },
          sortValue: (r) => Number(r.ts) || 0,
          csv: (r) => String(r.vaqt),
        },
        { key: 'direction', label: t('dashboard.telephony.colDirection') },
        { key: 'number', label: t('dashboard.telephony.colNumber') },
        { key: 'operator', label: t('dashboard.telephony.colOperator') },
        { key: 'status', label: t('dashboard.telephony.colStatus') },
        {
          key: 'duration',
          label: t('dashboard.telephony.colDuration'),
          align: 'right',
          render: (r) => formatDuration(Number(r.duration) || 0),
          sortValue: (r) => Number(r.duration) || 0,
        },
      ] as DetailColumn[],
    });

  const fmtMin = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h} ${t('dashboard.common.soat')} ${m} min` : `${m} min`;
  };

  return (
    <div className="dash-card">
      <div className="dash-card__title-row">
        <h3 className="dash-card__title">
          <i className="fa-solid fa-phone" style={{ marginRight: 8, color: '#a855f7' }} />
          {t('dashboard.telephony.title')}
        </h3>
        {stats.total > 0 && (
          <button className="dash-detail-btn" onClick={openCallsDetail}>
            <i className="fa-solid fa-up-right-from-square" /> {t('dashboard.detail.btn')}
          </button>
        )}
      </div>

      {callsLoading ? (
        <div className="dash-empty">{t('dashboard.common.loading')}</div>
      ) : stats.total === 0 ? (
        <div className="dash-empty">{t('dashboard.common.noData')}</div>
      ) : (
        <>
          <div className="tel-tiles">
            <div className="tel-tile">
              <span className="tel-tile__value">{groupDigits(stats.total)}</span>
              <span className="tel-tile__label">{t('dashboard.telephony.totalCalls')}</span>
            </div>
            <div className="tel-tile">
              <span className="tel-tile__value" style={{ color: '#16a34a' }}>
                {stats.answerRate}%
              </span>
              <span className="tel-tile__label">
                {t('dashboard.telephony.answerRate')} · {stats.answered}
              </span>
            </div>
            <div className="tel-tile">
              <span className="tel-tile__value" style={{ color: '#6366f1' }}>
                {formatDuration(stats.avgTalk)}
              </span>
              <span className="tel-tile__label">{t('dashboard.telephony.avgTalk')}</span>
            </div>
            <div className="tel-tile">
              <span className="tel-tile__value" style={{ color: '#a855f7' }}>
                {stats.leadRate}%
              </span>
              <span className="tel-tile__label">
                {t('dashboard.telephony.withLead')} · {stats.withLead}
              </span>
            </div>
          </div>

          <div className="tel-bars">
            <TelBar
              label={t('dashboard.telephony.answered')}
              value={stats.answered}
              total={stats.total}
              color="#22c55e"
            />
            <TelBar
              label={t('dashboard.telephony.noAnswer')}
              value={stats.noAnswer}
              total={stats.total}
              color="#f59e0b"
            />
            <TelBar
              label={t('dashboard.telephony.failed')}
              value={stats.failed}
              total={stats.total}
              color="#ef4444"
            />
            <TelBar
              label={t('dashboard.telephony.inbound')}
              value={stats.inbound}
              total={stats.total}
              color="#3b82f6"
            />
            <TelBar
              label={t('dashboard.telephony.outbound')}
              value={stats.outbound}
              total={stats.total}
              color="#8b5cf6"
            />
          </div>

          <p className="dash-card__sub" style={{ marginTop: 4 }}>
            {t('dashboard.telephony.totalTalk')}: {fmtMin(stats.talkSec)}
          </p>

          {byOperator.length > 0 && (
            <table className="moliya-table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>{t('dashboard.telephony.colOperator')}</th>
                  <th style={{ textAlign: 'right' }}>{t('dashboard.telephony.totalCalls')}</th>
                  <th style={{ textAlign: 'right' }}>{t('dashboard.telephony.answered')}</th>
                  <th style={{ textAlign: 'right' }}>{t('dashboard.telephony.avgTalk')}</th>
                </tr>
              </thead>
              <tbody>
                {byOperator.slice(0, 8).map((o, i) => (
                  <tr key={i}>
                    <td>{o.name}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'noto-m' }}>{o.calls}</td>
                    <td style={{ textAlign: 'right', color: '#16a34a', fontFamily: 'noto-m' }}>
                      {o.answered}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'noto-m' }}>
                      {formatDuration(o.answered ? Math.round(o.talkSec / o.answered) : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function TelBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="tel-bar">
      <div className="tel-bar__head">
        <span>{label}</span>
        <span className="tel-bar__num">
          {value} · {pct}%
        </span>
      </div>
      <div className="tel-bar__track">
        <div className="tel-bar__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
