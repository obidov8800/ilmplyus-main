import React, { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API, type SilentForbiddenConfig } from '../../api/api';
import { useGroupsData } from '@/pages/groups/useGroupsData';
import { fetchOptions, useOptions, type Option } from '@/api/options';
import './studentsAttendance.css';
import { usePermission } from '../../hooks/usePermission';
import { useDragScroll } from '../../hooks/useDragScroll';
import useAuthStore from '../../store/useAuthStore';
import ConfirmModal from '../../components/ConfirmModal';
import FormModal from '../../components/FormModal';
import GroupCard from '../../components/GroupCard';
import { formatDate, toTashkentDate } from '@/utils/date';
import { getApiErrorMessage } from '@/utils/apiError';
import { getLocalized } from '@/utils/getLocalized';
import { notifyError, notifySuccess, notifyWarning } from '@/utils/notify';
import type { Group } from '@/types/group.types';
import type { Lesson } from '@/types/lesson.types';
import type {
  Attendance,
  AttendanceMark,
  AttendanceStatus,
  GroupData,
  MonthlyAttendanceResponse,
  Student,
  StudentsResponse,
} from '@/types/studentsAttendance.types';

/** Backend status → badge klass + tarjima kaliti. */
const STUDENT_STATUS_META: Record<string, { key: string; cls: string }> = {
  active: { key: 'st_active', cls: 'aktiv' },
  Aktiv: { key: 'st_active', cls: 'aktiv' },
  frozen: { key: 'st_frozen', cls: 'frozen' },
  dropped: { key: 'st_dropped', cls: 'dropped' },
  graduated: { key: 'st_graduated', cls: 'graduated' },
  Noaktiv: { key: 'noaktiv', cls: 'noaktiv' },
};

/** Balans backenddan kelganmi (`/options/students` uni faqat `payments.create|students.show` bilan beradi). */
const hasBalance = (student: { balance?: unknown } | null | undefined): boolean =>
  student?.balance !== undefined && student?.balance !== null && student?.balance !== '' && Number.isFinite(Number(student.balance));

/** `1250000` → `1 250 000` (uzilmaydigan bo'shliq bilan). */
const formatMoney = (value: unknown): string =>
  Math.round(Number(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const getStatusMeta = (s?: string) =>
  STUDENT_STATUS_META[s ?? ''] ?? { key: 'st_active', cls: 'aktiv' };

/*
 * "Bugungi dars mavzusini kiriting" oynasi avval faqat ruxsatga
 * (`lessons.start` / `student_attendance.create`) qarab avtomatik ochilardi
 * — bu ruxsatlar odatda adminda ham bo'lgani uchun, admin har qanday
 * guruhni ochsa ham (o'sha guruhning o'qituvchisi bo'lmasa ham) oyna
 * chiqaverardi. Endi qo'shimcha shart: foydalanuvchi "Pedagog xodimlar"
 * bo'limiga tegishli bo'lishi kerak — nomi bo'yicha solishtiriladi, chunki
 * backend departmentlarni kod emas, nom orqali qaytaradi.
 * (`user.departments` — `dashboard-main`dagi bilan bir xil taxmin, ushbu
 * ilovada login qilib tasdiqlanmagan, `types/user.types.ts`ga qarang.)
 */
const TEACHING_DEPARTMENT_NAME = 'pedagog xodimlar';

const isTeachingDepartment = (name: string | undefined | null): boolean =>
  (name ?? '').trim().toLowerCase() === TEACHING_DEPARTMENT_NAME;

const isSameDay = (raw: unknown, today: Date): boolean => {
  const a = toTashkentDate(raw);
  return a !== '' && a === toTashkentDate(today);
};

const DAY_INDEX: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'reason'];

/**
 * Baho — 1 dan 5 gacha (besh ballik tizim). Backend kengroq qabul qiladi (`nullable|numeric|min:0|max:100`,
 * ustun integer) — chegara shu yerda. Eski yozuvlarda 100 ballik qiymat (masalan 85) bo'lishi mumkin: u jadvalda
 * o'z holicha ko'rinadi, oynada esa o'zgartirilmaguncha saqlanib qoladi.
 */
const GRADES = [1, 2, 3, 4, 5] as const;
const isScaleGrade = (value: number | null): boolean =>
  value !== null && (GRADES as readonly number[]).includes(value);
const COMMENT_MAX = 500;
const TOPIC_MAX = 255;

/**
 * Dars yaratishda backend `homework_title_uz` ni majburiy qiladi, uy vazifasi esa dars OXIRIDA beriladi.
 * Shu sabab dars boshlanganda vaqtincha shu belgi yoziladi — Darslar sahifasi uni «vazifa hali berilmagan»
 * deb tushunadi (`pages/lessons`: `HOMEWORK_PLACEHOLDER`).
 */
const HOMEWORK_PLACEHOLDER = '—';

/**
 * Katakchani bosganda nima qilinadi:
 *  - `create` — yangi belgi (POST);
 *  - `put`    — mavjud yozuvni o'zgartirish (PUT, backend `student_attendance.update`);
 *  - `upsert` — faqat «qo'shish» ruxsati bor o'qituvchi dars DAVOMIDA xato belgini tuzatadi:
 *               backend `store` shu o'quvchi+sana yozuvi bo'lsa uni yangilaydi (POST).
 */
type CellMode = 'create' | 'put' | 'upsert';

interface SelectedCell {
  studentId: number;
  date: string;
  attendance?: Attendance;
  mode: CellMode;
}

type ApiError = { response?: { status?: number; data?: { message?: unknown } } };

const AttendanceDot = memo(
  ({
    status,
    grade,
    onClick,
  }: {
    status?: Attendance['status'];
    grade?: number | null;
    onClick: () => void;
  }) => {
    let className = 'attendance-dot dot-empty';
    if (status === 'present') className = 'attendance-dot dot-present';
    if (status === 'absent') className = 'attendance-dot dot-absent';
    if (status === 'late') className = 'attendance-dot dot-late';
    if (status === 'reason') className = 'attendance-dot dot-reason';

    return (
      <div className={className} onClick={onClick}>
        {grade !== undefined && grade !== null && <span className="grade-value">{grade}</span>}
      </div>
    );
  },
);

/** Davomat va baho oynasi (bitta o'quvchi, bitta dars kuni). */
const MarkModal = ({
  studentName,
  dateLabel,
  initial,
  onSave,
  onCancel,
  onDelete,
  busy,
  canDelete,
}: {
  studentName: string;
  dateLabel: string;
  initial?: Attendance;
  onSave: (mark: AttendanceMark) => void;
  onCancel: () => void;
  onDelete: () => void;
  busy: boolean;
  canDelete: boolean;
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AttendanceStatus | undefined>(initial?.status);
  const [grade, setGrade] = useState<number | null>(
    initial?.score !== undefined && initial?.score !== null && Number.isFinite(Number(initial.score))
      ? Number(initial.score)
      : null,
  );
  const [comment, setComment] = useState<string>(initial?.comment_uz ?? '');

  // Eski (100 ballik) baho — yangi tanlanmaguncha o'zgarishsiz saqlanadi.
  const legacyGrade = grade !== null && !isScaleGrade(grade) ? grade : null;
  const canSave = !!status && !busy;

  const handleSave = () => {
    if (!status) return;
    onSave({ status, grade, comment: status === 'reason' ? comment.trim() : '' });
  };

  return (
    <FormModal
      open
      size="sm"
      className="sam"
      title={t('studentsAttendance.mark_title')}
      subtitle={`${studentName} · ${dateLabel}`}
      busy={busy}
      onClose={onCancel}
      onSubmit={handleSave}
      footer={
        <>
          {canDelete && (
            <button
              type="button"
              className="fm-btn fm-btn--danger-text fm-footer__start"
              disabled={busy}
              onClick={onDelete}
            >
              {t('studentsAttendance.delete')}
            </button>
          )}
          <button type="button" className="fm-btn fm-btn--ghost" disabled={busy} onClick={onCancel}>
            {t('studentsAttendance.cancel')}
          </button>
          <button
            type="submit"
            className="fm-btn fm-btn--primary"
            disabled={!canSave}
            title={!status ? t('studentsAttendance.status_required') : undefined}
          >
            {busy ? t('studentsAttendance.saving') : t('studentsAttendance.save')}
          </button>
        </>
      }
    >
      <div className="fm-field">
        <span className="fm-label">
          {t('studentsAttendance.davomat')}
          <span className="fm-req">*</span>
        </span>
        <div className="sam-statuses" role="radiogroup" aria-label={t('studentsAttendance.davomat')}>
          {ATTENDANCE_STATUSES.map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={status === opt}
              className={`sam-status sam-status--${opt}${status === opt ? ' is-active' : ''}`}
              disabled={busy}
              onClick={() => setStatus(opt)}
            >
              <span className={`legend-dot dot-${opt}`} />
              {t(`studentsAttendance.${opt}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="fm-field">
        <span className="fm-label">
          {t('studentsAttendance.baho')}
          <span className="fm-label__note">({t('studentsAttendance.grade_hint')})</span>
        </span>
        <div className="sam-grades" role="radiogroup" aria-label={t('studentsAttendance.baho')}>
          {GRADES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={grade === value}
              className={`sam-grade sam-grade--${value}${grade === value ? ' is-active' : ''}`}
              disabled={busy}
              // Tanlangan bahoni qayta bosish — bahoni olib tashlaydi.
              onClick={() => setGrade(grade === value ? null : value)}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={grade === null}
            className={`sam-grade sam-grade--none${grade === null ? ' is-active' : ''}`}
            disabled={busy}
            onClick={() => setGrade(null)}
          >
            {t('studentsAttendance.no_grade')}
          </button>
        </div>
        {legacyGrade !== null && (
          <span className="fm-hint">{t('studentsAttendance.grade_legacy', { value: legacyGrade })}</span>
        )}
      </div>

      {status === 'reason' && (
        <div className="fm-field">
          <label className="fm-label" htmlFor="sam-reason">
            {t('studentsAttendance.reason_label')}
          </label>
          <textarea
            id="sam-reason"
            className="fm-textarea sam-reason"
            value={comment}
            maxLength={COMMENT_MAX}
            disabled={busy}
            placeholder={t('studentsAttendance.reason_placeholder')}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      )}
    </FormModal>
  );
};

const GroupSelector: React.FC = () => {
  const { groups: allGroups } = useGroupsData({ params: { limit: 1000 }, scope: 'student_attendance' });
  // Maktabga tayyorlov (preschool) guruhlar davomati alohida bo'limda (`/preschool-attendance`): backend oddiy davomatni
  // preschool guruhga belgilashni rad etadi. Preschool guruh o'quv yiliga bog'langan (`academic_year_id`).
  const groups: Group[] = allGroups.filter((g) => (g as { academic_year_id?: number | null }).academic_year_id == null);

  return (
    <div className="group-selector-wrapper">
      <h3 className="group-selector-title">Guruhni tanlang</h3>
      <div className="group-cards-grid">
        {groups.map((g) => (
          <GroupCard key={g.id} group={g} />
        ))}
      </div>
    </div>
  );
};

const StudentsAttendance: React.FC = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId');

  // Sahifaning o'zi `student_attendance.view` bilan cheklangan (marshrutda).
  // Bu yerdagilar esa ICHKI amallarni cheklaydi — backend marshrutlari bilan BIR XIL:
  //  - lessons.create — bugungi dars yozuvini yaratish (`POST /lessons`);
  //  - lessons.edit — darsni boshlash/tugatish (`POST /lessons/{id}/start|end`; alohida `start/end`
  //    ruxsati bazada YO'Q);
  //  - student_attendance.create — yangi davomat/baho (`POST /student_attendance`). Backend buni faqat
  //    BOSHLANGAN (ongoing) dars sanasiga qabul qiladi va shu o'quvchi+sana yozuvi bo'lsa uni yangilaydi;
  //  - student_attendance.update — mavjud yozuvni o'zgartirish (`PUT`). DIQQAT: Rollar sahifasidagi
  //    «Tahrirlash» (`.edit`) ni backend marshruti tekshirmaydi — `permissionDeps` ikkalasini birga beradi;
  //  - student_attendance.delete — yozuvni o'chirish.
  const canEditLesson = usePermission('lessons.edit');
  const canCreateLesson = usePermission('lessons.create');
  const canCreateAttendance = usePermission('student_attendance.create');
  const canUpdateAttendance = usePermission('student_attendance.update');
  const canDeleteAttendance = usePermission('student_attendance.delete');
  const canEndLesson = canEditLesson;

  // Tahrirlash ruxsati (`student_attendance.update`; Rollar sahifasida «Tahrirlash» bilan birga belgilanadi) bo'lsa —
  // o'qituvchi ham — istalgan O'TGAN dars sanasidagi MAVJUD davomat/bahoni o'zgartira oladi (backend `PUT` da dars
  // holatini tekshirmaydi; begona guruh — 403). Ilgari bunga guruhlarni yaratish/tahrirlash ruxsati ham kerak edi.
  // Kelajak sanalar va o'tgan kunga YANGI belgi (backend faqat boshlangan darsga qabul qiladi) — yopiq.

  // Jadval keng bo'lganda sichqoncha bilan ushlab surish.
  const { ref: tableScrollRef, onMouseDown: onTableScrollMouseDown } =
    useDragScroll<HTMLDivElement>();
  const mobileCardsRef = useRef<HTMLDivElement>(null);

  // "Dars mavzusini kiriting" oynasi ruxsatdan tashqari — faqat pedagog
  // xodim kirganda avtomatik ochilishi uchun.
  const currentUser = useAuthStore((s) => s.user);
  const isTeachingStaff = (currentUser?.departments ?? []).some((d) =>
    isTeachingDepartment(d.name_uz),
  );

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [startTopic, setStartTopic] = useState('');
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [autoPrompted, setAutoPrompted] = useState(false);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const todayStr = useMemo(() => toTashkentDate(new Date()), []);

  // Guruh o'quvchilari — ruxsatga qarab (so'rovdan OLDIN tekshiriladi, ruxsatsiz so'rov yuborilmaydi):
  //  `students.view` — `/students` (guruh bo'yicha ajratiladi); `groups.show` — `/groups/{id}/students` (o'qituvchi);
  //  aks holda — tanlov ro'yxati `/options/students?group_id=` (faqat ism).
  const canViewStudents = usePermission('students.view');
  const canShowGroup = usePermission('groups.show');
  const canViewLessons = usePermission('lessons.view');
  const { data: studentsData } = useQuery<StudentsResponse>({
    queryKey: ['students', groupId, canViewStudents, canShowGroup],
    queryFn: async () => {
      if (canViewStudents) {
        const res = await API.get('/students', { params: { per_page: 1000 } });
        const all: Student[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        return { data: all.filter((s) => s.groups?.some((g) => g.id === Number(groupId))) };
      }
      if (canShowGroup) {
        const res = await API.get(`/groups/${groupId}/students`, { skip403Toast: true } as SilentForbiddenConfig);
        const list = res.data?.students ?? res.data?.data ?? [];
        return { data: (Array.isArray(list) ? list : []) as Student[] };
      }
      const rows = await fetchOptions('students', { group_id: groupId }, { skip403Toast: true });
      return { data: rows.map((o) => ({ id: o.id, first_name: o.label, last_name: '' }) as unknown as Student) };
    },
    enabled: !!groupId,
  });

  // Guruh tafsiloti (nomi, dars kunlari): `groups.show` bo'lsa `/groups/{id}`, bo'lmasa tanlov ro'yxatidan.
  const { data: fullGroupData } = useQuery<GroupData>({
    queryKey: ['group', groupId],
    queryFn: () => API.get(`/groups/${groupId}`).then((res) => res.data.data ?? res.data),
    enabled: !!groupId && canShowGroup,
  });
  const { data: groupOptionRows = [] } = useOptions('groups', undefined, { enabled: !!groupId && !canShowGroup });
  const groupData: GroupData | undefined = canShowGroup
    ? fullGroupData
    : (() => {
        const o = groupOptionRows.find((row) => String(row.id) === String(groupId)) as
          | (Option & { days?: string[]; start_time?: string; end_time?: string })
          | undefined;
        return o
          ? ({ id: o.id, name: o.label, days: o.days ?? [], start_time: o.start_time, end_time: o.end_time } as unknown as GroupData)
          : undefined;
      })();

  const { data: attendanceData } = useQuery<MonthlyAttendanceResponse>({
    queryKey: ['student_attendance', 'monthly', groupId, currentYear, currentMonth],
    queryFn: () =>
      API.get('/student_attendance/monthly', {
        params: {
          group_id: groupId,
          year: currentYear,
          month: currentMonth + 1,
        },
      }).then((res) => res.data),
    enabled: !!groupId,
  });

  // Davomat faqat "ongoing" dars paytida qo'yiladi — bugungi darsni topamiz.
  // `silentError: true` — `lessons.view` ruxsati yo'q bo'lsa, butun sahifani
  // "buzilgandek" ko'rsatadigan qizil xabar chiqmaydi; sahifa shunchaki
  // dars-holatiga bog'liq imkoniyatlarsiz (start/end) ishlashda davom etadi.
  const { data: lessonsData } = useQuery<Lesson[]>({
    queryKey: ['lessons', groupId],
    queryFn: () => {
      const config: SilentForbiddenConfig = {
        params: { group_id: groupId, per_page: 200 },
        skip403Toast: true,
      };
      return API.get('/lessons', config).then((res) => {
        const arr = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        return arr as Lesson[];
      });
    },
    // Darslar (bugungi dars holati) — faqat rolda «Darslar» ruxsati bo'lsa.
    enabled: !!groupId && canViewLessons,
    retry: false,
  });

  const todayLesson = useMemo(
    () =>
      (lessonsData ?? []).find(
        (l) => Number(l.group_id) === Number(groupId) && isSameDay(l.date, new Date()),
      ),
    [lessonsData, groupId],
  );
  const lessonStatus = todayLesson?.status;
  const lessonActive = lessonStatus === 'ongoing';

  // Darsni boshlash: yozuv bo'lsa — `lessons.edit` (start); bo'lmasa avval yaratiladi — `lessons.create` ham kerak.
  const canStartLesson = canEditLesson && (todayLesson ? true : canCreateLesson);

  // Bugun guruhning dars kunimi? (group.days asosida)
  const todayIsLessonDay = useMemo(() => {
    if (!groupData?.days) return false;
    const todayDow = new Date().getDay();
    return groupData.days.some((d) => DAY_INDEX[d.toLowerCase()] === todayDow);
  }, [groupData]);

  // Dars vaqti — guruhning start_time/end_time (masalan "15:00-16:30").
  const lessonTime = useMemo(() => {
    const g = groupData as Record<string, unknown> | undefined;
    const fmt = (v: unknown) => (typeof v === 'string' ? v.slice(0, 5) : '');
    const start = fmt(g?.start_time);
    const end = fmt(g?.end_time);
    if (!start && !end) return '';
    return end ? `${start}-${end}` : start;
  }, [groupData]);

  /**
   * Xato xabari — sahifaning O'ZI ko'rsatadi (so'rovlar `silentError` bilan ketadi, aks holda bitta xato uchun
   * ikkita bildirishnoma chiqardi: umumiy «• score: The score field…» va sahifaniki).
   */
  const showError = (error: unknown, fallbackKey: string) => {
    // Ish vaqtidan tashqarida bekor qilingan so'rov — xabari allaqachon chiqqan.
    if (axios.isCancel(error)) return;
    const response = (error as ApiError)?.response;
    const raw = typeof response?.data?.message === 'string' ? response.data.message : '';
    // Ruxsat middleware'ining inglizcha matni o'rniga tushunarli xabar; backendning o'zbekcha sababi
    // («Bu guruh sizga biriktirilmagan.») o'z holicha chiqadi.
    const message =
      response?.status === 403 && (!raw || /right permissions|unauthorized|forbidden/i.test(raw))
        ? t('studentsAttendance.no_permission')
        : getApiErrorMessage(error, t(fallbackKey));
    notifyError(message, t('studentsAttendance.notif_error_title'));
  };

  const showSuccess = (messageKey: string) =>
    notifySuccess(t(messageKey), t('studentsAttendance.notif_success_title'));

  const silent: SilentForbiddenConfig = { silentError: true };

  const invalidateAttendanceQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['student_attendance'] });
    // balansi davomatdan keyin o'zgaradi — o'quvchilar ro'yxatini ham yangilaymiz
    queryClient.invalidateQueries({ queryKey: ['students', groupId] });
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
  };

  /** Dars holati o'zgardi — shu sahifadagi ro'yxat ham, Darslar sahifasining keshi ham (`['lessons', …]`) yangilanadi. */
  const refreshLessons = () => queryClient.invalidateQueries({ queryKey: ['lessons'] });

  /** Dars allaqachon boshlangan/tugatilgan (409) — oyna yopiladi, holat qayta o'qiladi. */
  const closeStartOnConflict = (error: unknown) => {
    if ((error as ApiError)?.response?.status === 409) setStartModalOpen(false);
  };

  const startLessonMutation = useMutation({
    mutationFn: (id: number) => API.post(`/lessons/${id}/start`, undefined, silent),
    onSuccess: () => {
      setStartModalOpen(false);
      showSuccess('studentsAttendance.lesson_started');
    },
    onError: (error) => {
      closeStartOnConflict(error);
      showError(error, 'studentsAttendance.lesson_start_error');
    },
    // Xato bo'lsa ham (masalan 409 — allaqachon boshlangan) holatni yangilaymiz.
    onSettled: () => refreshLessons(),
  });

  // Bugungi dars yozuvi bo'lmasa — avval yaratamiz (mavzu bilan), so'ng boshlaymiz.
  const createAndStartMutation = useMutation({
    mutationFn: async (topic: string) => {
      const form = new FormData();
      form.append('group_id', String(groupId));
      form.append('date', todayStr);
      form.append('topic_uz', topic);
      // Backend `homework_title_uz` ni majburiy qiladi — uy vazifasi dars tugaganda Darslar sahifasida beriladi.
      form.append('homework_title_uz', HOMEWORK_PLACEHOLDER);
      const res = await API.post('/lessons', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        ...silent,
      });
      const created = (res.data?.data ?? res.data) as Lesson | undefined;
      if (created?.id) {
        await API.post(`/lessons/${created.id}/start`, undefined, silent);
      }
      return created;
    },
    onSuccess: () => {
      setStartModalOpen(false);
      setStartTopic('');
      showSuccess('studentsAttendance.lesson_started');
    },
    onError: (error) => {
      closeStartOnConflict(error);
      showError(error, 'studentsAttendance.lesson_start_error');
    },
    // Dars yaratilib, boshlash xato bergan bo'lsa ham — yozuv ro'yxatda paydo bo'ladi, qayta bosilganda faqat boshlanadi.
    onSettled: () => refreshLessons(),
  });

  const startBusy = startLessonMutation.isPending || createAndStartMutation.isPending;

  const handleConfirmStart = () => {
    if (startBusy) return;
    if (todayLesson) {
      startLessonMutation.mutate(todayLesson.id);
    } else if (startTopic.trim()) {
      createAndStartMutation.mutate(startTopic.trim());
    }
  };

  // Dars boshlanishi kerak bo'lgan holat (bugun dars kuni, hali ongoing/completed emas).
  const startNeeded =
    Boolean(todayLesson || todayIsLessonDay) &&
    lessonStatus !== 'ongoing' &&
    lessonStatus !== 'completed';

  // Guruh tanlangach / ma'lumot yuklangach — start modalini bir marta avtomatik ochamiz.
  // Effekt emas, render fazasida (ConfirmModal'dagi kabi) — cascading render bo'lmasligi uchun.
  // FAQAT darsni boshlash ruxsati bo'lganlar uchun — aks holda modal ochilib,
  // backend so'rovni rad etib (403) "Ruxsat yo'q" xabari chiqib qolardi. Va
  // FAQAT pedagog xodim uchun — aks holda shu ruxsatga ega admin/boshqa
  // xodim har qanday guruhni ochganida ham "mavzu kiriting" oynasi
  // bexosdan chiqaverardi.
  if (startNeeded && !autoPrompted && canStartLesson && isTeachingStaff) {
    setAutoPrompted(true);
    setStartModalOpen(true);
  }

  const endLessonMutation = useMutation({
    mutationFn: (id: number) => API.post(`/lessons/${id}/end`, undefined, silent),
    onSuccess: (_res, id) => {
      showSuccess('studentsAttendance.lesson_ended');
      // Dars tugagach — uy vazifasini biriktirish uchun darslar sahifasiga o'tamiz,
      // guruh + o'sha sana bilan modal avtomatik ochiladi. (Faqat MUVAFFAQIYATDA: ilgari xato bo'lsa ham
      // o'tib ketar, dars esa tugamagan holda qolardi.)
      navigate(`/lessons?groupId=${groupId}&date=${todayStr}&openHomework=1&lessonId=${id}`);
    },
    onError: (error) => showError(error, 'studentsAttendance.lesson_end_error'),
    onSettled: () => {
      setConfirmEndOpen(false);
      refreshLessons();
      invalidateAttendanceQueries();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Attendance) => API.post('/student_attendance', data, silent),
    onSuccess: () => {
      invalidateAttendanceQueries();
      setSelectedCell(null);
    },
    onError: (error) => showError(error, 'studentsAttendance.attendance_error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Pick<Attendance, 'status' | 'score' | 'comment_uz'> & { id: number }) =>
      API.put(`/student_attendance/${id}`, data, silent),
    onSuccess: () => {
      invalidateAttendanceQueries();
      setSelectedCell(null);
    },
    onError: (error) => showError(error, 'studentsAttendance.attendance_error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => API.delete(`/student_attendance/${id}`, silent),
    onSuccess: () => {
      invalidateAttendanceQueries();
      setSelectedCell(null);
    },
    onError: (error) => showError(error, 'studentsAttendance.attendance_error'),
  });

  const lessonDatesInMonth = useMemo(() => {
    if (!groupData?.days) return [];
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const lessonDays = groupData.days.map((d: string) => DAY_INDEX[d.toLowerCase()]);
    const result: number[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(currentYear, currentMonth, day);
      if (lessonDays.includes(date.getDay())) {
        result.push(day);
      }
    }
    return result;
  }, [currentYear, currentMonth, groupData]);

  const dateOf = useCallback(
    (day: number) =>
      `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    [currentYear, currentMonth],
  );

  const getWeekday = useCallback(
    (day: number) => {
      const date = new Date(currentYear, currentMonth, day);
      return t(`studentsAttendance.weekdays.${WEEKDAY_KEYS[date.getDay()]}`);
    },
    [currentYear, currentMonth, t],
  );

  /**
   * Katakcha bosilganda qaysi amal bajariladi (yoki `null` — yopiq):
   *  - bo'sh katak: faqat BUGUNGI boshlangan dars (backend boshqa sanaga yangi belgini rad etadi — 422);
   *  - mavjud belgi: `update` (tahrirlash) ruxsati bilan — bugungi va istalgan o'tgan sana;
   *    faqat `create` ruxsati bilan — bugungi dars davomida qayta saqlash (xatoni tuzatish).
   */
  const cellModeOf = useCallback(
    (dateStr: string, hasRecord: boolean): CellMode | null => {
      const liveToday = lessonActive && dateStr === todayStr;
      if (!hasRecord) return canCreateAttendance && liveToday ? 'create' : null;
      if (canUpdateAttendance && dateStr <= todayStr) return 'put';
      if (canCreateAttendance && liveToday) return 'upsert';
      return null;
    },
    [lessonActive, todayStr, canCreateAttendance, canUpdateAttendance],
  );

  const findAttendance = useCallback(
    (studentId: number, dateStr: string) =>
      (attendanceData?.[studentId] || []).find((a) => String(a.date).startsWith(dateStr)),
    [attendanceData],
  );

  const handleCellClick = useCallback(
    (studentId: number, day: number) => {
      const dateStr = dateOf(day);
      const attendance = findAttendance(studentId, dateStr);
      const mode = cellModeOf(dateStr, !!attendance);
      if (!mode) {
        // Yopiq katak — sababini aytamiz (ilgari bosilganda hech narsa bo'lmasdi).
        if (dateStr === todayStr && canCreateAttendance) {
          if (lessonStatus === 'completed') notifyWarning(t('studentsAttendance.lesson_closed'));
          else if (!lessonActive && (todayLesson || todayIsLessonDay)) notifyWarning(t('studentsAttendance.start_first'));
        } else if (dateStr < todayStr && !attendance && canUpdateAttendance) {
          notifyWarning(t('studentsAttendance.past_empty'));
        }
        return;
      }
      setSelectedCell({ studentId, date: dateStr, attendance, mode });
    },
    [dateOf, findAttendance, cellModeOf, todayStr, canCreateAttendance, canUpdateAttendance, lessonStatus, lessonActive, todayLesson, todayIsLessonDay, t],
  );

  // Telefonda har o'quvchi kartasidagi kunlar qatori gorizontal aylanadi — bugungi kun ko'rinib tursin.
  const todayDay = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    return y === currentYear && m === currentMonth + 1 ? d : null;
  }, [todayStr, currentYear, currentMonth]);
  const studentCount = studentsData?.data?.length ?? 0;
  useEffect(() => {
    if (todayDay === null) return;
    const center = (scroller: HTMLElement | null, target: HTMLElement | null) => {
      if (!scroller || !target) return;
      const offset = target.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
      scroller.scrollLeft += offset - (scroller.clientWidth - target.clientWidth) / 2;
    };
    mobileCardsRef.current?.querySelectorAll<HTMLElement>('.card-attendance-grid').forEach((grid) => {
      center(grid, grid.querySelector<HTMLElement>('.card-day-col.is-today'));
    });
    const table = tableScrollRef.current;
    if (table && table.scrollWidth > table.clientWidth) {
      center(table, table.querySelector<HTMLElement>('th.is-today'));
    }
  }, [todayDay, studentCount, lessonDatesInMonth, tableScrollRef]);

  if (!groupId)
    return (
      <div className="attendance-container container">
        <GroupSelector />
      </div>
    );

  const handleSaveAttendance = (mark: AttendanceMark) => {
    if (!selectedCell) return;
    // `score`/`comment_uz` — `null` ham yuboriladi: PUT'da so'rovda YO'Q maydon o'zgarmay qolardi
    // (bahoni o'chirib bo'lmasdi, «sababli»dan boshqa holatga o'tganda eski sabab qolib ketardi).
    const values = {
      status: mark.status,
      score: mark.grade,
      comment_uz: mark.comment || null,
    };

    if (selectedCell.mode === 'put' && selectedCell.attendance?.id) {
      updateMutation.mutate({ id: selectedCell.attendance.id, ...values });
    } else {
      createMutation.mutate({
        student_id: selectedCell.studentId,
        group_id: Number(groupId),
        date: selectedCell.date,
        ...values,
      });
    }
  };

  const handleDeleteAttendance = () => {
    if (selectedCell?.attendance?.id) {
      deleteMutation.mutate(selectedCell.attendance.id);
    }
  };

  const monthKeys = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sept',
    'oct',
    'nov',
    'dec',
  ];

  const selectedStudent = selectedCell
    ? studentsData?.data?.find((s) => s.id === selectedCell.studentId)
    : undefined;
  const selectedStudentName = selectedStudent
    ? `${selectedStudent.first_name ?? ''} ${selectedStudent.last_name ?? ''}`.trim()
    : '';
  const selectedDateLabel = selectedCell
    ? `${formatDate(selectedCell.date)}, ${t(
        `studentsAttendance.weekdays.${WEEKDAY_KEYS[new Date(`${selectedCell.date}T00:00:00`).getDay()]}`,
      )}`
    : '';
  const markBusy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const groupName = groupData?.name ?? '';
  const todayLessonTopic = todayLesson ? getLocalized(todayLesson, 'topic', i18n.language) : '';

  return (
    <div
      className={`attendance-container container${
        canEditLesson ? ' has-lesson-controls' : ''
      }`}
    >
      <button
        type="button"
        className="attendance-group-bar"
        onClick={() => navigate('/students-attendance')}
        title={t('studentsAttendance.change_group')}
      >
        <span className="attendance-group-bar__back" aria-hidden>
          ‹
        </span>
        <span className="attendance-group-bar__name">
          {t('studentsAttendance.group')}: {groupData?.name ?? '…'}
        </span>
        {studentsData?.data && (
          <span className="attendance-group-bar__count">
            · {studentsData.data.length} {t('studentsAttendance.students_short')}
          </span>
        )}
      </button>

      <div className="attendance-header">
        <div className="attendance-controls">
          <div className="year-selector">
            <button className="year-btn" onClick={() => setCurrentYear((p) => p - 1)}>
              ‹
            </button>
            <span className="year-display">{currentYear}</span>
            <button className="year-btn" onClick={() => setCurrentYear((p) => p + 1)}>
              ›
            </button>
          </div>
          <div className="month-pills">
            {monthKeys.map((m, idx) => (
              <button
                key={m}
                className={`month-pill${currentMonth === idx ? ' active' : ''}`}
                onClick={() => setCurrentMonth(idx)}
              >
                {t(`studentsAttendance.months.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="attendance-legend">
          <div className="legend-item">
            <div className="legend-dot dot-present" />
            {t('studentsAttendance.present')}
          </div>
          <div className="legend-item">
            <div className="legend-dot dot-absent" />
            {t('studentsAttendance.absent')}
          </div>
          <div className="legend-item">
            <div className="legend-dot dot-late" />
            {t('studentsAttendance.late')}
          </div>
          <div className="legend-item">
            <div className="legend-dot dot-reason" />
            {t('studentsAttendance.reason')}
          </div>
        </div>
      </div>

      <div
        className="desktop-table-container"
        ref={tableScrollRef}
        onMouseDown={onTableScrollMouseDown}
      >
        <table className="attendance-table">
          <thead>
            <tr>
              <th className="student-col-header">FISH</th>
              {lessonDatesInMonth.map((day) => (
                <th
                  key={day}
                  className={`attendance-col-header${day === todayDay ? ' is-today' : ''}`}
                  title={day === todayDay ? t('studentsAttendance.today') : undefined}
                >
                  <div className="weekday-header">{getWeekday(day)}</div>
                  <div className="date-header">{day}</div>
                </th>
              ))}
              <th className="balance-col-header">{t('studentsAttendance.oquvchi_balansi')}</th>
            </tr>
          </thead>
          <tbody>
            {studentsData?.data?.map((student) => (
              <tr key={student.id}>
                <td className="student-info-cell">
                  <div className="student-info-inner">
                    <img
                      src={`https://ui-avatars.com/api/?name=${student.first_name}+${student.last_name}`}
                      alt="avatar"
                      className="avatar"
                    />
                    <div className="student-text">
                      <span className="student-name">
                        {student.first_name} {student.last_name}
                      </span>
                      <span className="student-phone">{student.phone}</span>
                    </div>
                    <div className={`status-badge status-${getStatusMeta(student?.status).cls}`}>
                      {t(`studentsAttendance.${getStatusMeta(student?.status).key}`)}
                    </div>
                  </div>
                </td>
                {lessonDatesInMonth.map((day) => {
                  const dateStr = dateOf(day);
                  const att = findAttendance(student.id, dateStr);
                  const cellActive = cellModeOf(dateStr, !!att) !== null;
                  return (
                    <td
                      key={day}
                      className={`attendance-cell${cellActive ? '' : ' cell-locked'}${
                        day === todayDay ? ' is-today' : ''
                      }`}
                    >
                      <AttendanceDot
                        status={att?.status}
                        grade={att?.score}
                        onClick={() => handleCellClick(student.id, day)}
                      />
                    </td>
                  );
                })}
                <td className="balance-info">
                  <div className="id-text">
                    {t('studentsAttendance.id')}: {student.id}
                  </div>
                  <div className="last-payment">{formatDate(student.last_payment_date, '')}</div>
                  {/* Balans faqat backend bergan bo'lsa (`payments.create|students.show` — `/options/students` `extra_if`):
                      o'qituvchida maydon kelmaydi — ilgari «Balans: NaN» chiqardi. */}
                  {hasBalance(student) && (
                    <div
                      className={`balance-text ${Number(student.balance) < 0 ? 'balance-red' : 'balance-green'}`}
                    >
                      {t('studentsAttendance.balance')}: {formatMoney(student.balance)}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards" ref={mobileCardsRef}>
        {studentsData?.data?.map((student) => (
          <div key={student.id} className="student-card">
            <div className="card-header">
              <img
                src={`https://ui-avatars.com/api/?name=${student.first_name}+${student.last_name}`}
                alt="avatar"
                className="avatar"
              />
              <div className="student-text">
                <span className="student-name">
                  {student.first_name} {student.last_name}
                </span>
                <span className="student-phone">{student.phone}</span>
              </div>
              <div className={`status-badge status-${getStatusMeta(student?.status).cls}`}>
                {t(`studentsAttendance.${getStatusMeta(student?.status).key}`)}
              </div>
            </div>
            <div className="card-body">
              <div className="card-attendance-grid">
                {lessonDatesInMonth.map((day) => {
                  const dateStr = dateOf(day);
                  const att = findAttendance(student.id, dateStr);
                  const cellActive = cellModeOf(dateStr, !!att) !== null;
                  return (
                    <div
                      key={day}
                      className={`card-day-col${day === todayDay ? ' is-today' : ''}${
                        cellActive ? '' : ' cell-locked'
                      }`}
                    >
                      <span className="card-weekday">{getWeekday(day)}</span>
                      <span className="card-date">{day}</span>
                      <AttendanceDot
                        status={att?.status}
                        grade={att?.score}
                        onClick={() => handleCellClick(student.id, day)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="card-footer">
                {hasBalance(student) && (
                  <span
                    className={`balance-text ${Number(student.balance) < 0 ? 'balance-red' : 'balance-green'}`}
                  >
                    {t('studentsAttendance.balance')}: {formatMoney(student.balance)}
                  </span>
                )}
                <span className="id-text">
                  {t('studentsAttendance.id')}: {student.id}
                </span>
                <span className="last-payment">{formatDate(student.last_payment_date, '')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Darsni boshlash/tugatish paneli — `lessons.edit` (bugungi dars yozuvi bo'lmasa `lessons.create` ham)
          ruxsati kerak. Davomatni faqat ko'rib chiqadigan admin·menejerdan shu ruxsatni olib qo'ysangiz,
          «Darsni boshlash / Bugun dars yo'q / Darsni tamomlash» va dars-mavzusi oynasi chiqmaydi. */}
      {canEditLesson && (
        <div className="lesson-control-fixed">
          {canStartLesson && startNeeded && (
            <button
              className="lesson-btn btn-start"
              onClick={() => setStartModalOpen(true)}
              disabled={startBusy}
            >
              {t('studentsAttendance.darsni_boshlash')}
              {lessonTime && <span>{lessonTime}</span>}
            </button>
          )}
          {!todayLesson && !todayIsLessonDay && (
            <button className="lesson-btn btn-disabled" disabled>
              {t('studentsAttendance.no_lesson_today')}
            </button>
          )}
          {canEndLesson && lessonStatus === 'ongoing' && (
            <button
              className="lesson-btn btn-end"
              onClick={() => setConfirmEndOpen(true)}
              disabled={endLessonMutation.isPending}
            >
              {t('studentsAttendance.darsni_tamomlash')}
              {lessonTime && <span>{lessonTime}</span>}
            </button>
          )}
          {lessonStatus === 'completed' && (
            <button className="lesson-btn btn-disabled" disabled>
              {t('studentsAttendance.lesson_completed')}
            </button>
          )}
        </div>
      )}

      <FormModal
        open={startModalOpen}
        size="sm"
        className="sa-start"
        title={t('studentsAttendance.start_lesson_title')}
        subtitle={[groupName, lessonTime].filter(Boolean).join(' · ') || undefined}
        busy={startBusy}
        onClose={() => setStartModalOpen(false)}
        onSubmit={handleConfirmStart}
        footer={
          <>
            <button
              type="button"
              className="fm-btn fm-btn--ghost"
              disabled={startBusy}
              onClick={() => setStartModalOpen(false)}
            >
              {t('studentsAttendance.cancel')}
            </button>
            <button
              type="submit"
              className="fm-btn fm-btn--primary"
              disabled={startBusy || (!todayLesson && !startTopic.trim())}
            >
              {startBusy ? t('studentsAttendance.starting') : t('studentsAttendance.start')}
            </button>
          </>
        }
      >
        <p className="fm-text">{t('studentsAttendance.start_lesson_desc')}</p>

        {todayLesson ? (
          todayLessonTopic &&
          todayLessonTopic !== '-' && (
            <div className="sa-start__topic">
              <span className="sa-start__topic-label">{t('studentsAttendance.lesson_topic_label')}</span>
              <span className="sa-start__topic-value">{todayLessonTopic}</span>
            </div>
          )
        ) : (
          <div className="fm-field">
            <label className="fm-label" htmlFor="sa-start-topic">
              {t('studentsAttendance.lesson_topic_label')}
              <span className="fm-req">*</span>
            </label>
            <input
              id="sa-start-topic"
              className="fm-input"
              value={startTopic}
              maxLength={TOPIC_MAX}
              disabled={startBusy}
              autoFocus
              autoComplete="off"
              placeholder={t('studentsAttendance.topic_placeholder')}
              onChange={(e) => setStartTopic(e.target.value)}
            />
          </div>
        )}
      </FormModal>

      <ConfirmModal
        open={confirmEndOpen}
        title={t('studentsAttendance.end_lesson_title')}
        message={t('studentsAttendance.end_confirm_desc')}
        confirmLabel={t('studentsAttendance.end_confirm_btn')}
        cancelLabel={t('studentsAttendance.cancel')}
        tone="danger"
        busy={endLessonMutation.isPending}
        onConfirm={() => todayLesson && endLessonMutation.mutate(todayLesson.id)}
        onCancel={() => setConfirmEndOpen(false)}
      />

      {selectedCell && (
        <MarkModal
          key={`${selectedCell.studentId}-${selectedCell.date}`}
          studentName={selectedStudentName}
          dateLabel={selectedDateLabel}
          initial={selectedCell.attendance}
          onSave={handleSaveAttendance}
          onCancel={() => setSelectedCell(null)}
          onDelete={handleDeleteAttendance}
          busy={markBusy}
          canDelete={canDeleteAttendance && !!selectedCell.attendance?.id}
        />
      )}
    </div>
  );
};

export default StudentsAttendance;
