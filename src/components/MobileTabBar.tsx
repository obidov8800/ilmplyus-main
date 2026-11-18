import { NavLink, useLocation } from 'react-router-dom';
import { MERGED_GROUPS_PATHS, useTeacherGroupsMerged } from '@/hooks/useCanSeeAll';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../hooks/usePermission';
import useAuthStore from '../store/useAuthStore';
import useDashboardSettings from '../store/useDashboardSettings';
import './MobileTabBar.css';

/**
 * Telefon/planshet (≤900px) uchun ekran pastidagi tezkor navigatsiya paneli —
 * ilova "mobil ilovadek" tuyulishi uchun. Desktopda `display:none`.
 *
 * To'liq menyu YO'Q — buning uchun Header'dagi hamburger tugmasi yetarli.
 * Bu panel faqat foydalanuvchi RUXSATLARIGA qarab eng kerakli sahifalarga
 * havola beradi: quyidagi ustuvorlik ro'yxatidan ruxsat bo'lganlarining
 * DASTLABKI 6 tasi ko'rsatiladi. Ruxsatlar boshqacha bo'lsa — boshqa
 * havolalar chiqadi; hamma ruxsat bo'lsa — ro'yxat boshidagi 6 tasi.
 */

interface Candidate {
  to: string;
  icon: string;
  labelKey: string;
  /** undefined => hammaga ochiq */
  perm?: string;
}

const CANDIDATES: Candidate[] = [
  { to: '/', icon: 'fa-house', labelKey: 'mobileNav.home' },
  {
    to: '/students-attendance',
    icon: 'fa-user-check',
    labelKey: 'mobileNav.attendance',
    perm: 'student_attendance.view',
  },
  { to: '/lessons', icon: 'fa-book', labelKey: 'mobileNav.tasks', perm: 'lessons.view' },
  { to: '/groups', icon: 'fa-users', labelKey: 'mobileNav.groups', perm: 'groups.view' },
  {
    to: '/lesson-schedule',
    icon: 'fa-calendar-days',
    labelKey: 'mobileNav.schedule',
    perm: 'lessons_schedules.view',
  },
  { to: '/test', icon: 'fa-list-check', labelKey: 'mobileNav.tests', perm: 'tests.view' },
  { to: '/lids', icon: 'fa-user-plus', labelKey: 'mobileNav.leads', perm: 'lids.view' },
  { to: '/payments', icon: 'fa-wallet', labelKey: 'mobileNav.payments', perm: 'payments.view' },
  {
    to: '/students-contract',
    icon: 'fa-file-signature',
    labelKey: 'mobileNav.contracts',
    perm: 'student_contracts.view',
  },
  {
    to: '/courses',
    icon: 'fa-graduation-cap',
    labelKey: 'mobileNav.courses',
    perm: 'course_prices.view',
  },
  { to: '/reports', icon: 'fa-chart-line', labelKey: 'mobileNav.reports', perm: 'reports.view' },
  // `/notifications` ATAYLAB yo'q — Header'da qo'ng'iroq tugmasi bor, pastki
  // panelda takrorlanmasin (foydalanuvchi so'rovi).
];

const MobileTabBar = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { getVisibleTabs, settingsReady } = useDashboardSettings();

  // `usePermission` — hook: har bir nomzod ruxsati oldindan, shartsiz olinadi
  // (hooks tartibi doim bir xil bo'lishi kerak).
  const has: Record<string, boolean> = {
    'student_attendance.view': usePermission('student_attendance.view'),
    'lessons.view': usePermission('lessons.view'),
    'groups.view': usePermission('groups.view'),
    'lessons_schedules.view': usePermission('lessons_schedules.view'),
    'tests.view': usePermission('tests.view'),
    'lids.view': usePermission('lids.view'),
    'payments.view': usePermission('payments.view'),
    'student_contracts.view': usePermission('student_contracts.view'),
    'course_prices.view': usePermission('course_prices.view'),
    'reports.view': usePermission('reports.view'),
  };

  // "Bosh sahifa" (`/`) — Boshqaruv paneli. Rolida analitika paneliga ruxsat
  // bo'lmasa bu tugma umuman ko'rsatilmaydi (`/` baribir foydalanuvchining
  // haqiqiy bosh sahifasiga yo'naltiradi — `pages/dashboard/index.tsx`).
  // Sozlamalar kelmaguncha optimistik ravishda ko'rsatiladi (miltillamasin).
  const roleName =
    typeof user?.role === 'string'
      ? user.role
      : ((user?.role as { name?: string } | undefined)?.name ?? user?.roles?.[0]?.name ?? '');
  const hasDashboard =
    roleName === 'admin' || !settingsReady || getVisibleTabs(roleName).length > 0;

  // O'qituvchida «Guruhlar» va «Davomat» bir xil kartalar — faqat «Guruhlar» (davomat sahifasida ham faol).
  const teacherGroupsMerged = useTeacherGroupsMerged();
  const location = useLocation();

  const links = CANDIDATES.filter((c) =>
    c.to === '/' ? hasDashboard : !(teacherGroupsMerged && c.to === '/students-attendance') && (!c.perm || has[c.perm]),
  ).slice(0, 6);

  // Bittagina havola qoladigan bo'lsa panel ortiqcha (Header hamburger'i bor).
  if (links.length < 2) return null;

  return (
    <nav className="mobile-tabbar" aria-label={t('mobileNav.title')}>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          className={({ isActive }) => {
            const alsoActive =
              teacherGroupsMerged && link.to === '/groups' && MERGED_GROUPS_PATHS.some((p) => location.pathname.startsWith(p));
            return `mobile-tabbar__item${isActive || alsoActive ? ' is-active' : ''}`;
          }}
        >
          <i className={`fa-solid ${link.icon}`} aria-hidden="true" />
          <span>{t(link.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default MobileTabBar;
