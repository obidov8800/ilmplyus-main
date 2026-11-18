import React from 'react';
import { Modal } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
  faBuilding,
  faCalendarDays,
  faClock,
  faDoorOpen,
  faLayerGroup,
  faUserTie,
  faUsers,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import type { Group } from '@/types/group.types';
import { getLocalized } from '@/utils/getLocalized';
import { formatDate } from '@/utils/date';
import './groupDetailModal.css';

/*
 * «Guruh tafsilotlari» oynasi (Dars jadvali) — Admin va User'da BIR XIL (faqat `Group` turi importi farq qiladi).
 * Uslub `groupDetailModal.css` (`gdm-` prefiksi): boshqa sahifalarning global `.modal*` qoidalari aralashmaydi.
 */

interface DetailModalProps {
  group: Group | null;
  opened: boolean;
  onClose: () => void;
}

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const DAY_SHORT: Record<string, string[]> = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
};

const DAY_FULL: Record<string, string[]> = {
  uz: ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'],
  ru: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

/** `09:00:00` / `9:00` → `09:00`. */
const hm = (time?: string | null) => {
  if (!time) return '';
  const [h = '', m = '00'] = String(time).split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
};

/** Nomi bo'sh (`-`) bo'lsa — ko'rsatilmaydi. */
const named = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text !== '-' ? text : '';
};

type Person = { first_name?: string | null; last_name?: string | null; middle_name?: string | null } | null | undefined;

const personName = (p: Person) => [p?.last_name, p?.first_name].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');

export const DetailModal: React.FC<DetailModalProps> = ({ group, opened, onClose }) => {
  const { t, i18n } = useTranslation();
  if (!group) return null;

  const lang = i18n.language;
  const lng = lang.slice(0, 2);
  const short = DAY_SHORT[lng] ?? DAY_SHORT.uz;
  const full = DAY_FULL[lng] ?? DAY_FULL.uz;

  const g = group as Group & {
    room?: { floor?: number | null } | null;
    teacher?: Person;
    students_count?: number | null;
    max_students?: number | null;
    start_date?: string | null;
    end_date?: string | null;
  };

  const lessonDays = new Set((g.days ?? []).map((d) => String(d).toLowerCase()));
  const daysText = WEEK.map((day, i) => (lessonDays.has(day) ? full[i] : '')).filter(Boolean).join(', ');
  const course = named(getLocalized(g.course, 'name', lang));
  const level = named(getLocalized(g.level, 'name', lang));
  const roomName = named(getLocalized(g.room, 'name', lang));
  const floor = g.room?.floor;
  const room = roomName
    ? floor != null
      ? `${roomName} · ${t('groupDetails.floor', '{{floor}}-qavat', { floor })}`
      : roomName
    : '';
  const branch = named(getLocalized(g.branch, 'name', lang));
  const teacher = personName(g.teacher);
  const start = hm(g.start_time);
  const end = hm(g.end_time);
  const count = typeof g.students_count === 'number' ? g.students_count : null;
  const max = g.max_students || null;
  const fill = count !== null && max ? Math.min(100, Math.round((count / max) * 100)) : null;
  const period =
    g.start_date || g.end_date
      ? [g.start_date ? formatDate(g.start_date) : '…', g.end_date ? formatDate(g.end_date) : '…'].join(' – ')
      : '';

  const info: { icon: IconDefinition; label: string; value: React.ReactNode; wide?: boolean }[] = [
    { icon: faUserTie, label: t('groupDetails.teacher', 'O‘qituvchi'), value: teacher || '—' },
    { icon: faDoorOpen, label: t('groupDetails.room', 'Xona'), value: room || '—' },
    { icon: faBuilding, label: t('groupDetails.branch', 'Filial'), value: branch || '—' },
    {
      icon: faUsers,
      label: t('groupDetails.students', 'O‘quvchilar'),
      value: (
        <>
          {count !== null && max ? `${count} / ${max}` : count !== null ? count : max ? t('groupDetails.capacity', '{{max}} o‘rin', { max }) : '—'}
          {fill !== null && (
            <span className="gdm-bar" aria-hidden="true">
              <span style={{ width: `${fill}%` }} />
            </span>
          )}
        </>
      ),
    },
  ];
  if (period) info.push({ icon: faCalendarDays, label: t('groupDetails.period', 'O‘qish muddati'), value: period, wide: true });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      size={560}
      radius={18}
      centered
      padding={0}
      classNames={{ content: 'gdm-modal', body: 'gdm-modal-body' }}
    >
      <div className="gdm">
        <div className="gdm-head">
          <div className="gdm-head__text">
            <span className="gdm-eyebrow">{t('groupDetails.title', 'Guruh tafsilotlari')}</span>
            <h2 className="gdm-name">{g.name}</h2>
            {(course || level) && (
              <div className="gdm-chips">
                {course && <span className="gdm-chip gdm-chip--course">{course}</span>}
                {level && (
                  <span className="gdm-chip">
                    <FontAwesomeIcon icon={faLayerGroup} /> {level}
                  </span>
                )}
              </div>
            )}
          </div>
          <button type="button" className="gdm-close" onClick={onClose} aria-label={t('common.close', 'Yopish')}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="gdm-body">
          <div className="gdm-schedule">
            <div className="gdm-schedule__row">
              <div className="gdm-days" aria-label={daysText}>
                {WEEK.map((day, i) => (
                  <span key={day} className={`gdm-day${lessonDays.has(day) ? ' is-on' : ''}`} title={full[i]}>
                    {short[i]}
                  </span>
                ))}
              </div>
              <div className="gdm-time">
                <FontAwesomeIcon icon={faClock} />
                <span>{start && end ? `${start} – ${end}` : start || '—'}</span>
              </div>
            </div>
            {daysText && <div className="gdm-days-text">{daysText}</div>}
          </div>

          <div className="gdm-grid">
            {info.map((item) => (
              <div key={item.label} className={`gdm-info${item.wide ? ' gdm-info--wide' : ''}`}>
                <span className="gdm-info__icon">
                  <FontAwesomeIcon icon={item.icon} />
                </span>
                <span className="gdm-info__text">
                  <span className="gdm-info__label">{item.label}</span>
                  <span className="gdm-info__value">{item.value}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
