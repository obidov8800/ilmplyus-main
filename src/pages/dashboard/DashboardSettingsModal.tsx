import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { fetchRoles } from '@/pages/roles/roles.service';
import useDashboardSettings, { ALL_TABS, ALL_FEATURES, type MainTab, type FeaturePermission } from '@/store/useDashboardSettings';
import type { DashboardGoals } from '@/pages/dashboard/dashboard.service';
import { WIDGET_REGISTRY } from './widgets/registry';

interface Props {
  onClose: () => void;
  defaultLabels: Record<MainTab, string>;
}

export default function DashboardSettingsModal({ onClose, defaultLabels }: Props) {
  const { t } = useTranslation();
  const {
    tabNames,
    roleVisibility,
    widgetVisibility,
    features,
    pagePermissions,
    goals,
    saveSettings,
    isSaving,
  } = useDashboardSettings();

  const [section, setSection] = useState<'names' | 'visibility' | 'goals' | 'widgets'>('names');

  // Local state — applied only on Save
  const [localNames, setLocalNames] = useState<Partial<Record<MainTab, string>>>({
    ...tabNames,
  });
  const [localVis, setLocalVis] = useState<Record<string, string[]>>({
    ...roleVisibility,
  });
  const [localFeatures, setLocalFeatures] = useState<string[]>([...features]);
  const [localGoals, setLocalGoals] = useState<DashboardGoals>({ ...goals });
  const [localWidgets, setLocalWidgets] = useState<Record<string, string[]>>({
    ...widgetVisibility,
  });
  /** Vidjet ruxsatlari bo'limida hozir tanlangan rol. */
  const [widgetRole, setWidgetRole] = useState<string>('');

  const { data: rolesRaw, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles-settings'],
    queryFn: fetchRoles,
  });

  // API may return plain array or wrapped { data: [] }
  const roles = Array.isArray(rolesRaw)
    ? rolesRaw
    : Array.isArray((rolesRaw as unknown as { data: typeof rolesRaw })?.data)
      ? ((rolesRaw as unknown as { data: typeof rolesRaw }).data as typeof rolesRaw)
      : [];

  const nonAdminRoles = (roles ?? []).filter((r) => r.name !== 'admin');

  function handleSave() {
    const newTabNames: Record<string, string> = {};
    ALL_TABS.forEach((tab) => {
      const name = (localNames[tab] ?? '').trim();
      if (name) newTabNames[tab] = name;
    });
    saveSettings(
      {
        tabNames: newTabNames,
        roleVisibility: localVis,
        features: localFeatures,
        // Boshqa yerda boshqariladigan sozlamalar yo'qolmasin.
        pagePermissions,
        goals: localGoals,
        widgetVisibility: localWidgets,
      },
      { onSuccess: onClose },
    );
  }

  function isVisible(roleName: string, tab: MainTab): boolean {
    const saved = localVis[roleName];
    if (!saved) return true;
    return saved.includes(tab as string);
  }

  function toggleTab(roleName: string, tab: MainTab) {
    const current: string[] = localVis[roleName] ?? (ALL_TABS as string[]);
    const next = current.includes(tab) ? current.filter((k) => k !== tab) : [...current, tab];
    setLocalVis((prev) => ({ ...prev, [roleName]: next }));
  }

  const FEATURE_LABELS: Record<FeaturePermission, string> = {
    'ip_telephone.view': t('dashboard.settings.featureIpTelephoneView', {
      defaultValue: 'IP Telefoniya ko’rish',
    }),
    'ip_telephone.listen_recordings': t('dashboard.settings.featureListenRecordings', {
      defaultValue: 'Ovozli xabarlarni eshitish',
    }),
  };

  /**
   * Rol uchun vidjet ochiqmi.
   *
   * Rol umuman sozlanmagan bo'lsa — barcha vidjet ochiq (mavjud xatti-harakat
   * buzilmasin, ruxsat berilmagan rol panelsiz qolib ketmasin).
   */
  function isWidgetOn(roleName: string, widgetId: string): boolean {
    const saved = localWidgets[roleName];
    if (!saved) return true;
    return saved.includes(widgetId);
  }

  function toggleWidget(roleName: string, widgetId: string) {
    const current = localWidgets[roleName] ?? WIDGET_REGISTRY.map((w) => w.id);
    const next = current.includes(widgetId)
      ? current.filter((id) => id !== widgetId)
      : [...current, widgetId];
    setLocalWidgets((prev) => ({ ...prev, [roleName]: next }));
  }

  function setAllWidgets(roleName: string, on: boolean) {
    setLocalWidgets((prev) => ({
      ...prev,
      [roleName]: on ? WIDGET_REGISTRY.map((w) => w.id) : [],
    }));
  }

  /** Vidjetlar tab (bo'lim) bo'yicha guruhlanadi — ko'p vidjetni bitta ro'yxatda berish og'ir. */
  const widgetGroups = ALL_TABS.map((cat) => ({
    cat,
    defs: WIDGET_REGISTRY.filter((w) => w.category === cat),
  })).filter((g) => g.defs.length > 0);

  function tabLabel(tab: MainTab) {
    return (localNames[tab] ?? '').trim() || defaultLabels[tab];
  }

  return (
    <div className="dsm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dsm-modal">
        {/* Header */}
        <div className="dsm-header">
          <h2 className="dsm-title">
            <i className="fa-solid fa-gear" style={{ marginRight: 8, color: '#6366f1' }} />
            {t('dashboard.settings.title')}
          </h2>
          <button className="dsm-close" onClick={onClose} aria-label="yopish">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Section tabs */}
        <div className="dsm-sections">
          <button
            className={`dsm-section-tab${section === 'names' ? ' dsm-section-tab--active' : ''}`}
            onClick={() => setSection('names')}
          >
            <i className="fa-solid fa-pen" />
            {t('dashboard.settings.tabNames')}
          </button>
          <button
            className={`dsm-section-tab${section === 'visibility' ? ' dsm-section-tab--active' : ''}`}
            onClick={() => setSection('visibility')}
          >
            <i className="fa-solid fa-eye" />
            {t('dashboard.settings.visibility')}
          </button>
          <button
            className={`dsm-section-tab${section === 'goals' ? ' dsm-section-tab--active' : ''}`}
            onClick={() => setSection('goals')}
          >
            <i className="fa-solid fa-bullseye" />
            {t('dashboard.settings.goals')}
          </button>
          <button
            className={`dsm-section-tab${section === 'widgets' ? ' dsm-section-tab--active' : ''}`}
            onClick={() => setSection('widgets')}
          >
            <i className="fa-solid fa-table-cells-large" />
            {t('dashboard.widgets.permTab')}
          </button>
        </div>

        {/* Body */}
        <div className="dsm-body">
          {/* ── Tab name editing ─────────────────────────────── */}
          {section === 'names' && (
            <>
              <p className="dsm-hint">{t('dashboard.settings.hintNames')}</p>
              <table className="dsm-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.settings.defaultName')}</th>
                    <th>{t('dashboard.settings.customName')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ALL_TABS.map((tab) => (
                    <tr key={tab}>
                      <td className="dsm-default-label">
                        <span
                          className="dsm-tab-dot"
                          style={{
                            background: {
                              umumiy: '#3b82f6',
                              sotuv: '#a855f7',
                              oquvchi: '#06b6d4',
                              oqituvchi: '#6366f1',
                              moliya: '#22c55e',
                            }[tab],
                          }}
                        />
                        {defaultLabels[tab]}
                      </td>
                      <td>
                        <input
                          className="dsm-input"
                          value={localNames[tab] ?? ''}
                          onChange={(e) =>
                            setLocalNames((prev) => ({ ...prev, [tab]: e.target.value }))
                          }
                          placeholder={defaultLabels[tab]}
                        />
                      </td>
                      <td>
                        {(localNames[tab] ?? '').trim() && (
                          <button
                            className="dsm-reset-btn"
                            title="Standartga qaytarish"
                            onClick={() =>
                              setLocalNames((prev) => {
                                const n = { ...prev };
                                delete n[tab];
                                return n;
                              })
                            }
                          >
                            <i className="fa-solid fa-rotate-left" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Role visibility matrix ────────────────────────── */}
          {section === 'visibility' && (
            <>
              <p className="dsm-hint">{t('dashboard.settings.hintVisibility')}</p>
              {rolesLoading ? (
                <div className="dash-loading">{t('dashboard.common.loading')}</div>
              ) : (
                <>
                  {/* Dashboard tabs visibility */}
                  <div className="dsm-vis-wrap">
                    <table className="dsm-table dsm-vis-table">
                      <thead>
                        <tr>
                          <th>{t('dashboard.settings.role')}</th>
                          {ALL_TABS.map((tab) => (
                            <th key={tab} className="dsm-vis-th">
                              <span
                                className="dsm-tab-dot"
                                style={{
                                  background: {
                                    umumiy: '#3b82f6',
                                    sotuv: '#a855f7',
                                    oquvchi: '#06b6d4',
                                    oqituvchi: '#6366f1',
                                    moliya: '#22c55e',
                                  }[tab],
                                }}
                              />
                              {tabLabel(tab)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Admin row — locked */}
                        <tr className="dsm-vis-row dsm-vis-row--admin">
                          <td className="dsm-role-cell">
                            <span className="dsm-role-badge dsm-role-badge--admin">admin</span>
                            <span className="dsm-locked-note">
                              <i className="fa-solid fa-lock" />
                            </span>
                          </td>
                          {ALL_TABS.map((tab) => (
                            <td key={tab} className="dsm-check-cell">
                              <span className="dsm-check--locked">
                                <i className="fa-solid fa-check" />
                              </span>
                            </td>
                          ))}
                        </tr>

                        {nonAdminRoles.length === 0 ? (
                          <tr>
                            <td colSpan={ALL_TABS.length + 1} className="dsm-empty">
                              {t('dashboard.settings.noRoles')}
                            </td>
                          </tr>
                        ) : (
                          nonAdminRoles.map((role) => (
                            <tr key={role.id} className="dsm-vis-row">
                              <td className="dsm-role-cell">
                                <span className="dsm-role-badge">{role.name}</span>
                              </td>
                              {ALL_TABS.map((tab) => (
                                <td key={tab} className="dsm-check-cell">
                                  <input
                                    type="checkbox"
                                    className="dsm-checkbox"
                                    checked={isVisible(role.name, tab)}
                                    onChange={() => toggleTab(role.name, tab)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Feature permissions */}
                  <div className="dsm-vis-wrap" style={{ marginTop: 20 }}>
                    <p className="dsm-hint" style={{ marginBottom: 10 }}>
                      {t('dashboard.settings.hintFeatures', {
                        defaultValue: 'Frontend funksiya ruxsatlari',
                      })}
                    </p>
                    <table className="dsm-table dsm-vis-table">
                      <thead>
                        <tr>
                          <th>Funksiya</th>
                          <th className="dsm-vis-th">Ruxsat statusi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ALL_FEATURES.map((feat) => (
                          <tr key={feat} className="dsm-vis-row">
                            <td className="dsm-role-cell">
                              <span
                                className="dsm-tab-dot"
                                style={{ background: '#f59e0b', marginRight: 8 }}
                              />
                              {FEATURE_LABELS[feat]}
                            </td>
                            <td className="dsm-check-cell">
                              <input
                                type="checkbox"
                                className="dsm-checkbox"
                                checked={localFeatures.includes(feat)}
                                onChange={() => {
                                  setLocalFeatures((prev) =>
                                    prev.includes(feat)
                                      ? prev.filter((f) => f !== feat)
                                      : [...prev, feat],
                                  );
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Maqsadlar (progress bar bazasi) ──────────────────── */}
          {/* ── Oylik maqsadlar ──────────────────────────────── */}
          {section === 'goals' && (
            <>
              <p className="dsm-hint">{t('dashboard.settings.hintGoals')}</p>
              <table className="dsm-table">
                <tbody>
                  {(
                    [
                      ['shartnoma', 'goalShartnoma'],
                      ['tushum_mln', 'goalTushum'],
                      ['retention', 'goalRetention'],
                    ] as [keyof DashboardGoals, string][]
                  ).map(([key, labelKey]) => (
                    <tr key={key}>
                      <td className="dsm-default-label">{t(`dashboard.settings.${labelKey}`)}</td>
                      <td>
                        <input
                          className="dsm-input"
                          type="number"
                          min={0}
                          value={localGoals[key]}
                          onChange={(e) =>
                            setLocalGoals((prev) => ({
                              ...prev,
                              [key]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Vidjet ruxsatlari ─────────────────────────────── */}
          {section === 'widgets' && (
            <>
              <p className="dsm-hint">{t('dashboard.widgets.permHint')}</p>
              {rolesLoading ? (
                <div className="dash-loading">{t('dashboard.common.loading')}</div>
              ) : nonAdminRoles.length === 0 ? (
                <div className="dsm-empty">{t('dashboard.settings.noRoles')}</div>
              ) : (
                <>
                  <div className="dsm-role-picker">
                    {nonAdminRoles.map((role) => (
                      <button
                        key={role.id}
                        className={`dsm-role-chip${widgetRole === role.name ? ' dsm-role-chip--active' : ''}`}
                        onClick={() => setWidgetRole(role.name)}
                      >
                        {role.name}
                      </button>
                    ))}
                  </div>

                  {!widgetRole ? (
                    <p className="dsm-hint" style={{ marginTop: 14 }}>
                      {t('dashboard.widgets.permPickRole')}
                    </p>
                  ) : (
                    <>
                      <div className="dsm-wg-actions">
                        <button
                          className="dsm-wg-btn"
                          onClick={() => setAllWidgets(widgetRole, true)}
                        >
                          {t('dashboard.widgets.permAll')}
                        </button>
                        <button
                          className="dsm-wg-btn"
                          onClick={() => setAllWidgets(widgetRole, false)}
                        >
                          {t('dashboard.widgets.permNone')}
                        </button>
                        <span className="dsm-wg-count">
                          {WIDGET_REGISTRY.filter((w) => isWidgetOn(widgetRole, w.id)).length} /{' '}
                          {WIDGET_REGISTRY.length}
                        </span>
                      </div>

                      {widgetGroups.map(({ cat, defs }) => (
                        <div key={cat} className="dsm-wg-group">
                          <p className="dsm-wg-title">
                            <span
                              className="dsm-tab-dot"
                              style={{
                                background: {
                                  umumiy: '#3b82f6',
                                  sotuv: '#a855f7',
                                  oquvchi: '#06b6d4',
                                  oqituvchi: '#6366f1',
                                  moliya: '#22c55e',
                                }[cat],
                              }}
                            />
                            {tabLabel(cat)}
                          </p>
                          <div className="dsm-wg-items">
                            {defs.map((def) => (
                              <label key={def.id} className="dsm-wg-item">
                                <input
                                  type="checkbox"
                                  className="dsm-checkbox"
                                  checked={isWidgetOn(widgetRole, def.id)}
                                  onChange={() => toggleWidget(widgetRole, def.id)}
                                />
                                <span>{t(def.titleKey)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="dsm-footer">
          <button className="dsm-btn dsm-btn--save" onClick={handleSave} disabled={isSaving}>
            <i className={isSaving ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-floppy-disk'} />
            {t('dashboard.settings.save')}
          </button>
          <button className="dsm-btn dsm-btn--cancel" onClick={onClose}>
            {t('dashboard.settings.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
