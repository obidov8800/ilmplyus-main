import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOptions, optionLabel, roomOptionLabel } from '@/api/options';
import { useTeacherOptions } from '@/api/teachers';
import { getFieldError } from '@/utils/apiError';
import { notifyError } from '@/utils/notify';
import { createGroup, fetchAllGroups, updateGroup } from './groups.service';
import { generateGroupName } from './groupName';
import DateInput from '@/components/DateInput';
import { AvailSelect, type AvailOption } from './AvailSelect';
import { isPreschoolBranch } from '@/utils/branchType';
import {
  PRESCHOOL_DEFAULT_DAYS,
  PRESCHOOL_END_TIME,
  PRESCHOOL_START_TIME,
  isPreschoolDefaultDays,
  nextPreschoolGroupName,
} from '@/utils/preschoolGroup';
import type { Group, GroupCreatePayload } from '@/types/group.types';
import './groupForm.css';

/*
 * «Guruh yaratish / tahrirlash» oynasi. Tartibi va ko'rinishi Admin'dagi guruh oynasi bilan bir xil:
 *   chapda  — Filial · (O'quv yili) · Kurs · Daraja · Guruh nomi · O'qituvchi · Xona
 *   o'ngda  — Boshlanish sanasi · Tugash sanasi · Boshlanish vaqti · Tugash vaqti · Dars kunlari · Kurs davomiyligi
 * Maktabga tayyorlov filialda: kurs/daraja/tugash sanasi/davomiylik so'ralmaydi va yuborilmaydi
 * (backend preschool'da ularni ixtiyoriy qiladi), kunlar dushanba–juma, vaqt 09:00–16:00, nom `0-A`, `0-B`…
 */

type WeekDayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

const WEEK_DAYS: { key: WeekDayKey; short: string }[] = [
  { key: 'monday', short: 'Du' },
  { key: 'tuesday', short: 'Se' },
  { key: 'wednesday', short: 'Ch' },
  { key: 'thursday', short: 'Pa' },
  { key: 'friday', short: 'Ju' },
  { key: 'saturday', short: 'Sha' },
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

  const hasAM = /AM/i.test(time);
  const hasPM = /PM/i.test(time);
  const clean = time.replace(/AM|PM/i, '').trim();

  const [hour, minute] = clean.split(':').map(Number);

  let h = hour;

  if (hasPM && h < 12) h += 12;
  if (hasAM && h === 12) h = 0;

  return h * 60 + minute;
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

    if (lessonDays.includes(day)) {
      lessons++;
    }

    current.setDate(current.getDate() + 1);
  }

  const diff = parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime);

  if (diff <= 0) return 0;

  return Math.round(lessons * (diff / 45));
}

function hasTimeOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return toMin(s1) < toMin(e2) && toMin(e1) > toMin(s2);
}

/** `09:00:00` → `09:00` (backend vaqtni sekundlar bilan qaytaradi). */
const hhmm = (time: string | null | undefined) => (time ? time.slice(0, 5) : '');

// ── HH:mm vaqt maydoni ───────────────────────────────────────────────────────

interface TimeInputProps {
  value: string;
  onChange: (val: string) => void;
}

function TimeInput({ value, onChange }: TimeInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/[^\d:]/g, '');

    if (val.length > 5) return;

    // qisman to'g'ri kiritishga ruxsat
    if (/^([01]?\d|2[0-3])(:([0-5]?\d)?)?$/.test(val)) {
      // avtomatik ":" qo‘shish
      if (val.length === 2 && !val.includes(':')) {
        onChange(val + ':');
      } else {
        onChange(val);
      }
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const match = e.target.value.match(/^(\d{1,2}):?(\d{1,2})?$/);

    if (!match) {
      onChange('');
      return;
    }

    const h = Number(match[1]);
    const m = Number(match[2] ?? 0);

    if (h > 23 || m > 59) {
      onChange('');
      return;
    }

    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }

  return (
    <input
      type="text"
      className="gf-time"
      placeholder="HH:mm"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      inputMode="numeric"
    />
  );
}

// ── Saqlash so'rovlari ───────────────────────────────────────────────────────

function useSaveGroup(editingGroupId: number | null | undefined, onClose: () => void, onCreated: () => void) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, GroupCreatePayload>({
    mutationFn: (payload) => (editingGroupId ? updateGroup(editingGroupId, payload) : createGroup(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      // Yangi guruh ochilganda ro'yxat oxirgi sahifaga o'tadi; tahrirlashda joyida qoladi.
      if (!editingGroupId) onCreated();
      onClose();
    },
  });
}

// ── Oyna ─────────────────────────────────────────────────────────────────────

interface FormState {
  branchId: number | null;
  courseId: number | null;
  levelId: number | null;
  roomId: number | null;
  days: WeekDayKey[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  teacherId: number | null;
  groupName: string;
  isManualName: boolean;
}

const EMPTY_FORM: FormState = {
  branchId: null,
  courseId: null,
  levelId: null,
  roomId: null,
  days: [],
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  teacherId: null,
  groupName: '',
  isManualName: false,
};

interface GroupFormModalProps {
  onClose: () => void;
  onCreated: () => void;
  groups: Group[];
  editingGroupId?: number | null;
}

export default function GroupFormModal({ onClose, onCreated, groups, editingGroupId }: GroupFormModalProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [form, setForm] = useState<FormState>(() => {
    const g = editingGroupId ? groups.find((gr) => gr.id === editingGroupId) : null;
    if (!g) return EMPTY_FORM;
    return {
      branchId: g.branch?.id ?? null,
      courseId: g.course?.id ?? null,
      levelId: g.level?.id ?? null,
      roomId: g.room?.id || null,
      days: (g.days ?? []) as WeekDayKey[],
      startDate: g.start_date || '',
      endDate: g.end_date || '',
      startTime: hhmm(g.start_time),
      endTime: hhmm(g.end_time),
      teacherId: g.teacher?.id || null,
      groupName: g.name,
      isManualName: true,
    };
  });
  const [submitTried, setSubmitTried] = useState(false);

  const { branchId, courseId, levelId, roomId, days, startDate, endDate, startTime, endTime, teacherId } = form;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const { data: branches } = useOptions('branches');
  // Xona va o'qituvchi faqat TANLANGAN FILIALniki (avval hamma filial xonalari va hamma xodim chiqardi)
  const { data: rooms, isLoading: roomsLoading } = useOptions(
    'rooms',
    { branch_id: branchId ?? undefined },
    { enabled: !!branchId },
  );
  const { data: activeYears } = useOptions('academic_years', { status: 'active' });

  // Nom generatsiyasi va band nomlarni bilish uchun barcha guruhlar kerak — `groups` faqat joriy sahifa bo'lishi mumkin.
  const { data: allGroups } = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: fetchAllGroups,
  });
  const knownGroups = allGroups ?? groups;

  const editingGroup = editingGroupId ? groups.find((gr) => gr.id === editingGroupId) : null;

  // O'qituvchi: `/options/teachers?branch_id=` — shu filialning pedagogik bo'limda faol shartnomali xodimlari
  // (tahrirlanayotgan guruhning joriy o'qituvchisi doim qoladi)
  const { teachers: teacherList, isLoading: teachersLoading } = useTeacherOptions(
    branchId,
    editingGroup?.teacher
      ? [
          {
            id: editingGroup.teacher.id,
            label: [editingGroup.teacher.last_name, editingGroup.teacher.first_name].filter(Boolean).join(' '),
          },
        ]
      : [],
  );

  // Maktabga tayyorlov (preschool) filialida guruh o'quv yiliga bog'lanadi. Yilni backend o'zi qo'yadi
  // (`POST/PUT /groups` `academic_year_id` qabul qilmaydi): yangi guruh — faol yilga, mavjud guruh — o'z yilida
  // qoladi. Shu sabab formada yil tanlanmaydi, faqat qaysi yilga tushishi ko'rsatiladi.
  const isPreschoolGroup = isPreschoolBranch(branches?.find((b) => b.id === branchId));
  const keepsOwnYear = !!editingGroup?.academic_year && editingGroup.branch?.id === branchId;
  const academicYearLabel = keepsOwnYear
    ? (editingGroup?.academic_year?.name ?? null)
    : (activeYears?.[0]?.label ?? null);
  const academicYearId = keepsOwnYear ? (editingGroup?.academic_year?.id ?? null) : (activeYears?.[0]?.id ?? null);
  const missingAcademicYear = isPreschoolGroup && !academicYearLabel;

  const { data: courses } = useOptions(
    'courses',
    { branch_id: branchId ?? undefined },
    { enabled: !!branchId && !isPreschoolGroup },
  );

  const mutation = useSaveGroup(editingGroupId, onClose, onCreated);
  // Backend 422: «O'qituvchi shu filial xodimi emas» / «pedagogik bo'limda faol shartnomasi yo'q» / «Xona shu filialga tegishli emas» —
  // xabar maydon tagida ko'rinadi va shu maydon o'zgarsa yo'qoladi (xatoga sabab bo'lgan qiymat bilan birga saqlanadi).
  const [serverErr, setServerErr] = useState<{
    teacherId: number | null;
    teacher?: string;
    roomId: number | null;
    room?: string;
  }>({ teacherId: null, roomId: null });

  const selectedRoom = useMemo(() => {
    if (!roomId || !rooms) return null;
    return rooms.find((r) => r.id === roomId) ?? null;
  }, [roomId, rooms]);

  const selectedCourse = useMemo(() => {
    if (!courseId || !courses) return null;
    return courses.find((c) => c.id === courseId) ?? null;
  }, [courseId, courses]);

  const duration = calcDuration(startDate, endDate, startTime, endTime, days);

  // Xona / o'qituvchi band: boshqa guruhda tanlangan kunlardan biri va vaqt kesishsa.
  const isBusy = (match: (g: Group) => boolean) =>
    days.length > 0 &&
    knownGroups.some(
      (g) =>
        g.id !== editingGroupId &&
        match(g) &&
        days.some((d) => g.days?.includes(d)) &&
        (!startTime || !endTime || hasTimeOverlap(startTime, endTime, g.start_time, g.end_time)),
    );

  const roomOptions: AvailOption[] = (rooms ?? []).map((r) => ({
    value: String(r.id),
    label: roomOptionLabel(r, lang),
    busy: isBusy((g) => g.room?.id === r.id),
  }));

  const teacherOptions: AvailOption[] = teacherList.map((e) => ({
    value: String(e.id),
    label: e.label,
    busy: isBusy((g) => g.teacher?.id === e.id),
  }));

  const autoGroupName = useMemo(() => {
    if (isPreschoolGroup) {
      if (!academicYearId) return '';
      // `0-A`, `0-B`… — shu filial va shu o'quv yilidagi band nomlar o'tkazib yuboriladi (backend nomni yil ichida takrorlatmaydi).
      return nextPreschoolGroupName(
        knownGroups
          .filter(
            (g) =>
              g.id !== editingGroupId &&
              g.branch?.id === branchId &&
              (g.academic_year_id ?? g.academic_year?.id) === academicYearId,
          )
          .map((g) => g.name),
      );
    }

    if (!branchId || !courseId || !levelId) return '';

    const branch = branches?.find((b) => b.id === branchId);
    const course = courses?.find((c) => c.id === courseId);
    const level = selectedCourse?.levels?.find((l) => l.id === levelId);

    if (!branch || !course || !level) return '';

    return generateGroupName(branch.label, course.label, optionLabel(level, lang), knownGroups);
  }, [
    isPreschoolGroup,
    academicYearId,
    branchId,
    courseId,
    levelId,
    branches,
    courses,
    selectedCourse,
    knownGroups,
    editingGroupId,
    lang,
  ]);

  const finalGroupName = form.isManualName ? form.groupName : autoGroupName;

  // Majburiy maydonlar (maktabga tayyorlov filialda kurs/daraja/tugash sanasi yo'q)
  const missing = {
    branch: !branchId,
    course: !isPreschoolGroup && !courseId,
    level: !isPreschoolGroup && !levelId,
    name: !finalGroupName,
    teacher: !teacherId,
    room: !roomId,
    startDate: !startDate,
    endDate: !isPreschoolGroup && !endDate,
    startTime: !startTime,
    endTime: !endTime,
    days: days.length === 0,
  };
  const hasMissing = Object.values(missing).some(Boolean);
  const invalid = (key: keyof typeof missing) => (submitTried && missing[key] ? ' gf-field--invalid' : '');

  function onBranchChange(value: string) {
    const nextId = Number(value) || null;
    const toPreschool = isPreschoolBranch(branches?.find((b) => b.id === nextId));
    setForm((prev) => ({
      ...prev,
      branchId: nextId,
      courseId: null,
      levelId: null,
      // Xona va o'qituvchi filialga bog'liq — filial o'zgarsa qayta tanlanadi
      roomId: prev.branchId === nextId ? prev.roomId : null,
      teacherId: prev.branchId === nextId ? prev.teacherId : null,
      // Maktabga tayyorlov filialda nom, hafta kunlari va dars vaqti tayyor keladi; oddiy filialga qaytilsa
      // (foydalanuvchi o'zgartirmagan bo'lsa) tozalanadi.
      ...(toPreschool || isPreschoolGroup ? { isManualName: false, groupName: '' } : {}),
      ...(toPreschool
        ? {
            days: prev.days.length ? prev.days : ([...PRESCHOOL_DEFAULT_DAYS] as WeekDayKey[]),
            startTime: prev.startTime || PRESCHOOL_START_TIME,
            endTime: prev.endTime || PRESCHOOL_END_TIME,
          }
        : isPreschoolGroup
          ? {
              days: isPreschoolDefaultDays(prev.days) ? [] : prev.days,
              startTime: prev.startTime === PRESCHOOL_START_TIME ? '' : prev.startTime,
              endTime: prev.endTime === PRESCHOOL_END_TIME ? '' : prev.endTime,
            }
          : {}),
    }));
  }

  function toggleDay(day: WeekDayKey) {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
    }));
  }

  function handleSubmit() {
    setSubmitTried(true);
    if (hasMissing) notifyError(t('groups.form.requiredError'));
    if (hasMissing || missingAcademicYear || !branchId || !roomId || !teacherId) return;

    const common = {
      name: finalGroupName.trim(),
      branch_id: branchId,
      teacher_id: teacherId,
      room_id: roomId,
      max_students: selectedRoom?.capacity ?? 0,
      start_date: startDate,
      start_time: startTime,
      end_time: endTime,
      days,
    };

    // Maktabga tayyorlov filialda kurs, daraja, tugash sanasi va davomiylik yuborilmaydi (backend: preschool'da ixtiyoriy).
    mutation.mutate(
      isPreschoolGroup
        ? common
        : {
            ...common,
            course_id: courseId as number,
            level_id: levelId as number,
            end_date: endDate,
            duration,
          },
      {
        onError: (error) =>
          setServerErr({
            teacherId,
            teacher: getFieldError(error, 'teacher_id'),
            roomId,
            room: getFieldError(error, 'room_id'),
          }),
      },
    );
  }

  const title = editingGroupId ? t('groups.form.editTitle') : t('groups.createGroupTitle');

  return (
    <div className="gf-overlay">
      <div className="gf-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3 className="gf-title">{title}</h3>

        <div className="gf-form">
          <div className="gf-col">
            <div className={`gf-field${invalid('branch')}`}>
              <label>{t('groups.form.branch')}</label>
              <select value={branchId ?? ''} onChange={(e) => onBranchChange(e.target.value)}>
                <option value="">{t('groups.form.choose')}</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            {isPreschoolGroup && (
              <div className="gf-field">
                <label>{t('groups.academicYear')}</label>
                <div className={`gf-static${missingAcademicYear ? ' gf-static--missing' : ''}`}>
                  {academicYearLabel ?? t('groups.noActiveAcademicYear')}
                </div>
                {academicYearLabel && (
                  <span className="gf-hint">
                    {keepsOwnYear ? t('groups.academicYearKept') : t('groups.academicYearAuto')}
                  </span>
                )}
              </div>
            )}

            {!isPreschoolGroup && (
              <>
                <div className={`gf-field${invalid('course')}`}>
                  <label>{t('groups.form.course')}</label>
                  <select
                    value={courseId ?? ''}
                    disabled={!branchId}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, courseId: Number(e.target.value) || null, levelId: null }))
                    }
                  >
                    <option value="">{branchId ? t('groups.form.choose') : t('groups.form.selectBranch')}</option>
                    {courses?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`gf-field${invalid('level')}`}>
                  <label>{t('groups.form.level')}</label>
                  <select
                    value={levelId ?? ''}
                    disabled={!courseId}
                    onChange={(e) => setField('levelId', Number(e.target.value) || null)}
                  >
                    <option value="">{courseId ? t('groups.form.choose') : t('groups.form.selectCourse')}</option>
                    {selectedCourse?.levels?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {optionLabel(l, lang)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className={`gf-field${invalid('name')}`}>
              <label>{t('groups.form.groupName')}</label>
              <input
                type="text"
                value={finalGroupName}
                disabled={!isPreschoolGroup && !levelId}
                placeholder={
                  isPreschoolGroup
                    ? t('groups.preschoolNamePlaceholder')
                    : levelId
                      ? ''
                      : t('groups.form.selectLevel')
                }
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    groupName: e.target.value.toUpperCase(),
                    // Maktabga tayyorlov filialda nom to'liq o'chirilsa — yana avtomatik nomga qaytadi.
                    isManualName: isPreschoolGroup ? e.target.value !== '' : true,
                  }))
                }
              />
              {isPreschoolGroup && !form.isManualName && finalGroupName && (
                <span className="gf-hint">{t('groups.preschoolNameHint')}</span>
              )}
            </div>

            <div className={`gf-field${invalid('teacher')}`}>
              <label>{t('groups.form.teacher')}</label>
              <AvailSelect
                value={teacherId ? String(teacherId) : ''}
                options={teacherOptions}
                placeholder={branchId ? t('groups.form.choose') : t('groups.form.selectBranch')}
                busyLabel={t('groups.form.busy')}
                freeLabel={t('groups.form.free')}
                disabled={!branchId}
                onChange={(v) => setField('teacherId', Number(v) || null)}
              />
              {!!branchId && !teachersLoading && teacherOptions.length === 0 && (
                <span className="gf-hint gf-hint--error">{t('groups.noTeachers')}</span>
              )}
              {serverErr.teacher && serverErr.teacherId === teacherId && (
                <span className="gf-hint gf-hint--error">{serverErr.teacher}</span>
              )}
            </div>

            <div className={`gf-field${invalid('room')}`}>
              <label>{t('groups.form.room')}</label>
              <AvailSelect
                value={roomId ? String(roomId) : ''}
                options={roomOptions}
                placeholder={branchId ? t('groups.form.choose') : t('groups.form.selectBranch')}
                busyLabel={t('groups.form.busy')}
                freeLabel={t('groups.form.free')}
                disabled={!branchId}
                onChange={(v) => setField('roomId', Number(v) || null)}
              />
              {!!branchId && !roomsLoading && roomOptions.length === 0 && (
                <span className="gf-hint gf-hint--error">{t('groups.noRooms')}</span>
              )}
              {serverErr.room && serverErr.roomId === roomId && (
                <span className="gf-hint gf-hint--error">{serverErr.room}</span>
              )}
              {selectedRoom && (
                <span className="gf-hint gf-hint--room">
                  {t('groups.form.capacity')}: <strong>{selectedRoom.capacity}</strong> {t('groups.form.pieces')}
                  {selectedRoom.floor != null && ` · ${selectedRoom.floor}-${t('groups.form.floor')}`}
                </span>
              )}
            </div>
          </div>

          <div className="gf-col">
            <div className={`gf-field${invalid('startDate')}`}>
              <label>{t('groups.form.startDate')}</label>
              <DateInput value={startDate} onChange={(e) => setField('startDate', e.target.value)} />
            </div>

            {!isPreschoolGroup && (
              <div className={`gf-field${invalid('endDate')}`}>
                <label>{t('groups.form.endDate')}</label>
                <DateInput value={endDate} onChange={(e) => setField('endDate', e.target.value)} />
              </div>
            )}

            <div className={`gf-field${invalid('startTime')}`}>
              <label>{t('groups.form.startTime')}</label>
              <TimeInput value={startTime} onChange={(v) => setField('startTime', v)} />
            </div>

            <div className={`gf-field${invalid('endTime')}`}>
              <label>{t('groups.form.endTime')}</label>
              <TimeInput value={endTime} onChange={(v) => setField('endTime', v)} />
            </div>

            <div className={`gf-field${invalid('days')}`}>
              <label>{t('groups.form.lessonDays')}</label>
              <div className="gf-days">
                {WEEK_DAYS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={days.includes(d.key)}
                    className={`gf-day${days.includes(d.key) ? ' gf-day--on' : ''}`}
                    onClick={() => toggleDay(d.key)}
                  >
                    {t(`groups.days.${d.key}Short`, { defaultValue: d.short })}
                  </button>
                ))}
              </div>
            </div>

            {!isPreschoolGroup && (
              <div className="gf-field">
                <label>{t('groups.form.duration')}</label>
                <div className={`gf-duration${duration > 0 ? ' gf-duration--set' : ''}`}>
                  {duration > 0 ? (
                    <>
                      <strong>{duration}</strong> {t('groups.form.hours')}
                    </>
                  ) : (
                    t('groups.form.durationAuto')
                  )}
                </div>
                {duration > 0 && <span className="gf-hint">{t('groups.form.durationHint')}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="gf-actions">
          <button
            type="button"
            className="gf-btn gf-btn--primary"
            onClick={handleSubmit}
            disabled={mutation.isPending || missingAcademicYear}
          >
            {mutation.isPending ? t('groups.saving') : t('groups.save')}
          </button>
          <button type="button" className="gf-btn gf-btn--cancel" onClick={onClose}>
            {t('groups.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
