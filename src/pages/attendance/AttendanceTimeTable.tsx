import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import './attendanceTime.css';
import { useTranslation } from 'react-i18next';
import {
  fetchPunches,
  groupPunches,
  shortTime,
  type AttendanceDay,
  type AttendancePunch,
  type DayStatus,
} from './attendancePunches';

interface Employee {
  id: number;
  full_name: string;
  role: string;
  /** Xodim bo'limi (masalan "Pedagog xodimlar") — `/attendances`dan keladi. */
  department: string;
  departmentId: number | null;
  avatar: string | null;
}

const STATUS_COLORS: Record<DayStatus, string> = {
  present: '#1bb200',
  late: '#fe9100',
  absent: '#ff0000',
  excused: '#3f88c9',
};

/** Statusi yo'q, lekin o'tishlari bor kun ham ko'rinsin. */
const NEUTRAL_COLOR = '#94a3b8';

const YEAR_RANGE_START = 2020;
const YEAR_RANGE_END = 2030;

const getDaysInMonth = (year: number, month: number): Date[] => {
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, month - 1, i + 1));
};

const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

interface AttendanceTimeTableProps {
  /** Tanlangan bo'lim id'si; bo'sh qiymat — barcha bo'limlar. */
  departmentId?: string;
  /** Bo'lim filtri tanlagichi — sarlavhada oy almashtirish tugmalaridan keyin chiqadi. */
  departmentFilter?: ReactNode;
}

const Attendance = ({ departmentId = '', departmentFilter }: AttendanceTimeTableProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const UZ_WEEKDAYS = [
    t('attendance.weekdays.sun'),
    t('attendance.weekdays.mon'),
    t('attendance.weekdays.tues'),
    t('attendance.weekdays.wed'),
    t('attendance.weekdays.thurs'),
    t('attendance.weekdays.fri'),
    t('attendance.weekdays.sat'),
  ];

  const UZ_MONTHS = [
    t('attendance.month.jan'),
    t('attendance.month.feb'),
    t('attendance.month.mar'),
    t('attendance.month.apr'),
    t('attendance.month.may'),
    t('attendance.month.jun'),
    t('attendance.month.jul'),
    t('attendance.month.aug'),
    t('attendance.month.sept'),
    t('attendance.month.oct'),
    t('attendance.month.nov'),
    t('attendance.month.dec'),
  ];

  const LEGEND_ITEMS: { status: DayStatus; label: string }[] = [
    { status: 'present', label: t('attendance.attendanceStatus.come') },
    { status: 'late', label: t('attendance.attendanceStatus.late') },
    { status: 'absent', label: t('attendance.attendanceStatus.notCome') },
    { status: 'excused', label: t('attendance.attendanceStatus.notComeWithReason') },
  ];

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(today.getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    if (pickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);

  // `AttendanceStatusTable` ham `['attendances', year, month]` kalitidan foydalanadi,
  // lekin oyni 0-indeksli beradi va javobni boshqacha shaklda kutadi — keshda
  // to'qnashmasligi uchun alohida kalit.
  const { data: punches = [] } = useQuery<AttendancePunch[]>({
    queryKey: ['attendance-punches', currentYear, currentMonth],
    queryFn: () => fetchPunches(currentYear, currentMonth),
  });

  /**
   * Xodimlar ro'yxati va lavozim/bo'lim — endi FAQAT `/attendances`dan
   * (`punches`). Ilgari bu yerga `/options/employees` ham aralashtirilardi
   * (jadvalni davomati yo'q xodim bilan ham to'ldirish uchun), lekin o'sha
   * ro'yxatda bo'lim/lavozim umuman yo'q — natijada ba'zi xodimlar bo'sh
   * lavozim bilan chiqardi. `/attendances`ning o'zida har ikkalasi ham bor,
   * shuning uchun ikkita manbani aralashtirishga hojat qolmadi.
   *
   * Ta'sir: shu oyda birorta ham kirish/chiqish hodisasi bo'lmagan xodim
   * endi jadvalda ko'rinmaydi (ilgari bo'sh qator bilan chiqardi).
   */
  const { employees, daysByEmployee } = useMemo(() => {
    const grouped = groupPunches(punches);

    const employees: Employee[] = Object.values(grouped)
      .map((employee) => ({
        id: employee.employeeId,
        full_name: employee.fullName,
        role: employee.position ?? '',
        department: employee.department?.name_uz ?? '',
        departmentId: employee.department?.id ?? null,
        avatar: null,
      }))
      // Bo'lim filtri (bo'sh — hammasi).
      .filter((e) => !departmentId || String(e.departmentId) === departmentId)
      // Ism bo'yicha alifbo tartibi — `/options/employees` o'rniga endi
      // shu ro'yxatning o'zi tartibni belgilaydi.
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'uz'));

    const map: Record<number, Record<string, AttendanceDay>> = {};
    for (const employee of Object.values(grouped)) {
      map[employee.employeeId] = employee.days;
    }

    return { employees, daysByEmployee: map };
  }, [punches, departmentId]);

  const days = useMemo(
    () => getDaysInMonth(currentYear, currentMonth),
    [currentYear, currentMonth],
  );

  /** Telefon karta ko'rinishi uchun — har xodimning oylik yig'indisi + kun-ma-kun ro'yxati. */
  const summaryByEmployee = useMemo(() => {
    const result: Record<
      number,
      {
        counts: Record<DayStatus, number>;
        dayList: { date: string; dayNum: number; status: DayStatus | null; hasPunch: boolean }[];
      }
    > = {};
    for (const emp of employees) {
      const counts: Record<DayStatus, number> = { present: 0, late: 0, absent: 0, excused: 0 };
      const dayList = days.map((d) => {
        const date = formatDate(d);
        const rec = daysByEmployee[emp.id]?.[date];
        if (rec?.status) counts[rec.status] += 1;
        return {
          date,
          dayNum: d.getDate(),
          status: rec?.status ?? null,
          hasPunch: Boolean(rec?.firstIn || rec?.lastOut),
        };
      });
      result[emp.id] = { counts, dayList };
    }
    return result;
  }, [employees, days, daysByEmployee]);

  /** Ism ustuni eng uzun F.I.Sh bitta qatorga sig'adigan qilib o'lchanadi
   *  (avatar + padding uchun ~90px qo'shiladi). */
  const nameColumnWidth = useMemo(() => {
    const longest = employees.reduce((max, e) => Math.max(max, e.full_name.length), 0);
    return Math.min(620, Math.max(220, Math.round(longest * 8.6) + 100));
  }, [employees]);

  const yearOptions = useMemo(
    () =>
      Array.from({ length: YEAR_RANGE_END - YEAR_RANGE_START + 1 }, (_, i) => YEAR_RANGE_START + i),
    [],
  );

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleOpenPicker = () => {
    setPickerYear(currentYear);
    setPickerOpen(true);
  };

  const handlePickerMonthSelect = (month: number) => {
    setCurrentMonth(month);
    setCurrentYear(pickerYear);
    setPickerOpen(false);
  };

  const openEmployee = (employeeId: number) => {
    const month = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    navigate(`/attendance/${employeeId}?month=${month}`);
  };

  return (
    <div className="attendance">
      <div className="attendance-top">
        <div className="attendance-top-left">
          <button className="month-nav-btn" onClick={handlePrevMonth}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="month-picker-wrapper" ref={pickerRef}>
            <button className="month-label" onClick={handleOpenPicker}>
              {UZ_MONTHS[currentMonth - 1]} {currentYear}
            </button>

            {pickerOpen && (
              <div className="month-picker-dropdown">
                <div className="month-picker-year-row">
                  <button
                    className="picker-year-nav"
                    onClick={() => setPickerYear((y) => Math.max(YEAR_RANGE_START, y - 1))}
                  >
                    ‹
                  </button>
                  <select
                    className="picker-year-select"
                    value={pickerYear}
                    onChange={(e) => setPickerYear(Number(e.target.value))}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <button
                    className="picker-year-nav"
                    onClick={() => setPickerYear((y) => Math.min(YEAR_RANGE_END, y + 1))}
                  >
                    ›
                  </button>
                </div>
                <div className="month-picker-grid">
                  {UZ_MONTHS.map((name, idx) => (
                    <button
                      key={name}
                      className={`picker-month-btn${
                        currentMonth === idx + 1 && currentYear === pickerYear ? ' active' : ''
                      }`}
                      onClick={() => handlePickerMonthSelect(idx + 1)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button className="month-nav-btn" onClick={handleNextMonth}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {departmentFilter}
        </div>

        <div className="attendance-top-right">
          {LEGEND_ITEMS.map(({ status, label }) => (
            <div key={status} className="attendance-box-wrapper">
              <div className="attendance-box" style={{ backgroundColor: STATUS_COLORS[status] }} />
              <h4>{label}</h4>
            </div>
          ))}
        </div>
      </div>

      <div className="attendance-content attendance-desktop">
        {employees.length === 0 && (
          <div className="attendance-empty">{t('attendance.noData', 'Maʼlumot topilmadi')}</div>
        )}
        <div
          className="attendance-time-table"
          style={
            {
              '--day-count': days.length,
              '--name-col': `${nameColumnWidth}px`,
              '--position-col': '210px',
              ...(employees.length === 0 ? { display: 'none' } : {}),
            } as React.CSSProperties
          }
        >
          <div className="attendance-time-table-header">
            <div className="attendance-col-employee">{t('attendance.fish')}</div>
            <div className="attendance-col-position">{t('attendance.table.position')}</div>
            {days.map((day) => (
              <div key={formatDate(day)} className="attendance-col-day">
                <span className="day-weekday">{UZ_WEEKDAYS[day.getDay()]}</span>
                <span className="day-number">{day.getDate()}</span>
              </div>
            ))}
          </div>

          <div className="attendance-time-table-body">
            {employees.map((employee) => (
              <div key={employee.id} className="attendance-row">
                <div className="attendance-col-employee attendance-employee-info">
                  <div className="employee-avatar">
                    {employee.avatar ? (
                      <img src={employee.avatar} alt={employee.full_name} />
                    ) : (
                      <svg
                        viewBox="0 0 40 40"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        width="40"
                        height="40"
                      >
                        <circle cx="20" cy="20" r="20" fill="#e8f0fe" />
                        <circle cx="20" cy="16" r="7" fill="#90a4ae" />
                        <ellipse cx="20" cy="34" rx="11" ry="7" fill="#90a4ae" />
                      </svg>
                    )}
                  </div>
                  <div className="employee-details">
                    <button
                      type="button"
                      className="attendance-employee-link"
                      onClick={() => openEmployee(employee.id)}
                      title={t('attendance.detail.openDetail')}
                    >
                      {employee.full_name}
                    </button>
                  </div>
                </div>
                <div className="attendance-col-position attendance-position-info">
                  <span className="employee-role">{employee.role || '—'}</span>
                  {employee.department && (
                    <span className="employee-department">{employee.department}</span>
                  )}
                </div>

                {days.map((day) => {
                  const dateStr = formatDate(day);
                  const record = daysByEmployee[employee.id]?.[dateStr];
                  return (
                    <div key={dateStr} className="attendance-col-day attendance-time-cell">
                      {record && (
                        <div
                          className="attendance-status-block"
                          style={{
                            backgroundColor: record.status
                              ? STATUS_COLORS[record.status]
                              : NEUTRAL_COLOR,
                          }}
                        >
                          {record.firstIn && (
                            <span className="attendance-time check-in">
                              {shortTime(record.firstIn)}
                            </span>
                          )}
                          {record.lastOut && (
                            <span className="attendance-time check-out">
                              {shortTime(record.lastOut)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Telefon ko'rinishi: har xodim — karta (oylik yig'indi + mini-kalendar) ── */}
      <div className="attendance-cards">
        {employees.length === 0 ? (
          <div className="attendance-empty">{t('attendance.noData', 'Maʼlumot topilmadi')}</div>
        ) : (
          employees.map((employee) => {
            const summary = summaryByEmployee[employee.id];
            return (
              <button
                key={employee.id}
                type="button"
                className="att-emp-card"
                onClick={() => openEmployee(employee.id)}
              >
                <div className="att-emp-card__head">
                  <span className="att-emp-card__avatar" aria-hidden="true">
                    {employee.full_name.charAt(0)}
                  </span>
                  <span className="att-emp-card__ident">
                    <span className="att-emp-card__name">{employee.full_name}</span>
                    {(employee.role || employee.department) && (
                      <span className="att-emp-card__role">
                        {[employee.role, employee.department].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <i className="fa-solid fa-chevron-right att-emp-card__chev" aria-hidden="true" />
                </div>

                <div className="att-emp-card__stats">
                  {LEGEND_ITEMS.map(({ status, label }) => (
                    <span key={status} className="att-stat">
                      <span
                        className="att-stat__dot"
                        style={{ backgroundColor: STATUS_COLORS[status] }}
                      />
                      <b>{summary?.counts[status] ?? 0}</b>
                      <span className="att-stat__lbl">{label}</span>
                    </span>
                  ))}
                </div>

                <div className="att-emp-card__month" aria-hidden="true">
                  {summary?.dayList.map((d) => (
                    <span
                      key={d.date}
                      className={`att-day${d.status || d.hasPunch ? ' is-marked' : ''}`}
                      style={{
                        backgroundColor: d.status
                          ? STATUS_COLORS[d.status]
                          : d.hasPunch
                            ? NEUTRAL_COLOR
                            : undefined,
                      }}
                    >
                      {d.dayNum}
                    </span>
                  ))}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Attendance;
