/*
 * FAQAT «Xodim shartnomalari» bo'limi (sinov build'i, `VITE_CONTRACTS_ONLY=1`).
 *
 * To'liq ilova o'rniga faqat: login, parol o'rnatish va `/contracts*` sahifalari.
 * Yon menyu va boshqa bo'limlar yo'q. Ruxsatlar odatdagidek backend `/me` dan
 * (`employee_contracts.view/create/show`).
 */
import { Suspense, lazy, useState } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuthStore from './store/useAuthStore';
import ProtectedRoute from './components/ProtectedRoute';
import RouteFallback from './components/RouteFallback';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
import Header from './components/Header';
import mainLogo from './assets/images/logo-min.svg';
import asideLogo from "./assets/images/o'quv-markaz.svg";
import contractsIcon from './assets/images/handshake-solid-full.svg';

const LoginPage = lazy(() => import('./pages/login'));
const SetPasswordPage = lazy(() => import('./pages/set-password'));
const Contracts = lazy(() => import('./pages/contracts'));
const ContractsCreate = lazy(() => import('./pages/contracts/ContractsCreate'));
const ContractDetailPage = lazy(() => import('./pages/contracts/ContractDetailPage'));

/** Ruxsat yo'q bo'lsa `/` ga yo'naltirilmaydi (bu yerda `/` ham `/contracts` ga qaytib, aylana bo'lardi) — xabar ko'rsatiladi. */
const PermissionGate = ({ permission }: { permission: string }) => {
  const permissions = useAuthStore((state) => state.permissions);
  const loaded = useAuthStore((state) => state.permissionsLoaded);
  const logout = useAuthStore((state) => state.logout);
  if (!loaded) return <RouteFallback />;
  if (permissions.includes(permission)) return <Outlet />;
  return (
    <div style={{ padding: 40, maxWidth: 520 }}>
      <h3>Bu akkauntda ruxsat yo'q</h3>
      <p>
        «Xodim shartnomalari» bo'limi uchun <b>{permission}</b> ruxsati kerak. Boshqa akkaunt bilan
        kiring yoki shu rolga ruxsat bering.
      </p>
      <button
        type="button"
        onClick={() => {
          logout();
          window.location.href = '/login';
        }}
      >
        Chiqish
      </button>
    </div>
  );
};

/** Yon menyu — faqat «Shartnomalar» (asosiy `Aside` bilan bir xil klass va markup). */
const ContractsAside = ({
  collapsed,
  mobileOpen,
  onOpen,
  onClose,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCloseMobile: () => void;
}) => {
  const { t } = useTranslation();
  const permissions = useAuthStore((state) => state.permissions);
  const loaded = useAuthStore((state) => state.permissionsLoaded);
  const cls = ['aside', collapsed ? 'collapsed' : '', mobileOpen ? 'mobile-open' : ''].filter(Boolean).join(' ');
  const shrunk = collapsed && !mobileOpen;
  return (
    <aside className={cls} onMouseEnter={onOpen} onMouseLeave={onClose}>
      <div className="aside-top">
        <img src={shrunk ? mainLogo : asideLogo} alt="logo" className={shrunk ? 'collapsed-logo' : 'aside-logo'} />
        <button type="button" className="aside-close-btn" aria-label="Menyuni yopish" onClick={onCloseMobile}>
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div className="aside-content">
        <div className="sidebar">
          {(!loaded || permissions.includes('employee_contracts.view')) && (
            <NavLink to="/contracts" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
              <span className="sidebar-icon">
                <img src={contractsIcon} alt={t('header.contracts')} />
              </span>
              <span className={`sidebar-label ${collapsed ? 'hidden' : ''}`}>{t('header.contracts')}</span>
            </NavLink>
          )}
        </div>
      </div>
      <div className="aside-version">1.5 versiya</div>
    </aside>
  );
};

const ContractsLayout = () => {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }
  return (
    <div className={`layout ${collapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}>
      <ContractsAside
        collapsed={collapsed}
        mobileOpen={mobileMenuOpen}
        onOpen={() => setCollapsed(false)}
        onClose={() => setCollapsed(true)}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      {mobileMenuOpen && <div className="layout-backdrop" onClick={() => setMobileMenuOpen(false)} />}
      <div className="layout-main">
        <Header onMenuToggle={() => setMobileMenuOpen((v) => !v)} />
        <main className="page">
          <ChunkErrorBoundary resetKey={pathname}>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </ChunkErrorBoundary>
        </main>
      </div>
    </div>
  );
};

const ContractsOnlyApp = () => {
  const isAuth = useAuthStore((state) => state.isAuth);
  const { pathname } = useLocation();
  return (
    <ChunkErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route
            path="/login"
            element={isAuth ? <Navigate to="/contracts" replace /> : <LoginPage />}
          />
          <Route element={<ProtectedRoute />}>
            <Route element={<ContractsLayout />}>
              <Route element={<PermissionGate permission="employee_contracts.view" />}>
                <Route path="/contracts" element={<Contracts />} />
              </Route>
              <Route element={<PermissionGate permission="employee_contracts.create" />}>
                <Route path="/contracts/create" element={<ContractsCreate />} />
              </Route>
              <Route element={<PermissionGate permission="employee_contracts.show" />}>
                <Route path="/contracts/:id" element={<ContractDetailPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/contracts" replace />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
};

export default ContractsOnlyApp;
