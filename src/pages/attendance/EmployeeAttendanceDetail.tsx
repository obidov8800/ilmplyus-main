import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useOptions } from '@/api/options';
import {
  fetchPunches,
  formatDuration,
  groupPunches,
  shortTime,
  type AttendancePunch,
  type DayStatus,
} from './attendancePunches';
import './employeeAttendanceDetail.css';

const STATUS_LABEL_KEY: Record<DayStatus, string> = {
  present: 'attendance.legend.present',
  late: 'attendance.legend.late',
  absent: 'attendance.legend.absentNoExcuse',
  excused: 'attendance.legend.absentWithExcuse',
};

const currentMonthValue = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/** `YYYY-MM-DD` → `DD.MM.YYYY`. */
const displayDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

const EmployeeAttendanceDetail = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const monthValue = searchParams.get('month') || currentMonthValue();
  const [year, month] = monthValue.split('-').map(Number);

  const { data: punches = [], isLoading } = useQuery<AttendancePunch[]>({
    queryKey: ['attendance-punches', year, month],
    queryFn: () => fetchPunches(year, month),
    enabled: Number.isFinite(year) && Number.isFinite(month),
  });

  const { data: employeeOptions = [] } = useOptions('employees');

  const id = Number(employeeId);

  const employee = useMemo(() => groupPunches(punches)[id], [punches, id]);

  /** Davomati yo'q oyda ham xodim nomi ko'rinsin. */
  const fallbackName = employeeOptions.find((option) => option.id === id)?.label ?? '';

  const sortedDays = useMemo(() => {
    if (!employee) return [];
    // Eng yangi kun tepada.
    return Object.values(employee.days).sort((a, b) => b.date.localeCompare(a.date));
  }, [employee]);

  const stats = useMemo(() => {
    let totalMinutes = 0;
    let late = 0;
    let absent = 0;
    for (const day of sortedDays) {
      totalMinutes += day.minutes;
      if (day.status === 'late') late += 1;
      if (day.status === 'absent') absent += 1;
    }
    return { workDays: sortedDays.length, totalMinutes, late, absent };
  }, [sortedDays]);

  const branchName = useMemo(() => {
    const branch = employee?.branch;
    if (!branch) return '';
    const lang = i18n.language;
    if (lang === 'ru') return branch.name_ru || branch.name_uz || '';
    if (lang === 'en') return branch.name_en || branch.name_uz || '';
    return branch.name_uz || '';
  }, [employee, i18n.language]);

  const handleMonthChange = (value: string) => {
    if (!value) return;
    setSearchParams({ month: value }, { replace: true });
  };

  return (
    <div className="eatt-page container">
      <div className="eatt-toolbar">
        <button type="button" className="eatt-back-btn" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          {t('attendance.detail.back')}
        </button>

        <input
          type="month"
          className="eatt-month-input"
          value={monthValue}
          onChange={(e) => handleMonthChange(e.target.value)}
          aria-label={t('attendance.detail.month')}
        />
      </div>

      <div className="eatt-card">
        <h2 className="eatt-name">{employee?.fullName || fallbackName}</h2>

        <div className="eatt-meta">
          {employee?.position && (
            <span className="eatt-meta-item">
              {t('attendance.detail.position')}: <b>{employee.position}</b>
            </span>
          )}
          {branchName && (
            <span className="eatt-meta-item">
              {t('attendance.detail.branch')}: <b>{branchName}</b>
            </span>
          )}
        </div>

        <div className="eatt-stats">
          <div className="eatt-stat">
            <span className="eatt-stat-label">{t('attendance.detail.workDays')}</span>
            <span className="eatt-stat-value">{stats.workDays}</span>
          </div>
          <div className="eatt-stat">
            <span className="eatt-stat-label">{t('attendance.detail.totalTime')}</span>
            <span className="eatt-stat-value">{formatDuration(stats.totalMinutes)}</span>
          </div>
          <div className="eatt-stat">
            <span className="eatt-stat-label">{t('attendance.legend.late')}</span>
            <span className="eatt-stat-value">{stats.late}</span>
          </div>
          <div className="eatt-stat">
            <span className="eatt-stat-label">{t('attendance.legend.absentNoExcuse')}</span>
            <span className="eatt-stat-value">{stats.absent}</span>
          </div>
        </div>
      </div>

      <h3 className="eatt-section-title">{t('attendance.detail.byDays')}</h3>

      <div className="eatt-table-wrapper">
        <table className="eatt-table">
          <thead>
            <tr>
              <th>{t('attendance.detail.date')}</th>
              <th>{t('attendance.detail.checkIn')}</th>
              <th>{t('attendance.detail.checkOut')}</th>
              <th>{t('attendance.detail.duration')}</th>
              <th>{t('attendance.detail.status')}</th>
              <th>{t('attendance.detail.comment')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedDays.map((day) => (
              <tr key={day.date}>
                <td className="eatt-cell-date">{displayDate(day.date)}</td>
                <td>
                  <div className="eatt-time-list">
                    {day.ins.map((time) => (
                      <span key={time} className="eatt-time eatt-time--in">
                        {shortTime(time)}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="eatt-time-list">
                    {day.outs.map((time) => (
                      <span key={time} className="eatt-time eatt-time--out">
                        {shortTime(time)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="eatt-cell-duration">{formatDuration(day.minutes)}</td>
                <td className="eatt-cell-status">
                  {day.status ? t(STATUS_LABEL_KEY[day.status]) : '—'}
                </td>
                <td className="eatt-cell-comment">{day.comments.join(' | ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!isLoading && sortedDays.length === 0 && (
          <p className="eatt-empty">{t('attendance.detail.empty')}</p>
        )}
      </div>
    </div>
  );
};

export default EmployeeAttendanceDetail;
