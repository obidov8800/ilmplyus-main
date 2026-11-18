import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/utils/date';
import type { CourseStatus } from '@/types/course.types';
import { STATUS_DISPLAY } from './courseFormat';

/*
 * `index.tsx` (jadval) va `CoursePriceHistoryModal.tsx` (tarix) ikkalasi ham
 * bir xil qator ko'rinishlaridan (holat belgisi, narx foizi, kim/qachon)
 * foydalanadi — shu komponentlar shu yerda, umumiy. Toza (JSX'siz) mantiq
 * (`STATUS_DISPLAY`, formatlash, guruhlash) esa `courseFormat.ts`da — bu
 * fayl faqat komponent eksport qilishi shart (Vite Fast Refresh talabi).
 */

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const { labelKey, cls } = STATUS_DISPLAY[status as CourseStatus] ?? STATUS_DISPLAY.pending;
  return <span className={`courses-badge ${cls}`}>{t(labelKey)}</span>;
}

/** Ism + amal vaqti; ism kelmasa bo'sh katak ("—") ko'rsatiladi. */
export function ActorCell({ name, at }: { name?: string | null; at?: string | null }) {
  if (!name) return <span className="courses-actor__empty">—</span>;
  return (
    <span className="courses-actor">
      <span className="courses-actor__name">{name}</span>
      {at && <span className="courses-actor__at">{formatDateTime(at, '')}</span>}
    </span>
  );
}

/** "Sardor Aliyev" → "SA" — avatar doirachasida ko'rsatish uchun. */
function initials(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

/**
 * Narx tarixidagi bitta "kim/qachon" yozuvi — yorliq + avatar doiracha +
 * ism/sana. Bo'sh bo'lsa (masalan hali rad etilmagan) butun blok xiralashadi,
 * shunda ko'z avtomatik to'lgan maydonlarga tushadi.
 */
export function AuditCell({
  icon,
  label,
  name,
  at,
}: {
  icon: string;
  label: string;
  name?: string | null;
  at?: string | null;
}) {
  const filled = !!name;
  return (
    <div className={`courses-audit${filled ? '' : ' courses-audit--empty'}`}>
      <span className="courses-audit__avatar" aria-hidden="true">
        {filled ? initials(name) : <i className={`fa-solid ${icon}`} />}
      </span>
      <span className="courses-audit__body">
        <span className="courses-audit__label">{label}</span>
        <ActorCell name={name} at={at} />
      </span>
    </div>
  );
}

export function PctCell({ value }: { value: number }) {
  const cls = value > 0 ? 'courses-pct--up' : value < 0 ? 'courses-pct--down' : '';
  return (
    <span className={`courses-pct ${cls}`}>
      {value > 0 ? '+' : ''}
      {value}%
    </span>
  );
}
