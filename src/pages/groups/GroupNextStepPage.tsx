import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOptions, optionLabel, roomOptionLabel, type NestedOption } from '@/api/options';
import { useTeacherOptions } from '@/api/teachers';
import { getFieldError } from '@/utils/apiError';
import './groupStudents.css';
import type { Group, GroupCreatePayload } from '@/types/group.types';
import { createGroup, fetchAllGroups } from './groups.service';
import { generateGroupName } from './groupName';
import DateInput from '@/components/DateInput';

interface GroupNextStepPageProps {
  group: Group;
  onClose: () => void;
  onSaved: () => void;
}

type WeekDayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

const WEEK_DAYS: { key: WeekDayKey; label: string }[] = [
  { key: 'monday', label: 'Du' },
  { key: 'tuesday', label: 'Se' },
  { key: 'wednesday', label: 'Ch' },
  { key: 'thursday', label: 'Pa' },
  { key: 'friday', label: 'Ju' },
  { key: 'saturday', label: 'Sha' },
];

const DAY_INDEX: Record<WeekDayKey, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseTimeToMinutes(time: string): number {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function calcDuration(
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string,
  days: WeekDayKey[],
): number {
  if (!startDate || !endDate || !startTime || !endTime || days.length === 0) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start > end) return 0;
  const lessonDays = days.map((d) => DAY_INDEX[d]);
  let lessons = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay() === 0 ? 7 : current.getDay();
    if (lessonDays.includes(day)) lessons++;
    current.setDate(current.getDate() + 1);
  }
  const diff = parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime);
  if (diff <= 0) return 0;
  return Math.round(lessons * (diff / 45));
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
                onClick={() => {
                  onChange(`${h}:${currentMin || '00'}`);
                }}
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
                onClick={() => {
                  onChange(`${currentHour || '00'}:${m}`);
                }}
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

const GroupNextStepPage = ({ group, onClose, onSaved }: GroupNextStepPageProps) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();

  const [branchId, setBranchId] = useState<number>(group.branch?.id ?? 0);
  const [courseId, setCourseId] = useState<number>(group.course?.id ?? 0);
  const [levelId, setLevelId] = useState<number>(group.level?.id ?? 0);
  const [sourceGroupId, setSourceGroupId] = useState<number>(group.id);
  const [roomId, setRoomId] = useState<number>(0);
  const [teacherId, setTeacherId] = useState<number>(0);
  const [days, setDays] = useState<WeekDayKey[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isManualName, setIsManualName] = useState(false);
  const [manualName, setManualName] = useState('');

  const { data: branches } = useOptions('branches');
  // Xona va o'qituvchi faqat TANLANGAN FILIALniki; o'qituvchi — `/options/teachers?branch_id=` (pedagogik bo'limda faol shartnomali)
  const { data: rooms, isLoading: roomsLoading } = useOptions(
    'rooms',
    { branch_id: branchId || undefined },
    { enabled: !!branchId },
  );
  const { teachers: employees, isLoading: teachersLoading } = useTeacherOptions(branchId || null);

  const { data: allGroups } = useQuery<Group[]>({
    queryKey: ['groups-all-next'],
    queryFn: fetchAllGroups,
  });

  const { data: courses } = useOptions(
    'courses',
    { branch_id: branchId ?? undefined },
    { enabled: !!branchId },
  );

  const selectedCourse = useMemo(
    () => courses?.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  );

  const levels: NestedOption[] = selectedCourse?.levels ?? [];

  const selectedRoom = useMemo(() => rooms?.find((r) => r.id === roomId) ?? null, [rooms, roomId]);

  // Yangi guruh nomi tanlangan filial/kurs/daraja bo'yicha quriladi — manba
  // guruhning nomidan emas, chunki keyingi bosqichda daraja o'zgaradi.
  const autoGroupName = useMemo(() => {
    if (!branchId || !courseId || !levelId) return '';
    const branch = branches?.find((b) => b.id === branchId);
    const course = courses?.find((c) => c.id === courseId);
    const level = selectedCourse?.levels?.find((l) => l.id === levelId);
    if (!branch || !course || !level) return '';

    return generateGroupName(branch.label, course.label, optionLabel(level, lang), allGroups ?? []);
  }, [branchId, courseId, levelId, branches, courses, selectedCourse, allGroups, lang]);

  const finalGroupName = isManualName ? manualName : autoGroupName;

  const duration = calcDuration(startDate, endDate, startTime, endTime, days);

  function toggleDay(d: WeekDayKey) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  // Backend 422 (`teacher_id` / `room_id`) — maydon tagida, shu maydon o'zgarsa yo'qoladi
  const [serverErr, setServerErr] = useState<{ teacherId: number; teacher?: string; roomId: number; room?: string }>({
    teacherId: 0,
    roomId: 0,
  });

  const saveMutation = useMutation<void, Error, GroupCreatePayload>({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      onSaved();
    },
  });

  const timeError =
    startTime && endTime && parseTimeToMinutes(endTime) <= parseTimeToMinutes(startTime);

  function handleSave() {
    if (
      !finalGroupName ||
      !branchId ||
      !courseId ||
      !levelId ||
      !roomId ||
      !teacherId ||
      !startDate ||
      !endDate ||
      !startTime ||
      !endTime ||
      days.length === 0 ||
      timeError
    )
      return;

    saveMutation.mutate({
      name: finalGroupName.trim(),
      branch_id: branchId,
      course_id: courseId,
      level_id: levelId,
      teacher_id: teacherId,
      room_id: roomId,
      duration,
      max_students: selectedRoom?.capacity ?? 0,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      days,
    }, {
      onError: (error) =>
        setServerErr({
          teacherId,
          teacher: getFieldError(error, 'teacher_id'),
          roomId,
          room: getFieldError(error, 'room_id'),
        }),
    });
  }

  return (
    <div className="gnsp-container">
      <div className="gnsp-header">
        <span className="gnsp-header-title">
          {t('groups.nextStep.title', { defaultValue: 'KEYINGI BOSQICHGA O‘TKAZISH' })}
        </span>
      </div>

      <div className="gnsp-body">
        {/* Row 1: Guruh, Filial, Yangi guruh nomi, Kurs */}
        <div className="gnsp-field">
          <label>{t('groups.nextStep.group', { defaultValue: 'Guruh' })}</label>
          <div className="gnsp-select-wrap">
            <select
              value={sourceGroupId}
              onChange={(e) => setSourceGroupId(Number(e.target.value))}
            >
              <option value={0}>
                {t('groups.students.selectTest', { defaultValue: 'kiriting' })}
              </option>
              {allGroups?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name?.toUpperCase()}
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down" />
          </div>
        </div>

        <div className="gnsp-field">
          <label>{t('groups.nextStep.branch', { defaultValue: 'Filial' })}</label>
          <div className="gnsp-select-wrap">
            <select
              value={branchId}
              onChange={(e) => {
                const nextBranchId = Number(e.target.value);
                if (nextBranchId !== branchId) {
                  setRoomId(0);
                  setTeacherId(0);
                }
                setBranchId(nextBranchId);
                setCourseId(0);
                setLevelId(0);
              }}
            >
              <option value={0}></option>
              {branches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down" />
          </div>
        </div>

        <div className="gnsp-field">
          <label>
            {t('groups.nextStep.newGroupName', { defaultValue: 'Yangi guruh nomi (avto)' })}
          </label>
          <input
            type="text"
            className="gnsp-input-placeholder"
            value={finalGroupName}
            placeholder={t('groups.nextStep.newGroupNamePlaceholder', { defaultValue: 'kiriting' })}
            onChange={(e) => {
              setIsManualName(true);
              setManualName(e.target.value);
            }}
          />
        </div>

        <div className="gnsp-field">
          <label>{t('groups.nextStep.course', { defaultValue: 'Kurs' })}</label>
          <div className="gnsp-select-wrap">
            <select
              value={courseId}
              disabled={!branchId}
              onChange={(e) => {
                setCourseId(Number(e.target.value));
                setLevelId(0);
              }}
            >
              <option value={0}>{t('groups.selectOption', { defaultValue: 'tanlang' })}</option>
              {courses?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down" />
          </div>
        </div>

        {/* Row 2: Daraja, Hafta kunlari, Dars boshlanish sanasi, Tugash sanasi */}
        <div className="gnsp-field">
          <label>{t('groups.nextStep.level', { defaultValue: 'Daraja' })}</label>
          <div className="gnsp-select-wrap">
            <select
              value={levelId}
              disabled={!courseId}
              onChange={(e) => setLevelId(Number(e.target.value))}
            >
              <option value={0}>
                {t('groups.nextStep.levelPlaceholder', { defaultValue: 'kiriting' })}
              </option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {optionLabel(l, lang)}
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down" />
          </div>
        </div>

        <div className="gnsp-field">
          <label>{t('groups.nextStep.weekDays', { defaultValue: 'Hafta kunlari' })}</label>
          <div className="gnsp-select-wrap">
            <select
              value=""
              onChange={(e) => {
                const d = e.target.value as WeekDayKey;
                if (d) toggleDay(d);
              }}
            >
              <option value="">{t('groups.selectOption', { defaultValue: 'tanlang' })}</option>
              {WEEK_DAYS.map((wd) => (
                <option key={wd.key} value={wd.key}>
                  {wd.label}
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down" />
          </div>
          {days.length > 0 && (
            <div className="gnsp-days-wrap" style={{ marginTop: 6 }}>
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="gnsp-day-btn gnsp-day-btn--active"
                  onClick={() => toggleDay(d)}
                >
                  {WEEK_DAYS.find((wd) => wd.key === d)?.label ?? d}
                  <i className="fa-solid fa-xmark" style={{ marginLeft: 4, fontSize: 10 }} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="gnsp-field">
          <label>
            {t('groups.nextStep.startDate', { defaultValue: 'Dars boshlanish sanasi' })}
          </label>
          <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div className="gnsp-field">
          <label>{t('groups.nextStep.endDate', { defaultValue: 'Tugash sanasi' })}</label>
          <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        {/* Row 3: Boshlanish vaqti, Tugash vaqti, Xona, O'qtuvchi */}
        <div className="gnsp-field">
          <label>{t('groups.nextStep.startTime', { defaultValue: 'Boshlanish vaqti' })}</label>
          <TimeInput24 value={startTime} onChange={setStartTime} hasError={!!timeError} />
        </div>

        <div className="gnsp-field">
          <label>{t('groups.nextStep.endTime', { defaultValue: 'Tugash vaqti' })}</label>
          <TimeInput24 value={endTime} onChange={setEndTime} hasError={!!timeError} />
          {timeError && (
            <span style={{ fontSize: 11, color: '#E70A0A' }}>
              {t('groups.students.timeError', {
                defaultValue: 'Tugash vaqti boshlanish vaqtidan katta bolishi kerak',
              })}
            </span>
          )}
        </div>

        <div className="gnsp-field">
          <label>{t('groups.nextStep.room', { defaultValue: 'Xona' })}</label>
          <div className="gnsp-select-wrap">
            <select
              value={roomId}
              disabled={!branchId}
              onChange={(e) => setRoomId(Number(e.target.value))}
            >
              <option value={0}>
                {branchId
                  ? t('groups.selectOption', { defaultValue: 'tanlang' })
                  : t('groups.selectBranch')}
              </option>
              {rooms?.map((r) => (
                <option key={r.id} value={r.id}>
                  {roomOptionLabel(r, lang)}
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down" />
          </div>
          {!!branchId && !roomsLoading && !rooms?.length && (
            <span style={{ fontSize: 11, color: '#E70A0A' }}>{t('groups.noRooms')}</span>
          )}
          {serverErr.room && serverErr.roomId === roomId && (
            <span style={{ fontSize: 11, color: '#E70A0A' }}>{serverErr.room}</span>
          )}
        </div>

        <div className="gnsp-field">
          <label>{t('groups.nextStep.teacher', { defaultValue: 'O‘qtuvchi' })}</label>
          <div className="gnsp-select-wrap">
            <select
              value={teacherId}
              disabled={!branchId}
              onChange={(e) => setTeacherId(Number(e.target.value))}
            >
              <option value={0}>
                {branchId
                  ? t('groups.selectOption', { defaultValue: 'tanlang' })
                  : t('groups.selectBranch')}
              </option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.label}
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down" />
          </div>
          {!!branchId && !teachersLoading && employees.length === 0 && (
            <span style={{ fontSize: 11, color: '#E70A0A' }}>{t('groups.noTeachers')}</span>
          )}
          {serverErr.teacher && serverErr.teacherId === teacherId && (
            <span style={{ fontSize: 11, color: '#E70A0A' }}>{serverErr.teacher}</span>
          )}
        </div>

        {/* Footer buttons */}
        <div className="gnsp-footer">
          <button className="gnsp-btn-save" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending
              ? t('groups.saving', { defaultValue: 'Saqlanmoqda...' })
              : t('groups.nextStep.save', { defaultValue: 'Saqlash' })}
          </button>
          <button className="gnsp-btn-cancel" onClick={onClose}>
            {t('groups.nextStep.cancel', { defaultValue: 'Bekor qilish' })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupNextStepPage;
