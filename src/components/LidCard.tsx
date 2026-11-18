import { useCallback, useRef, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lid } from '@/types/lid.types';
import { formatGender, getInterestColorMeta, getSourceLabel, LID_STATUS } from '@/types/lid.types';
import { getOperatorFullName } from '@/pages/lid/lid.service';
import { useLidInterestColor } from '@/pages/lid/useLidInterestColor';
import { getLocalized } from '@/utils/getLocalized';
import InterestColorPicker from '@/components/InterestColorPicker';

interface LeadCardProps {
  lead: Lid;
  color: string;
  hideComment?: boolean;
  isLastSection?: boolean;
  onDragStart: (lead: Lid) => void;
  onClick: (lead: Lid) => void;
}

const DRAG_THRESHOLD = 5;

function formatDateParts(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return { time: '', date: '' };
  }

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return {
    time: `${hours}:${minutes}`,
    date: `${day}.${month}.${year}`,
  };
}

function LeadCard({
  lead,
  color,
  onDragStart,
  onClick,
  hideComment,
  isLastSection,
}: LeadCardProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { time, date } = formatDateParts(lead.created_at);
  const interestColor = useLidInterestColor(lead.id, lead.interest_color);
  const interestMeta = getInterestColorMeta(interestColor.color);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  const shouldHideComment =
    hideComment || lead.status === LID_STATUS.NEW_ONLINE || lead.status === LID_STATUS.NEW_OFFLINE;

  const displayComment = useMemo(() => {
    if (!lead.comments || lead.comments.length === 0) return null;
    const filtered = lead.comments.filter((c) => !c.text.startsWith('RO‘YXATDAN O‘TGANLAR'));
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  }, [lead.comments]);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    onDragStart(lead);
  }, [onDragStart, lead]);

  const handleDragEnd = useCallback(() => {
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDraggingRef.current) return;
      if (!pointerStartRef.current) return;

      const dx = Math.abs(e.clientX - pointerStartRef.current.x);
      const dy = Math.abs(e.clientY - pointerStartRef.current.y);

      if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) {
        onClick(lead);
      }

      pointerStartRef.current = null;
    },
    [onClick, lead],
  );

  return (
    <div
      className={`lead-card${isLastSection ? ' lead-card--last-section' : ''}`}
      style={interestMeta ? { borderLeftColor: interestMeta.hex } : undefined}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      role="article"
      aria-label={`Lead: ${lead.first_name} ${lead.last_name}, ID: ${lead.id}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(lead);
        }
      }}
    >
      <div className="lead-card__top">
        <div className="lead-card__top-badges">
          <span className="lead-card__badge lead-card__badge--source">
            {getSourceLabel(lead.source, lang)}
          </span>
          <span
            className={`lead-card__badge lead-card__badge--${
              lead.gender === 'male' ? 'male' : 'female'
            }`}
          >
            {formatGender(lead.gender)}
          </span>
        </div>
        <InterestColorPicker
          value={interestColor.color}
          onChange={interestColor.setColor}
          disabled={interestColor.isPending}
        />
      </div>

      <div className="lead-card__id">ID: {lead.id}</div>
      <div className="lead-card__name-row">
        <div className="lead-card__name">
          {lead.first_name} {lead.last_name}
        </div>

        {lead.branch && (
          <div className="lead-card__branch">{getLocalized(lead.branch, 'name', lang)}</div>
        )}
      </div>
      <div className="lead-card__phone">{lead.phone}</div>

      <div className="lead-card__meta">
        {lead.course && (
          <span className="lead-card__course" style={{ backgroundColor: color, color: '#fff' }}>
            {getLocalized(lead.course, 'name', lang)}
          </span>
        )}

        <div className="lead-card__date">
          <span className="lead-card__time">{time}</span>
          <span className="lead-card__date-text">{date}</span>
        </div>
      </div>

      <div className="lead-card__group">
        {lead.level && (
          <span className="lead-card__level">{getLocalized(lead.level, 'name', lang)}</span>
        )}

        {lead.group && (
          <span className="lead-card__group-name">{getLocalized(lead.group, 'name', lang)}</span>
        )}
      </div>

      {!shouldHideComment && displayComment && (
        <div className="lead-card__note-section">
          <div className="lead-card__note-label">{t('lid.card.comment')}</div>
          <div className="lead-card__note">{displayComment.text}</div>
        </div>
      )}

      <div className="lead-card__operator">
        {t('lid.card.operator')}: {getOperatorFullName(lead.operator)}
      </div>
    </div>
  );
}

export default memo(LeadCard);
