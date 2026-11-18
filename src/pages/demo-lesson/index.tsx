import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import MultiPicker from '@/components/MultiPicker';
import { API } from '@/api/api';
import { useGroupsData } from '@/pages/groups/useGroupsData';
import { usePermission } from '@/hooks/usePermission';
import { useOptions, roomOptionLabel, type Option } from '@/api/options';
import { getLocalized } from '@/utils/getLocalized';
import SortableTh from '@/components/SortableTh';
import { useTableSort } from '@/hooks/useTableSort';
import type { Group } from '@/types/group.types';
import type { DemoLesson, CreateDemoLessonPayload, DemoLessonLid } from '@/types/demoLesson.types';
import { LID_STATUS } from '@/types/lid.types';
import { advanceLidStatus } from '@/pages/lid/lid.service';
import {
  useCreateDemoLesson,
  useUpdateDemoLesson,
  useDeleteDemoLesson,
  useAttendanceDemoLesson,
} from './useDemoLesson';
import { Protected } from '@/components/Protected';
import { Pagination } from '@/components/Pagination';
import FilterBar, { type FilterBarField } from '@/components/FilterBar';
import { countFilterBarValues } from '@/components/FilterBar/filterBar.utils';
import FilterButton from '@/components/FilterButton';
import './demoLesson.css';

// ─── helpers ────────────────────────────────────────────────────────────────

const UZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '-';
  const datePart = dateStr.split('T')[0]; // handle ISO "2026-05-25T19:00:00.000000Z"
  const parts = datePart.split('-');
  if (parts.length === 3) {
    const monthIdx = parseInt(parts[1], 10) - 1;
    return `${parseInt(parts[2], 10)}-${UZ_MONTHS[monthIdx] ?? ''}`;
  }
  return dateStr;
}

function formatCreatedAt(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()} ${hh}:${min}`;
  } catch {
    return dateStr;
  }
}

function apiDateToForm(apiDate: string): string {
  const datePart = apiDate.split('T')[0]; // handle ISO format
  const parts = datePart.split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return apiDate;
}

function formDateToApi(formDate: string): string {
  const parts = formDate.split('.');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return formDate;
}

function isDateInPast(value: string): boolean {
  if (value.length < 10) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;

  const inputDay = parseInt(parts[0]);
  const inputMonth = parseInt(parts[1]);
  const inputYear = parseInt(parts[2]);
  if (isNaN(inputDay) || isNaN(inputMonth) || isNaN(inputYear)) return false;

  const today = new Date();
  const tY = today.getFullYear();
  const tM = today.getMonth() + 1;
  const tD = today.getDate();

  if (inputYear < tY) return true;
  if (inputYear > tY) return false;
  if (inputMonth < tM) return true;
  if (inputMonth > tM) return false;
  return inputDay < tD; // same year+month: true only if day is strictly less
}

function timeToMinutes(time: string): number {
  if (!time || time.length < 4) return -1;
  const [h, m] = time.split(':');
  return (parseInt(h) || 0) * 60 + (parseInt(m) || 0);
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getDayOfWeek(formDate: string): string {
  const parts = formDate.split('.');
  if (parts.length !== 3) return '';
  const d = new Date(Date.UTC(+parts[2], +parts[1] - 1, +parts[0]));
  return DAY_NAMES[d.getUTCDay()] ?? '';
}

function checkRoomOccupiedByGroups(
  groups: Group[],
  roomId: number,
  formDate: string,
  startTime: string,
  endTime: string,
): boolean {
  const dayName = getDayOfWeek(formDate);
  if (!dayName) return false;

  const apiDate = formDateToApi(formDate); // YYYY-MM-DD
  const newStart = timeToMinutes(startTime);
  const newEnd = timeToMinutes(endTime);
  if (newStart < 0 || newEnd < 0 || newStart >= newEnd) return false;

  return groups.some((g) => {
    if (!g.room || g.room.id !== roomId) return false;
    if (!g.days?.includes(dayName)) return false;
    if (g.start_date && apiDate < g.start_date) return false;
    if (g.end_date && apiDate > g.end_date) return false;

    const gs = timeToMinutes(g.start_time);
    const ge = timeToMinutes(g.end_time);
    return newStart < ge && newEnd > gs;
  });
}

// ─── sub-components ──────────────────────────────────────────────────────────

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);

  const currentHour = value && value.includes(':') ? value.split(':')[0] : '';
  const currentMin = value && value.includes(':') ? value.split(':')[1] : '';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      const h = parseInt(currentHour) || 0;
      const m = parseInt(currentMin) || 0;
      setTimeout(() => {
        if (hourRef.current) hourRef.current.scrollTop = h * 36;
        if (minRef.current) minRef.current.scrollTop = m * 36;
      }, 0);
    }
  }, [open, currentHour, currentMin]);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  return (
    <div className="dl-select-wrap" ref={ref}>
      <div
        className="dl-input-wrap"
        style={{ cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
      >
        <input className="dl-input" type="text" value={value} readOnly placeholder="00:00" />
        <span className="dl-input-icon">
          <i className="fa-regular fa-clock" />
        </span>
      </div>
      {open && (
        <div className="dl-time-picker">
          <div className="dl-time-col" ref={hourRef}>
            {hours.map((h) => (
              <div
                key={h}
                className={`dl-time-item${h === currentHour ? ' dl-time-item--active' : ''}`}
                onClick={() => onChange(`${h}:${currentMin || '00'}`)}
              >
                {h}
              </div>
            ))}
          </div>
          <div className="dl-time-col" ref={minRef}>
            {minutes.map((m) => (
              <div
                key={m}
                className={`dl-time-item${m === currentMin ? ' dl-time-item--active' : ''}`}
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

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const parseValue = (v: string): Date | null => {
    if (v.length !== 10) return null;
    const parts = v.split('.');
    if (parts.length !== 3) return null;
    const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    return isNaN(d.getTime()) ? null : d;
  };

  const selectedDate = parseValue(value);
  const today = new Date();

  const [viewYear, setViewYear] = useState(selectedDate?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate?.getMonth() ?? today.getMonth());

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const startDay = (firstDayOfMonth + 6) % 7;

  const handleDayClick = (day: number) => {
    const d = String(day).padStart(2, '0');
    const m = String(viewMonth + 1).padStart(2, '0');
    onChange(`${d}.${m}.${viewYear}`);
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  };

  const isPast = isDateInPast(value);

  const MONTH_NAMES = [
    'Yanvar',
    'Fevral',
    'Mart',
    'Aprel',
    'May',
    'Iyun',
    'Iyul',
    'Avgust',
    'Sentabr',
    'Oktabr',
    'Noyabr',
    'Dekabr',
  ];
  const DAY_LABELS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

  return (
    <div className="dl-date-field">
      <div className="dl-select-wrap" ref={ref}>
        <div
          className="dl-input-wrap"
          style={{ cursor: 'pointer' }}
          onClick={() => setOpen((o) => !o)}
        >
          <input
            className={`dl-input${isPast ? ' dl-input--error' : ''}`}
            type="text"
            value={value}
            readOnly
            placeholder={t('demoLesson.modal.datePlaceholder')}
          />
          <span className="dl-input-icon">
            <i className="fa-regular fa-calendar" />
          </span>
        </div>
        {open && (
          <div className="dl-calendar">
            <div className="dl-calendar-header">
              <button type="button" className="dl-cal-nav" onClick={prevMonth}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="dl-cal-title">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button type="button" className="dl-cal-nav" onClick={nextMonth}>
                <i className="fa-solid fa-chevron-right" />
              </button>
            </div>
            <div className="dl-calendar-grid">
              {DAY_LABELS.map((d) => (
                <div key={d} className="dl-cal-day-label">
                  {d}
                </div>
              ))}
              {Array.from({ length: startDay }).map((_, i) => (
                <div key={`e${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const isSelected =
                  selectedDate?.getDate() === day &&
                  selectedDate?.getMonth() === viewMonth &&
                  selectedDate?.getFullYear() === viewYear;
                const isToday =
                  today.getDate() === day &&
                  today.getMonth() === viewMonth &&
                  today.getFullYear() === viewYear;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`dl-cal-day${isSelected ? ' dl-cal-day--selected' : ''}${isToday && !isSelected ? ' dl-cal-day--today' : ''}`}
                    onClick={() => handleDayClick(day)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <span className="dl-date-hint">{t('demoLesson.modal.dateHint')}</span>
    </div>
  );
}

function GroupSelect({
  value,
  onChange,
  groups,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: Group[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = groups.find((g) => String(g.id) === value);
  const filtered = groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="dl-select-wrap" ref={ref}>
      <div className="dl-input-wrap">
        <input
          className="dl-input"
          type="text"
          value={open ? search : (selected?.name ?? '')}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('demoLesson.modal.groupPlaceholder')}
        />
        <span className="dl-input-icon dl-arrow-icon" onClick={() => setOpen((o) => !o)}>
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} />
        </span>
      </div>
      {open && (
        <div className="dl-dropdown">
          {filtered.length === 0 ? (
            <div className="dl-dropdown-empty">{t('demoLesson.modal.dropdownEmpty')}</div>
          ) : (
            filtered.map((g) => (
              <div
                key={g.id}
                className={`dl-dropdown-item${String(g.id) === value ? ' dl-dropdown-item--active' : ''}`}
                onClick={() => {
                  onChange(String(g.id));
                  setOpen(false);
                  setSearch('');
                }}
              >
                {g.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="dl-input-wrap">
      <select
        className="dl-input dl-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="dl-input-icon dl-arrow-icon">
        <i className="fa-solid fa-chevron-down" />
      </span>
    </div>
  );
}

function formatTimeForApi(time: string): string {
  if (!time || !time.includes(':')) return time;
  const [h, m] = time.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

function LidMultiSelect({
  value,
  onChange,
  lids,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  lids: DemoLessonLid[];
}) {
  // Qidiruv ism va telefon bo'yicha — ikkalasi ham yorliqda.
  const options = useMemo(
    () =>
      lids.map((l) => ({
        value: l.id,
        label: `${l.last_name} ${l.first_name}${l.phone ? ` — ${l.phone}` : ''}`,
      })),
    [lids],
  );
  return <MultiPicker options={options} value={value} onChange={onChange} placeholder="Lidlarni tanlang" />;
}

function RoomSelect({
  value,
  onChange,
  rooms,
  groups,
  formDate,
  startTime,
  endTime,
}: {
  value: string;
  onChange: (v: string) => void;
  rooms: Option[];
  groups: Group[];
  formDate: string;
  startTime: string;
  endTime: string;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const canCheck = formDate.length >= 10 && startTime.length >= 4 && endTime.length >= 4;
  const selected = rooms.find((r) => String(r.id) === value);
  const selectedOccupied =
    selected && canCheck
      ? checkRoomOccupiedByGroups(groups, selected.id, formDate, startTime, endTime)
      : null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const roomName = (r: Option) => roomOptionLabel(r, i18n.language);

  return (
    <div className="dl-select-wrap" ref={ref}>
      <div className="dl-room-trigger" onClick={() => setOpen((o) => !o)}>
        {selected ? (
          <span className="dl-room-trigger-inner">
            <span>{roomName(selected)}</span>
            {selectedOccupied !== null && (
              <span
                className={`dl-badge ${selectedOccupied ? 'dl-badge--occupied' : 'dl-badge--free'}`}
              >
                {selectedOccupied ? t('demoLesson.badge.occupied') : t('demoLesson.badge.free')}
              </span>
            )}
          </span>
        ) : (
          <span className="dl-placeholder">{t('demoLesson.modal.roomPlaceholder')}</span>
        )}
        <span className="dl-room-arrow">
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} />
        </span>
      </div>
      {open && (
        <div className="dl-dropdown">
          {rooms.map((room) => {
            const occupied = canCheck
              ? checkRoomOccupiedByGroups(groups, room.id, formDate, startTime, endTime)
              : null;
            return (
              <div
                key={room.id}
                className={`dl-dropdown-item dl-room-item${String(room.id) === value ? ' dl-dropdown-item--active' : ''}`}
                onClick={() => {
                  onChange(String(room.id));
                  setOpen(false);
                }}
              >
                <span>{roomName(room)}</span>
                {occupied !== null && (
                  <span
                    className={`dl-badge ${occupied ? 'dl-badge--occupied' : 'dl-badge--free'}`}
                  >
                    {occupied ? t('demoLesson.badge.occupied') : t('demoLesson.badge.free')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── attendance view ─────────────────────────────────────────────────────────

function DemoLessonAttendanceView({
  lessonId,
  onClose,
}: {
  lessonId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<Record<number, boolean>>({});

  const { data: lessonDetail, isLoading } = useQuery({
    queryKey: ['demo-lesson-detail', lessonId],
    queryFn: async () => {
      const res = await API.get(`/demo-lessons/${lessonId}`);
      return res.data?.data ?? res.data;
    },
    staleTime: 0,
  });

  const lids: Array<{ id: number; first_name: string; last_name: string; father_name?: string }> =
    lessonDetail?.lids ?? [];

  const attendances: Array<{ lid_id: number; status: string }> = lessonDetail?.attendances ?? [];

  // Default — eng oxirgi qo'shilgani tepada; ID ustuni bosilsa asc/desc.
  const lidSort = useTableSort(lids);

  const getStatus = (lidId: number): boolean => {
    if (lidId in statuses) return statuses[lidId];
    const att = attendances.find((a) => a.lid_id === lidId);
    return att ? att.status === 'present' : false;
  };

  const save = useAttendanceDemoLesson();

  const handleSaveAttendance = () => {
    const payload = lids.map((l) => ({
      lid_id: l.id,
      status: getStatus(l.id) ? 'present' : 'absent',
    }));

    save.mutate(
      { id: lessonId, data: { attendances: payload } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['demo-lesson-detail', lessonId] });
          // Demo darsga kelgan/kelmagan har bir lid avtomatik mos ustunga
          // (Keldi/Kelmadi) o'tadi.
          payload.forEach((a) =>
            advanceLidStatus(
              a.lid_id,
              a.status === 'present' ? LID_STATUS.DEMO_ATTENDED : LID_STATUS.DEMO_MISSED,
            ),
          );
          notifications.show({
            title: t('demoLesson.notification.success'),
            message: t('demoLesson.notification.saved'),
            color: 'green',
          });
          onClose();
        },
      },
    );
  };

  return (
    <div className="dl-att-page">
      <div className="dl-att-header">
        <h1 className="dl-att-title">{t('demoLesson.attendance.title')}</h1>
        <button
          className="dl-att-save-btn"
          onClick={handleSaveAttendance}
          disabled={save.isPending || lids.length === 0}
        >
          {t('demoLesson.attendance.save')}
        </button>
      </div>

      <div className="dl-att-card">
        <table className="dl-att-table">
          <thead>
            <tr>
              <SortableTh sortKey="id" sort={lidSort}>
                {t('demoLesson.table.id')}
              </SortableTh>
              <th>{t('demoLesson.attendance.name')}</th>
              <th />
              <th>{t('demoLesson.attendance.managerPermission')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="dl-att-empty">
                  {t('demoLesson.attendance.loading')}
                </td>
              </tr>
            ) : lids.length === 0 ? (
              <tr>
                <td colSpan={4} className="dl-att-empty">
                  {t('demoLesson.attendance.notFound')}
                </td>
              </tr>
            ) : (
              lidSort.rows.map((lid) => {
                const present = getStatus(lid.id);
                const fullName = [lid.last_name, lid.first_name, lid.father_name]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <tr key={lid.id}>
                    <td>{lid.id}</td>
                    <td>{fullName}</td>
                    <td>
                      <span className={present ? 'dl-att-status--present' : 'dl-att-status--absent'}>
                        {present
                          ? t('demoLesson.attendance.present')
                          : t('demoLesson.attendance.absent')}
                      </span>
                    </td>
                    <td>
                      <div className="dl-att-status-cell">
                        <label className="dl-att-toggle">
                          <input
                            type="checkbox"
                            checked={present}
                            onChange={(e) =>
                              setStatuses((prev) => ({ ...prev, [lid.id]: e.target.checked }))
                            }
                          />
                          <span className="dl-att-track" />
                          <span className="dl-att-thumb" />
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── form state ──────────────────────────────────────────────────────────────

interface FormState {
  group_id: string;
  date: string;
  start_time: string;
  end_time: string;
  room_id: string;
  teacher_id: string;
  lid_ids: number[];
}

const EMPTY_FORM: FormState = {
  group_id: '',
  date: '',
  start_time: '',
  end_time: '',
  room_id: '',
  teacher_id: '',
  lid_ids: [],
};

const PER_PAGE = 10;

type DemoFilterKey = 'group' | 'room' | 'teacher' | 'date';

const EMPTY_DEMO_FILTERS: Record<DemoFilterKey, string> = {
  group: '',
  room: '',
  teacher: '',
  date: '',
};

// ─── page ─────────────────────────────────────────────────────────────────────

const DemoLessonPage = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Record<DemoFilterKey, string>>(EMPTY_DEMO_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DemoLesson | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [attendanceLessonId, setAttendanceLessonId] = useState<number | null>(null);

  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  // ── queries ──
  const { data: rawLessons, isLoading } = useQuery<
    { current_page: number; data: DemoLesson[] } | DemoLesson[]
  >({
    queryKey: ['demo-lessons'],
    queryFn: async () => {
      const res = await API.get('/demo-lessons');
      return res.data;
    },
    staleTime: 1000 * 60 * 2,
  });

  const lessons = useMemo<DemoLesson[]>(() => {
    if (!rawLessons) return [];
    if (Array.isArray(rawLessons)) return rawLessons;
    return (rawLessons as { current_page: number; data: DemoLesson[] }).data ?? [];
  }, [rawLessons]);

  // Xona bandligi guruhning `room`, `days`, `start_time`, `end_time` maydonlariga qarab
  // hisoblanadi — /options/groups bularni bermaydi.
  const { groups } = useGroupsData({ staleTime: 1000 * 60 * 5 });

  const { data: rooms = [] } = useOptions('rooms');

  const { data: employees = [] } = useOptions('employees');

  // Lid tanlovi — faqat rolda «Lidlar» sahifasi bo'lsa (`/options` da lid ro'yxati hali yo'q — backend B4).
  const canViewLids = usePermission('lids.view');
  const { data: rawLids } = useQuery<DemoLessonLid[] | { data: DemoLessonLid[] }>({
    queryKey: ['lids-simple'],
    queryFn: () => API.get('/lids', { params: { per_page: 200 } }).then((r) => r.data),
    enabled: canViewLids,
    staleTime: 1000 * 60 * 5,
  });
  const allLids: DemoLessonLid[] = Array.isArray(rawLids)
    ? rawLids
    : ((rawLids as { data: DemoLessonLid[] })?.data ?? []);

  // ── mutations ──
  const create = useCreateDemoLesson();
  const update = useUpdateDemoLesson();
  const remove = useDeleteDemoLesson();

  // ── derived ──
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const groupId = filters.group ? Number(filters.group) : null;
    const roomId = filters.room ? Number(filters.room) : null;
    const teacherId = filters.teacher ? Number(filters.teacher) : null;

    return lessons.filter((l) => {
      if (s && !l.group?.name?.toLowerCase().includes(s) && !l.date?.toLowerCase().includes(s)) {
        return false;
      }
      if (groupId && (l.group_id ?? l.group?.id) !== groupId) return false;
      if (roomId && (l.room_id ?? l.room?.id) !== roomId) return false;
      if (teacherId && (l.teacher_id ?? l.teacher?.id) !== teacherId) return false;
      // `date` ISO ("2026-05-25T19:00:00Z") yoki "YYYY-MM-DD" bo'lishi mumkin.
      if (filters.date && (l.date ?? '').slice(0, 10) !== filters.date) return false;
      return true;
    });
  }, [lessons, search, filters]);

  // Default — eng oxirgi qo'shilgan demo dars tepada; ID ustuni bosilsa asc/desc.
  const sort = useTableSort(filtered);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, lastPage);
  const paginated = sort.rows.slice((safePage - 1) * perPage, safePage * perPage);

  const employeeOptions = employees.map((e) => ({
    value: String(e.id),
    label: e.label,
  }));

  const filterFields: FilterBarField<DemoFilterKey>[] = [
    {
      key: 'group',
      label: t('demoLesson.table.groupName'),
      placeholder: t('demoLesson.modal.groupSelectPlaceholder'),
      options: groups.map((g) => ({ value: g.id, label: g.name })),
    },
    {
      key: 'room',
      label: t('demoLesson.table.room'),
      placeholder: t('demoLesson.modal.roomPlaceholder'),
      options: rooms.map((r) => ({ value: r.id, label: roomOptionLabel(r, lang) })),
    },
    {
      key: 'teacher',
      label: t('demoLesson.table.teacher'),
      placeholder: t('demoLesson.modal.teacherPlaceholder'),
      options: employeeOptions.map((e) => ({ value: e.value, label: e.label })),
    },
    {
      key: 'date',
      label: t('demoLesson.modal.date'),
      type: 'date',
    },
  ];

  const activeFilterCount = countFilterBarValues(filters);

  const handleFilterChange = (next: Record<DemoFilterKey, string>) => {
    setFilters(next);
    setPage(1);
  };

  const isSaving = create.isPending || update.isPending;

  // ── handlers ──
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (lesson: DemoLesson) => {
    setEditing(lesson);
    setForm({
      group_id: String(lesson.group_id ?? ''),
      date: lesson.date ? apiDateToForm(lesson.date) : '',
      start_time: lesson.start_time ? lesson.start_time.slice(0, 5) : '',
      end_time: lesson.end_time ? lesson.end_time.slice(0, 5) : '',
      room_id: String(lesson.room_id ?? ''),
      teacher_id: String(lesson.teacher_id ?? ''),
      // Demo darsning O'Z lidlari: backend `lids` qaytaradi (`lid_ids` emas). Avval bu yerda bo'sh massiv chiqib qolardi —
      // backend `PUT lid_ids: []` ni 422 bilan rad etardi; endi esa u BARCHA lidlarni olib tashlaydi.
      lid_ids: lesson.lid_ids ?? lesson.lids?.map((l) => l.id) ?? (lesson.lid ? [lesson.lid.id] : []),
    });
    setModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!window.confirm(t('demoLesson.confirmDelete'))) return;
    remove.mutate(id, {
      onSuccess: () =>
        notifications.show({
          title: t('demoLesson.notification.success'),
          message: t('demoLesson.notification.deleted'),
          color: 'green',
        }),
    });
  };
  // Delete tugmasi izohga olingan; tugma qaytarilganda quyidagi qatorni o'chirish kerak
  void handleDelete;

  const handleSave = () => {
    if (form.date.length !== 10) {
      notifications.show({
        title: t('demoLesson.modal.date'),
        message: t('demoLesson.notification.dateInvalid'),
        color: 'red',
      });
      return;
    }

    const payload: CreateDemoLessonPayload = {
      group_id: parseInt(form.group_id),
      date: formDateToApi(form.date),
      start_time: formatTimeForApi(form.start_time),
      end_time: formatTimeForApi(form.end_time),
      room_id: parseInt(form.room_id),
      teacher_id: parseInt(form.teacher_id),
      lid_ids: form.lid_ids,
    };

    if (editing) {
      update.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            notifications.show({
              title: t('demoLesson.notification.success'),
              message: t('demoLesson.notification.updated'),
              color: 'green',
            });
            setModalOpen(false);
          },
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          notifications.show({
            title: t('demoLesson.notification.success'),
            message: t('demoLesson.notification.created'),
            color: 'green',
          });
          setModalOpen(false);
        },
      });
    }
  };

  // ── render ──
  if (attendanceLessonId !== null) {
    return (
      <div className="dl-page container">
        <DemoLessonAttendanceView
          lessonId={attendanceLessonId}
          onClose={() => setAttendanceLessonId(null)}
        />
      </div>
    );
  }

  return (
    <div className="dl-page container">
      {/* ── header ── */}
      <div className="dl-header">
        <div className="dl-controls">
          <div className="dl-search-box">
            <i className="fa-solid fa-magnifying-glass dl-search-icon" />
            <input
              type="text"
              className="dl-search-input"
              placeholder={t('demoLesson.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <FilterButton
            onClick={() => setFilterOpen((v) => !v)}
            active={filterOpen || activeFilterCount > 0}
            expanded={filterOpen}
            count={activeFilterCount}
            label={t('demoLesson.filter')}
          />
          <Protected permission="demo_lessons.create">
            <button className="dl-create-btn" onClick={openCreate}>
              {t('demoLesson.createBtn')}
            </button>
          </Protected>
        </div>
      </div>

      {/* ── table ── */}
      <div className="dl-card">
        {filterOpen && (
          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={handleFilterChange}
            onReset={() => {
              setFilters(EMPTY_DEMO_FILTERS);
              setPage(1);
            }}
            onClose={() => setFilterOpen(false)}
            ariaLabel={t('demoLesson.filter')}
          />
        )}
        <div className="responsive-table-wrap">
        <table className="data-table dl-table">
          <thead>
            <tr>
              <SortableTh sortKey="id" sort={sort}>
                {t('demoLesson.table.id')}
              </SortableTh>
              <th>{t('demoLesson.table.groupName')}</th>
              <th>{t('demoLesson.table.lessonDay')}</th>
              <th>{t('demoLesson.table.startTime')}</th>
              <th>{t('demoLesson.table.endTime')}</th>
              <th>{t('demoLesson.table.room')}</th>
              <th>{t('demoLesson.table.teacher')}</th>
              <th>{t('demoLesson.table.createdAt')}</th>
              <th>{t('demoLesson.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="dl-td-empty">
                  {t('demoLesson.loading')}
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={9} className="dl-td-empty">
                  {t('demoLesson.notFound')}
                </td>
              </tr>
            ) : (
              paginated.map((lesson) => (
                <tr key={lesson.id}>
                  <td>{lesson.id}</td>
                  <td>{lesson.group?.name ?? '-'}</td>
                  <td>{formatDateDisplay(lesson.date)}</td>
                  <td>{lesson.start_time ?? '-'}</td>
                  <td>{lesson.end_time ?? '-'}</td>
                  <td>{getLocalized(lesson.room, 'name', lang)}</td>
                  <td>
                    {lesson.teacher?.full_name ??
                      (lesson.teacher
                        ? `${lesson.teacher.first_name} ${lesson.teacher.last_name}`
                        : '-')}
                  </td>
                  <td>{formatCreatedAt(lesson.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      <Protected permission="demo_lessons.edit">
                        <button
                          className="row-action row-action--edit"
                          title={t('demoLesson.editTitle')}
                          onClick={() => openEdit(lesson)}
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                      </Protected>
                      <Protected permission="demo_lessons.mark_attendance">
                        <button
                          className="row-action row-action--secondary"
                          title={t('demoLesson.attendanceTitle')}
                          onClick={() => setAttendanceLessonId(lesson.id)}
                        >
                          <i className="fa-solid fa-clipboard-list" />
                        </button>
                      </Protected>
                      {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                      <Protected permission="demo_lessons.delete">
                        <button
                          className="row-action row-action--delete"
                          title={t('demoLesson.deleteTitle')}
                          onClick={() => handleDelete(lesson.id)}
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      </Protected>
                      */}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
        <div className="responsive-cards">
          {isLoading ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('demoLesson.loading')}
            </div>
          ) : paginated.length === 0 ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('demoLesson.notFound')}
            </div>
          ) : (
            paginated.map((lesson) => (
              <div key={lesson.id} className="data-card">
                <div className="data-card__head">
                  <span className="data-card__title">{lesson.group?.name ?? '-'}</span>
                </div>
                <div className="data-card__actions">
                    <Protected permission="demo_lessons.edit">
                      <button
                        className="row-action row-action--edit"
                        title={t('demoLesson.editTitle')}
                        onClick={() => openEdit(lesson)}
                      >
                        <i className="fa-solid fa-pen" />
                      </button>
                    </Protected>
                    <Protected permission="demo_lessons.mark_attendance">
                      <button
                        className="row-action row-action--secondary"
                        title={t('demoLesson.attendanceTitle')}
                        onClick={() => setAttendanceLessonId(lesson.id)}
                      >
                        <i className="fa-solid fa-clipboard-list" />
                      </button>
                    </Protected>
                  </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('demoLesson.table.id')}</span>
                  <span className="data-card__value">{lesson.id}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('demoLesson.table.lessonDay')}</span>
                  <span className="data-card__value">{formatDateDisplay(lesson.date)}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('demoLesson.table.startTime')}</span>
                  <span className="data-card__value">
                    {(lesson.start_time ?? '-')} – {(lesson.end_time ?? '-')}
                  </span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('demoLesson.table.room')}</span>
                  <span className="data-card__value">
                    {getLocalized(lesson.room, 'name', lang)}
                  </span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('demoLesson.table.teacher')}</span>
                  <span className="data-card__value">
                    {lesson.teacher?.full_name ??
                      (lesson.teacher
                        ? `${lesson.teacher.first_name} ${lesson.teacher.last_name}`
                        : '-')}
                  </span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('demoLesson.table.createdAt')}</span>
                  <span className="data-card__value">{formatCreatedAt(lesson.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {filtered.length > 0 && (
          <Pagination
            currentPage={safePage}
            lastPage={lastPage}
            total={filtered.length}
            from={(safePage - 1) * perPage + 1}
            to={Math.min(safePage * perPage, filtered.length)}
            onPageChange={setPage}
            pageSize={perPage}
            onPageSizeChange={(size) => {
              setPerPage(size);
              setPage(1);
            }}
          />
        )}
      </div>

      {/* ── modal ── */}
      {modalOpen && (
        <div className="dl-overlay">
          <div className="dl-modal">
            <div className="dl-modal-header">
              <span>{t('demoLesson.modal.title')}</span>
            </div>

            <div className="dl-modal-body">
              <div className="dl-form-grid">
                {/* Guruh */}
                <div className="dl-field">
                  <label className="dl-label">{t('demoLesson.modal.group')}</label>
                  <GroupSelect
                    value={form.group_id}
                    onChange={(v) => {
                      const g = groups.find((gr) => String(gr.id) === v);
                      const groupNumId = parseInt(v);
                      const matchingLidIds = allLids
                        .filter((l) => l.group_id != null && l.group_id === groupNumId)
                        .map((l) => l.id);
                      setForm((f) => ({
                        ...f,
                        group_id: v,
                        teacher_id: g?.teacher?.id ? String(g.teacher.id) : f.teacher_id,
                        lid_ids: matchingLidIds.length > 0 ? matchingLidIds : f.lid_ids,
                      }));
                    }}
                    groups={groups}
                  />
                </div>

                {/* Sana */}
                <div className="dl-field">
                  <label className="dl-label">{t('demoLesson.modal.date')}</label>
                  <DateInput
                    value={form.date}
                    onChange={(v) => setForm((f) => ({ ...f, date: v }))}
                  />
                </div>

                {/* Boshlanish vaqti */}
                <div className="dl-field">
                  <label className="dl-label">{t('demoLesson.modal.startTime')}</label>
                  <TimeInput
                    value={form.start_time}
                    onChange={(v) => setForm((f) => ({ ...f, start_time: v }))}
                  />
                </div>

                {/* Tugash vaqti */}
                <div className="dl-field">
                  <label className="dl-label">{t('demoLesson.modal.endTime')}</label>
                  <TimeInput
                    value={form.end_time}
                    onChange={(v) => setForm((f) => ({ ...f, end_time: v }))}
                  />
                </div>

                {/* Xona */}
                <div className="dl-field">
                  <label className="dl-label">{t('demoLesson.modal.room')}</label>
                  <RoomSelect
                    value={form.room_id}
                    onChange={(v) => setForm((f) => ({ ...f, room_id: v }))}
                    rooms={rooms}
                    groups={groups}
                    formDate={form.date}
                    startTime={form.start_time}
                    endTime={form.end_time}
                  />
                </div>

                {/* O'qituvchi */}
                <div className="dl-field">
                  <label className="dl-label">{t('demoLesson.modal.teacher')}</label>
                  <NativeSelect
                    value={form.teacher_id}
                    onChange={(v) => setForm((f) => ({ ...f, teacher_id: v }))}
                    options={employeeOptions}
                    placeholder={t('demoLesson.modal.teacherPlaceholder')}
                  />
                </div>

                {/* Lidlar */}
                <div className="dl-field dl-field--full">
                  <label className="dl-label">Lidlar</label>
                  <LidMultiSelect
                    value={form.lid_ids}
                    onChange={(v) => setForm((f) => ({ ...f, lid_ids: v }))}
                    lids={allLids}
                  />
                </div>
              </div>
            </div>

            <div className="dl-modal-footer">
              <button className="dl-btn-save" onClick={handleSave} disabled={isSaving}>
                {isSaving ? t('demoLesson.modal.saving') : t('demoLesson.modal.save')}
              </button>
              <button className="dl-btn-cancel" onClick={() => setModalOpen(false)}>
                {t('demoLesson.modal.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DemoLessonPage;
