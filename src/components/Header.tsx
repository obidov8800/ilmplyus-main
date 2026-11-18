import { useEffect, useState, useRef } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import LanguageSelect from './LanguageSelect/LanguageSelect';
import adminImg from '../assets/images/admin-img.svg';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../store/useAuthStore';
import { useAccount } from '../services/account';

interface Props {
  onMenuToggle?: () => void;
}

const Header = ({ onMenuToggle }: Props) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [showLogout, setShowLogout] = useState(false);
  const logoutRef = useRef<HTMLDivElement>(null);

  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (logoutRef.current && !logoutRef.current.contains(event.target as Node)) {
        setShowLogout(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /*
   * Har marshrut uchun header sarlavhasi.
   *
   * Ilgari bu ro'yxatda ~15 ta marshrut yo'q edi (roles, regions, districts,
   * finance-plans, penalties, salary-schedule, advance-schedule,
   * finance-generation, month-end-analysis, profile, student-exams...) —
   * ular hech qanday patternga tushmagani uchun pastdagi `matchedTitle ??
   * t('header.controlPanel')` orqali barchasi "Boshqaruv paneli" deb
   * ko'rsatilardi. Shu bo'sh joylar to'ldirildi; tarjima kalitlari allaqachon
   * mavjud edi (`messages/*.json`), faqat shu yerga ulanmagan edi.
   *
   * `/students-contract` ilgari `header.contracts`ga ("Shartnomalar" — xodim
   * shartnomalari) ishora qilardi, garchi aynan shu marshrut uchun alohida
   * `header.studentsContracts` ("O'quvchilar shartnomasi") kaliti bo'lsa ham
   * — shu xato ham tuzatildi. Ichki bolalar (`/adult`, `/minor`,
   * `/legal_bilateral`...) uchun `matchPath` https://reactrouter.com
   * dagidek `/*` bilan yopiladi, sakkiztasini birma-bir yozish o'rniga.
   */
  const pageTitles: Record<string, string> = {
    '/': t('header.controlPanel'),
    '/tasks': t('header.operatorTasks'),
    '/cyclogram': t('header.cyclogram'),
    '/users': t('header.users'),
    '/roles': t('header.roles'),
    '/regions': t('header.regions'),
    '/districts': t('header.districts'),
    '/courses': t('header.courses'),
    '/courses/price-list': t('header.priceList'),
    '/expenses': t('header.expenses'),
    '/lids': t('header.lids'),
    '/ip-telephone': t('header.ipTelephone'),
    '/students-contract': t('header.studentsContracts'),
    '/students-contract/*': t('header.studentsContracts'),
    '/students-attendance': t('header.Studentsattendance'),
    '/preschool-attendance': t('header.preschoolAttendance'),
    '/preschool-prices': t('header.preschoolPrices'),
    '/preschool-contracts': t('header.preschoolContracts'),
    // Yaratish sahifasi kurs shartnomasi kabi: yuqorida bo'lim nomi, sahifada «Shartnoma: …» (sarlavha ikki marta takrorlanmasin)
    '/preschool-contracts/new': t('header.studentsContracts'),
    '/preschool-contracts/*': t('header.preschoolContracts'),
    '/reports': t('header.reports'),
    '/payments': t('header.payments'),
    '/registration': t('header.registration'),
    '/groups': t('header.groups'),
    '/groups/*': t('header.groups'),
    '/attendance': t('header.attendance'),
    '/attendance/*': t('header.attendance'),
    '/contracts': t('header.contracts'),
    '/contracts/*': t('header.contracts'),
    '/lesson-schedule': t('header.lessonSchedule'),
    '/lessons': t('header.lessons'),
    '/test': t('header.test'),
    '/student-exams': t('header.studentExams'),
    '/student-exam/*': t('header.test'),
    '/profile': t('header.profile'),
    '/demo-lesson': t('header.demoLesson'),
    '/finances': t('header.finances'),
    '/debts': t('header.debtsTitle'),
    '/payroll-adjustments': t('header.payrollAdjustments'),
    '/payroll-adjustments/*': t('header.payrollAdjustments'),
    '/payroll-distribution-requests': t('header.payrollDistributionRequests'),
    '/daily-cash-reports': t('header.dailyCashReports'),
    '/payroll/distributions/:employeeId': t('header.payroll'),
    '/finance-generation': t('header.generation'),
    '/advance-schedule': t('header.advanceSchedule'),
    '/salary-schedule': t('header.salarySchedule'),
    '/penalties': t('header.penalties'),
    '/finance-plans': t('header.financePlans'),
    '/month-end-analysis': t('header.monthEndAnalysis'),
    '/notifications': t('header.notifications'),
    '/faq': t('header.faq'),
  };

  // Ism va rol — yagona hisob servisidan (`services/account.ts`): xodim-foydalanuvchi, o'z login/paroli bilan kirgan
  // xodim (o'qituvchi) va talaba uchun bir xil; qo'shimcha `/me` so'rovi yo'q. Juda uzun ism sig'masin: familiya to'liq,
  // qolgan so'zlar bosh harfi bilan ("Abdullayeva Mohichehra Ravshanbekovna" → "Abdullayeva M. R."), to'liq ism —
  // sichqoncha ustida.
  const { account } = useAccount();
  const fullName = account?.fullName ?? '';
  const displayName = account?.shortName ?? '';

  // Kalitlar route shabloni (`/payroll/distributions/:employeeId`) bo'lgani uchun
  // oddiy obyekt qidiruvi ish bermaydi — `:employeeId` shunchaki matn bo'lib qolardi.
  // `matchPath` shablonni haqiqiy manzilga solishtiradi.
  const matchedTitle = Object.entries(pageTitles).find(([pattern]) =>
    matchPath(pattern, pathname),
  )?.[1];

  const title = matchedTitle ?? t('header.controlPanel');

  return (
    <header>
      <div className="header-left">
        <button
          type="button"
          className="menu-toggle-btn"
          aria-label="Menyu"
          onClick={onMenuToggle}
        >
          <i className="fa-solid fa-bars"></i>
        </button>
        <h1>{title}</h1>
      </div>

      <div className="header-right">
        <div className="header-right-buttons">
          <LanguageSelect />
          <button
            type="button"
            className="notification-btn"
            aria-label={t('header.notifications')}
            onClick={() => navigate('/notifications')}
          >
            <i className="fa-solid fa-bell"></i>
          </button>
          <button className="chat-btn">
            <i className="fa-regular fa-message"></i>
          </button>
        </div>

        <div
          className={`header-right-admin ${showLogout ? 'active' : ''}`}
          onClick={() => setShowLogout(!showLogout)}
          ref={logoutRef}
        >
          <div style={{ textAlign: 'right' }}>
            <h1 title={fullName}>{displayName}</h1>
            <h3>{account?.roleName}</h3>
          </div>
          <div className="header-right-admin-card">
            <img src={adminImg} alt="admin avatar" />
          </div>

          {showLogout && (
            <div className="logout-dropdown">
              <button
                className="logout-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLogout(false);
                  navigate('/profile');
                }}
              >
                <i className="fa-solid fa-user"></i>
                <span>{t('header.profile')}</span>
              </button>
              <button onClick={handleLogout} className="logout-btn">
                <i className="fa-solid fa-right-from-bracket"></i>
                <span>{t('header.logout')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
