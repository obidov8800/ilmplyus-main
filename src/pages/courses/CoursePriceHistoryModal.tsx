import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalized } from '@/utils/getLocalized';
import { formatDateTime } from '@/utils/date';
import type { CoursePrice } from '@/types/course.types';
import { AuditCell, StatusBadge, PctCell } from './courseShared';
import { formatNarx, formatCourseDate, isAutoPriceRow } from './courseFormat';
import { formatApplyDate, getNextApplyDate, getNextPrice, isAutoIndexActive } from './autoIndex';
import './courses.css';

interface Props {
  /** Bitta kurs+daraja+filial guruhining barcha yozuvlari — eng yangisi birinchi. */
  rows: CoursePrice[];
  lang: string;
  onClose: () => void;
}

/**
 * "Ko'rish" tugmasi ochadigan tarix modali.
 *
 * Jadvalning o'zi endi har guruhdan (kurs+daraja+filial) faqat bitta dolzarb
 * yozuvni ko'rsatadi (`groupCoursePrices`, `index.tsx`) — shu guruhning
 * qolgan barcha tarixiy narx o'zgarishlari shu yerda, xronologik tartibda
 * (eng yangisi tepada), vertikal vaqt chizig'i ko'rinishida ko'rsatiladi.
 */
export default function CoursePriceHistoryModal({ rows, lang, onClose }: Props) {
  const { t } = useTranslation();
  const first = rows[0];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="courses-modal-overlay" onClick={onClose}>
      <div
        className="courses-modal courses-modal--history"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cph-title"
      >
        <div className="courses-modal__header courses-modal__header--history">
          <div className="courses-modal__header-icon" aria-hidden="true">
            <i className="fa-solid fa-clock-rotate-left" />
          </div>
          <div className="courses-modal__header-text">
            <h2 className="courses-modal__title" id="cph-title">
              {t('course.historyTitle')}
            </h2>
            <span className="courses-modal__history-subtitle">
              {getLocalized(first.course, 'name', lang)}
              {first.level && ` · ${getLocalized(first.level, 'name', lang)}`}
              {` · ${getLocalized(first.branch, 'name', lang)}`}
            </span>
          </div>
          <span className="courses-modal__date">
            {t('course.viewHistoryCount', { count: rows.length })}
          </span>
        </div>

        <div className="courses-modal__body courses-modal__body--history">
          <ul className="courses-history-list">
            {rows.map((row, index) => {
              // Avtomatik indeksatsiya faqat hali kuchda turgan (eski
              // hisoblanmagan) so'rov uchun mantiqan dolzarb.
              const autoActive = row.holat !== 'old_price' && isAutoIndexActive(row);
              const nextApplyDate = autoActive ? getNextApplyDate(row) : null;
              const nextPrice = autoActive ? getNextPrice(row) : 0;
              const isLatest = index === 0;
              const dotCls =
                row.percentage > 0
                  ? 'courses-history-item__dot--up'
                  : row.percentage < 0
                    ? 'courses-history-item__dot--down'
                    : 'courses-history-item__dot--flat';

              return (
                <li
                  key={row.id}
                  className={`courses-history-item${isLatest ? ' courses-history-item--latest' : ''}`}
                  style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
                >
                  <span className={`courses-history-item__dot ${dotCls}`} aria-hidden="true" />

                  <div className="courses-history-item__card">
                    {isLatest && (
                      <span className="courses-history-item__latest-tag">
                        <i className="fa-solid fa-star" aria-hidden="true" />
                        {t('course.latestChange')}
                      </span>
                    )}

                    <div className="courses-history-item__top">
                      <span className="courses-history-item__price">
                        <span className="courses-history-item__price-old">
                          {formatNarx(row.old_price)}
                        </span>
                        <i className="fa-solid fa-arrow-right-long" aria-hidden="true" />
                        <span className="courses-history-item__price-new">
                          {formatNarx(row.new_price)}
                        </span>
                      </span>
                      <PctCell value={row.percentage} />
                      {row.holat && <StatusBadge status={row.holat} />}
                    </div>

                    <div className="courses-history-item__stats">
                      <span className="courses-history-item__stat">
                        <i className="fa-solid fa-calendar-days" aria-hidden="true" />
                        {formatDateTime(row.created_at, '')}
                      </span>
                      <span className="courses-history-item__stat">
                        <i className="fa-solid fa-rotate" aria-hidden="true" />
                        {t('course.changeDate')}: {formatCourseDate(row.start_date)}
                      </span>
                    </div>

                    <div className="courses-history-item__audit">
                      <AuditCell
                        icon="fa-user"
                        label={t('course.createdBy')}
                        name={isAutoPriceRow(row) ? t('course.autoChanged') : row.creator?.full_name}
                        at={row.created_at}
                      />
                      <AuditCell
                        icon="fa-check"
                        label={t('course.approvedBy')}
                        name={row.approver?.full_name}
                        at={row.approved_at}
                      />
                      <AuditCell
                        icon="fa-xmark"
                        label={t('course.rejectedBy')}
                        name={row.rejecter?.full_name}
                        at={row.rejected_at}
                      />
                    </div>

                    {nextApplyDate && nextPrice > 0 && (
                      <div className="courses-table__auto-hint">
                        <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
                        {t('course.autoIndexTitle', {
                          date: formatApplyDate(nextApplyDate),
                          price: formatNarx(nextPrice),
                        })}
                      </div>
                    )}

                    {row.holat === 'rejected' && row.rejection_reason && (
                      <div className="courses-history-item__reason">
                        <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                        {row.rejection_reason}
                      </div>
                    )}

                    {row.comment && (
                      <div className="courses-history-item__comment">
                        <i className="fa-solid fa-quote-left" aria-hidden="true" />
                        {row.comment}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="courses-modal__footer">
          <button type="button" className="courses-modal__btn courses-modal__btn--cancel" onClick={onClose}>
            {t('course.historyClose')}
          </button>
        </div>
      </div>
    </div>
  );
}
