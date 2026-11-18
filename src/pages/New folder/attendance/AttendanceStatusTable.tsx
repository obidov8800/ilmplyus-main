import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { API } from '../../api/api';
import './attendance.css';
import { Popover, Textarea, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../../hooks/usePermission';
import useAuthStore from '../../store/useAuthStore';
import { getBranchScope } from '../../utils/branchScope';
import { toTashkentDate } from '../../utils/date';

/** Belgi (+ / NB / K / S) → rang (telefon karta ko'rinishi uchun). */
const MARK_COLOR: Record<string, string> = {
  '+': '#1bb200',
  present: '#1bb200',
  NB: '#ff0000',
  absent: '#ff0000',
  K: '#fe9100',
  late: '#fe9100',
  S: '#3f88c9',
  excused: '#3f88c9',
};
const primaryMark = (marks: string[]): string | null =>
  marks.find((m) => m === 'NB' || m === 'absent') ??
  marks.find((m) => m === 'S' || m === 'excused') ??
  marks.find((m) => m === 'K' || m === 'late') ??
  marks.find((m) => m === '+' || m === 'present') ??
  null;

/**
 * Ismni chop uchun bitta qatorga sig'diradi: qisqa bo'lsa — to'liq;
 * uzun bo'lsa birinchi so'z to'liq, qolganlari bosh harf bilan
 * ("Bozorboyev Nurmuhammad" → "Bozorboyev N."). Chop ustuni ~40mm,
 * 8.5pt shriftda taxminan 24 belgi sig'adi.
 */
const NAME_FIT_CHARS = 26;
const fitName = (name: string): string => {
  const n = (name || '').trim();
  if (n.length <= NAME_FIT_CHARS) return n;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return n;
  const short = `${parts[0]} ${parts
    .slice(1)
    .map((w) => (w[0] ? w[0].toUpperCase() + '.' : ''))
    .join('')}`;
  if (short.length <= NAME_FIT_CHARS) return short;
  return `${parts[0].slice(0, NAME_FIT_CHARS - 3)}… ${(parts[1][0] || '').toUpperCase()}.`;
};
import type {
  EmployeeAttendance,
  AttendanceStatus,
  AttendanceStatusKey,
  AttendanceRecord,
  FlatAttendanceRecord,
} from '../../types/attendance.types';

interface AttendanceStatusTableProps {
  /** Tanlangan bo'lim id'si; bo'sh qiymat — barcha bo'limlar. */
  departmentId?: string;
  /** Bo'lim filtri tanlagichi — sarlavhada oy almashtirish tugmalaridan keyin chiqadi. */
  departmentFilter?: ReactNode;
}

const AttendancePage = ({ departmentId = '', departmentFilter }: AttendanceStatusTableProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const branchScope = getBranchScope(user);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [branchFilter, setBranchFilter] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  // Tahrirlash tugmasi faqat `attendance.edit` ruxsati bor xodimga chiqadi.
  const canEditAttendance = usePermission('attendance.edit');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const datePickerRef = useRef<HTMLDivElement>(null);

  // State for popover/modal
  const [activeCell, setActiveCell] = useState<{
    recordId?: number;
    employeeId: number;
    employeeName: string;
    date: string;
    currentStatuses: AttendanceStatusKey[];
    comment: string;
  } | null>(null);

  const month = selectedDate.getMonth();
  const year = selectedDate.getFullYear();

  useEffect(() => {
    setPickerYear(year);
  }, [year]);

  // Ruxsat yo'qligida tahrirlash rejimi yopishib qolmasin (masalan ruxsat
  // sessiya davomida olib tashlansa) — tugma o'zi ko'rinmaydi, lekin bu
  // himoya sifatida qo'shimcha qatlam.
  useEffect(() => {
    if (!canEditAttendance && isEditMode) setIsEditMode(false);
  }, [canEditAttendance, isEditMode]);

  useEffect(() => {
    if (!showDatePicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker]);

  // Translation helpers
  const monthNames = useMemo(
    () => [
      t('attendance.months.january'),
      t('attendance.months.february'),
      t('attendance.months.march'),
      t('attendance.months.april'),
      t('attendance.months.may'),
      t('attendance.months.june'),
      t('attendance.months.july'),
      t('attendance.months.august'),
      t('attendance.months.september'),
      t('attendance.months.october'),
      t('attendance.months.november'),
      t('attendance.months.december'),
    ],
    [t],
  );

  const dayNames = useMemo(
    () => [
      t('attendance.days.sun'),
      t('attendance.days.mon'),
      t('attendance.days.tue'),
      t('attendance.days.wed'),
      t('attendance.days.thu'),
      t('attendance.days.fri'),
      t('attendance.days.sat'),
    ],
    [t],
  );

  const daysInMonth = useMemo(() => {
    const daysCount = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysCount }, (_, i) => {
      const dayDate = new Date(year, month, i + 1);
      const yearStr = year;
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(i + 1).padStart(2, '0');
      return {
        dayNum: i + 1,
        dayName: dayNames[dayDate.getDay()],
        fullDate: `${yearStr}-${monthStr}-${dayStr}`,
      };
    });
  }, [month, year, dayNames]);

  const { data: attendanceData } = useQuery<{ data: FlatAttendanceRecord[] }>({
    queryKey: ['attendances', year, month],
    queryFn: async () => {
      const { data } = await API.get('/attendances', {
        params: { month: `${year}-${String(month + 1).padStart(2, '0')}` },
      });
      return data;
    },
  });

  const attendanceRecords = useMemo(() => {
    const records = attendanceData?.data ?? [];
    return branchScope
      ? records.filter((record) => record.branch_id != null && branchScope.includes(Number(record.branch_id)))
      : records;
  }, [attendanceData, branchScope]);

  /**
   * Xodimlar ro'yxati va lavozim/bo'lim — endi FAQAT `/attendances`dan.
   * Ilgari jadval `/options/employees` bilan "urug'lantirilar" edi
   * (davomati yo'q xodim ham bo'sh qator bilan ko'rinsin deb), va ism
   * bo'yicha moslashtirish (`nameToId`) ham shu ro'yxatga tayanardi.
   * Lekin `/options/employees`da bo'lim/lavozim yo'q, shuning uchun
   * ikkalasini aralashtirish ba'zan noto'g'ri/bo'sh ma'lumot berardi.
   * `/attendances`ning o'zida `employee_id` ham, `position`/`department`
   * ham to'liq keladi — boshqa manba shart emas.
   *
   * Ta'sir: shu oyda birorta ham hodisasi bo'lmagan xodim endi jadvalda
   * ko'rinmaydi (ilgari bo'sh qator bilan chiqardi).
   */
  const employeesWithAttendances = useMemo(() => {
    const flatRecords = attendanceRecords;
    const groupedById: Record<number, EmployeeAttendance> = {};

    flatRecords.forEach((r) => {
      const empId = r.employee_id;
      if (empId == null) return;

      if (!groupedById[empId]) {
        groupedById[empId] = {
          id: empId,
          full_name: r.employee,
          position: r.position || null,
          department: r.department?.name_uz ?? null,
          department_id: r.department?.id ?? null,
          attendances: [],
        };
      } else {
        if (r.position && !groupedById[empId].position) {
          groupedById[empId].position = r.position;
        }
        if (r.department?.name_uz && !groupedById[empId].department) {
          groupedById[empId].department = r.department.name_uz;
        }
      }

      const currentStatuses = (Array.isArray(r.status) ? r.status : [r.status]).filter(
        (s): s is AttendanceStatusKey => s !== null,
      );

      const mappedStatuses = currentStatuses.map((s) => {
        if (s === 'present') return '+';
        if (s === 'absent') return 'NB';
        if (s === 'late') return 'K';
        if (s === 'excused') return 'S';
        if (s === 'no_uniform') return 'F';
        return s;
      }) as AttendanceStatusKey[];

      groupedById[empId].attendances.push({
        id: r.id,
        employee_id: empId,
        date: r.date,
        status: mappedStatuses,
        comment_uz: r.comment || '',
        check_in: r.check_in,
        check_out: r.check_out,
      });
    });

    // Ism bo'yicha alifbo tartibi — `/options/employees` o'rniga endi
    // shu ro'yxatning o'zi tartibni belgilaydi.
    return Object.values(groupedById).sort((a, b) =>
      a.full_name.localeCompare(b.full_name, 'uz'),
    );
  }, [attendanceRecords]);

  // Filial ro'yxati va xodim→filial bog'lanishi — bevosita `/attendances`
  // javobidan (har yozuvda `branch` + `branch_id` keladi).
  const { branchOptions, branchByEmployee } = useMemo(() => {
    const names = new Map<number, string>();
    const byEmp: Record<number, number> = {};
    attendanceRecords.forEach((r) => {
      if (r.branch_id == null) return;
      if (r.branch?.name_uz) names.set(r.branch_id, r.branch.name_uz);
      if (byEmp[r.employee_id] == null) byEmp[r.employee_id] = r.branch_id;
    });
    return {
      branchOptions: [...names.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'uz')),
      branchByEmployee: byEmp,
    };
  }, [attendanceRecords]);

  const selectedBranchName = branchFilter
    ? (branchOptions.find((b) => String(b.id) === branchFilter)?.name ?? '')
    : '';

  // Tanlangan filial bo'yicha filtrlangan xodimlar (filial tanlanmasa — hammasi).
  const visibleEmployees = useMemo(
    () =>
      employeesWithAttendances.filter(
        (e) =>
          (!branchFilter || String(branchByEmployee[e.id] ?? '') === branchFilter) &&
          (!departmentId || String(e.department_id ?? '') === departmentId),
      ),
    [employeesWithAttendances, branchFilter, branchByEmployee, departmentId],
  );

  /** Telefon karta ko'rinishi — har xodimning oylik belgilar yig'indisi + mini-kalendar. */
  const cardSummaries = useMemo(() => {
    return visibleEmployees.map((emp) => {
      const counts = { '+': 0, NB: 0, K: 0, S: 0 } as Record<string, number>;
      const byDate: Record<string, string[]> = {};
      for (const a of emp.attendances) {
        byDate[a.date] = a.status;
        const p = primaryMark(a.status);
        if (p === '+' || p === 'present') counts['+'] += 1;
        else if (p === 'NB' || p === 'absent') counts.NB += 1;
        else if (p === 'K' || p === 'late') counts.K += 1;
        else if (p === 'S' || p === 'excused') counts.S += 1;
      }
      const dayList = daysInMonth.map((d) => ({
        dayNum: d.dayNum,
        date: d.fullDate,
        mark: primaryMark(byDate[d.fullDate] ?? []),
      }));
      return { emp, counts, dayList };
    });
  }, [visibleEmployees, daysInMonth]);

  const saveMutation = useMutation({
    mutationFn: async (records: AttendanceRecord[]) => {
      // If we are updating a single existing record
      if (activeCell?.recordId) {
        const record = records[0];
        const { data } = await API.put(`/attendances/${activeCell.recordId}`, record);
        return data;
      }
      // Send the single record directly (backend expects flat fields at root)
      const { data } = await API.post('/attendances', records[0]);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendances'] });
      setActiveCell(null);
    },
  });

  // Handlers
  const handlePrevMonth = () => {
    setSelectedDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setSelectedDate(new Date(year, month + 1, 1));
  };

  const handleMonthSelect = (monthIdx: number) => {
    setSelectedDate(new Date(pickerYear, monthIdx, 1));
    setShowDatePicker(false);
  };

  const handleClearFilter = () => {
    setSelectedDate(new Date());
    setShowDatePicker(false);
  };

  const handlePrint = () => {
    // Brauzerning chop kolontituli MARKAZda `document.title`ni chizadi —
    // ya'ni "ILM PLYUS TA'LIM TIZIMI". Hujjatning O'Z sarlavhasi shundoq
    // ham markazda turadi, shuning uchun kolontitul sarlavhasi TAKROR
    // bo'lardi.
    //
    // DIQQAT: sarlavha BUTUNLAY bo'sh (yoki faqat probel) bo'lsa, Chrome
    // uning o'rniga MANZILNI ("localhost:5174/attendance") chizadi. Shu
    // sabab nol kenglikdagi belgi (U+200B) qo'yiladi — texnik jihatdan
    // bo'sh emas, lekin ko'rinmaydi.
    const prevTitle = document.title;
    const restore = () => {
      document.title = prevTitle;
      window.removeEventListener('afterprint', restore);
    };
    document.title = '\u200B';
    window.addEventListener('afterprint', restore);
    window.print();
    // Zaxira — `afterprint` ba'zi brauzerlarda kechikadi yoki kelmaydi.
    window.setTimeout(restore, 1500);
  };

  const isPastDay = (fullDate: string) => {
    // Toshkent kalendari bo'yicha bugun (UTC kuni 05:00 gacha kecha bo'lib qolardi).
    const today = toTashkentDate(new Date());
    return fullDate <= today;
  };

  const handleCellClick = (employee: EmployeeAttendance, day: any) => {
    if (!isEditMode || !canEditAttendance) return;

    const dayRecords = employee.attendances.filter((a) => a.date === day.fullDate);
    const existing = dayRecords[dayRecords.length - 1];

    // Extract current statuses from existing record and deduplicate
    let currentStatuses: AttendanceStatusKey[] = [];
    if (existing) {
      if (Array.isArray(existing.status)) {
        currentStatuses = [
          ...new Set(existing.status.filter((s): s is AttendanceStatusKey => s !== null)),
        ];
      } else if (existing.status) {
        currentStatuses = [existing.status as AttendanceStatusKey];
      }
    }

    setActiveCell({
      recordId: existing?.id,
      employeeId: employee.id,
      employeeName: employee.full_name,
      date: day.fullDate,
      currentStatuses,
      comment: existing?.comment_uz || '',
    });
  };

  const handleSubmitStatus = () => {
    if (!activeCell) return;
    if (activeCell.currentStatuses.length === 0) return;

    // Map internal codes back to backend-friendly verbose strings
    const backendStatuses = activeCell.currentStatuses.map((s) => {
      if (s === '+') return 'present';
      if (s === 'NB') return 'absent';
      if (s === 'K') return 'late';
      if (s === 'S') return 'excused';
      if (s === 'F') return 'no_uniform';
      return s;
    });

    const now = new Date();
    const checkIn = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const record: AttendanceRecord = {
      employee_id: activeCell.employeeId,
      date: activeCell.date,
      check_in: checkIn,
      status: backendStatuses,
      comment_uz: activeCell.comment,
    };

    saveMutation.mutate([record]);
  };

  const toggleStatus = (status: AttendanceStatusKey) => {
    if (!activeCell) return;

    setActiveCell((prev) => {
      if (!prev) return null;
      let newStatuses = [...prev.currentStatuses];

      if (status === 'NB' || status === 'S') {
        // Mutual exclusion for Absent/Excused
        newStatuses = newStatuses.includes(status) ? [] : [status];
      } else {
        // Remove Absent/Excused if toggling others
        newStatuses = newStatuses.filter((s) => s !== 'NB' && s !== 'S');

        if (status === '+' || status === 'K') {
          // Mutual exclusion between Present and Late
          const other = status === '+' ? 'K' : '+';
          newStatuses = newStatuses.filter((s) => s !== other);

          if (newStatuses.includes(status)) {
            newStatuses = newStatuses.filter((s) => s !== status);
          } else {
            newStatuses.push(status);
          }
        } else if (status === 'F') {
          // Toggle Formasiz
          if (newStatuses.includes('F')) {
            newStatuses = newStatuses.filter((s) => s !== 'F');
          } else {
            newStatuses.push('F');
          }
        }
      }

      return { ...prev, currentStatuses: newStatuses };
    });
  };

  const renderStatuses = (status: AttendanceStatus | string[] | null) => {
    if (!status) return null;
    const statuses = Array.isArray(status) ? status : [status];

    if (statuses.includes('NB')) return <span className="status-nb">NB</span>;
    if (statuses.includes('S')) return <span className="status-s">S</span>;

    const elements = [];
    if (statuses.includes('+'))
      elements.push(
        <span key="+" className="status-plus">
          +
        </span>,
      );
    if (statuses.includes('K'))
      elements.push(
        <span key="K" className="status-k">
          K
        </span>,
      );
    if (statuses.includes('F'))
      elements.push(
        <span key="F" className="status-f">
          F
        </span>,
      );

    return elements;
  };

  return (
    <div className="attendance-page">
      {/* Faqat chop etishda ko'rinadi — hujjat sarlavhasi (oy/yil + izoh). */}
      <div className="attendance-print-head" aria-hidden="true">
        <h1 className="attendance-print-title">
          {t('attendance.printTitle', { defaultValue: 'Xodimlar davomati jadvali' })}
        </h1>
        <p className="attendance-print-period">
          {monthNames[month]} {year}
          {selectedBranchName ? ` — ${selectedBranchName}` : ''}
        </p>
        <div className="attendance-print-legend">
          <span>
            <b>+</b> {t('attendance.legend.present')}
          </span>
          <span>
            <b>NB</b> {t('attendance.legend.absentNoExcuse')}
          </span>
          <span>
            <b>S</b> {t('attendance.legend.absentWithExcuse')}
          </span>
          <span>
            <b>K</b> {t('attendance.legend.late')}
          </span>
          <span>
            <b>F</b> {t('attendance.legend.noUniform')}
          </span>
        </div>
      </div>

      <div className="attendance-header">
        <div className="attendance-controls">
          <div className="month-picker-container" ref={datePickerRef}>
            <div className="month-picker">
              <button className="nav-btn" onClick={handlePrevMonth}>
                <i className="fa-solid fa-chevron-left"></i>
              </button>
              <span className="month-picker-label" onClick={() => setShowDatePicker((v) => !v)}>
                {monthNames[month]} {year}
              </span>
              <button className="nav-btn" onClick={handleNextMonth}>
                <i className="fa-solid fa-chevron-right"></i>
              </button>
            </div>

            {showDatePicker && (
              <div className="date-picker-dropdown">
                <div className="date-picker-year-row">
                  <button className="dp-nav-btn" onClick={() => setPickerYear((y) => y - 1)}>
                    <i className="fa-solid fa-chevron-left"></i>
                  </button>
                  <select
                    className="dp-year-select"
                    value={pickerYear}
                    onChange={(e) => setPickerYear(Number(e.target.value))}
                  >
                    {Array.from({ length: 16 }, (_, i) => 2020 + i).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <button className="dp-nav-btn" onClick={() => setPickerYear((y) => y + 1)}>
                    <i className="fa-solid fa-chevron-right"></i>
                  </button>
                </div>

                <div className="date-picker-months">
                  {monthNames.map((name, idx) => (
                    <button
                      key={idx}
                      className={`dp-month-btn ${idx === month && pickerYear === year ? 'dp-month-active' : ''}`}
                      onClick={() => handleMonthSelect(idx)}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                <button className="dp-clear-btn" onClick={handleClearFilter}>
                  {t('attendance.clearFilter')}
                </button>
              </div>
            )}
          </div>

          {departmentFilter}

          {branchOptions.length > 0 && (
            <select
              className="attendance-branch-filter"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label={t('attendance.table.branch', { defaultValue: 'Filial' })}
            >
              <option value="">
                {t('attendance.allBranches', { defaultValue: 'Barcha filiallar' })}
              </option>
              {branchOptions.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <div className="action-btns">
            <button
              className="icon-btn"
              onClick={handlePrint}
              title={t('attendance.tooltips.print')}
            >
              <i className="fa-solid fa-print"></i>
            </button>
            {canEditAttendance && (
              <button
                className={`icon-btn ${isEditMode ? 'edit-mode' : ''}`}
                onClick={() => setIsEditMode(!isEditMode)}
                title={t('attendance.tooltips.edit')}
              >
                <i className="fa-solid fa-pen"></i>
              </button>
            )}
          </div>
        </div>

        <div className="legend">
          <div className="legend-item">
            <b className="status-plus">+</b> - {t('attendance.legend.present')}
          </div>
          <div className="legend-item">
            <b className="status-nb">NB</b> - {t('attendance.legend.absentNoExcuse')}
          </div>
          <div className="legend-item">
            <b className="status-s">S</b> - {t('attendance.legend.absentWithExcuse')}
          </div>
          <div className="legend-item">
            <b className="status-f">F</b> - {t('attendance.legend.noUniform')}
          </div>
          <div className="legend-item">
            <b className="status-k">K</b> - {t('attendance.legend.late')}
          </div>
        </div>
      </div>

      {/* ── Telefon ko'rinishi: xodim kartalari (oylik belgilar + mini-kalendar).
             Tahrirlash rejimida (katakma-katak belgilash) esa jadval ko'rsatiladi. ── */}
      {!isEditMode && (
      <div className="attendance-cards">
        {visibleEmployees.length === 0 ? (
          <div className="attendance-empty">{t('attendance.noData', 'Maʼlumot topilmadi')}</div>
        ) : (
          cardSummaries.map(({ emp, counts, dayList }) => (
            <button
              key={emp.id}
              type="button"
              className="att-emp-card"
              onClick={() => navigate(`/attendance/${emp.id}`)}
            >
              <div className="att-emp-card__head">
                <span className="att-emp-card__avatar" aria-hidden="true">
                  {emp.full_name.charAt(0)}
                </span>
                <span className="att-emp-card__ident">
                  <span className="att-emp-card__name">{emp.full_name}</span>
                  {(emp.position || emp.department) && (
                    <span className="att-emp-card__role">
                      {[emp.position, emp.department].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <i className="fa-solid fa-chevron-right att-emp-card__chev" aria-hidden="true" />
              </div>

              <div className="att-emp-card__stats">
                <span className="att-stat">
                  <span className="att-stat__dot" style={{ backgroundColor: MARK_COLOR['+'] }} />
                  <b>{counts['+']}</b>
                  <span className="att-stat__lbl">{t('attendance.legend.present')}</span>
                </span>
                <span className="att-stat">
                  <span className="att-stat__dot" style={{ backgroundColor: MARK_COLOR.K }} />
                  <b>{counts.K}</b>
                  <span className="att-stat__lbl">{t('attendance.legend.late')}</span>
                </span>
                <span className="att-stat">
                  <span className="att-stat__dot" style={{ backgroundColor: MARK_COLOR.NB }} />
                  <b>{counts.NB}</b>
                  <span className="att-stat__lbl">{t('attendance.legend.absentNoExcuse')}</span>
                </span>
                <span className="att-stat">
                  <span className="att-stat__dot" style={{ backgroundColor: MARK_COLOR.S }} />
                  <b>{counts.S}</b>
                  <span className="att-stat__lbl">{t('attendance.legend.absentWithExcuse')}</span>
                </span>
              </div>

              <div className="att-emp-card__month" aria-hidden="true">
                {dayList.map((d) => (
                  <span
                    key={d.date}
                    className={`att-day${d.mark ? ' is-marked' : ''}`}
                    style={d.mark ? { backgroundColor: MARK_COLOR[d.mark] } : undefined}
                  >
                    {d.dayNum}
                  </span>
                ))}
              </div>
            </button>
          ))
        )}
      </div>
      )}

      <div
        className={`attendance-table-container${isEditMode ? '' : ' attendance-desktop'}`}
      >
        {visibleEmployees.length === 0 && (
          <div className="attendance-empty">
            {t('attendance.noData', 'Maʼlumot topilmadi')}
          </div>
        )}
        <table
          className="attendance-table"
          style={visibleEmployees.length === 0 ? { display: 'none' } : undefined}
        >
          <thead>
            <tr>
              <th className="col-id">№</th>
              <th className="col-name">{t('attendance.table.fullName')}</th>
              <th className="col-position">{t('attendance.table.position')}</th>
              {daysInMonth.map((day) => (
                <th key={day.dayNum} className="col-day">
                  <div className="day-header">
                    <span className="day-name">{day.dayName}</span>
                    <span className="day-num">{day.dayNum}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((employee, idx) => (
              <tr key={employee.id}>
                <td className="col-id">{idx + 1}</td>
                <td className="col-name">
                  <span className="col-cell-inner">
                    <span className="col-name__full">{employee?.full_name}</span>
                    <span className="col-name__print">{fitName(employee?.full_name ?? '')}</span>
                  </span>
                </td>
                <td className="col-position" title={employee?.department ?? undefined}>
                  <span className="col-cell-inner">{employee?.position}</span>
                </td>
                {daysInMonth.map((day) => {
                  const dayRecords =
                    employee?.attendances?.filter((a) => a.date === day.fullDate) || [];

                  const allStatuses = dayRecords.reduce((acc, r) => {
                    r.status.forEach((s) => {
                      if (!acc.includes(s)) acc.push(s);
                    });
                    return acc;
                  }, [] as string[]);

                  const status = allStatuses.length > 0 ? allStatuses : null;
                  const isPast = isPastDay(day.fullDate);

                  // Create tooltip label combining all records
                  const tooltipContent = dayRecords
                    .map((r) => {
                      const parts = [];
                      if (r.check_in) parts.push(`${r.check_in} - ${r.check_out || ''}`);
                      if (r.comment) parts.push(`${r.comment}`);
                      return parts.join(' | ');
                    })
                    .filter(Boolean)
                    .join('\\n');

                  return (
                    <td
                      key={day.dayNum}
                      className={`attendance-cell ${isEditMode && isPast ? 'editable' : ''}`}
                      onClick={() => handleCellClick(employee, day)}
                    >
                      <Popover
                        opened={
                          activeCell?.employeeId === employee.id &&
                          activeCell?.employeeName === employee.full_name &&
                          activeCell?.date === day.fullDate
                        }
                        onChange={() => setActiveCell(null)}
                        position="bottom"
                        withArrow
                      >
                        <Popover.Target>
                          <div className="tooltip-wrapper">
                            <Tooltip
                              label={tooltipContent}
                              disabled={!tooltipContent}
                              position="top"
                              withArrow
                              multiline
                            >
                              <div className="cell-status">{renderStatuses(status as any)}</div>
                            </Tooltip>
                          </div>
                        </Popover.Target>
                        <Popover.Dropdown p={0} onClick={(e) => e.stopPropagation()}>
                          <div className="attendance-popover">
                            <div className="popover-btns">
                              {activeCell?.currentStatuses.some(
                                (s) => s !== 'no_uniform' && s !== 'F',
                              ) ? (
                                (() => {
                                  const primary = activeCell.currentStatuses.find(
                                    (s) => s !== 'no_uniform' && s !== 'F',
                                  );
                                  return (
                                    <>
                                      <button
                                        className="status-btn selected"
                                        disabled
                                        type="button"
                                      >
                                        {primary === 'absent'
                                          ? 'NB'
                                          : primary === 'present'
                                            ? '+'
                                            : primary === 'late'
                                              ? 'K'
                                              : primary === 'excused'
                                                ? 'S'
                                                : primary}
                                      </button>
                                      <button
                                        type="button"
                                        className={`status-btn f-btn ${activeCell.currentStatuses.includes('F') || activeCell.currentStatuses.includes('no_uniform') ? 'selected' : ''}`}
                                        onClick={() => toggleStatus('F')}
                                      >
                                        F
                                      </button>
                                    </>
                                  );
                                })()
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className={`status-btn ${activeCell?.currentStatuses.includes('+') ? 'selected' : ''}`}
                                    onClick={() => toggleStatus('+')}
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    className={`status-btn k-btn ${activeCell?.currentStatuses.includes('K') ? 'selected' : ''}`}
                                    onClick={() => toggleStatus('K')}
                                  >
                                    K
                                  </button>
                                  <button
                                    type="button"
                                    className={`status-btn f-btn ${activeCell?.currentStatuses.includes('F') ? 'selected' : ''}`}
                                    onClick={() => toggleStatus('F')}
                                  >
                                    F
                                  </button>
                                  <button
                                    type="button"
                                    className={`status-btn nb-btn ${activeCell?.currentStatuses.includes('NB') ? 'selected' : ''}`}
                                    onClick={() => toggleStatus('NB')}
                                  >
                                    NB
                                  </button>
                                  <button
                                    type="button"
                                    className={`status-btn s-btn ${activeCell?.currentStatuses.includes('S') ? 'selected' : ''}`}
                                    onClick={() => toggleStatus('S')}
                                  >
                                    S
                                  </button>
                                </>
                              )}
                            </div>

                            <Textarea
                              className="comment-area"
                              placeholder={t('attendance.popover.writeComment')}
                              value={activeCell?.comment}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setActiveCell((prev) =>
                                  prev ? { ...prev, comment: e.target.value } : null,
                                )
                              }
                              minRows={3}
                            />

                            <div className="popover-actions">
                              <button
                                type="button"
                                className="popover-save"
                                onClick={handleSubmitStatus}
                                disabled={saveMutation.isPending}
                              >
                                {t('attendance.popover.save')}
                              </button>
                              <button
                                type="button"
                                className="popover-cancel"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCell(null);
                                }}
                              >
                                {t('attendance.popover.cancel')}
                              </button>
                            </div>
                          </div>
                        </Popover.Dropdown>
                      </Popover>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendancePage;
