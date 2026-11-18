import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LID_STATUS, type Lid, type LidStatus } from '@/types/lid.types';
import ModalPattern from './ModalPattern';
import NoteOrReminder from './NoteOrReminder';

interface AloqaModalProps {
  lead: Lid;
  /** `reminderAt` — "Taymer" rejimida to'ldirilsa, chaqiruvchi o'ziga eslatma-vazifa yaratadi. */
  onConfirm: (subStatus: LidStatus, comment: string, reminderAt: string | null) => void;
  onCancel: () => void;
}

const STATUS_ITEMS: Array<{
  id: LidStatus;
  title: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    id: LID_STATUS.CONTACTED,
    title: 'lid.statuses.contacted.title',
    desc: 'lid.statuses.contacted.desc',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12.4 19.79 19.79 0 0 1 1.62 3.78 2 2 0 0 1 3.59 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.58a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: LID_STATUS.NOT_CONTACTED,
    title: 'lid.statuses.notContacted.title',
    desc: 'lid.statuses.notContacted.desc',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: LID_STATUS.NOT_INTERESTED,
    title: 'lid.statuses.notInterested.title',
    desc: 'lid.statuses.notInterested.desc',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path
          d="M8 15s1.5-2 4-2 4 2 4 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="9" cy="9" r="1" fill="currentColor" />
        <circle cx="15" cy="9" r="1" fill="currentColor" />
      </svg>
    ),
  },
];

export default function AloqaModal({ lead, onConfirm, onCancel }: AloqaModalProps) {
  const { t } = useTranslation();
  const [selectedStatus, setSelectedStatus] = useState<LidStatus | null>(null);
  const [note, setNote] = useState('');
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!selectedStatus || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedStatus, note, reminderAt);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPattern title={t('lid.modals.editStatus')} onCancel={onCancel}>
      <div className="mp-lead-card">
        <div className="mp-lead-card__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
        <div className="mp-lead-card__info">
          <div className="mp-lead-card__name">
            {lead.first_name && lead.last_name
              ? `${lead.first_name} ${lead.last_name}`
              : lead.first_name || lead.last_name || t('lid.modals.unknown')}
          </div>
          <div className="mp-lead-card__group">{t('lid.modals.contactDepartment')}</div>
        </div>
      </div>

      <div className="mp-tabs">
        <button className="mp-tab" type="button">
          {t('lid.modals.tabContract')}
        </button>
        <button className="mp-tab mp-tab--active" type="button">
          {t('lid.modals.tabContact')}
        </button>
        <button className="mp-tab" type="button">
          {t('lid.modals.tabDemo')}
        </button>
      </div>

      <div className="mp-section">
        <div className="mp-section-title">{t('lid.modals.subStatus')}</div>
        {STATUS_ITEMS.map((item) => {
          const isSelected = selectedStatus === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`mp-status-card${isSelected ? ' mp-status-card--selected' : ''}`}
              onClick={() => setSelectedStatus(isSelected ? null : item.id)}
              aria-pressed={isSelected}
            >
              <div className="mp-status-card__icon" aria-hidden="true">
                {item.icon}
              </div>
              <div className="mp-status-card__content">
                <div className="mp-status-card__title">{t(item.title)}</div>
                <div className="mp-status-card__desc">{t(item.desc)}</div>
              </div>
              {isSelected && (
                <div className="mp-status-card__check" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M20 6L9 17l-5-5"
                      stroke="var(--color-accent)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mp-section">
        <NoteOrReminder note={note} onNoteChange={setNote} onReminderChange={setReminderAt} />
      </div>

      <div className="mp-actions">
        <button
          className="mp-btn mp-btn--confirm"
          onClick={handleConfirm}
          type="button"
          disabled={!selectedStatus || submitting}
        >
          {t('lid.modals.save')}
        </button>
        <button className="mp-btn mp-btn--cancel" onClick={onCancel} type="button">
          {t('lid.modals.cancel')}
        </button>
      </div>
    </ModalPattern>
  );
}
