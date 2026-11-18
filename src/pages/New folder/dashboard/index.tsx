import { useState, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './dashboard.css';
import UmumiyTab from './UmumiyTab';
import SotuvTab from './SotuvTab';
import OquvchilarTab from './OquvchilarTab';
import OqituvchilarTab from './OqituvchilarTab';
import MoliyaTab from './MoliyaTab';
import DashboardFilterBar from './DashboardFilterBar';
import DashboardDetailModal from './DashboardDetailModal';
import DashboardSettingsModal from './DashboardSettingsModal';
import { useAllowedWidgets } from './widgets/useDashboardWidgets';
import useAuthStore from '@/store/useAuthStore';
import useDashboardSettings, { ALL_TABS, type MainTab } from '@/store/useDashboardSettings';
import { usePrefetchDashboard } from './usePrefetchDashboard';
import { resolveHomeRoute } from '@/utils/homeRoute';
import type { User } from '@/types/user.types';

function getRoleName(user: User | null): string {
  if (!user) return '';
  if (typeof user.role === 'string') return user.role;
  if (user.role && typeof user.role === 'object') {
    return (user.role as { name: string }).name ?? '';
  }
  return user.roles?.[0]?.name ?? '';
}

const TAB_DOTS: Record<MainTab, string> = {
  umumiy: '#3b82f6',
  sotuv: '#a855f7',
  oquvchi: '#06b6d4',
  oqituvchi: '#6366f1',
  moliya: '#22c55e',
};

const Dashboard = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const { tabNames, settingsReady } = useDashboardSettings();

  const [activeTab, setActiveTab] = useState<MainTab>('umumiy');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  // Vidjetlarni joylashtirish rejimi (sudrash, o'lcham, olib tashlash/qo'shish) —
  // har bir foydalanuvchi o'zi uchun yoqadi.
  const [editing, setEditing] = useState(false);

  // Sozlamalar javobini kutmasdan boshlanadi — pastdagi `return null` ham
  // buni to'xtatmaydi, chunki hooklar erta qaytishdan oldin ishlaydi.
  usePrefetchDashboard();

  const roleName = getRoleName(user);
  const isAdmin = roleName === 'admin';

  // Rolga ochiq tablar: kamida bitta ruxsat etilgan vidjeti bor bo'limlar.
  const { tabs: visibleKeys, hasAnyAccess } = useAllowedWidgets();

  const defaultLabels = Object.fromEntries(
    ALL_TABS.map((key) => [key, t(`dashboard.tabs.${key}`)]),
  ) as Record<MainTab, string>;

  const visibleTabs = visibleKeys.map((key) => ({
    key,
    label: (tabNames[key] ?? '').trim() || defaultLabels[key],
    dot: TAB_DOTS[key],
  }));

  const currentTab: MainTab = visibleKeys.includes(activeTab)
    ? activeTab
    : (visibleKeys[0] ?? 'umumiy');

  const currentTabLabel =
    visibleTabs.find((tab) => tab.key === currentTab)?.label ?? defaultLabels[currentTab];

  async function handleExportPdf() {
    const el = document.querySelector<HTMLElement>('.dashboard .dash-tab-content');
    if (!el || exportingPdf) return;
    setExportingPdf(true);
    try {
      const { exportDashboardPdf } = await import('./pdfExport');
      const stamp = new Date().toISOString().slice(0, 10);
      await exportDashboardPdf(el, `${currentTabLabel} - ${stamp}`, currentTabLabel);
    } finally {
      setExportingPdf(false);
    }
  }

  // Analitika paneliga ruxsati yo'q foydalanuvchi — bu sahifa umuman
  // ko'rsatilmaydi. Sozlamalar/ruxsatlar hali yuklanmagan bo'lsa kutamiz
  // (panel bir zumga miltillab ketmasin), yuklangach — foydalanuvchining
  // "bosh sahifasi"ga (ruxsati bor birinchi sahifa) yo'naltiramiz.
  if (!isAdmin && !hasAnyAccess) {
    if (!settingsReady || !permissionsLoaded) return null;
    return <Navigate to={resolveHomeRoute(permissions)} replace />;
  }

  return (
    <section className="dashboard container">
      <nav className="dash-tabs" aria-label={t('dashboard.tabsAria')}>
        <div className="dash-tabs__list">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              className={`dash-tab${currentTab === tab.key ? ' dash-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              style={
                currentTab === tab.key ? ({ '--tab-color': tab.dot } as CSSProperties) : undefined
              }
            >
              <span className="dash-tab__dot" style={{ background: tab.dot }} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="dash-tabs__actions">
          <button
            className={'dash-settings-btn' + (editing ? ' dash-settings-btn--on' : '')}
            onClick={() => setEditing((v) => !v)}
            title={t('dashboard.widgets.editTitle')}
          >
            <i className={editing ? 'fa-solid fa-check' : 'fa-solid fa-table-cells-large'} />
          </button>
          <button
            className="dash-export-btn"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            title={t('dashboard.exportPdf')}
          >
            <i className={exportingPdf ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-pdf'} />
          </button>
          {isAdmin && (
            <button
              className="dash-settings-btn"
              onClick={() => setSettingsOpen(true)}
              title={t('dashboard.settings.btnTitle')}
            >
              <i className="fa-solid fa-gear" />
            </button>
          )}
        </div>
      </nav>

      <DashboardFilterBar />

      {editing && <p className="dash-edit-hint">{t('dashboard.widgets.editHint')}</p>}

      {currentTab === 'umumiy' && <UmumiyTab editing={editing} />}
      {currentTab === 'sotuv' && <SotuvTab editing={editing} />}
      {currentTab === 'oquvchi' && <OquvchilarTab editing={editing} />}
      {currentTab === 'oqituvchi' && <OqituvchilarTab editing={editing} />}
      {currentTab === 'moliya' && <MoliyaTab editing={editing} />}

      {settingsOpen && (
        <DashboardSettingsModal
          onClose={() => setSettingsOpen(false)}
          defaultLabels={defaultLabels}
        />
      )}

      <DashboardDetailModal />
    </section>
  );
};

export default Dashboard;
