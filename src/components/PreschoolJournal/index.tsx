import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOptions } from '@/api/options';
import {
  ATTENDANCE_STATUSES,
  deleteMark,
  fetchJournal,
  formatSum,
  isMemberOn,
  monthDays,
  saveDay,
  updateMark,
  type AttendanceStatus,
  type DayItem,
  type JournalMark,
  type JournalStudent,
} from '@/api/preschool';
import { usePermission } from '@/hooks/usePermission';
import { WriteGuard } from '@/components/Protected';
import { currentPeriod, periodLabel, shiftPeriod } from '@/utils/paymentPeriod';
import { dateToIso } from '@/utils/date';
import '@/styles/preschool.css';

/*
 * Maktabga tayyorlov guruhlarining davomat jurnali. User'da ko'rinishi XODIM DAVOMATI (`pages/attendance`) kabi: to'q ko'k panel
 * (oy almashtirish, filtrlar, belgilar izohi) + oq jadval kartasi. Admin'dagi nusxa eski ko'rinishda (Admin xodim davomati boshqa dizaynda).
 * Filtrlar: o'quv yili → filial → guruh → oy. Jadval: o'quvchi × oy kunlari, oylik hisob (kelgan/kelmagan/…)
 * va shu oy uchun to'lov holati (to'langan / qisman / to'lanmagan). Davomat balansdan pul yechmaydi.
 */

const STATUS_ICON: Record<AttendanceStatus, string> = {
  present: 'fa-check',
  absent: 'fa-xmark',
  late: 'fa-clock',
  reason: 'fa-notes-medical',
};

const StatusDot = ({ status }: { status: AttendanceStatus }) => (
  <span className={`pj-dot pj-dot--${status}`} aria-hidden="true">
    <i className={`fa-solid ${STATUS_ICON[status]}`} />
  </span>
);

interface MarkTarget {
  student: JournalStudent;
  date: string;
  mark: JournalMark | null;
}

export default function PreschoolJournal() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const canCreate = usePermission('preschool_attendances.create');
  const canEdit = usePermission('preschool_attendances.edit');
  const canDelete = usePermission('preschool_attendances.delete');
  const canSeePrices = usePermission('preschool_prices.view');
  // Faqat «qo'shish» ruxsati: faqat BUGUN va BIR MARTA (backend ham shunday majburlaydi). O'tgan sanalar va
  // saqlangan belgilarni o'zgartirish — faqat «tahrirlash» ruxsati bilan.
  const dailyOnly = canCreate && !canEdit;

  const today = dateToIso(new Date());

  const [yearId, setYearId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [period, setPeriod] = useState(currentPeriod);
  const [markTarget, setMarkTarget] = useState<MarkTarget | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const monthInputRef = useRef<HTMLInputElement>(null);

  const { data: years } = useOptions('academic_years');
  const { data: activeYears } = useOptions('academic_years', { status: 'active' });
  const { data: branches } = useOptions('branches', { type: 'preschool' });

  // Tanlanmagan bo'lsa — faol o'quv yili.
  const effectiveYearId = yearId || (activeYears?.[0] ? String(activeYears[0].id) : '');

  const { data: groups } = useOptions(
    'groups',
    { academic_year_id: effectiveYearId, branch_id: branchId },
    { enabled: !!effectiveYearId },
  );

  // Ro'yxatda yo'q (filtr almashgan) guruh tanlovi bekor bo'ladi; yagona guruh o'zi tanlanadi.
  const effectiveGroupId = (groups ?? []).some((g) => String(g.id) === groupId)
    ? groupId
    : groups?.length === 1
      ? String(groups[0].id)
      : '';

  const [yearNum, monthNum] = period.split('-').map(Number);

  const journalQuery = useQuery({
    queryKey: ['preschool-journal', effectiveGroupId, yearNum, monthNum],
    queryFn: () => fetchJournal(Number(effectiveGroupId), yearNum, monthNum),
    enabled: !!effectiveGroupId && !!yearNum && !!monthNum,
  });
  const journal = journalQuery.data;

  const days = monthDays(yearNum, monthNum, today);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['preschool-journal'] });

  const saveMark = useMutation({
    mutationFn: async (v: { target: MarkTarget; status: AttendanceStatus; comment: string }) => {
      const comment = v.comment.trim() || null;
      if (v.target.mark) return updateMark(v.target.mark.id, { status: v.status, comment });
      return saveDay(Number(effectiveGroupId), v.target.date, [
        { student_id: v.target.student.id, status: v.status, comment },
      ]);
    },
    onSuccess: () => {
      refresh();
      setMarkTarget(null);
    },
  });

  const removeMark = useMutation({
    mutationFn: (id: number) => deleteMark(id),
    onSuccess: () => {
      refresh();
      setMarkTarget(null);
    },
  });

  const weekdayLabel = (weekday: number) => t(`preschool.attendance.weekdays.${weekday}`);
  const money = (v: string | number | null | undefined) => formatSum(v);

  // Bo'sh katak: «qo'shish» kerak (faqat «qo'shish» bo'lsa — faqat bugun). Belgili katak: «tahrirlash» yoki «o'chirish».
  const canMark = (mark: JournalMark | null, date: string) =>
    mark ? canEdit || canDelete : canCreate && (!dailyOnly || date === today);

  // Katak nega bloklangani (faqat «qo'shish» ruxsati borlar uchun) — sichqoncha ustida ko'rinadi.
  const lockedHint = (mark: JournalMark | null, date: string) => {
    if (!dailyOnly) return '';
    if (mark) return t('preschool.attendance.limited.savedCell');
    return date !== today ? t('preschool.attendance.limited.pastCell') : '';
  };

  // «Kunlik belgilash»: faqat «qo'shish» borlarda doim bugun — jurnal boshqa oyda bo'lsa, joriy oyga o'tiladi
  // (bugungi saqlangan belgilar ko'rinishi uchun).
  const openDay = () => {
    if (dailyOnly && period !== currentPeriod()) setPeriod(currentPeriod());
    setDayOpen(true);
  };

  return (
    <>
      <div className="pj-board">
        {/* To'q ko'k panel — xodim davomatidagi kabi: oy almashtirish, filtrlar, belgilar izohi */}
        <div className="pj-top">
          <div className="pj-top-left">
            <button
              type="button"
              className="pj-nav-btn"
              aria-label={t('preschool.attendance.prevMonth')}
              onClick={() => setPeriod((p) => shiftPeriod(p, -1))}
            >
              <i className="fa-solid fa-chevron-left" />
            </button>
            <div className="pj-month">
              <button
                type="button"
                className="pj-month-label"
                onClick={() => monthInputRef.current?.showPicker?.()}
              >
                {periodLabel(period, t)}
              </button>
              <input
                ref={monthInputRef}
                className="pj-month-input"
                type="month"
                tabIndex={-1}
                aria-label={t('preschool.attendance.month')}
                value={period}
                onChange={(e) => setPeriod(e.target.value || currentPeriod())}
              />
            </div>
            <button
              type="button"
              className="pj-nav-btn"
              aria-label={t('preschool.attendance.nextMonth')}
              onClick={() => setPeriod((p) => shiftPeriod(p, 1))}
            >
              <i className="fa-solid fa-chevron-right" />
            </button>

            <div className="pj-filter">
              <label className="pj-sr">{t('preschool.attendance.year')}</label>
              <select
                value={effectiveYearId}
                title={t('preschool.attendance.year')}
                onChange={(e) => {
                  setYearId(e.target.value);
                  setGroupId('');
                }}
              >
                {(years ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pj-filter">
              <label className="pj-sr">{t('preschool.attendance.branch')}</label>
              <select
                value={branchId}
                title={t('preschool.attendance.branch')}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setGroupId('');
                }}
              >
                <option value="">{t('preschool.attendance.allBranches')}</option>
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pj-filter">
              <label className="pj-sr">{t('preschool.attendance.group')}</label>
              <select
                value={effectiveGroupId}
                title={t('preschool.attendance.group')}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">{t('preschool.attendance.selectGroup')}</option>
                {(groups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pj-top-right">
            <div className="pj-legend">
              {ATTENDANCE_STATUSES.map((s) => (
                <div key={s} className="pj-legend-item">
                  <span className={`pj-legend-box pj-legend-box--${s}`} />
                  <h4>{t(`preschool.attendance.status.${s}`)}</h4>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pj-content">
          {!effectiveGroupId ? (
            <div className="pj-empty">
              {groups && groups.length === 0 && effectiveYearId
                ? t('preschool.attendance.noGroups')
                : t('preschool.attendance.pickGroup')}
            </div>
          ) : journalQuery.isLoading ? (
            <div className="pj-empty">{t('preschool.attendance.loading')}</div>
          ) : !journal ? (
            <div className="pj-empty">{t('preschool.attendance.loadError')}</div>
          ) : (
            <>
              <div className="pj-info">
                <span>
                  <strong>{journal.group.name}</strong>
                  {journal.group.academic_year && ` · ${journal.group.academic_year.name}`}
                </span>
                <span>
                  {journal.group.price ? (
                    <>
                      {t('preschool.attendance.price')}:{' '}
                      <strong>
                        {money(journal.group.price.monthly_price)} {t('preschool.attendance.currency')}
                      </strong>
                    </>
                  ) : (
                    <>
                      {t('preschool.attendance.priceMissing')}
                      {canSeePrices && (
                        <>
                          {' · '}
                          <Link to="/preschool-prices">{t('preschool.attendance.priceAdd')}</Link>
                        </>
                      )}
                    </>
                  )}
                </span>
                {canCreate && (
                  <WriteGuard>
                    <button type="button" className="pj-add-btn" onClick={openDay}>
                      {t('preschool.attendance.markDay')}
                    </button>
                  </WriteGuard>
                )}
              </div>

              {journal.students.length === 0 ? (
                <div className="pj-empty">{t('preschool.attendance.noStudents')}</div>
              ) : (
                <div className="pj-wrap">
                  <table className="pj-table">
                    <thead>
                      <tr>
                        <th className="pj-name">
                          <span className="pj-num pj-num--head">№</span>
                          {t('preschool.attendance.student')}
                        </th>
                        {days.map((d) => (
                          <th
                            key={d.date}
                            className={`pj-day${d.weekday === 0 || d.weekday === 6 ? ' pj-day--weekend' : ''}${d.date === today ? ' pj-day--today' : ''}`}
                          >
                            <span className="pj-day-wd">{weekdayLabel(d.weekday)}</span>
                            <span className="pj-day-num">{d.day}</span>
                          </th>
                        ))}
                        <th className="pj-pay">{t('preschool.attendance.payment')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journal.students.map((student, index) => {
                        const byDate = new Map(student.attendances.map((a) => [a.date, a]));
                        const pay = student.payment;
                        return (
                          <tr key={student.id}>
                            <td className={`pj-name${student.left_at ? ' pj-name--left' : ''}`}>
                              <div className="pj-student">
                                <span className="pj-num">{index + 1}</span>
                                <span className="pj-avatar" aria-hidden="true">
                                  <svg width="44" height="44" viewBox="0 0 40 40">
                                    <circle cx="20" cy="20" r="20" fill="#e8f0fe" />
                                    <circle cx="20" cy="16" r="7" fill="#90a4ae" />
                                    <ellipse cx="20" cy="34" rx="11" ry="7" fill="#90a4ae" />
                                  </svg>
                                </span>
                                <span className="pj-student-text">
                                  <b>{student.full_name}</b>
                                  <small>{student.student_code ?? ''}</small>
                                </span>
                              </div>
                            </td>
                            {days.map((d) => {
                              const mark = byDate.get(d.date) ?? null;
                              const member = isMemberOn(student, d.date);
                              const clickable = !d.future && (member || !!mark) && canMark(mark, d.date);
                              const hint = d.future ? '' : lockedHint(mark, d.date);
                              return (
                                <td
                                  key={d.date}
                                  className={`pj-daycell${d.weekday === 0 || d.weekday === 6 ? ' pj-day--weekend' : ''}`}
                                >
                                  <button
                                    type="button"
                                    className={`pj-cell${mark ? ` pj-cell--${mark.status}` : ''}${hint ? ' pj-cell--locked' : ''}`}
                                    disabled={!clickable}
                                    title={
                                      mark
                                        ? [t(`preschool.attendance.status.${mark.status}`), mark.comment, hint]
                                            .filter(Boolean)
                                            .join(' — ')
                                        : !member
                                          ? t('preschool.attendance.notMember')
                                          : hint
                                    }
                                    aria-label={`${student.full_name} ${d.date}`}
                                    onClick={() => setMarkTarget({ student, date: d.date, mark })}
                                  >
                                    {mark ? <i className={`fa-solid ${STATUS_ICON[mark.status]}`} /> : ''}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="pj-pay">
                              <span className={`pj-badge pj-badge--${pay.status}`}>
                                {t(`preschool.attendance.pay.${pay.status}`)}
                              </span>
                              <small>
                                {pay.expected_amount != null
                                  ? t('preschool.attendance.pay.of', {
                                      paid: money(pay.paid_amount),
                                      expected: money(pay.expected_amount),
                                    })
                                  : pay.paid_amount > 0
                                    ? t('preschool.attendance.pay.paidOnly', { paid: money(pay.paid_amount) })
                                    : ''}
                              </small>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {markTarget && (
        <MarkModal
          target={markTarget}
          canSave={markTarget.mark ? canEdit : canCreate}
          canDelete={!!markTarget.mark && canDelete}
          busy={saveMark.isPending || removeMark.isPending}
          onSave={(status, comment) => saveMark.mutate({ target: markTarget, status, comment })}
          onDelete={() => markTarget.mark && removeMark.mutate(markTarget.mark.id)}
          onClose={() => setMarkTarget(null)}
        />
      )}

      {dayOpen && journal && (
        <DayModal
          students={journal.students}
          groupId={Number(effectiveGroupId)}
          groupName={journal.group.name}
          period={period}
          today={today}
          dailyOnly={dailyOnly}
          onClose={() => setDayOpen(false)}
          onSaved={() => {
            refresh();
            setDayOpen(false);
          }}
        />
      )}
    </>
  );
}

// ── Bitta belgini o'zgartirish ───────────────────────────────────────────────

interface MarkModalProps {
  target: MarkTarget;
  canSave: boolean;
  canDelete: boolean;
  busy: boolean;
  /** Faqat «qo'shish» ruxsati: saqlangach bu belgini o'zgartirib bo'lmaydi. */
  onSave: (status: AttendanceStatus, comment: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

function MarkModal({ target, canSave, canDelete, busy, onSave, onDelete, onClose }: MarkModalProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState(target.mark?.comment ?? '');

  return (
    <div className="pp-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="pp-modal" role="dialog" aria-modal="true">
        <h3 className="pp-title">{t('preschool.attendance.markModal.title')}</h3>
        <p className="pp-sub">
          {target.student.full_name} · {target.date.split('-').reverse().join('.')}
        </p>
        <div className="pj-statuses">
          {ATTENDANCE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`pj-status-btn${target.mark?.status === s ? ' pj-status-btn--on' : ''}`}
              disabled={busy || !canSave}
              onClick={() => onSave(s, comment)}
            >
              <StatusDot status={s} /> {t(`preschool.attendance.status.${s}`)}
            </button>
          ))}
        </div>

        <div className="pp-form" style={{ marginTop: 14 }}>
          <div className="pp-field">
            <label>{t('preschool.attendance.markModal.comment')}</label>
            <input
              type="text"
              maxLength={500}
              value={comment}
              placeholder={t('preschool.attendance.markModal.commentPlaceholder')}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>

        <div className="pp-actions">
          {canDelete && (
            <button type="button" className="pp-btn pp-btn--danger" disabled={busy} onClick={onDelete}>
              {t('preschool.attendance.markModal.delete')}
            </button>
          )}
          <button type="button" className="pp-btn pp-btn--cancel" disabled={busy} onClick={onClose}>
            {t('preschool.attendance.markModal.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Kunlik belgilash (butun guruh) ───────────────────────────────────────────

interface DayModalProps {
  students: JournalStudent[];
  groupId: number;
  groupName: string;
  /** Jurnal oyi, `YYYY-MM` */
  period: string;
  today: string;
  /** Faqat «qo'shish» ruxsati: sana — doim bugun, bugun saqlangan o'quvchilar qulflangan (qayta kiritib bo'lmaydi). */
  dailyOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type DraftItem = { status: AttendanceStatus; comment: string };

function DayModal({ students, groupId, groupName, period, today, dailyOnly, onClose, onSaved }: DayModalProps) {
  const { t } = useTranslation();

  // Sana jurnal oyi ichida va bugundan keyin emas (backend kelajak sanaga belgilashni rad etadi).
  const first = `${period}-01`;
  const last = lastDayOf(period);
  const max = last < today ? last : today;
  const min = first;

  const [date, setDate] = useState(() => (dailyOnly || (today >= first && today <= last) ? today : max));
  // Tanlangan sana uchun qo'lda o'zgartirilganlar; sana almashsa — boshidan (mavjud belgilar yoki «keldi»).
  const [draft, setDraft] = useState<{ date: string; items: Record<number, DraftItem> }>({
    date,
    items: {},
  });

  const members = students.filter((s) => isMemberOn(s, date));
  // Faqat «qo'shish» ruxsati: bu kun uchun allaqachon saqlanganlar qulflanadi va so'rovga kirmaydi.
  const isLocked = (s: JournalStudent) => dailyOnly && s.attendances.some((a) => a.date === date);
  const editable = members.filter((s) => !isLocked(s));
  const existing = (s: JournalStudent): DraftItem => {
    const mark = s.attendances.find((a) => a.date === date);
    return { status: mark?.status ?? 'present', comment: mark?.comment ?? '' };
  };
  const itemOf = (s: JournalStudent): DraftItem =>
    (draft.date === date ? draft.items[s.id] : undefined) ?? existing(s);

  const patch = (s: JournalStudent, change: Partial<DraftItem>) =>
    setDraft((prev) => ({
      date,
      items: { ...(prev.date === date ? prev.items : {}), [s.id]: { ...itemOf(s), ...change } },
    }));

  const setAll = (status: AttendanceStatus) =>
    setDraft((prev) => ({
      date,
      items: {
        ...(prev.date === date ? prev.items : {}),
        ...Object.fromEntries(editable.map((s) => [s.id, { ...itemOf(s), status }])),
      },
    }));

  const save = useMutation({
    mutationFn: () => {
      const items: DayItem[] = editable.map((s) => {
        const it = itemOf(s);
        return { student_id: s.id, status: it.status, comment: it.comment.trim() || null };
      });
      return saveDay(groupId, date, items);
    },
    onSuccess: onSaved,
  });

  return (
    <div className="pp-overlay" onMouseDown={(e) => e.target === e.currentTarget && !save.isPending && onClose()}>
      <div className="pp-modal pp-modal--wide" role="dialog" aria-modal="true">
        <h3 className="pp-title">{t('preschool.attendance.dayModal.title')}</h3>
        <p className="pp-sub">{groupName}</p>

        <div className="pp-form">
          <div className="pp-field">
            <label>{t('preschool.attendance.dayModal.date')}</label>
            <input
              type="date"
              value={date}
              min={dailyOnly ? today : min}
              max={dailyOnly ? today : max}
              disabled={dailyOnly}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="pj-bulk" style={{ marginTop: 14 }}>
          <button type="button" disabled={editable.length === 0} onClick={() => setAll('present')}>
            {t('preschool.attendance.dayModal.allPresent')}
          </button>
          <button type="button" disabled={editable.length === 0} onClick={() => setAll('absent')}>
            {t('preschool.attendance.dayModal.allAbsent')}
          </button>
        </div>

        {members.length === 0 ? (
          <div className="pj-empty">{t('preschool.attendance.dayModal.noStudents')}</div>
        ) : (
          <div className="pj-day-list">
            {members.map((s) => {
              const it = itemOf(s);
              const locked = isLocked(s);
              return (
                <div
                  key={s.id}
                  className={`pj-day-row${locked ? ' pj-day-row--locked' : ''}`}
                  title={locked ? t('preschool.attendance.limited.savedRow') : undefined}
                >
                  <b>
                    {locked && (
                      <>
                        <i className="fa-solid fa-lock" aria-hidden="true" />{' '}
                      </>
                    )}
                    {s.full_name}
                  </b>
                  <span className="pj-seg">
                    {ATTENDANCE_STATUSES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        title={t(`preschool.attendance.status.${st}`)}
                        aria-pressed={it.status === st}
                        className={it.status === st ? `pj-seg--${st}` : ''}
                        disabled={locked}
                        onClick={() => patch(s, { status: st })}
                      >
                        <i className={`fa-solid ${STATUS_ICON[st]}`} />
                      </button>
                    ))}
                  </span>
                  <input
                    type="text"
                    maxLength={500}
                    value={it.comment}
                    disabled={locked}
                    placeholder={t('preschool.attendance.markModal.commentPlaceholder')}
                    onChange={(e) => patch(s, { comment: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="pp-actions">
          <button
            type="button"
            className="pp-btn pp-btn--primary"
            disabled={save.isPending || editable.length === 0}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t('preschool.attendance.dayModal.saving') : t('preschool.attendance.dayModal.save')}
          </button>
          <button type="button" className="pp-btn pp-btn--cancel" disabled={save.isPending} onClick={onClose}>
            {t('preschool.attendance.dayModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** `2026-09` → `2026-09-30` */
function lastDayOf(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}
