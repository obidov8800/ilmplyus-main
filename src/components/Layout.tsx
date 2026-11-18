import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Aside from './Aside';
import MobileTabBar from './MobileTabBar';
import RouteFallback from './RouteFallback';
import ChunkErrorBoundary from './ChunkErrorBoundary';
import GlobalCallWidget from '@/features/sip/GlobalCallWidget';
import AccessNotice from './AccessNotice';

const Layout = () => {
  const [collapsed, setCollapsed] = useState(true);
  // Mobil/planshetda menyu sichqoncha hover bilan emas, hamburger tugma bilan
  // ochiladi-yopiladi — shuning uchun alohida holat, desktop hover mantig'iga
  // (collapsed) tegmaydi.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { pathname } = useLocation();
  // Lids page keeps its own full-bleed board layout (excluded from the gutter system)
  const isFullBleed = pathname.startsWith('/lids');

  // Sahifa almashganda mobil menyu avtomatik yopiladi — effekt o'rniga render
  // paytida moslashtiriladi (React'ning tavsiya qilingan usuli), aks holda
  // `react-hooks/set-state-in-effect` effekt ichida sinxron setState haqida
  // ogohlantiradi.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  return (
    <div className={`layout ${collapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}>
      <Aside
        collapsed={collapsed}
        mobileOpen={mobileMenuOpen}
        onOpen={() => setCollapsed(false)}
        onClose={() => setCollapsed(true)}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {mobileMenuOpen && (
        <div className="layout-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      <div className="layout-main">
        <Header onMenuToggle={() => setMobileMenuOpen((v) => !v)} />

        {/* Call popup — lives here (not inside the ip-telephone page) so it
            shows on every page for as long as the user is logged in, and
            between header/main so the minimized call bar sits in the content
            column instead of covering the sidebar. */}
        <GlobalCallWidget />

        {/* Suspense shu yerda — sahifa bo'lagi yuklanayotganda yon menyu va
            header o'z joyida qoladi, faqat ichki qism kutadi. */}
        <main className={`page ${isFullBleed ? 'page--full' : ''}`}>
          {/* Shartnomasiz foydalanuvchi uchun tushuntirish (kirgandan keyin; yopish mumkin). */}
          <AccessNotice />
          <ChunkErrorBoundary resetKey={pathname}>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </ChunkErrorBoundary>
        </main>

        {/* Telefon/planshet uchun pastki tezkor navigatsiya (≤900px).
            To'liq menyu — Header'dagi hamburger orqali. */}
        <MobileTabBar />
      </div>
    </div>
  );
};

export default Layout;
