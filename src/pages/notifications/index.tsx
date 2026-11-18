import { groupDigits } from '@/utils/formatNumber';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { API } from '@/api/api';
import { fetchAllPages } from '@/api/fetchAllPages';
import { usePermission } from '@/hooks/usePermission';
import useAuthStore from '@/store/useAuthStore';
import { fetchLidsData, fetchStudentsData } from '@/pages/dashboard/dashboard.service';
import { ACTION_PERMISSION, monthI18nKey } from '@/pages/payroll-sheets/helpers';
import { LID_STATUS } from '@/types/lid.types';
import { parseServerDate } from '@/utils/date';
import type { Task } from '@/types/task.types';
import './notifications.css';

/*
 * Alohida "bildirishnoma" backend endpointi yo'q — tekshirildi
 * (`/notifications`, `/alerts`, `/announcements` va h.k. — hammasi 404).
 * Shu sabab bu sahifa ilovada allaqachon mavjud, haqiqiy ma'lumotlardan
 * bitta oddiy, vaqt bo'yicha saralangan ro'yxat yasaydi — har bir qator:
 * matn + "Ko'rish" havolasi (talab qilingan ko'rinish shu edi):
 *   1. Menga biriktirilgan, hali yakunlanmagan vazifalar (`/tasks`)
 *   2. Yangi ONLAYN lidlar (`/lids`, status===onlayn) — bular o'quvchi
 *      saytdan o'zi ro'yxatdan o'tgan yoki Telegram botga so'rov
 *      yuborgan holatlar, operator ulardan hali xabardor emas. OFLAYN
 *      lidlar (operatorning o'zi qo'lda qo'shgani) qasddan CHIQARILGAN —
 *      operator allaqachon bilgan narsasi haqida bildirishnoma olmaydi.
 *   3. Manfiy balansli (qarzdor) o'quvchilar (`/students`)
 *   4. Tasdiqlashga yuborilgan (`sent`) avans/oylik vedomostlari —
 *      faqat `payroll_sheets.approve` ruxsati bo'lganlarga (direktor/menejer):
 *      "vedomost tasdiqlashga tayyor" (`/payroll/sheets`, `POST /{id}/send`
 *      dan keyin — alohida push yo'q, tasdiqlovchi sahifani ochganda ko'radi).
 *
 * Har bir manba mos ruxsat bilan qo'riqlanadi (`Aside.tsx`dagi yon menyu
 * havolalari qanday ruxsat talab qilsa, shu manba ham xuddi shuni talab
 * qiladi) — foydalanuvchi ko'ra olmaydigan modul bu yerda ham chiqmaydi.
 */

const MAX_ITEMS = 40;
// Modul yuklanganda BIR MARTA olinadi — render/useMemo ichida `Date.now()`
// chaqirish "impure" hisoblanadi (`react-hooks/purity`), xuddi `SotuvTab`dagi
// `NOW_MS` kabi.
const NOW_MS = Date.now();

type NotifKind = 'task' | 'lid' | 'debt' | 'payroll';

interface NotifEntry {
  id: string;
  kind: NotifKind;
  text: string;
  date: number;
  urgent?: boolean;
  link: string;
}

const KIND_ICON: Record<NotifKind, string> = {
  task: 'fa-solid fa-clipboard-check',
  lid: 'fa-solid fa-user-plus',
  debt: 'fa-solid fa-sack-dollar',
  payroll: 'fa-solid fa-file-invoice-dollar',
};

/**
 * Bildirishnomalar backendda saqlanmaydi (har safar joriy ma'lumotdan qayta
 * yasaladi — yuqoridagi izohga qara), shuning uchun "o'qildi" holati ham
 * BACKENDDA yo'q — faqat shu brauzerda, `entry.id` bo'yicha localStorage'da
 * saqlanadi (boshqa qurilma/brauzerda qayta "o'qilmagan" bo'lib ko'rinadi —
 * kutilgan holat). `entries` har sahifa yuklanganda qaytadan hisoblanadi va
 * eski (endi ro'yxatda yo'q) id'lar pastdagi effekt orqali tozalanadi —
 * localStorage cheksiz o'smasin.
 */
const READ_IDS_KEY = 'notifications-read-ids';

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage to'lgan/bloklangan bo'lishi mumkin — jim o'tkazib yuboriladi.
  }
}

type NotifTab = 'all' | 'unread' | 'read';

/** `/payroll/sheets` ro'yxat qatorining kerakli maydonlari (xom javob). */
interface RawPayrollSheet {
  id: number;
  type: 'advance' | 'salary';
  status: string;
  branch_id: number;
  branch?: { id: number; name_uz?: string | null } | null;
  year: number;
  month: number;
  sent_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function timeAgo(t: (key: string, opts?: Record<string, unknown>) => string, timestamp: number): string {
  const diffMs = NOW_MS - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('notificationsPage.justNow');
  if (minutes < 60) return t('notificationsPage.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notificationsPage.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return t('notificationsPage.daysAgo', { count: days });
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const canViewTasks = usePermission('tasks.view');
  const canViewLids = usePermission('lids.view');
  // Qarzdorlik bildirishnomalari `/students` (balans) dan olinadi — backend `students.view` talab qiladi.
  // Ilgari `student_attendance.view` tekshirilardi: o'qituvchida har ochilishda «Ruxsat yo'q» chiqardi.
  const canViewStudents = usePermission('students.view');
  // Tasdiqlovchi (direktor/menejer) — `sent` vedomostlar bo'yicha bildirishnoma oladi.
  const canApprovePayroll = usePermission(ACTION_PERMISSION.approve);

  const currentUserId = useAuthStore((state) => state.user?.id ?? 0);

  const { data: tasksRaw, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () =>
      API.get('/tasks').then((r) => {
        const responseData = r.data;
        if (Array.isArray(responseData)) return responseData;
        if (Array.isArray(responseData?.data)) return responseData.data;
        return [];
      }),
    enabled: canViewTasks,
  });

  const { data: lidsData, isLoading: lidsLoading } = useQuery({
    queryKey: ['dash-lids'],
    queryFn: fetchLidsData,
    enabled: canViewLids,
  });

  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['dash-students'],
    queryFn: fetchStudentsData,
    enabled: canViewStudents,
  });

  // Prefiks `['payroll-sheet', ...]` — tasdiqlash/rad etish/qaytarish shu prefiksni
  // invalidatsiya qiladi, shuning uchun amal bajarilgach ro'yxat o'zi yangilanadi.
  const { data: payrollSheets, isLoading: payrollLoading } = useQuery<RawPayrollSheet[]>({
    queryKey: ['payroll-sheet', 'all'],
    queryFn: () => fetchAllPages<RawPayrollSheet>('/payroll/sheets'),
    enabled: canApprovePayroll,
  });

  const hasAnySource = canViewTasks || canViewLids || canViewStudents || canApprovePayroll;
  const isLoading =
    (canViewTasks && tasksLoading) ||
    (canViewLids && lidsLoading) ||
    (canViewStudents && studentsLoading) ||
    (canApprovePayroll && payrollLoading);

  const entries = useMemo<NotifEntry[]>(() => {
    const list: NotifEntry[] = [];

    if (canViewTasks && tasksRaw && currentUserId) {
      tasksRaw
        .filter((task) => task.operator_id === currentUserId && task.status !== 'bajarildi')
        .forEach((task) => {
          const deadline = parseServerDate(task.deadline);
          const overdue = !!deadline && deadline.getTime() < NOW_MS;
          list.push({
            id: `task-${task.id}`,
            kind: 'task',
            text: `${t('notificationsPage.typeNewTask')}: ${task.description || '—'}`,
            date: (parseServerDate(task.created_at) ?? new Date(NOW_MS)).getTime(),
            urgent: overdue,
            link: '/tasks',
          });
        });
    }

    if (canViewLids) {
      (lidsData?.list ?? [])
        .filter((lid) => lid.status === LID_STATUS.NEW_ONLINE)
        .forEach((lid) => {
          const name = [lid.last_name, lid.first_name].filter(Boolean).join(' ') || '—';
          list.push({
            id: `lid-${lid.id}`,
            kind: 'lid',
            text: `${t('notificationsPage.typeNewLid')}: ${name}`,
            date: (parseServerDate(lid.created_at) ?? new Date(NOW_MS)).getTime(),
            link: '/lids',
          });
        });
    }

    if (canViewStudents) {
      (studentsData?.list ?? [])
        .filter((s) => Number(s.balance) < 0)
        .forEach((s) => {
          const name = [s.last_name, s.first_name].filter(Boolean).join(' ') || '—';
          const amount = groupDigits(Math.abs(Number(s.balance)));
          list.push({
            id: `debt-${s.id}`,
            kind: 'debt',
            text: `${t('notificationsPage.typeDebt')}: ${name} — ${amount} so'm`,
            date: (parseServerDate(s.last_payment_date) ?? new Date(0)).getTime(),
            urgent: true,
            link: '/students-attendance',
          });
        });
    }

    if (canApprovePayroll) {
      (payrollSheets ?? [])
        .filter((sheet) => sheet.status === 'sent')
        .forEach((sheet) => {
          const typeWord = t(`payrollSheets.type.${sheet.type}`);
          const period = `${t(monthI18nKey(sheet.month))} ${sheet.year}`;
          const branch = sheet.branch?.name_uz || `#${sheet.branch_id}`;
          const path = sheet.type === 'salary' ? '/salary-schedule' : '/advance-schedule';
          list.push({
            id: `payroll-${sheet.id}`,
            kind: 'payroll',
            text: `${t('notificationsPage.typePayrollApproval')}: ${typeWord} — ${branch}, ${period}`,
            date: (
              parseServerDate(sheet.sent_at ?? sheet.updated_at ?? sheet.created_at) ??
              new Date(NOW_MS)
            ).getTime(),
            urgent: true,
            link: `${path}?branch_id=${sheet.branch_id}&year=${sheet.year}&month=${sheet.month}`,
          });
        });
    }

    return list.sort((a, b) => b.date - a.date).slice(0, MAX_ITEMS);
  }, [
    canViewTasks,
    canViewLids,
    canViewStudents,
    canApprovePayroll,
    tasksRaw,
    currentUserId,
    lidsData,
    studentsData,
    payrollSheets,
    t,
  ]);

  const [storedReadIds, setStoredReadIds] = useState<Set<string>>(() => loadReadIds());
  const [tab, setTab] = useState<NotifTab>('all');

  // `storedReadIds` localStorage'dagi XOM to'plam — ro'yxatdan tushib
  // qolgan (lid boshqa holatga o'tgan, vazifa yakunlangan) eski id'larni
  // ham saqlab turishi mumkin. Ko'rsatish/hisoblash uchun faqat HOZIR
  // `entries`da bor id'lar bilan kesishmasi ishlatiladi — sof hosila
  // (pure derivation), alohida "tozalash effekti" shart emas.
  const readIds = useMemo(() => {
    const validIds = new Set(entries.map((e) => e.id));
    return new Set([...storedReadIds].filter((id) => validIds.has(id)));
  }, [entries, storedReadIds]);

  const markRead = useCallback((id: string) => {
    setStoredReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      saveReadIds(next);
      return next;
    });
  }, []);

  const toggleRead = useCallback((id: string) => {
    setStoredReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveReadIds(next);
      return next;
    });
  }, []);

  const handleView = useCallback(
    (entry: NotifEntry) => {
      markRead(entry.id);
      navigate(entry.link);
    },
    [markRead, navigate],
  );

  const unreadCount = entries.length - readIds.size;
  const readCount = readIds.size;

  const visibleEntries = useMemo(() => {
    if (tab === 'unread') return entries.filter((e) => !readIds.has(e.id));
    if (tab === 'read') return entries.filter((e) => readIds.has(e.id));
    return entries;
  }, [entries, readIds, tab]);

  const emptyMessageKey =
    tab === 'unread'
      ? 'notificationsPage.emptyUnread'
      : tab === 'read'
        ? 'notificationsPage.emptyRead'
        : 'notificationsPage.empty';

  return (
    <div className="notif-page container">
      {/* Sahifa nomi allaqachon yuqoridagi navbarda ko'rinadi (Header) —
          bu yerda takrorlanmaydi, faqat qisqa izoh qoladi. */}
      <p className="notif-header__subtitle">{t('notificationsPage.subtitle')}</p>

      {!hasAnySource ? (
        <div className="notif-empty-all">
          <i className="fa-regular fa-bell-slash" />
          <span>{t('notificationsPage.empty')}</span>
        </div>
      ) : isLoading ? (
        <div className="notif-page-loading">{t('notificationsPage.loading')}</div>
      ) : (
        <>
          <div className="notif-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              className={`notif-tab${tab === 'all' ? ' notif-tab--active' : ''}`}
              onClick={() => setTab('all')}
            >
              {t('notificationsPage.tabAll')}
              <span className="notif-tab__count">{entries.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'unread'}
              className={`notif-tab${tab === 'unread' ? ' notif-tab--active' : ''}`}
              onClick={() => setTab('unread')}
            >
              {t('notificationsPage.tabUnread')}
              <span className="notif-tab__count">{unreadCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'read'}
              className={`notif-tab${tab === 'read' ? ' notif-tab--active' : ''}`}
              onClick={() => setTab('read')}
            >
              {t('notificationsPage.tabRead')}
              <span className="notif-tab__count">{readCount}</span>
            </button>
          </div>

          {visibleEntries.length === 0 ? (
            <div className="notif-empty-all">
              <i className="fa-regular fa-bell-slash" />
              <span>{t(emptyMessageKey)}</span>
            </div>
          ) : (
            <div className="notif-feed">
              {visibleEntries.map((entry) => {
                const read = readIds.has(entry.id);
                return (
                  <div key={entry.id} className={`notif-row${read ? ' notif-row--read' : ''}`}>
                    <span className={`notif-row__icon notif-row__icon--${entry.kind}`}>
                      <i className={KIND_ICON[entry.kind]} />
                    </span>
                    <div className="notif-row__body">
                      <p className="notif-row__text">{entry.text}</p>
                      <span className="notif-row__time">{timeAgo(t, entry.date)}</span>
                    </div>
                    {entry.urgent && !read && <span className="notif-row__dot" />}
                    <button
                      type="button"
                      className="notif-row__read-toggle"
                      onClick={() => toggleRead(entry.id)}
                      title={t(read ? 'notificationsPage.markUnread' : 'notificationsPage.markRead')}
                      aria-label={t(read ? 'notificationsPage.markUnread' : 'notificationsPage.markRead')}
                    >
                      <i className={read ? 'fa-solid fa-envelope-circle-check' : 'fa-regular fa-envelope'} />
                    </button>
                    <button className="notif-row__view" onClick={() => handleView(entry)}>
                      {t('notificationsPage.view')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
