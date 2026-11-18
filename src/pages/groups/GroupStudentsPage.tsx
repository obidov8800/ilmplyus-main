import { groupDigits } from '@/utils/formatNumber';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API } from '@/api/api';
import './groupStudents.css';
import type { Group, GroupStudent } from '@/types/group.types';
import { sortByNewest } from '@/utils/sortByNewest';
import { fetchGroupStudents } from './groups.service';
import { useDragScroll } from '@/hooks/useDragScroll';
import DateInput from '@/components/DateInput';

interface GroupStudentsPageProps {
  group: Group;
  onClose: () => void;
  onNext: (sessionId: number) => void;
}

interface CreateSessionPayload {
  test_id: number;
  group_id: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  min_attendance_pct: number;
  check_debt: boolean;
  notes: string;
}

interface TestCourse {
  id: number;
  name_uz?: string;
  name_ru?: string;
  name_en?: string;
}

interface Test {
  id: number;
  name: string;
  questions_count: number;
  pass_percentage: number;
  time_limit: number;
  status?: string;
  course?: TestCourse;
  level?: TestCourse;
  branch?: TestCourse;
}

function parseTimeToMinutes(time: string): number {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function TimeInput24({
  value,
  onChange,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);

  const currentHour = value?.split(':')[0] ?? '';
  const currentMin = value?.split(':')[1] ?? '';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = parseInt(currentHour) || 0;
    const m = parseInt(currentMin) || 0;
    const timer = setTimeout(() => {
      if (hourRef.current) hourRef.current.scrollTop = h * 36;
      if (minRef.current) minRef.current.scrollTop = m * 36;
    }, 0);
    return () => clearTimeout(timer);
  }, [open, currentHour, currentMin]);

  function handleToggle() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
    setOpen((o) => !o);
  }

  return (
    <div className="gs-timepicker-wrap">
      <div
        ref={triggerRef}
        className={`gs-timepicker-trigger${open ? ' gs-timepicker-trigger--open' : ''}${hasError ? ' gs-timepicker-trigger--error' : ''}`}
        onClick={handleToggle}
      >
        <span className={`gs-timepicker-value${!value ? ' gs-timepicker-value--placeholder' : ''}`}>
          {value || '00:00'}
        </span>
        <i className="fa-regular fa-clock gs-timepicker-icon" />
      </div>
      {open && (
        <div
          ref={dropdownRef}
          className="gs-timepicker-dropdown"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="gs-timepicker-col" ref={hourRef}>
            {HOURS.map((h) => (
              <div
                key={h}
                className={`gs-timepicker-item${h === currentHour ? ' gs-timepicker-item--active' : ''}`}
                onClick={() => onChange(`${h}:${currentMin || '00'}`)}
              >
                {h}
              </div>
            ))}
          </div>
          <div className="gs-timepicker-col" ref={minRef}>
            {MINUTES.map((m) => (
              <div
                key={m}
                className={`gs-timepicker-item${m === currentMin ? ' gs-timepicker-item--active' : ''}`}
                onClick={() => onChange(`${currentHour || '00'}:${m}`)}
              >
                {m}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDebt(debt: number): string {
  return groupDigits(debt);
}

const GroupStudentsPage = ({ group, onClose, onNext }: GroupStudentsPageProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { ref: tableScrollRef, onMouseDown: onTableScrollMouseDown } =
    useDragScroll<HTMLDivElement>();

  const [selectedTestId, setSelectedTestId] = useState<number | ''>('');
  const [examDate, setExamDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [minAttendancePct] = useState(70);
  const [checkDebt] = useState(false);
  const [notes] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'permitted' | 'not_permitted'>('all');

  const { data: testsData } = useQuery<Test[]>({
    queryKey: ['tests-list'],
    queryFn: async () => {
      const res = await API.get<{ data: Test[] } | { data: { data: Test[] } } | Test[]>('/tests');
      if (Array.isArray(res.data)) return res.data;
      const inner = (res.data as { data: Test[] | { data: Test[] } }).data;
      if (Array.isArray(inner)) return inner;
      if (Array.isArray(inner?.data)) return inner.data;
      return [];
    },
  });
  const tests = useMemo(() => testsData ?? [], [testsData]);

  const { data: studentsData, isLoading: studentsLoading } = useQuery<GroupStudent[]>({
    queryKey: ['group-students', group.id],
    queryFn: () => fetchGroupStudents(group.id),
  });
  const students = useMemo(() => studentsData ?? [], [studentsData]);

  const togglePermissionMutation = useMutation({
    mutationFn: async ({ studentId, permitted }: { studentId: number; permitted: boolean }) => {
      await API.put(`/students/${studentId}`, { manager_permission: permitted });
    },
    onMutate: async ({ studentId, permitted }) => {
      await queryClient.cancelQueries({ queryKey: ['group-students', group.id] });
      const previous = queryClient.getQueryData<GroupStudent[]>(['group-students', group.id]);
      queryClient.setQueryData<GroupStudent[]>(
        ['group-students', group.id],
        (old) =>
          old?.map((s) => (s.id === studentId ? { ...s, manager_permission: permitted } : s)) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['group-students', group.id], context.previous);
      }
    },
  });

  const saveSessionMutation = useMutation<{ id: number }, Error, CreateSessionPayload>({
    mutationFn: async (payload) => {
      const res = await API.post<{ id: number } | { data: { id: number } }>(
        '/exam-sessions',
        payload,
      );
      if ('id' in res.data) return res.data as { id: number };
      return (res.data as { data: { id: number } }).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['exam-sessions'] });
      onNext(data.id);
    },
  });

  const stats = useMemo(
    () => ({
      total: students.length,
      permitted: students.filter((s) => s.manager_permission).length,
      attendanceIssue: students.filter((s) => (s.attendance_pct ?? 0) < minAttendancePct).length,
      debtors: students.filter((s) => (s.debt ?? 0) > 0).length,
    }),
    [students, minAttendancePct],
  );

  const filteredStudents = useMemo(() => {
    let list = students;
    if (statusFilter === 'permitted') list = list.filter((s) => s.manager_permission);
    else if (statusFilter === 'not_permitted') list = list.filter((s) => !s.manager_permission);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        `${s.first_name} ${s.last_name} ${s.student_code ?? ''}`.toLowerCase().includes(q),
      );
    }
    return sortByNewest(list);
  }, [students, statusFilter, search]);

  const selectedTest = tests.find((t) => t.id === Number(selectedTestId)) ?? null;

  const timeError =
    startTime && endTime && parseTimeToMinutes(endTime) <= parseTimeToMinutes(startTime);

  function handleSave() {
    if (!selectedTestId || !examDate || !startTime || !endTime || timeError) return;
    saveSessionMutation.mutate({
      test_id: Number(selectedTestId),
      group_id: group.id,
      exam_date: examDate,
      start_time: startTime,
      end_time: endTime,
      min_attendance_pct: selectedTest ? selectedTest.pass_percentage : minAttendancePct,
      check_debt: checkDebt,
      notes,
    });
  }

  return (
    <div className="gs-page-view">
      <div className="gs-top-bar">
        <button
          className="gs-btn-primary"
          onClick={handleSave}
          disabled={
            saveSessionMutation.isPending ||
            !selectedTestId ||
            !examDate ||
            !startTime ||
            !endTime ||
            !!timeError
          }
        >
          <i className="fa-solid fa-check" style={{ marginRight: 8 }} />
          {saveSessionMutation.isPending
            ? t('groups.students.saving', { defaultValue: 'Saqlanmoqda...' })
            : t('groups.students.saveAndConfirm', { defaultValue: 'Tasdiqlash va saqlash' })}
        </button>
        <button className="gs-btn-close" onClick={onClose}>
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Stats */}
      <div className="gs-stats">
        <div className="gs-stat-card">
          <div className="gs-stat-icon gs-stat-icon--blue">
            <i className="fa-solid fa-users" />
          </div>
          <div>
            <div className="gs-stat-value">{stats.total}</div>
            <div className="gs-stat-label">{t('groups.students.totalStudents')}</div>
          </div>
        </div>
        <div className="gs-stat-card">
          <div className="gs-stat-icon gs-stat-icon--green">
            <i className="fa-solid fa-user-check" />
          </div>
          <div>
            <div className="gs-stat-value">{stats.permitted}</div>
            <div className="gs-stat-label">{t('groups.students.confirmed')}</div>
          </div>
        </div>
        <div className="gs-stat-card">
          <div className="gs-stat-icon gs-stat-icon--orange">
            <i className="fa-solid fa-clock" />
          </div>
          <div>
            <div className="gs-stat-value">{stats.attendanceIssue}</div>
            <div className="gs-stat-label">{t('groups.students.attendanceIssues')}</div>
          </div>
        </div>
        <div className="gs-stat-card">
          <div className="gs-stat-icon gs-stat-icon--red">
            <i className="fa-solid fa-credit-card" />
          </div>
          <div>
            <div className="gs-stat-value">{stats.debtors}</div>
            <div className="gs-stat-label">{t('groups.students.debtors')}</div>
          </div>
        </div>
      </div>

      {/* TEST MA'LUMOTLARI */}
      <div className="gs-section">
        <div className="gs-section-header">
          <div className="gs-section-title">
            <i className="fa-solid fa-circle-info" />
            {t('groups.students.testInfo', { defaultValue: "TEST MA'LUMOTLARI" })}
          </div>
          <span className="gs-section-badge">
            {t('groups.students.minAttendance', {
              pct: selectedTest ? selectedTest.pass_percentage : minAttendancePct,
            })}
          </span>
        </div>

        <div className="gs-test-form">
          <div className="gs-field">
            <label>{t('groups.students.test', { defaultValue: 'Test' })}</label>
            <select
              value={selectedTestId}
              onChange={(e) => setSelectedTestId(Number(e.target.value) || '')}
            >
              <option value="">
                {t('groups.students.selectTest', { defaultValue: 'tanlang' })}
              </option>
              {tests.map((test) => (
                <option key={test.id} value={test.id}>
                  {test.name}
                </option>
              ))}
            </select>
          </div>

          <div className="gs-field">
            <label>{t('groups.students.date', { defaultValue: 'Sanasi' })}</label>
            <DateInput value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>

          <div className="gs-field">
            <label>{t('groups.students.startTime', { defaultValue: 'Boshlanish vaqti' })}</label>
            <TimeInput24 value={startTime} onChange={setStartTime} hasError={!!timeError} />
          </div>

          <div className="gs-field">
            <label>{t('groups.students.endTime', { defaultValue: 'Tugash vaqti' })}</label>
            <TimeInput24 value={endTime} onChange={setEndTime} hasError={!!timeError} />
            {timeError && (
              <span style={{ fontSize: 11, color: '#E70A0A' }}>
                {t('groups.students.timeError', {
                  defaultValue: 'Tugash vaqti boshlanish vaqtidan katta bo‘lishi kerak',
                })}
              </span>
            )}
          </div>
        </div>

        {selectedTest && (
          <div className="gs-test-form gs-test-info-row">
            <div className="gs-field">
              <label>{t('groups.testResults.course')}</label>
              <input type="text" readOnly value={selectedTest.course?.name_uz ?? '—'} />
            </div>
            <div className="gs-field">
              <label>{t('groups.testResults.level')}</label>
              <input type="text" readOnly value={selectedTest.level?.name_uz ?? '—'} />
            </div>
            <div className="gs-field">
              <label>{t('groups.testResults.branch')}</label>
              <input type="text" readOnly value={selectedTest.branch?.name_uz ?? '—'} />
            </div>
            <div className="gs-field">
              <label>{t('groups.testResults.questionsCount')}</label>
              <input type="text" readOnly value={`${selectedTest.questions_count} ta`} />
            </div>
            <div className="gs-field">
              <label>{t('groups.students.passPercentage')}</label>
              <input type="text" readOnly value={`${selectedTest.pass_percentage}%`} />
            </div>
            <div className="gs-field">
              <label>{t('groups.testResults.timeLimit')}</label>
              <input type="text" readOnly value={`${selectedTest.time_limit} min`} />
            </div>
            <div className="gs-field">
              <label>{t('groups.students.testStatus')}</label>
              <input type="text" readOnly value={selectedTest.status ?? '—'} />
            </div>
          </div>
        )}
      </div>

      {/* O'QUVCHILARNI NATIJASI */}
      <div className="gs-section">
        <div className="gs-section-header">
          <div className="gs-section-title">
            <i className="fa-solid fa-circle-info" />
            {t('groups.students.resultsTitle')}
          </div>
        </div>

        <div className="gs-table-toolbar">
          <div className="gs-search-wrap">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              className="gs-search-input"
              type="text"
              placeholder={t('groups.students.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="gs-filter-select-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">{t('groups.students.filterAll')}</option>
              <option value="permitted">{t('groups.students.filterPermitted')}</option>
              <option value="not_permitted">{t('groups.students.filterNotPermitted')}</option>
            </select>
            <i className="fa-solid fa-chevron-down" />
          </div>
        </div>

        <div
          className="gs-table-wrap responsive-table-wrap"
          ref={tableScrollRef}
          onMouseDown={onTableScrollMouseDown}
        >
          <table className="gs-table">
            <thead>
              <tr>
                <th>№</th>
                <th>{t('groups.students.colFish')}</th>
                <th>{t('groups.students.colAccountNumber')}</th>
                <th>{t('groups.students.colCourseCompletion')}</th>
                <th>{t('groups.students.colAttendance')}</th>
                <th>{t('groups.students.colDebt')}</th>
                <th>{t('groups.students.colManagerPermission')}</th>
                <th>{t('groups.students.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {studentsLoading ? (
                <tr>
                  <td colSpan={8} className="gs-table-loading">
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                    {t('groups.students.loading')}
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="gs-table-empty">
                    {t('groups.students.noData')}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, idx) => (
                  <tr key={student.id}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>
                      {student.first_name} {student.last_name}
                      {student.father_name ? ` ${student.father_name}` : ''}
                    </td>
                    <td>{student.student_code || '—'}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{student.course_completion_pct}%</span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            (student.attendance_pct ?? 0) < minAttendancePct
                              ? '#e03131'
                              : '#2f9e44',
                        }}
                      >
                        {student.attendance_pct ?? 0}%
                      </span>
                    </td>
                    <td>
                      {(student.debt ?? 0) > 0 ? (
                        <span className="gs-debt-amount">{formatDebt(student.debt ?? 0)}</span>
                      ) : (
                        <span className="gs-debt-none">{t('groups.students.noDebt')}</span>
                      )}
                    </td>
                    <td>
                      <label className="gs-toggle">
                        <input
                          type="checkbox"
                          checked={student.manager_permission ?? false}
                          onChange={(e) =>
                            togglePermissionMutation.mutate({
                              studentId: student.id,
                              permitted: e.target.checked,
                            })
                          }
                        />
                        <span className="gs-toggle-track" />
                        <span className="gs-toggle-thumb" />
                      </label>
                    </td>
                    <td>
                      {student.manager_permission ? (
                        <span className="gs-badge gs-badge--permitted">
                          {t('groups.students.statusPermitted')}
                        </span>
                      ) : (
                        <span className="gs-badge gs-badge--not-permitted">
                          {t('groups.students.statusNotPermitted')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
        <div className="responsive-cards">
          {studentsLoading ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('groups.students.loading')}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('groups.students.noData')}
            </div>
          ) : (
            filteredStudents.map((student, idx) => (
              <div key={student.id} className="data-card">
                <div className="data-card__head">
                  <span className="data-card__title">
                    {idx + 1}. {student.first_name} {student.last_name}
                    {student.father_name ? ` ${student.father_name}` : ''}
                  </span>
                  {student.manager_permission ? (
                    <span className="gs-badge gs-badge--permitted">
                      {t('groups.students.statusPermitted')}
                    </span>
                  ) : (
                    <span className="gs-badge gs-badge--not-permitted">
                      {t('groups.students.statusNotPermitted')}
                    </span>
                  )}
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">
                    {t('groups.students.colAccountNumber')}
                  </span>
                  <span className="data-card__value">{student.student_code || '—'}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">
                    {t('groups.students.colCourseCompletion')}
                  </span>
                  <span className="data-card__value" style={{ fontWeight: 600 }}>
                    {student.course_completion_pct}%
                  </span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">
                    {t('groups.students.colAttendance')}
                  </span>
                  <span
                    className="data-card__value"
                    style={{
                      fontWeight: 600,
                      color:
                        (student.attendance_pct ?? 0) < minAttendancePct
                          ? '#e03131'
                          : '#2f9e44',
                    }}
                  >
                    {student.attendance_pct ?? 0}%
                  </span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('groups.students.colDebt')}</span>
                  <span className="data-card__value">
                    {(student.debt ?? 0) > 0 ? (
                      <span className="gs-debt-amount">{formatDebt(student.debt ?? 0)}</span>
                    ) : (
                      <span className="gs-debt-none">{t('groups.students.noDebt')}</span>
                    )}
                  </span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">
                    {t('groups.students.colManagerPermission')}
                  </span>
                  <span className="data-card__value">
                    <label className="gs-toggle">
                      <input
                        type="checkbox"
                        checked={student.manager_permission ?? false}
                        onChange={(e) =>
                          togglePermissionMutation.mutate({
                            studentId: student.id,
                            permitted: e.target.checked,
                          })
                        }
                      />
                      <span className="gs-toggle-track" />
                      <span className="gs-toggle-thumb" />
                    </label>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupStudentsPage;
