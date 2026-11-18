import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { monthI18nKey } from '@/pages/finance-plans/helpers';
import { nextOccurrence, useCyclogram, type CyclogramEvent } from './api';
import './cyclogram.css';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** `2026-10-29T10:15:00+00:00` → `29.10.2026` (brauzer mintaqasida). */
function formatUpdated(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Cyclogram() {
  const { t } = useTranslation();
  const { data, isLoading, isError, isFetching, refetch } = useCyclogram();
  // 0 — barcha oylar.
  const [month, setMonth] = useState(0);
  const [query, setQuery] = useState('');
  const [today] = useState(() => new Date());
  const currentMonth = today.getMonth() + 1;

  const events = useMemo(() => data?.events ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(
      (e) =>
        (month === 0 || e.month === month) &&
        (!q || e.name.toLowerCase().includes(q) || (e.participants ?? '').toLowerCase().includes(q)),
    );
  }, [events, month, query]);

  const byMonth = useMemo(() => {
    const map = new Map<number, CyclogramEvent[]>();
    filtered.forEach((e) => map.set(e.month, [...(map.get(e.month) ?? []), e]));
    return map;
  }, [filtered]);

  const upcoming = useMemo(
    () =>
      events
        .map((event) => ({ event, ...nextOccurrence(event, today) }))
        .sort((a, b) => a.date.getTime() - b.date.getTime() || Number(b.ongoing) - Number(a.ongoing))
        .slice(0, 4),
    [events, today],
  );

  const countByMonth = useMemo(() => {
    const map = new Map<number, number>();
    events.forEach((e) => map.set(e.month, (map.get(e.month) ?? 0) + 1));
    return map;
  }, [events]);

  const monthName = (m: number) => t(monthI18nKey(m));
  const searching = query.trim() !== '';
  // Qidiruvda faqat mos tadbiri bor oylar; aks holda tanlangan oy yoki butun yil (bo'sh oylar ham ko'rinadi).
  const visibleMonths = (month === 0 ? MONTHS : [month]).filter((m) => !searching || byMonth.has(m));

  const organization = data?.organization;
  const orgName = organization?.full_name_uz || organization?.name;
  const updated = formatUpdated(data?.updatedAt ?? null);

  return (
    <div className="cy-page container">
      <div className="cy-top">
        <p className="cy-subtitle">{t('cyclogram.subtitle')}</p>
        {(orgName || updated) && (
          <div className="cy-meta">
            {orgName && <span className="cy-meta-chip">{orgName}</span>}
            {updated && <span className="cy-meta-chip">{t('cyclogram.updatedAt', { date: updated })}</span>}
          </div>
        )}
      </div>

      {isLoading && <div className="cy-state">{t('cyclogram.loading')}</div>}

      {isError && (
        <div className="cy-state cy-state--error">
          <strong>{t('cyclogram.errorTitle')}</strong>
          <span>{t('cyclogram.errorHint')}</span>
          <button type="button" className="cy-btn" onClick={() => refetch()} disabled={isFetching}>
            {t('cyclogram.retry')}
          </button>
        </div>
      )}

      {data && events.length === 0 && <div className="cy-state">{t('cyclogram.empty')}</div>}

      {data && events.length > 0 && (
        <>
          <div className="cy-stats">
            <div className="cy-stat">
              <span className="cy-stat-label">{t('cyclogram.total')}</span>
              <span className="cy-stat-value">{events.length}</span>
            </div>
            <div className="cy-stat">
              <span className="cy-stat-label">{t('cyclogram.thisMonth')}</span>
              <span className="cy-stat-value">{countByMonth.get(currentMonth) ?? 0}</span>
            </div>
            <div className="cy-upcoming">
              <span className="cy-stat-label">{t('cyclogram.upcoming')}</span>
              <ul className="cy-upcoming-list">
                {upcoming.map(({ event, date, ongoing }) => {
                  const isToday = !ongoing && date.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                  return (
                    <li key={event.id} className="cy-upcoming-item">
                      <span className={`cy-upcoming-date${ongoing ? ' cy-upcoming-date--ongoing' : ''}${isToday ? ' cy-upcoming-date--today' : ''}`}>
                        {ongoing
                          ? t('cyclogram.ongoing')
                          : isToday
                            ? t('cyclogram.today')
                            : event.day === null
                              ? monthName(event.month)
                              : `${date.getDate()} ${monthName(date.getMonth() + 1)}`}
                      </span>
                      <span className="cy-upcoming-name">{event.name}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="cy-toolbar">
            <div className="cy-chips" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={month === 0}
                className={`cy-chip${month === 0 ? ' cy-chip--active' : ''}`}
                onClick={() => setMonth(0)}
              >
                {t('cyclogram.all')}
              </button>
              {MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={month === m}
                  className={`cy-chip${month === m ? ' cy-chip--active' : ''}${m === currentMonth ? ' cy-chip--current' : ''}`}
                  onClick={() => setMonth(m)}
                >
                  {monthName(m)}
                  <span className="cy-chip-count">{countByMonth.get(m) ?? 0}</span>
                </button>
              ))}
            </div>
            <input
              className="cy-search"
              type="search"
              value={query}
              placeholder={t('cyclogram.searchPlaceholder')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {searching && filtered.length === 0 ? (
            <div className="cy-state">{t('cyclogram.noResults')}</div>
          ) : (
            <div className={`cy-grid${month !== 0 ? ' cy-grid--single' : ''}`}>
              {visibleMonths.map((m) => {
                const list = byMonth.get(m) ?? [];
                return (
                  <section key={m} className={`cy-month${m === currentMonth ? ' cy-month--current' : ''}`}>
                    <div className="cy-month-head">
                      <h3 className="cy-month-title">{monthName(m)}</h3>
                      {m === currentMonth && <span className="cy-badge">{t('cyclogram.currentMonth')}</span>}
                      <span className="cy-month-count">{t('cyclogram.count', { count: list.length })}</span>
                    </div>

                    {list.length === 0 ? (
                      <p className="cy-month-empty">{t('cyclogram.monthEmpty')}</p>
                    ) : (
                      <ul className="cy-events">
                        {list.map((e) => (
                          <li key={e.id} className="cy-event">
                            <div className={`cy-day${e.day === null ? ' cy-day--month' : ''}`}>
                              {e.day !== null ? (
                                <span className="cy-day-num">{e.day}</span>
                              ) : (
                                <span className="cy-day-whole">{t('cyclogram.wholeMonth')}</span>
                              )}
                            </div>
                            <div className="cy-event-body">
                              <div className="cy-event-name">{e.name}</div>
                              <div className={`cy-event-people${e.participants ? '' : ' cy-event-people--none'}`}>
                                {e.participants ?? t('cyclogram.noParticipants')}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
