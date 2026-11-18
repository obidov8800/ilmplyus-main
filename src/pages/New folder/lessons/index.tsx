import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { API, type SilentForbiddenConfig } from '../../api/api';
import { useGroupsData } from '@/pages/groups/useGroupsData';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import './lessons.css';
import type { Group, Lesson } from '@/types/lesson.types';
import { useTranslation } from 'react-i18next';
import { dateToIso, formatDate, toTashkentDate } from '@/utils/date';
import { getApiErrorMessage } from '@/utils/apiError';
import { getLocalized } from '@/utils/getLocalized';
import { notifyError, notifySuccess, notifyWarning } from '@/utils/notify';
import SortableTh from '@/components/SortableTh';
import FormModal from '@/components/FormModal';
import { useTableSort } from '@/hooks/useTableSort';
import { useDragScroll } from '@/hooks/useDragScroll';
import { usePermission } from '@/hooks/usePermission';
import { Protected } from '@/components/Protected';
import { FILE_BASE_URL } from '@/api/baseUrl';

const uzDays: Record<string, string> = {
  monday: 'dushanba',
  tuesday: 'seshanba',
  wednesday: 'chorshanba',
  thursday: 'payshanba',
  friday: 'juma',
  saturday: 'shanba',
  sunday: 'yakshanba',
};

const dayMap: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

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

const formatTime = (time: string | undefined) => {
  if (!time) return '';
  return time.split(':').slice(0, 2).join(':');
};

/* ── Fayllar: backend qoidasi bilan BIR XIL (`StoreLessonRequest`: mimes + max:20480 KB) ── */
const LESSON_FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'zip', 'rar', 'mp4', 'mp3'];
const LESSON_FILE_ACCEPT = LESSON_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',');
const LESSON_FILE_MAX_MB = 20;
const LESSON_FILE_HINT = `PDF, Word, Excel, PowerPoint, rasm (JPG/PNG), ZIP/RAR, MP3/MP4 · ${LESSON_FILE_MAX_MB} MB gacha`;
const TEXT_MAX = 255;

const extensionOf = (name: string | undefined | null) => {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  return base.includes('.') ? (base.split('.').pop() ?? '').toLowerCase() : '';
};

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Fayl backend qabul qiladigan turda va hajmdami — yuklashdan OLDIN tekshiriladi (aks holda 20 MB fayl
 *  to'liq yuklangach inglizcha «The homework file field must be a file of type…» xatosi chiqardi). */
function fileProblem(file: File): string | null {
  const ext = extensionOf(file.name);
  if (!LESSON_FILE_EXTENSIONS.includes(ext)) {
    return `«${file.name}» — bu turdagi fayl qabul qilinmaydi.\nRuxsat etilgan: ${LESSON_FILE_HINT.split(' · ')[0]}.`;
  }
  if (file.size > LESSON_FILE_MAX_MB * 1024 * 1024) {
    return `«${file.name}» hajmi ${formatSize(file.size)} — ${LESSON_FILE_MAX_MB} MB dan oshmasligi kerak.`;
  }
  return null;
}

const getFileUrl = (path?: string | null) => {
  if (!path) return '#';
  if (path.startsWith('http')) return path;
  return `${FILE_BASE_URL}/storage/${path.replace(/^\/+/, '')}`;
};

// Word/Excel/PowerPoint fayllarni brauzer o'zi ichida ko'rsata olmaydi —
// bosilganda avtomatik yuklab olishga tushib ketadi. Bunday fayllar uchun
// Microsoft Office Online Viewer orqali ochamiz (u faylni sahifa ko'rinishida
// render qilib beradi, yuklab olish shart bo'lmaydi). PDF/rasm kabi
// brauzer o'zi ochadigan formatlar to'g'ridan-to'g'ri havoladan ochiladi.
const OFFICE_PREVIEW_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
const getPreviewUrl = (path?: string | null) => {
  const fileUrl = getFileUrl(path);
  if (fileUrl === '#') return fileUrl;

  if (OFFICE_PREVIEW_EXTENSIONS.includes(extensionOf(path))) {
    // Office Viewer faylni O'ZI internetdan yuklab oladi — unga TO'LIQ manzil kerak. `FILE_BASE_URL` bo'sh
    // (fayllar shu domendan), shuning uchun nisbiy `/storage/...` ketib, hujjat umuman ochilmasdi.
    const absolute = new URL(fileUrl, window.location.origin).href;
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(absolute)}`;
  }

  return fileUrl;
};

/** Jadvalda ko'rinadigan fayl nomi. Backend faylni tasodifiy nom bilan saqlaydi (`lessons/Xk3…40 belgi.pdf`) —
 *  bunday nom o'rniga «Fayl (PDF)» chiqadi; o'qiladigan nom bo'lsa — o'zi. */
const fileLabel = (path?: string | null) => {
  if (!path) return '';
  const base = path.split('/').pop() ?? '';
  const ext = extensionOf(base);
  const stem = ext ? base.slice(0, -(ext.length + 1)) : base;
  if (/^[A-Za-z0-9]{24,}$/.test(stem)) return ext ? `Fayl (${ext.toUpperCase()})` : 'Fayl';
  return base;
};

/**
 * Davomat sahifasi darsni boshlaganda uy vazifasi sarlavhasiga vaqtincha shu belgini yozadi (backend maydonni
 * majburiy qiladi, vazifa esa dars oxirida beriladi) — formada bo'sh maydon sifatida ko'rsatiladi.
 */
const HOMEWORK_PLACEHOLDERS = ['—', '–', '-'];
const isHomeworkPlaceholder = (value: string) => HOMEWORK_PLACEHOLDERS.includes(value.trim());

/** Standart tartib: eng yangi DARS SANASI tepada (bir kunda bir nechta bo'lsa — oxirgi kiritilgani). */
const byLessonDateDesc = (a: Lesson, b: Lesson) => {
  const da = toTashkentDate(a.date);
  const db = toTashkentDate(b.date);
  if (da === db) return Number(b.id) - Number(a.id);
  return da < db ? 1 : -1;
};

const silent: SilentForbiddenConfig = { silentError: true };

interface ModalState {
  /** `null` — yangi dars. */
  lesson: Lesson | null;
  /** Dars sanasi (`YYYY-MM-DD`). */
  date: string;
  /** Davomat sahifasidan «Darsni tugatish» bilan kelingan — asosiy ish uy vazifasini kiritish. */
  homework: boolean;
}

/** Fayl tanlash qatori: mavjud fayl havolasi yoki yangi tanlangan fayl nomi + hajmi. */
const FileField = ({
  id,
  label,
  file,
  existingPath,
  disabled,
  onPick,
  onClear,
}: {
  id: string;
  label: string;
  file: File | null;
  existingPath?: string | null;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fm-field">
      <span className="fm-label">{label}</span>
      <div className={`lsn-file${file ? ' has-new' : ''}`}>
        <div className="lsn-file__info">
          {file ? (
            <>
              <span className="lsn-file__name" title={file.name}>
                {file.name}
              </span>
              <span className="lsn-file__meta">
                {formatSize(file.size)}
                {existingPath ? ' · avvalgi fayl o‘rniga yuklanadi' : ''}
              </span>
            </>
          ) : existingPath ? (
            <>
              <a
                className="lsn-file__link"
                href={getPreviewUrl(existingPath)}
                target="_blank"
                rel="noopener noreferrer"
                title="Faylni ochish"
              >
                {fileLabel(existingPath)}
              </a>
              <span className="lsn-file__meta">Yuklangan fayl — ochish uchun bosing</span>
            </>
          ) : (
            <span className="lsn-file__empty">Fayl tanlanmagan</span>
          )}
        </div>
        {file && !disabled && (
          <button type="button" className="lsn-file__clear" onClick={onClear} aria-label="Tanlangan faylni olib tashlash">
            ×
          </button>
        )}
        {!disabled && (
          <button type="button" className="lsn-file__btn" onClick={() => inputRef.current?.click()}>
            {file || existingPath ? 'Almashtirish' : 'Fayl tanlash'}
          </button>
        )}
        <input
          id={id}
          ref={inputRef}
          type="file"
          accept={LESSON_FILE_ACCEPT}
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0];
            // Qiymat tozalanadi — o'sha faylni (masalan, tuzatib) qayta tanlash mumkin bo'lsin.
            e.target.value = '';
            if (picked) onPick(picked);
          }}
        />
      </div>
      {!disabled && <span className="fm-hint">{LESSON_FILE_HINT}</span>}
    </div>
  );
};

const Lessons = () => {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  // Backend: `POST /lessons` — `lessons.create`; `PUT /lessons/{id}` — `lessons.edit`. Ruxsati yo'q foydalanuvchi
  // darsni faqat KO'RADI (ilgari «Saqlash» bosilib, «Ruxsat yo'q» xatosi chiqardi).
  const canCreateLesson = usePermission('lessons.create');
  const canEditLesson = usePermission('lessons.edit');

  // Davomat sahifasidan "Darsni tugatish" bilan kelinganda: guruh + sana tanlab,
  // uy vazifasini biriktirish uchun modalni avtomatik ochamiz.
  const [searchParams, setSearchParams] = useSearchParams();
  const autoOpenGroupId = searchParams.get('groupId');
  const autoOpenDate = searchParams.get('date');
  const autoOpenLessonId = searchParams.get('lessonId');
  const shouldAutoOpen = searchParams.get('openHomework') === '1' && !!autoOpenGroupId;

  const [selectedGroupId, setSelectedGroupId] = useState<number | ''>(() =>
    shouldAutoOpen ? Number(autoOpenGroupId) : '',
  );
  /** Sahifa filtri («Keyingi dars sanasi»). Oynadagi dars sanasi ALOHIDA (`modal.date`): ilgari darsni «ko'rish»
   *  filtrni ham o'zgartirib, oyna yopilgach ro'yxatda faqat o'sha bitta dars qolardi. */
  const [dateFilter, setDateFilter] = useState(() => (shouldAutoOpen && autoOpenDate ? autoOpenDate : ''));
  const [autoOpenPending, setAutoOpenPending] = useState(shouldAutoOpen);

  const [modal, setModal] = useState<ModalState | null>(null);

  // Form state
  const [topic, setTopic] = useState('');
  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [homeworkTitle, setHomeworkTitle] = useState('');
  const [homeworkDescription, setHomeworkDescription] = useState('');
  const [homeworkFile, setHomeworkFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  // Guruhlar `useGroupsData` dan: `groups.view` bo'lsa `/groups`, bo'lmasa `/options/groups`. Qamrov (o'z guruhlari yoki
  // hammasi) — `canSeeAll('lessons')`, sahifa rol nomiga qarab o'zi hal qilmaydi. Dars sanalari `days`/`start_time`dan.
  const { groups: fetchedGroups } = useGroupsData({ scope: 'lessons' });
  const groups = fetchedGroups as unknown as Group[];

  const selectedGroup = useMemo(() => {
    return groups.find((g: Group) => g.id === selectedGroupId);
  }, [groups, selectedGroupId]);

  const timeRange = useMemo(() => {
    const start = formatTime(selectedGroup?.start_time);
    const end = formatTime(selectedGroup?.end_time);
    return start && end ? `${start}-${end}` : start || end;
  }, [selectedGroup]);

  /** `2026-11-13` → `13-noyabr, juma` (qurilma zonasidan qat'i nazar — sana qismlaridan). */
  const dateLabel = useCallback((iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    const dayName = Object.keys(dayMap).find((key) => dayMap[key] === new Date(y, m - 1, d).getDay());
    return `${d}-${UZ_MONTHS[m - 1]}, ${dayName ? uzDays[dayName] : ''}`;
  }, []);

  /** Guruhning keyingi 15 ta dars kuni (bugundan boshlab). */
  const upcomingDates = useMemo(() => {
    if (!selectedGroup || !selectedGroup.days || selectedGroup.days.length === 0) return [];

    const allowedDays = selectedGroup.days.map((d: string) => dayMap[d.toLowerCase()]);
    let current = new Date();
    // Agar start_date bugundan keyin bo'lsa, o'shandan boshlaymiz
    if (selectedGroup.start_date) {
      const start = new Date(selectedGroup.start_date);
      if (start > current) current = start;
    }

    const dates: string[] = [];
    const searchDate = new Date(current);
    for (let i = 0; dates.length < 15 && i < 60; i++) {
      // Mahalliy kalendar kuni — yonidagi `getDay()` bilan bir xil (UTC kuni
      // tunda 00:00–05:00 da bir kun orqada bo'lib, dars noto'g'ri sanaga saqlanardi).
      if (allowedDays.includes(searchDate.getDay())) dates.push(dateToIso(searchDate));
      searchDate.setDate(searchDate.getDate() + 1);
    }
    return dates;
  }, [selectedGroup]);

  /** Tanlov ro'yxati: `extra` (o'tgan dars yoki davomat sahifasidan kelgan sana) ro'yxatda bo'lmasa — boshiga qo'shiladi. */
  const dateOptionsWith = useCallback(
    (extra: string) => {
      const suffix = timeRange ? ` (${timeRange})` : '';
      const options = upcomingDates.map((iso) => ({ value: iso, label: `${dateLabel(iso)}${suffix}` }));
      if (extra && !upcomingDates.includes(extra)) {
        options.unshift({ value: extra, label: `${formatDate(extra)}${suffix}` });
      }
      return options;
    },
    [upcomingDates, timeRange, dateLabel],
  );

  const filterOptions = useMemo(() => dateOptionsWith(dateFilter), [dateOptionsWith, dateFilter]);
  const modalDateOptions = useMemo(() => dateOptionsWith(modal?.date ?? ''), [dateOptionsWith, modal?.date]);

  // Guruhning HAMMA darslari bitta so'rov bilan; sana filtri — shu ro'yxat ustida (har sana uchun alohida so'rov emas).
  const lessonsQuery = useQuery({
    queryKey: ['lessons', 'by-group', selectedGroupId],
    queryFn: async () => {
      const res = await API.get('/lessons', {
        params: { group_id: selectedGroupId },
      });
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      // Backend `group_id` parametrini e'tiborsiz qoldiradi (ko'rinadigan hamma guruh darslarini qaytaradi) —
      // shu guruhnikini o'zimiz ajratamiz.
      return (data as Lesson[]).filter((lesson) => Number(lesson.group_id) === Number(selectedGroupId));
    },
    enabled: !!selectedGroupId,
  });
  const groupLessons = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);
  const isLoading = lessonsQuery.isLoading;

  // `lesson.date` — Toshkent yarim tuni UTC'da ("...T19:00:00Z"), shuning uchun
  // xom satrni emas, Toshkent kunini solishtiramiz.
  const lessons = useMemo(
    () => (dateFilter ? groupLessons.filter((lesson) => toTashkentDate(lesson.date) === dateFilter) : groupLessons),
    [groupLessons, dateFilter],
  );

  // Default — eng yangi dars sanasi tepada; ID ustuni bosilsa asc/desc.
  const sort = useTableSort<Lesson>(lessons, { id: (row) => row.id }, byLessonDateDesc);

  // Planshet/tor ekranda keng jadvalni sichqoncha bilan ushlab surish.
  const { ref: tableScrollRef, onMouseDown: onTableScrollMouseDown } =
    useDragScroll<HTMLDivElement>();

  const closeModal = () => {
    setModal(null);
    setUploadPct(null);
  };

  const mutation = useMutation({
    mutationFn: async ({ formData, lessonId }: { formData: FormData; lessonId?: number }) => {
      // Mavjud dars (davomat sahifasidan kelingan yoki "ko'rish") — PUT.
      // multipart/form-data'da PHP PUT'ni o'qimaydi, shuning uchun `_method=PUT`.
      const url = lessonId ? `/lessons/${lessonId}` : '/lessons';
      if (lessonId) formData.append('_method', 'PUT');
      const hasFile = [...formData.values()].some((value) => typeof value !== 'string');
      const res = await API.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Fayl yuklashda backend/proksi "osilib" qolsa — so'rov cheksiz kutmasin.
        // Aks holda "Saqlanmoqda..." abadiy turib qoladi. 2 daqiqadan keyin
        // xato beriladi, foydalanuvchi qayta urina oladi.
        timeout: 120_000,
        // Xatoni sahifaning o'zi ko'rsatadi (aks holda ikkita bildirishnoma chiqardi).
        ...silent,
        onUploadProgress: hasFile
          ? (event) => {
              if (event.total) setUploadPct(Math.min(99, Math.round((event.loaded / event.total) * 100)));
            }
          : undefined,
      });
      return res.data;
    },
    onSuccess: (data, variables) => {
      notifySuccess(
        variables.lessonId ? 'Dars ma’lumotlari yangilandi' : data?.message || 'Dars va vazifa saqlandi!',
        'Muvaffaqiyatli',
      );
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
    },
    onError: (error) => {
      setUploadPct(null);
      // Ish vaqtidan tashqarida bekor qilingan so'rov — xabari allaqachon chiqqan.
      if (axios.isCancel(error)) return;
      const response = (error as { response?: { status?: number; data?: { message?: unknown } } }).response;
      const raw = typeof response?.data?.message === 'string' ? response.data.message : '';
      const timedOut = (error as { code?: string }).code === 'ECONNABORTED';
      const message = timedOut
        ? 'Yuklash juda uzoq davom etdi. Internetni tekshirib, qayta urinib ko‘ring (yoki kichikroq fayl tanlang).'
        : response?.status === 413
          ? `Fayl juda katta — ${LESSON_FILE_MAX_MB} MB dan oshmasligi kerak.`
          : response?.status === 403 && (!raw || /right permissions|unauthorized|forbidden/i.test(raw))
            ? 'Bu amalga ruxsatingiz yo‘q — adminga murojaat qiling'
            : getApiErrorMessage(error, 'Dars/vazifani saqlashda xatolik yuz berdi. Qayta urinib ko‘ring.');
      notifyError(message, 'Xatolik');
    },
  });
  const saving = mutation.isPending;

  /** `getLocalized` topilmasa "-" qaytaradi — formaga uni yozmaymiz. */
  const localizedOrEmpty = (lesson: Lesson, field: string) => {
    const value = getLocalized(lesson, field, lang);
    return value === '-' ? '' : value;
  };

  const findLessonByDate = (iso: string) => groupLessons.find((lesson) => toTashkentDate(lesson.date) === iso);

  /** Mavjud darsni ochish (ko'rish/tahrirlash). */
  const openLesson = (lesson: Lesson, homework = false) => {
    const hwTitle = localizedOrEmpty(lesson, 'homework_title');
    // Maydonlar `_uz`/`_ru`/`_en` bilan keladi — xom `topic` ko'pincha bo'sh.
    setTopic(localizedOrEmpty(lesson, 'topic'));
    // Dars boshlanganda yozilgan vaqtincha belgi — «vazifa hali berilmagan».
    setHomeworkTitle(isHomeworkPlaceholder(hwTitle) ? '' : hwTitle);
    setHomeworkDescription(localizedOrEmpty(lesson, 'homework_description'));
    setLessonFile(null);
    setHomeworkFile(null);
    setSubmitted(false);
    setUploadPct(null);
    setModal({ lesson, date: toTashkentDate(lesson.date), homework });
  };

  /** Yangi dars oynasi; shu sanaga dars allaqachon bo'lsa — takror yaratmay, o'shani ochadi. */
  const openNew = (iso: string) => {
    const existing = findLessonByDate(iso);
    if (existing) {
      notifyWarning(`${formatDate(iso)} sanasiga dars allaqachon kiritilgan — shu dars ochildi.`);
      openLesson(existing);
      return;
    }
    setTopic('');
    setHomeworkTitle('');
    setHomeworkDescription('');
    setLessonFile(null);
    setHomeworkFile(null);
    setSubmitted(false);
    setUploadPct(null);
    setModal({ lesson: null, date: iso, homework: false });
  };

  const handleOpenAdd = () => {
    if (!selectedGroupId) {
      notifyWarning('Avval guruhni tanlang!', 'Ogohlantirish');
      return;
    }
    const date = dateFilter || upcomingDates[0] || toTashkentDate(new Date());
    openNew(date);
  };

  /** Oynada sana almashtirildi (faqat yangi dars): o'sha sanada dars bo'lsa — uni ochamiz. */
  const handleModalDateChange = (iso: string) => {
    if (!modal || modal.lesson) return;
    const existing = findLessonByDate(iso);
    if (existing) {
      notifyWarning(`${formatDate(iso)} sanasiga dars allaqachon kiritilgan — shu dars ochildi.`);
      openLesson(existing);
      return;
    }
    setModal({ ...modal, date: iso });
  };

  const readOnly = !!modal?.lesson && !canEditLesson;
  const topicMissing = !topic.trim();
  const homeworkMissing = !homeworkTitle.trim();

  const handleSubmit = () => {
    if (!modal || !selectedGroupId || saving || readOnly) return;
    setSubmitted(true);
    if (topicMissing || homeworkMissing) return;

    const formData = new FormData();
    if (!modal.lesson) {
      // Guruh va sana faqat YANGI darsda yuboriladi — mavjud darsning sanasi bu oynadan o'zgarmaydi.
      formData.append('group_id', String(selectedGroupId));
      formData.append('date', modal.date || toTashkentDate(new Date()));
    }
    // Maydonlar backendda `_uz` qo'shimchali (eski nomlar 422 beradi).
    formData.append('topic_uz', topic.trim());
    if (lessonFile) formData.append('lesson_file', lessonFile);
    formData.append('homework_title_uz', homeworkTitle.trim());
    formData.append('homework_description_uz', homeworkDescription.trim());
    if (homeworkFile) formData.append('homework_file', homeworkFile);

    mutation.mutate({ formData, lessonId: modal.lesson?.id });
  };

  const pickFile = (file: File, setFile: (file: File | null) => void) => {
    const problem = fileProblem(file);
    if (problem) {
      notifyError(problem, 'Fayl qabul qilinmadi');
      return;
    }
    setFile(file);
  };

  // Davomat sahifasidan kelingan: darslar yuklangach oynani BIR MARTA ochamiz — o'sha sanaga dars bo'lsa,
  // uy vazifasini biriktirish uchun uni oldindan to'ldiramiz. (Render fazasida — effektda setState emas.)
  if (autoOpenPending && selectedGroupId && !lessonsQuery.isPending && !lessonsQuery.isFetching) {
    setAutoOpenPending(false);
    // Davomat sahifasi tugatilgan darsning `lessonId` sini ham yuboradi —
    // avval shu bo'yicha, topilmasa Toshkent kuni bo'yicha qidiramiz.
    const existing =
      (autoOpenLessonId ? groupLessons.find((l) => Number(l.id) === Number(autoOpenLessonId)) : undefined) ??
      (autoOpenDate ? findLessonByDate(autoOpenDate) : undefined);
    if (existing) openLesson(existing, true);
    else if (canCreateLesson) openNew(autoOpenDate || toTashkentDate(new Date()));
  }

  // Parametrlarni tozalaymiz — sahifa yangilanganda oyna qayta ochilib qolmasin.
  useEffect(() => {
    if (!autoOpenPending && searchParams.get('openHomework')) setSearchParams({}, { replace: true });
  }, [autoOpenPending, searchParams, setSearchParams]);

  // Telefon karta ro'yxati va jadval bir xil holat-xabarlarini ko'rsatadi.
  const emptyMessage = !selectedGroupId
    ? 'Iltimos, darslarni ko‘rish uchun guruhni tanlang...'
    : isLoading
      ? 'Yuklanmoqda...'
      : sort.rows.length === 0
        ? dateFilter
          ? 'Ushbu dars sanasi uchun vazifa biriktirilmagan'
          : 'Guruhga hali dars va vazifa biriktirilmagan'
        : null;

  const homeworkText = (lesson: Lesson) => {
    const value = getLocalized(lesson, 'homework_title', lang);
    return isHomeworkPlaceholder(value) ? '—' : value;
  };

  const modalTitle = !modal
    ? ''
    : !modal.lesson
      ? 'Yangi dars'
      : readOnly
        ? 'Dars ma’lumotlari'
        : modal.homework
          ? 'Uyga vazifa biriktirish'
          : 'Dars va uyga vazifa';
  const modalSubtitle = modal
    ? [selectedGroup ? getLocalized(selectedGroup, 'name', lang) : '', modal.date ? dateLabel(modal.date) : '', timeRange]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="lessons-container container">
      <div className="lessons-header">
        <div className="lessons-filters">
          <div className="filter-item">
            <label>Guruhni tanlang</label>
            <select
              className="custom-select"
              value={selectedGroupId}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : '';
                setSelectedGroupId(val);
                setDateFilter(''); // Guruh o'zgarganda sanani ham tozalaymiz
              }}
            >
              <option value="">Guruhni tanlang...</option>
              {groups.map((g: Group) => (
                <option key={g.id} value={g.id}>
                  {getLocalized(g, 'name', lang)}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <label>Keyingi dars sanasi</label>
            <select
              className="custom-select"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              disabled={!selectedGroupId || filterOptions.length === 0}
            >
              {filterOptions.length === 0 ? (
                <option value="">Sana mavjud emas</option>
              ) : (
                <>
                  <option value="">Sanani tanlang...</option>
                  {filterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>
        <Protected permission="lessons.create">
          <button className="add-lesson-btn" onClick={handleOpenAdd}>
            Dars qo‘shish
          </button>
        </Protected>
      </div>

      <div
        className="lessons-table-wrapper"
        ref={tableScrollRef}
        onMouseDown={onTableScrollMouseDown}
      >
        <table className="lessons-table data-table">
          <thead>
            <tr>
              <SortableTh sortKey="id" sort={sort}>
                ID
              </SortableTh>
              <th>SANA</th>
              <th>DARS MAVZUSI</th>
              <th>DARSGA OID FAYL</th>
              <th>UYGA VAZIFA</th>
              <th>UYGA VAZIFA OID FAYL</th>
              <th>AMALLAR</th>
            </tr>
          </thead>
          <tbody>
            {emptyMessage ? (
              <tr>
                <td colSpan={7} className="lessons-table__empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sort.rows.map((lesson: Lesson) => (
                <tr key={lesson.id}>
                  <td className="fw-700">{lesson.id}</td>
                  <td className="fw-700">{formatDate(toTashkentDate(lesson.date))}</td>
                  <td className="fw-700">{getLocalized(lesson, 'topic', lang)}</td>
                  <td>
                    {lesson.lesson_file && (
                      <a
                        href={getPreviewUrl(lesson.lesson_file)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="table-link"
                      >
                        {fileLabel(lesson.lesson_file)}
                      </a>
                    )}
                  </td>
                  <td className="fw-700">{homeworkText(lesson)}</td>
                  <td>
                    {lesson.homework_file && (
                      <a
                        href={getPreviewUrl(lesson.homework_file)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="table-link"
                      >
                        {fileLabel(lesson.homework_file)}
                      </a>
                    )}
                  </td>
                  <td>
                    <button className="view-btn" onClick={() => openLesson(lesson)}>
                      ko‘rish
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Telefon ko'rinishi — 7 ustunli jadval sig'magani uchun karta ro'yxati.
          Jadval `@media (max-width: 768px)` da yashiriladi, bu blok ko'rinadi. */}
      <div className="lessons-cards">
        {emptyMessage ? (
          <div className="lessons-cards__empty">{emptyMessage}</div>
        ) : (
          <div className="data-cards">
            {sort.rows.map((lesson: Lesson) => (
              <div key={lesson.id} className="data-card">
                <div className="data-card__head">
                  <span className="data-card__title">{formatDate(toTashkentDate(lesson.date))}</span>
                  <button className="view-btn" onClick={() => openLesson(lesson)}>
                    ko‘rish
                  </button>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Dars mavzusi</span>
                  <span className="data-card__value">
                    {getLocalized(lesson, 'topic', lang) || '—'}
                  </span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Uyga vazifa</span>
                  <span className="data-card__value">{homeworkText(lesson) || '—'}</span>
                </div>
                {(lesson.lesson_file || lesson.homework_file) && (
                  <div className="data-card__row">
                    <span className="data-card__label">Fayllar</span>
                    <span className="data-card__value lessons-card__files">
                      {lesson.lesson_file && (
                        <a
                          href={getPreviewUrl(lesson.lesson_file)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="table-link"
                        >
                          {fileLabel(lesson.lesson_file)}
                        </a>
                      )}
                      {lesson.homework_file && (
                        <a
                          href={getPreviewUrl(lesson.homework_file)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="table-link"
                        >
                          {fileLabel(lesson.homework_file)}
                        </a>
                      )}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <FormModal
        open={!!modal}
        size="lg"
        className="lsn-modal"
        title={modalTitle}
        subtitle={modalSubtitle || undefined}
        busy={saving}
        onClose={closeModal}
        onSubmit={readOnly ? undefined : handleSubmit}
        footer={
          readOnly ? (
            <button type="button" className="fm-btn fm-btn--ghost" onClick={closeModal}>
              Yopish
            </button>
          ) : (
            <>
              <button type="button" className="fm-btn fm-btn--ghost" disabled={saving} onClick={closeModal}>
                Bekor qilish
              </button>
              <button type="submit" className="fm-btn fm-btn--primary" disabled={saving}>
                {saving
                  ? uploadPct !== null
                    ? `Yuklanmoqda… ${uploadPct}%`
                    : 'Saqlanmoqda…'
                  : 'Saqlash'}
              </button>
            </>
          )
        }
      >
        {modal && (
          <>
            {!modal.lesson && (
              <div className="fm-field">
                <label className="fm-label" htmlFor="lsn-date">
                  Dars sanasi<span className="fm-req">*</span>
                </label>
                <select
                  id="lsn-date"
                  className="fm-select"
                  value={modal.date}
                  disabled={saving}
                  onChange={(e) => handleModalDateChange(e.target.value)}
                >
                  {modalDateOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <section className="lsn-section">
              <h3 className="lsn-section__title">Dars materiallari</h3>

              <div className="fm-field">
                <label className="fm-label" htmlFor="lsn-topic">
                  Dars mavzusi<span className="fm-req">*</span>
                </label>
                <input
                  id="lsn-topic"
                  type="text"
                  className={`fm-input${submitted && topicMissing ? ' is-invalid' : ''}`}
                  value={topic}
                  maxLength={TEXT_MAX}
                  disabled={readOnly || saving}
                  autoFocus={!modal.homework && !readOnly}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Bugungi dars mavzusini kiriting"
                />
                {submitted && topicMissing && <span className="fm-error">Dars mavzusini kiriting</span>}
              </div>

              <FileField
                id="lsn-lesson-file"
                label="Dars uchun fayl"
                file={lessonFile}
                existingPath={modal.lesson?.lesson_file}
                disabled={readOnly || saving}
                onPick={(file) => pickFile(file, setLessonFile)}
                onClear={() => setLessonFile(null)}
              />
            </section>

            <section className="lsn-section">
              <h3 className="lsn-section__title">Uyga vazifa</h3>

              <div className="fm-field">
                <label className="fm-label" htmlFor="lsn-hw-title">
                  Vazifa sarlavhasi<span className="fm-req">*</span>
                </label>
                <input
                  id="lsn-hw-title"
                  type="text"
                  className={`fm-input${submitted && homeworkMissing ? ' is-invalid' : ''}`}
                  value={homeworkTitle}
                  maxLength={TEXT_MAX}
                  disabled={readOnly || saving}
                  autoFocus={modal.homework && !readOnly}
                  onChange={(e) => setHomeworkTitle(e.target.value)}
                  placeholder="Masalan: 1–2-mashqlarni bajarish va lug‘at yodlash"
                />
                {submitted && homeworkMissing && <span className="fm-error">Vazifa sarlavhasini kiriting</span>}
              </div>

              <div className="fm-field">
                <label className="fm-label" htmlFor="lsn-hw-desc">
                  Vazifa izohi va shartlari
                </label>
                <textarea
                  id="lsn-hw-desc"
                  className="fm-textarea"
                  value={homeworkDescription}
                  disabled={readOnly || saving}
                  onChange={(e) => setHomeworkDescription(e.target.value)}
                  placeholder="Masalan: mashqlarni daftarga yozib keling"
                />
              </div>

              <FileField
                id="lsn-hw-file"
                label="Vazifa uchun fayl"
                file={homeworkFile}
                existingPath={modal.lesson?.homework_file}
                disabled={readOnly || saving}
                onPick={(file) => pickFile(file, setHomeworkFile)}
                onClear={() => setHomeworkFile(null)}
              />
            </section>
          </>
        )}
      </FormModal>
    </div>
  );
};

export default Lessons;
