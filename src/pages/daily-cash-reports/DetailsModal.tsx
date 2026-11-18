import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime } from '@/utils/date';
import { useReport, useReportDetails, useReportLogs } from './api';
import { formatMoney, statusI18nKey } from './helpers';
import type { DailyCashReport, PersonRef } from './types';

interface Props {
  report: DailyCashReport | null;
  /** Ochilganda faol qiladigan tab. */
  initialTab?: TabKey;
  onClose: () => void;
}

type TabKey = 'balance' | 'expenses' | 'remainder' | 'logs';

const personName = (u: PersonRef | string | { full_name?: string } | null | undefined) =>
  !u ? '—' : typeof u === 'string' ? u || '—' : (u.full_name ?? '—');

/**
 * «Batafsil» modali — bitta hisobotning Баланс / Чиқим / Қолдиқ kesimlari va
 * audit jurnali. Balance = chiqimdan oldingi, Remainder = chiqimdan keyingi holat.
 */
const DetailsModal = ({ report, initialTab = 'balance', onClose }: Props) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>(initialTab);

  // report null bo'lmaganda id o'zgarsa boshlang'ich tabga qaytamiz (effektsiz).
  const [seenId, setSeenId] = useState(report?.id ?? null);
  if (report && report.id !== seenId) {
    setSeenId(report.id);
    setTab(initialTab);
  }

  const { data: details, isLoading } = useReportDetails(report?.id ?? null);
  // To'liq hisobot va jurnal doim yuklanadi — «Umumiy ma'lumotlar» paneli
  // mas'ul shaxslar (to'liq hisobot) va vaqtlarni (jurnal) ko'rsatadi.
  const { data: full } = useReport(report?.id ?? null);
  const { data: logs = [], isLoading: logsLoading } = useReportLogs(report?.id ?? null);

  if (!report) return null;

  const totals = details?.totals;

  // Qabul/topshirish vaqtlari maydon nomlari spetsifikatsiyada yo'q — shuning
  // uchun audit jurnalidagi status o'zgarishidan aniqlanadi (ishonchli).
  const submittedAt = logs.find((l) => l.to_status === 'sent')?.created_at ?? null;
  const acceptedAt = logs.find((l) => l.to_status === 'assistant_accepted')?.created_at ?? null;

  const info: { label: string; value: string }[] = [
    { label: t('dailyCashReports.info.cashier'), value: personName(full?.cashier ?? report.cashier) },
    { label: t('dailyCashReports.info.assistant'), value: personName(full?.assistant) },
    { label: t('dailyCashReports.info.accountant'), value: personName(full?.accountant) },
    { label: t('dailyCashReports.info.submittedAt'), value: submittedAt ? formatDateTime(submittedAt) : '—' },
    { label: t('dailyCashReports.info.acceptedAt'), value: acceptedAt ? formatDateTime(acceptedAt) : '—' },
    { label: t('dailyCashReports.columns.status'), value: t(statusI18nKey(report.status)) },
  ];

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'balance', label: t('dailyCashReports.details.balance') },
    { key: 'expenses', label: t('dailyCashReports.details.expenses') },
    { key: 'remainder', label: t('dailyCashReports.details.remainder') },
    { key: 'logs', label: t('dailyCashReports.details.logs') },
  ];

  return (
    <div className="dcr-overlay" onClick={onClose}>
      <div
        className="dcr-modal dcr-modal--lg"
        role="dialog"
        aria-modal="true"
        aria-label={report.report_number}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dcr-modal-head">
          <div>
            <h2>{report.report_number}</h2>
            <span className="dcr-modal-sub">
              {report.branch?.name_uz ?? '—'} · {formatDate(report.report_date)}
            </span>
          </div>
          <button className="dcr-modal-close" type="button" onClick={onClose} aria-label={t('modalPattern.close')}>
            ×
          </button>
        </div>

        <div className="dcr-info">
          {info.map((item) => (
            <div className="dcr-info-item" key={item.label}>
              <span className="dcr-info-label">{item.label}</span>
              <span className="dcr-info-value">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="dcr-tabs">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              className={`dcr-tab ${tab === tb.key ? 'active' : ''}`}
              onClick={() => setTab(tb.key)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div className="dcr-modal-body">
          {tab === 'logs' ? (
            logsLoading ? (
              <p className="dcr-modal-empty">{t('dailyCashReports.loading')}</p>
            ) : logs.length === 0 ? (
              <p className="dcr-modal-empty">{t('dailyCashReports.noData')}</p>
            ) : (
              <ul className="dcr-logs">
                {logs.map((log, i) => (
                  <li key={i} className="dcr-log">
                    <div className="dcr-log-main">
                      {/* action qiymatlari status nomlari bilan bir xil; noma'lum
                          action bo'lsa xom qiymat ko'rsatiladi. */}
                      <span className="dcr-log-action">
                        {t(statusI18nKey(log.action), { defaultValue: log.action })}
                      </span>
                      <span className="dcr-log-flow">
                        {log.from_status ? t(statusI18nKey(log.from_status)) : '—'} →{' '}
                        {log.to_status ? t(statusI18nKey(log.to_status)) : '—'}
                      </span>
                    </div>
                    {log.note && <div className="dcr-log-note">{log.note}</div>}
                    <div className="dcr-log-meta">
                      {personName(log.user)} · {formatDateTime(log.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : isLoading ? (
            <p className="dcr-modal-empty">{t('dailyCashReports.loading')}</p>
          ) : tab === 'expenses' ? (
            <div className="dcr-table-scroll">
              <table className="dcr-inner-table">
                <thead>
                  <tr>
                    <th>{t('dailyCashReports.details.expenseDate')}</th>
                    <th>{t('dailyCashReports.details.jamgarma')}</th>
                    <th>{t('dailyCashReports.details.category')}</th>
                    <th>{t('dailyCashReports.details.info')}</th>
                    <th className="dcr-num">{t('dailyCashReports.details.cash')}</th>
                    <th className="dcr-num">{t('dailyCashReports.details.nonCash')}</th>
                    <th className="dcr-num">{t('dailyCashReports.details.amount')}</th>
                    <th>{t('dailyCashReports.details.employee')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(details?.expenses ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="dcr-modal-empty">
                        {t('dailyCashReports.noData')}
                      </td>
                    </tr>
                  ) : (
                    details!.expenses.map((row, i) => (
                      <tr key={i}>
                        <td>{formatDate(row.expense_date)}</td>
                        <td>{row.jamgarma}</td>
                        <td>
                          {row.category}
                          {row.subcategory ? ` / ${row.subcategory}` : ''}
                        </td>
                        <td>{row.info}</td>
                        <td className="dcr-num">{formatMoney(row.cash_amount)}</td>
                        <td className="dcr-num">{formatMoney(row.non_cash_amount)}</td>
                        <td className="dcr-num">{formatMoney(row.amount)}</td>
                        <td>{row.employee}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr>
                      <td colSpan={4}>{t('dailyCashReports.details.total')}</td>
                      <td className="dcr-num">{formatMoney(totals.cash_expense)}</td>
                      <td className="dcr-num">{formatMoney(totals.non_cash_expense)}</td>
                      <td className="dcr-num">{formatMoney(totals.total_expense)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div className="dcr-table-scroll">
              <table className="dcr-inner-table">
                <thead>
                  <tr>
                    <th>{t('dailyCashReports.details.jamgarma')}</th>
                    <th className="dcr-num">{t('dailyCashReports.details.cash')}</th>
                    <th className="dcr-num">{t('dailyCashReports.details.nonCash')}</th>
                    <th className="dcr-num">{t('dailyCashReports.details.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {((tab === 'balance' ? details?.balance : details?.remainder) ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="dcr-modal-empty">
                        {t('dailyCashReports.noData')}
                      </td>
                    </tr>
                  ) : (
                    (tab === 'balance' ? details!.balance : details!.remainder).map((row) => (
                      <tr key={row.jamgarma_id}>
                        <td>{row.jamgarma_name}</td>
                        <td className="dcr-num">{formatMoney(row.cash)}</td>
                        <td className="dcr-num">{formatMoney(row.non_cash)}</td>
                        <td className="dcr-num">{formatMoney(row.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr>
                      <td>{t('dailyCashReports.details.total')}</td>
                      <td className="dcr-num" colSpan={3}>
                        {formatMoney(
                          tab === 'balance' ? totals.expense_balance_total : totals.remainder_total,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DetailsModal;
