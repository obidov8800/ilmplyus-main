interface Props {
  collapsed: boolean;
  mobileOpen?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCloseMobile?: () => void;
}

import { useState } from 'react';
import asideLogo from "../assets/images/o'quv-markaz.svg";
import mainLogo from '../assets/images/logo-min.svg';
import dashboardIcon from '../assets/images/dashboard-icon.svg';
import lidsIcon from '../assets/images/lidlar-icon.svg';
import tasksIcon from '../assets/images/tasks-icon.svg';
import coursesIcon from '../assets/images/courses-icon.svg';
import reportsIcon from '../assets/images/reports-icon.svg';
import attendanceIcon from '../assets/images/user-clock-solid-full.svg';
import staffAttendanceIcon from '../assets/images/briefcase-solid-full.svg';
import groupIcon from '../assets/images/graduation-cap-solid-full.svg';
import contractsIcon from '../assets/images/handshake-solid-full.svg';
import scheduleIcon from '../assets/images/calendar-days-solid-full.svg';
import studentsContractIcon from '../assets/images/file-signature-solid-full.svg';
import testsIcon from '../assets/images/list-check-solid-full.svg';
import lessonsIcon from '../assets/images/clipboard-list-solid-full.svg';
import demoLessonIcon from '../assets/images/chalkboard-user-solid-full.svg';
import paymentsIcon from '../assets/images/payments-icon.svg';
import expensesIcon from '../assets/images/wallet-solid-full.svg';
import financeIcon from '../assets/images/building-columns-solid-full.svg';
import faqIcon from '../assets/images/circle-question-solid-full.svg';
import { Accordion } from '@mantine/core';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../store/useAuthStore';
import { MERGED_GROUPS_PATHS, useTeacherGroupsMerged } from '../hooks/useCanSeeAll';
import useDashboardSettings from '../store/useDashboardSettings';
import {
  DAILY_CASH_REPORTS_VIEW,
  DEBTS_VIEW,
  FINANCE_ACCOUNTS_VIEW,
  FINANCE_SECTION_VIEW,
  FINANCIAL_PLANS_VIEW,
  MONTH_END_ANALYSIS_VIEW,
  PAYROLL_ADJUSTMENTS_VIEW,
  PAYROLL_DISTRIBUTION_REQUESTS_VIEW,
  PAYROLL_SHEETS_VIEW,
  PENALTIES_VIEW,
} from '../utils/financePermissions';
import type { Role } from '../types/user.types';
import { prefetchCallHistory } from '../pages/ip-telephone/callHistory';

/**
 * IP-telefoniya: kursor havola ustiga kelishi bilan (bosishdan OLDIN) sahifa
 * bo'lagi va PBX qo'ng'iroqlar tarixi yuklanishni boshlaydi — bosilganda
 * ma'lumot ko'pincha tayyor bo'ladi.
 */
const warmIpTelephone = () => {
  prefetchCallHistory();
  import('../pages/ip-telephone').catch(() => {});
};

/** «Shartnomalar» bo'limida ko'rsatiladigan yo'llar (umumiy menyudan chiqariladi). */
const SECTION_CONTRACT_PATHS = ['/contracts', '/students-contract', '/preschool-contracts'];

const subItem = (key: string, text: string, path: string, onWarm?: () => void) => (
  <NavLink
    key={key}
    to={path}
    onMouseEnter={onWarm}
    onFocus={onWarm}
    onTouchStart={onWarm}
    className={({ isActive }) => `sidebar-subitem ${isActive ? 'active' : ''}`}
  >
    {text}
  </NavLink>
);

const Aside = ({ collapsed, mobileOpen, onOpen, onClose, onCloseMobile }: Props) => {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const permissionsLoaded = useAuthStore((state) => state.permissionsLoaded);
  const role =
    typeof user?.role === 'string'
      ? user.role
      : ((user?.role as Role | undefined)?.name ?? user?.roles?.[0]?.name);
  const hasPermission = (p: string): boolean =>
    permissionsLoaded && (!p || permissions.includes(p));
  const { getVisibleTabs, hasFeature } = useDashboardSettings();
  // Rol yoki dashboard sozlamalari kelmagunicha havola ko'rsatilmaydi —
  // aks holda ruxsatsiz foydalanuvchida u bir zumga chiqib ketadi.
  const hasDashboardTabs = !!role && getVisibleTabs(role).length > 0;
  const canUseIpTelephone = hasFeature('ip_telephone.view');

  // O'qituvchida «Guruhlar» va «Davomat» bir xil kartalar — bitta «Guruhlar» qoladi (`useTeacherGroupsMerged`).
  const teacherGroupsMerged = useTeacherGroupsMerged();
  const hasStudentAttendance =
    permissionsLoaded &&
    !teacherGroupsMerged &&
    (permissions.includes('student_attendance.view') ||
      permissions.includes('student_attendance.create'));

  const hasAttendance =
    permissionsLoaded &&
    (permissions.includes('attendance.view') || permissions.includes('attendance.create'));

  // Moliya bo'limi — har bir havola o'z marshruti bilan bir xil ruxsat
  // ro'yxatidan tekshiriladi (`utils/financePermissions`). Sahifa bir nechta
  // resursni ko'rsatsa, ulardan kamida bittasi ochiq bo'lsa havola chiqadi.
  const hasAnyPermission = (list: string[]): boolean =>
    permissionsLoaded && list.some((p) => permissions.includes(p));

  const canViewFinances = hasAnyPermission(FINANCE_ACCOUNTS_VIEW);
  const canViewDebts = hasAnyPermission(DEBTS_VIEW);
  const canViewPayrollAdjustments = hasAnyPermission(PAYROLL_ADJUSTMENTS_VIEW);
  const canViewDistributionRequests = hasAnyPermission(PAYROLL_DISTRIBUTION_REQUESTS_VIEW);
  const canViewDailyCashReports = hasAnyPermission(DAILY_CASH_REPORTS_VIEW);
  const canViewPayrollSheets = hasAnyPermission(PAYROLL_SHEETS_VIEW);
  const canViewFines = hasAnyPermission(PENALTIES_VIEW);
  const canViewFinancialPlans = hasAnyPermission(FINANCIAL_PLANS_VIEW);
  const canViewMonthEndAnalysis = hasAnyPermission(MONTH_END_ANALYSIS_VIEW);

  // Bo'limning o'zi — ichida hech bo'lmasa bitta havola bo'lsagina chiziladi.
  const canViewFinanceSection = hasAnyPermission(FINANCE_SECTION_VIEW);

  // Akkordeon bo'limlari (`Accordion` boshqarilmagan holda ishlatilganda —
  // `value`/`onChange`siz — sahifa ochilganda hech qaysi bo'lim avtomatik
  // ochilmasdi, shu sabab ichidagi aktiv havola ko'rinmay (bo'lim yopiq
  // holda) qolardi. Endi joriy manzilga qarab tegishli bo'lim avtomatik
  // ochiladi, shu bilan birga `multiple={false}` tufayli bir vaqtda faqat
  // bitta bo'lim ochiq turadi.
  const salesSectionPaths = ['/lids', '/registration', '/ip-telephone'];
  const tasksSectionPaths = ['/tasks', '/cyclogram'];
  const financeSectionPaths = [
    '/finances',
    '/debts',
    '/payroll-adjustments',
    '/payroll-distribution-requests',
    '/daily-cash-reports',
    '/finance-generation',
    '/advance-schedule',
    '/salary-schedule',
    '/penalties',
    '/finance-plans',
    '/month-end-analysis',
  ];
  // «Boshqaruv» bo'limi staff menyusidan olib tashlandi (11-16); marshrutlar App.tsx'da qoladi.
  const activeAccordionValue = salesSectionPaths.some((p) => location.pathname.startsWith(p))
    ? 'sotuv-bolimi'
    : tasksSectionPaths.some((p) => location.pathname.startsWith(p))
      ? 'vazifalar-bolimi'
      : financeSectionPaths.some((p) => location.pathname.startsWith(p))
        ? 'moliya-bolimi'
        : null;

  const [openAccordion, setOpenAccordion] = useState<string | null>(activeAccordionValue);
  // Oldingi render'dagi qiymatni kuzatib boramiz — manzil (route) boshqa
  // bo'limga o'tganda ochiq akkordeonni shunga moslashtirish uchun. Bu
  // React'ning tavsiya qilingan "render vaqtida holatni moslashtirish"
  // usuli (effect ichida emas) — aks holda ortiqcha qayta render va
  // `set-state-in-effect` lint xatosiga olib kelardi.
  const [prevActiveValue, setPrevActiveValue] = useState(activeAccordionValue);
  if (activeAccordionValue !== prevActiveValue) {
    setPrevActiveValue(activeAccordionValue);
    if (activeAccordionValue) setOpenAccordion(activeAccordionValue);
  }

  const studentAttendanceItem = hasStudentAttendance
    ? {
        label: t('header.attendance'),
        icon: attendanceIcon,
        path: '/students-attendance',
        permission: 'student_attendance.view',
      }
    : null;

  const staffAttendanceItem = hasAttendance
    ? {
        label: t('header.staffAttendance'),
        icon: staffAttendanceIcon,
        path: '/attendance',
        permission: 'attendance.view',
      }
    : null;

  const menu = [
    {
      label: t('header.courses'),
      icon: coursesIcon,
      path: '/courses',
      permission: 'course_prices.view',
    },
    {
      // «Guruhlar» `groups.view` bilan chiqadi (App.tsx dagi izohga qarang): o'qituvchi o'z guruhlarini ko'radi.
      label: t('header.groups'),
      icon: groupIcon,
      path: '/groups',
      permission: 'groups.view',
      activeOn: teacherGroupsMerged ? MERGED_GROUPS_PATHS : undefined,
    },
    {
      label: t('header.demoLesson'),
      icon: demoLessonIcon,
      path: '/demo-lesson',
      permission: 'demo_lessons.view',
    },
    {
      label: t('header.lessonSchedule'),
      icon: scheduleIcon,
      path: '/lesson-schedule',
      permission: 'lessons_schedules.view',
    },
    {
      label: t('header.lessons'),
      icon: lessonsIcon,
      path: '/lessons',
      permission: 'lessons.view',
    },
    {
      label: t('header.test'),
      icon: testsIcon,
      path: '/test',
      // «Bir sahifa — bir ruxsat»: `tests.view` bo'lsa menyuda chiqadi (ilgari `tests.create` ham kerak edi —
      // sahifa manzil orqali ochilar, menyuda esa yo'q edi). Yaratish/tahrirlash tugmalari sahifada alohida.
      permission: 'tests.view',
    },
    {
      // "Mening testlarim" — faqat test TOPSHIRUVCHI (o'quvchi) uchun.
      // Test tuzuvchi (`tests.create`) va dars o'tadigan xodim (`lessons.create` —
      // o'qituvchi) bu bo'limни ko'rmaydi.
      label: t('header.studentExams'),
      icon: testsIcon,
      path: '/student-exams',
      permission: 'exam_sessions.view',
      hidden: hasPermission('tests.create') || hasPermission('lessons.create'),
    },
    {
      label: t('header.reports'),
      icon: reportsIcon,
      path: '/reports',
      permission: 'reports.view',
    },
    ...(studentAttendanceItem ? [studentAttendanceItem] : []),
    ...(hasPermission('preschool_attendances.view')
      ? [
          {
            label: t('header.preschoolAttendance'),
            icon: attendanceIcon,
            path: '/preschool-attendance',
            permission: 'preschool_attendances.view',
          },
        ]
      : []),
    ...(staffAttendanceItem ? [staffAttendanceItem] : []),
    {
      label: t('header.payments'),
      icon: paymentsIcon,
      path: '/payments',
      permission: 'payments.view',
    },
    ...(hasPermission('preschool_prices.view')
      ? [
          {
            label: t('header.preschoolPrices'),
            icon: paymentsIcon,
            path: '/preschool-prices',
            permission: 'preschool_prices.view',
          },
        ]
      : []),
    {
      label: t('header.contracts'),
      icon: contractsIcon,
      path: '/contracts',
      permission: 'employee_contracts.view',
    },
    {
      label: t('header.studentsContracts'),
      icon: studentsContractIcon,
      path: '/students-contract',
      permission: 'student_contracts.view',
    },
    ...(hasPermission('preschool_contracts.view')
      ? [
          {
            label: t('header.preschoolContracts'),
            icon: studentsContractIcon,
            path: '/preschool-contracts',
            permission: 'preschool_contracts.view',
          },
        ]
      : []),
  ];

  const asideClass = [
    'aside',
    collapsed ? 'collapsed' : '',
    mobileOpen ? 'mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={asideClass} onMouseEnter={onOpen} onMouseLeave={onClose}>
      <div className="aside-top">
        <img
          src={collapsed && !mobileOpen ? mainLogo : asideLogo}
          alt="logo"
          className={collapsed && !mobileOpen ? 'collapsed-logo' : 'aside-logo'}
        />
        <button
          type="button"
          className="aside-close-btn"
          aria-label="Menyuni yopish"
          onClick={onCloseMobile}
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div className="aside-content">
        <Accordion
          radius={0}
          className="sidebar"
          multiple={false}
          value={openAccordion}
          onChange={setOpenAccordion}
        >
          {/* Dashboard */}
          {hasDashboardTabs && (
            <NavLink
              to="/"
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            >
              <span className="sidebar-icon">
                <img src={dashboardIcon} alt={t('header.controlPanel')} />
              </span>
              <span className={`sidebar-label ${collapsed ? 'hidden' : ''}`}>
                {t('header.controlPanel')}
              </span>
            </NavLink>
          )}

          {/* Sotuv bo'limi */}
          {(hasPermission('lids.view') || canUseIpTelephone) && (
            <Accordion.Item value="sotuv-bolimi">
              <Accordion.Control className="sidebar-item">
                <span className="sidebar-icon">
                  <img src={lidsIcon} alt={t('header.sotuvBolimi')} />
                </span>
                <span className={`sidebar-label ${collapsed ? 'hidden' : ''}`}>
                  {t('header.sotuvBolimi')}
                </span>
              </Accordion.Control>
              <Accordion.Panel>
                <div className="sidebar-submenu">
                  {hasPermission('lids.view') &&
                    subItem('lidlar-boshqaruvi', t('header.lidsManagement'), '/lids')}
                  {hasPermission('lids.view') &&
                    subItem('lidlar-royxati', t('header.lidsRegistration'), '/registration')}
                  {canUseIpTelephone &&
                    subItem('ip-telefoniya', t('header.ipTelephone'), '/ip-telephone', warmIpTelephone)}
                </div>
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {/* Vazifalar — alohida bo'lim: operator vazifalari + yillik siklogramma */}
          {hasPermission('tasks.view') && (
            <Accordion.Item value="vazifalar-bolimi">
              <Accordion.Control className="sidebar-item">
                <span className="sidebar-icon">
                  <img src={tasksIcon} alt={t('header.tasks')} />
                </span>
                <span className={`sidebar-label ${collapsed ? 'hidden' : ''}`}>
                  {t('header.tasks')}
                </span>
              </Accordion.Control>
              <Accordion.Panel>
                <div className="sidebar-submenu">
                  {subItem('operator-vazifalari', t('header.operatorTasks'), '/tasks')}
                  {subItem('siklogramma', t('header.cyclogram'), '/cyclogram')}
                </div>
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {/*
           * Qolgan menu elementlari (To'lovlardan oldin).
           *
           * Ilgari rol NOMI "operator" bo'lganda /courses, /regions,
           * /districts, /contracts har doim yashirilardi — hatto o'sha rolga
           * mos ruxsat berilgan bo'lsa ham. Endi har bir havola faqat o'z
           * `permission`iga qarab ko'rsatiladi (rol nomidan qat'iy nazar).
           */}
          {menu
            .filter((item) => {
              if ('hidden' in item && item.hidden) return false;
              if (SECTION_CONTRACT_PATHS.includes(item.path)) return false;
              return !item.permission || hasPermission(item.permission);
            })
            .map((item) => (
              <NavLink
                key={item.label}
                to={item.path}
                className={({ isActive }) => {
                  const alsoActive =
                    'activeOn' in item && item.activeOn?.some((p) => location.pathname.startsWith(p));
                  return `sidebar-item ${item.label.length > 20 ? 'sidebar-item--wrap' : ''} ${isActive || alsoActive ? 'active' : ''}`;
                }}
              >
                <span className="sidebar-icon">
                  <img src={item.icon} alt={item.label} />
                </span>
                <span
                  className={`sidebar-label ${item.label.length > 20 ? 'sidebar-label--wrap' : ''} ${collapsed ? 'hidden' : ''}`}
                >
                  {item.label}
                </span>
              </NavLink>
            ))}

          {/* Chiqimlar — bitta sahifa, shuning uchun akkordeon emas, oddiy havola */}
          {hasPermission('expenses.view') && (
            <NavLink
              to="/expenses"
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            >
              <span className="sidebar-icon">
                <img src={expensesIcon} alt={t('expenses.expenseTitle')} />
              </span>
              <span className={`sidebar-label ${collapsed ? 'hidden' : ''}`}>
                {t('expenses.expenseTitle')}
              </span>
            </NavLink>
          )}

          {/* Moliya bo'limi — hech bir ichki havolaga ruxsat bo'lmasa,
              akkordeonning o'zi ham ko'rsatilmaydi. */}
          {canViewFinanceSection && (
            <Accordion.Item value="moliya-bolimi">
              <Accordion.Control className="sidebar-item">
                <span className="sidebar-icon">
                  <img src={financeIcon} alt={t('header.finance')} />
                </span>
                <span className={`sidebar-label ${collapsed ? 'hidden' : ''}`}>
                  {t('header.finance')}
                </span>
              </Accordion.Control>
              <Accordion.Panel>
                <div className="sidebar-submenu">
                  {canViewFinances &&
                    subItem('moliya-hisobotlar', t('header.financeScoreSheet'), '/finances')}
                  {canViewDebts && subItem('moliya-qarzlar', t('header.debts'), '/debts')}
                  {canViewPayrollAdjustments &&
                    subItem(
                      'moliya-ish-haqqi-tuzatishlar',
                      t('header.payrollAdjustments'),
                      '/payroll-adjustments',
                    )}
                  {canViewDistributionRequests &&
                    subItem(
                      'moliya-taqsimlash-sorovlari',
                      t('header.payrollDistributionRequests'),
                      '/payroll-distribution-requests',
                    )}
                  {canViewDailyCashReports &&
                    subItem(
                      'moliya-kunlik-kassa',
                      t('header.dailyCashReports'),
                      '/daily-cash-reports',
                    )}
                  {/* Avans/oylik vedomostlari — bitta `payroll_sheets.view` ruxsati. */}
                  {canViewPayrollSheets && (
                    <>
                      {subItem('moliya-generatsiya', t('header.generation'), '/finance-generation')}
                      {subItem(
                        'moliya-avans-jadvali',
                        t('header.advanceSchedule'),
                        '/advance-schedule',
                      )}
                      {subItem(
                        'moliya-oylik-jadvali',
                        t('header.salarySchedule'),
                        '/salary-schedule',
                      )}
                    </>
                  )}
                  {canViewFines && subItem('moliya-jarimalar', t('header.penalties'), '/penalties')}
                  {canViewFinancialPlans &&
                    subItem('moliya-rejalar', t('header.financePlans'), '/finance-plans')}
                  {/* Oy yakuni tahlili — rejalarni ko'rish emas, `analysis` ruxsati. */}
                  {canViewMonthEndAnalysis &&
                    subItem(
                      'moliya-oy-yakuni-tahlili',
                      t('header.monthEndAnalysis'),
                      '/month-end-analysis',
                    )}
                </div>
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {/* Shartnomalar */}
          {menu
            .filter((item) => {
              if (!SECTION_CONTRACT_PATHS.includes(item.path)) return false;
              return !item.permission || hasPermission(item.permission);
            })
            .map((item) => {
              // "Oylik taqsimoti" (`/payroll/distributions/:employeeId`)
              // shartnoma sahifasidan ochiladi, lekin o'z URL prefiksi
              // butunlay boshqa (`/contracts` bilan boshlanmaydi) — shu
              // sabab bu yerda qo'lda tekshiramiz, aks holda o'sha sahifada
              // hech qanday bo'lim aktiv ko'rinmay qolardi.
              const isPayrollDistribution =
                item.path === '/contracts' &&
                location.pathname.startsWith('/payroll/distributions');
              return (
                <NavLink
                  key={item.label}
                  to={item.path}
                  className={({ isActive }) =>
                    `sidebar-item ${item.label.length > 20 ? 'sidebar-item--wrap' : ''} ${isActive || isPayrollDistribution ? 'active' : ''}`
                  }
                >
                  <span className="sidebar-icon">
                    <img src={item.icon} alt={item.label} />
                  </span>
                  <span
                    className={`sidebar-label ${item.label.length > 20 ? 'sidebar-label--wrap' : ''} ${collapsed ? 'hidden' : ''}`}
                  >
                    {item.label}
                  </span>
                </NavLink>
              );
            })}

          {/* FAQ — har doim ko'rinadi (ruxsat talab qilmaydi, xuddi Profil
              kabi): ichidagi savollar o'zi foydalanuvchining ruxsatlariga
              qarab filtrlanadi (`FaqContent.tsx`). */}
          <NavLink
            to="/faq"
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <span className="sidebar-icon">
              <img src={faqIcon} alt={t('header.faq')} />
            </span>
            <span className={`sidebar-label ${collapsed ? 'hidden' : ''}`}>{t('header.faq')}</span>
          </NavLink>
        </Accordion>
      </div>
      <div className="aside-version">1.5 versiya</div>
    </aside>
  );
};

export default Aside;
