import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faCalendarDays,
  faClock,
  faDoorOpen,
  faLayerGroup,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { formatDate } from '@/utils/date';
import { getLocalized } from '@/utils/getLocalized';
import type { Group } from '@/types/group.types';
// `.legend-item` va boshqa umumiy davomat stillari shu fayl orqali bundle'ga tushadi (attendance.css izohi).
import '../pages/students-attendance/studentsAttendance.css';
import './groupCard.css';

interface GroupCardProps {
  group: Group;
}

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const DAY_SHORT: Record<string, string[]> = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
};

/** `09:00:00` / `9:00` → `09:00`. */
const hm = (time?: string | null) => {
  if (!time) return '';
  const [h = '', m = '00'] = time.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
};

/** Nomi bo'sh (`-`) bo'lsa — ko'rsatilmaydi. */
const named = (value: string) => (value && value !== '-' ? value : '');

/**
 * Guruh kartasi — o'qituvchining «Guruhlar» sahifasi va «Davomat»dagi guruh tanlash. Bosilganda shu guruh davomati
 * ochiladi. Ko'rsatiladi: kurs, guruh nomi, bosqich, boshlanish sanasi, hafta kunlari (belgilangani ajratilgan),
 * dars vaqti, xona va o'quvchilar soni.
 */
const GroupCard = ({ group }: GroupCardProps) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const short = DAY_SHORT[lang.slice(0, 2)] ?? DAY_SHORT.uz;

  const open = () => navigate(`/students-attendance?groupId=${group.id}`);

  const lessonDays = new Set((group.days ?? []).map((d) => String(d).toLowerCase()));
  const course = named(getLocalized(group.course, 'name', lang));
  const level = named(getLocalized(group.level, 'name', lang));
  const room = named(getLocalized(group.room, 'name', lang));
  const start = hm(group.start_time);
  const end = hm(group.end_time);
  const count = typeof group.students_count === 'number' ? group.students_count : null;
  const max = group.max_students || null;

  const students =
    count !== null && max
      ? t('groupCard.studentsOf', '{{count}} / {{max}} o‘quvchi', { count, max })
      : count !== null
        ? t('groupCard.students', '{{count}} o‘quvchi', { count })
        : max
          ? t('groupCard.capacity', '{{max}} o‘rin', { max })
          : '—';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      aria-label={t('groupCard.open', 'Davomatni ochish') + ': ' + group.name}
      className="tgc"
    >
      <div className="tgc-head">
        <div className="tgc-head__main">
          {course && <span className="tgc-course">{course}</span>}
          <h3 className="tgc-name" title={group.name}>
            {group.name}
          </h3>
          {level && (
            <span className="tgc-level">
              <FontAwesomeIcon icon={faLayerGroup} /> {level}
            </span>
          )}
        </div>
        {group.start_date && (
          <span className="tgc-date" title={t('groupCard.startDate', 'Boshlangan sana')}>
            <FontAwesomeIcon icon={faCalendarDays} /> {formatDate(group.start_date)}
          </span>
        )}
      </div>

      <div className="tgc-schedule">
        <div className="tgc-days" aria-label={t('groupCard.days', 'Dars kunlari')}>
          {WEEK.map((day, i) => (
            <span key={day} className={`tgc-day${lessonDays.has(day) ? ' is-on' : ''}`}>
              {short[i]}
            </span>
          ))}
        </div>
        <div className="tgc-time">
          <FontAwesomeIcon icon={faClock} />
          <span>{start && end ? `${start} – ${end}` : start || '—'}</span>
        </div>
      </div>

      <div className="tgc-meta">
        <span className="tgc-meta__item" title={t('groupCard.studentsTitle', 'O‘quvchilar')}>
          <FontAwesomeIcon icon={faUsers} /> {students}
        </span>
        {room && (
          <span className="tgc-meta__item" title={t('groupCard.room', 'Xona')}>
            <FontAwesomeIcon icon={faDoorOpen} />{' '}
            {/xona|комн|room/i.test(room) ? room : t('groupCard.roomValue', '{{room}}-xona', { room })}
          </span>
        )}
      </div>

      <div className="tgc-foot">
        <span>{t('groupCard.open', 'Davomatni ochish')}</span>
        <FontAwesomeIcon icon={faArrowRight} className="tgc-foot__arrow" />
      </div>
    </div>
  );
};

export default GroupCard;
