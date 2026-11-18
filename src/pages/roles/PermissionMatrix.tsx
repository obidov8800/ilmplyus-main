import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ROLE_TEMPLATES,
  STANDARD_ACTIONS,
  buildModuleRows,
  layoutSections,
  rowEntries,
  type ModuleRow,
  type PermissionEntry,
  type StandardAction,
} from '../../permissions/permissionPolicy';
import { templateSelection, togglePermission, withDeps } from '../../permissions/permissionDeps';
import './permissionMatrix.css';

/*
 * ROL RUXSATLARI (Admin va User — fayl BIR XIL, faqat yorliq funksiyalari prop orqali). Eski kartochka dizayni:
 * bo'limlar tablarda (Pedagogik / Moliyaviy / Ma'muriy / Sotuv va boshqa), har bo'lim — kartochka; ichida beshta asosiy
 * amal bir xil tartibda, tasdiqlash, yuborish… — «Qo'shimcha» ostida. Qamrov (`view_all`) — «Sahifani ko'rish» yonida.
 * Bog'liqliklar `permissions/permissionDeps.ts` da; `lookups.view` bu yerda ko'rinmaydi (saqlashda o'zi qo'shiladi).
 */

interface Props {
  /** Tizimdagi barcha ruxsatlar (`/permissions`). */
  entries: PermissionEntry[];
  /** Hozir belgilangan ruxsat kodlari. */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Saqlangan holat — o'zgargan katakchalar ajratiladi. */
  saved?: Set<string>;
  moduleLabel: (module: string) => string;
  actionLabel: (module: string, action: string) => string;
  /** Bo'lim nomi yonidagi undov (!) oynasi. */
  renderInfo?: (row: ModuleRow) => ReactNode;
  /** Qo'shimcha tab (masalan «Dashboard»): matritsa o'rniga o'z mazmuni chiqadi. */
  extraTab?: { key: string; title: string; content: ReactNode };
}

const COLUMN_DEFAULTS: Record<StandardAction, string> = {
  view: 'Sahifani ko‘rish',
  show: 'Ko‘rish',
  create: 'Qo‘shish',
  edit: 'Tahrirlash',
  delete: 'O‘chirish',
};

export default function PermissionMatrix({
  entries,
  selected,
  onChange,
  saved,
  moduleLabel,
  actionLabel,
  renderInfo,
  extraTab,
}: Props) {
  const { t } = useTranslation();
  const [active, setActive] = useState('');

  const names = useMemo(() => new Set(entries.map((entry) => entry.name)), [entries]);
  const exists = (name: string) => names.has(name);
  const rows = useMemo(() => buildModuleRows(entries), [entries]);
  const sections = useMemo(() => layoutSections(rows, moduleLabel), [rows, moduleLabel]);

  const activeKey =
    active === extraTab?.key || sections.some((s) => s.section.key === active)
      ? active
      : (sections[0]?.section.key ?? extraTab?.key ?? '');
  const activeSection = sections.find((s) => s.section.key === activeKey);

  const toggle = (name: string, checked: boolean) => onChange(togglePermission(selected, name, checked, exists));

  const toggleRow = (row: ModuleRow, checked: boolean) => {
    const list = rowEntries(row).map((entry) => entry.name);
    if (checked) {
      onChange(withDeps([...selected, ...list], exists));
      return;
    }
    const next = new Set(selected);
    list.forEach((name) => next.delete(name));
    onChange(next);
  };

  const applyTemplate = (key: string) => {
    const template = ROLE_TEMPLATES.find((item) => item.key === key);
    if (template) onChange(templateSelection(template, exists));
  };

  const changed = (name: string) => !!saved && saved.has(name) !== selected.has(name);

  /** Bitta bo'lim — eski kartochka: sarlavha (hammasi), asosiy amallar bir xil tartibda, keyin qo'shimchalar. */
  const renderCard = (row: ModuleRow) => {
    const list = rowEntries(row);
    const count = list.filter((entry) => selected.has(entry.name)).length;
    const all = list.length > 0 && count === list.length;
    const viewOn = !!row.standard.view && selected.has(row.standard.view.name);
    const actionRow = (entry: PermissionEntry) => (
      <label
        key={entry.id}
        className={`permission-checkbox-label perm-row${changed(entry.name) ? ' perm-row--changed' : ''}`}
      >
        <input type="checkbox" checked={selected.has(entry.name)} onChange={(e) => toggle(entry.name, e.target.checked)} />
        <span className="perm-row__text">
          <span className="perm-row__label">
            {(STANDARD_ACTIONS as readonly string[]).includes(entry.action)
              ? t(`roles.matrix.columns.${entry.action}`, COLUMN_DEFAULTS[entry.action as StandardAction])
              : actionLabel(entry.module, entry.action)}
          </span>
        </span>
      </label>
    );
    return (
      <div key={row.module} className={`permission-card pcard${count > 0 ? ' pcard--on' : ''}`}>
        <div className="pcard-head">
          <label className="permission-card-title permission-card-title-checkbox">
            <input type="checkbox" checked={all} onChange={(e) => toggleRow(row, e.target.checked)} />
            <span className="pcard-title">{moduleLabel(row.module)}</span>
          </label>
          <span className="pcard-count" title={t('roles.guide.selectedOf', 'Belgilangan / jami')}>
            {count}/{list.length}
          </span>
          {renderInfo?.(row)}
        </div>

        <div className="permission-checkboxes">
          {STANDARD_ACTIONS.map((action) => {
            const entry = row.standard[action];
            if (!entry) return null;
            return (
              <div key={action} className="pcard-line">
                {actionRow(entry)}
                {action === 'view' && row.scope && (
                  <span
                    className={`pmx-scope${viewOn ? '' : ' is-disabled'}`}
                    title={t('roles.matrix.scopeHint', 'Qamrov: o‘zi kiritgan yozuvlar yoki hammasi')}
                  >
                    <button
                      type="button"
                      className={!selected.has(row.scope.name) ? 'is-active' : ''}
                      disabled={!viewOn}
                      onClick={() => toggle(row.scope!.name, false)}
                    >
                      {t('roles.matrix.scopeOwn', 'o‘ziniki')}
                    </button>
                    <button
                      type="button"
                      className={`${selected.has(row.scope.name) ? 'is-active' : ''}${changed(row.scope.name) ? ' is-changed' : ''}`}
                      disabled={!viewOn}
                      onClick={() => toggle(row.scope!.name, true)}
                    >
                      {t('roles.matrix.scopeAll', 'hammasi')}
                    </button>
                  </span>
                )}
              </div>
            );
          })}
          {row.extras.length > 0 && (
            <>
              <span className="pcard-extra-title">{t('roles.matrix.columns.extra', 'Qo‘shimcha')}</span>
              {row.extras.map((entry) => actionRow(entry))}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pmx">
      <div className="pmx-toolbar">
        <span className="pmx-toolbar__label">{t('roles.matrix.templates', 'Shablon:')}</span>
        {ROLE_TEMPLATES.map((template) => (
          <button key={template.key} type="button" className="pmx-template" onClick={() => applyTemplate(template.key)}>
            {t(`roles.matrix.template.${template.key}`, template.title)}
          </button>
        ))}
        <button type="button" className="pmx-template pmx-template--clear" onClick={() => onChange(new Set())}>
          {t('roles.matrix.clear', 'Hammasini olib tashlash')}
        </button>
        {/* `lookups.view` (forma tanlov ro'yxatlari) — katakcha emas: rolda kamida bitta ruxsat bo'lsa saqlashda o'zi qo'shiladi. */}
        <span
          className={`pmx-auto${selected.size > 0 ? ' is-on' : ''}`}
          title={t(
            'roles.matrix.autoLookupsHint',
            'Formalardagi «tanlang» ro‘yxatlari (filial, guruh, o‘quvchi, kurs…) uchun ruxsat (lookups.view) alohida berilmaydi: rolda kamida bitta ruxsat bo‘lsa, saqlashda o‘zi qo‘shiladi.',
          )}
        >
          <i className={`fa-solid ${selected.size > 0 ? 'fa-circle-check' : 'fa-circle-minus'}`} aria-hidden="true" />{' '}
          {selected.size > 0
            ? t('roles.matrix.autoLookupsOn', 'Tanlov ro‘yxatlari — avtomatik yoqiladi')
            : t('roles.matrix.autoLookupsOff', 'Tanlov ro‘yxatlari — rol bo‘sh')}
        </span>
      </div>

      <div className="pmx-tabs" role="tablist">
        {sections.map(({ section, rows: sectionRows }) => {
          const on = sectionRows.filter((row) => rowEntries(row).some((entry) => selected.has(entry.name))).length;
          return (
            <button
              key={section.key}
              type="button"
              role="tab"
              aria-selected={activeKey === section.key}
              className={`pmx-tab${activeKey === section.key ? ' is-active' : ''}`}
              onClick={() => setActive(section.key)}
            >
              <span>{t(`roles.matrix.sections.${section.key}`, section.title)}</span>
              <span className="pmx-tab__count" title={t('roles.tabs.countHint', 'Ruxsat berilgan bo‘limlar / jami')}>
                {on}/{sectionRows.length}
              </span>
            </button>
          );
        })}
        {extraTab && (
          <button
            type="button"
            role="tab"
            aria-selected={activeKey === extraTab.key}
            className={`pmx-tab${activeKey === extraTab.key ? ' is-active' : ''}`}
            onClick={() => setActive(extraTab.key)}
          >
            <span>{extraTab.title}</span>
          </button>
        )}
      </div>

      {activeKey === extraTab?.key ? (
        <div className="pmx-extra">{extraTab.content}</div>
      ) : (
        <div className="permission-grid">
          {activeSection?.items.map((item) =>
            item.kind === 'row' ? (
              renderCard(item.row)
            ) : (
              <div key={item.bundle.key} className="pcard-bundle">
                <div className="pcard-bundle__title">
                  <i className="fa-regular fa-window-maximize" aria-hidden="true" />{' '}
                  {t(`roles.matrix.bundles.${item.bundle.key}`, item.bundle.title)}
                </div>
                <div className="permission-grid pcard-bundle__grid">{item.rows.map((row) => renderCard(row))}</div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
