import { useEffect, useRef, useCallback, memo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { notifications } from '@mantine/notifications';
import type { Lid } from '@/types/lid.types';
import { getName, formatGender } from '@/types/lid.types';
import { addLidComment } from '@/pages/lid/lid.service';
import { useLidInterestColor } from '@/pages/lid/useLidInterestColor';
import { getLocalized } from '@/utils/getLocalized';
import { usePermission } from '@/hooks/usePermission';
import { WriteGuard } from '@/components/Protected';
import useAuthStore from '@/store/useAuthStore';
import { API } from '@/api/api';
import type { CreateTaskPayload } from '@/types/task.types';
import TaskModal from '@/components/TaskModal';
import NoteOrReminder from '@/components/NoteOrReminder';
import useCallUIStore from '@/features/sip/useCallUIStore';
import InterestColorPicker from '@/components/InterestColorPicker';
import './LeadDetailsModal.css';

interface LeadDetailsModalProps {
  lead: Lid;
  onClose: () => void;
  onEdit: (lead: Lid) => void;
  onPhoneClick?: (phone: string, lead: Lid) => void;
}

const SOURCE_ICONS: Record<string, ReactElement> = {
  telegram: <i className="fa-brands fa-telegram" />,
  instagram: <i className="fa-brands fa-instagram" />,
  facebook: <i className="fa-brands fa-facebook" />,
};

function LeadDetailsModal({ lead, onClose, onEdit, onPhoneClick }: LeadDetailsModalProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [note, setNote] = useState<string>('');
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const openCall = useCallUIStore((s) => s.openCall);

  const canCreateTask = usePermission('tasks.create');
  const canCreateContract = usePermission('student_contracts.create');
  const canEditLead = usePermission('lids.edit');
  const currentUserId = useAuthStore((state) => state.user?.id);

  const handleEditLead = () => {
    onEdit(lead);
  };

  const handlePhoneClick = useCallback(() => {
    if (!lead.phone) return;
    const phone = lead.phone.replace(/^\+998/, '');
    if (onPhoneClick) {
      onPhoneClick(phone, lead);
    } else {
      // The call popup (GlobalCallWidget, mounted in Layout) shows on every
      // page, so there's no need to navigate to /ip-telephone just to place
      // a call anymore — open it right here, prefilled and ready to dial.
      onClose();
      openCall(phone);
    }
  }, [lead, onClose, onPhoneClick, openCall]);

  const handleCreateContract = useCallback(() => {
    onClose();
    navigate('/students-contract/adult', { state: { lidId: lead.id } });
  }, [lead.id, navigate, onClose]);

  const comments = lead.comments ?? [];

  // `NoteOrReminder`ning "Taymer" rejimidagi sana/vaqti o'zining ICHKI
  // holati (bu modal yopilmay, faqat izoh/eslatma qayta-qayta yoziladi —
  // AloqaModal/DemoModal/ShartnomaModal'dan farqli, ular saqlangach BUTUN
  // modal yopiladi). Shu sabab bu yerda alohida "qayta o'rnatish" kerak:
  // saqlash muvaffaqiyatli bo'lgach `resetKey`ni oshirish `<NoteOrReminder
  // key={resetKey}>`ni qayta mount qiladi — mode/sana/vaqt boshlang'ich
  // holatga qaytadi (React "key o'zgarsa qayta yasa" konvensiyasi).
  const [resetKey, setResetKey] = useState(0);

  const addCommentMutation = useMutation({
    mutationFn: (text: string) => addLidComment(lead.id, text),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lids'] });
      setNote('');
      setResetKey((k) => k + 1);
    },
  });

  const createReminderMutation = useMutation({
    mutationFn: (payload: CreateTaskPayload) => API.post('/tasks', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setResetKey((k) => k + 1);
      setReminderAt(null);
    },
  });

  const interestColor = useLidInterestColor(lead.id, lead.interest_color);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleSave = useCallback(() => {
    const trimmed = note.trim();
    if (!trimmed && !reminderAt) return;

    if (trimmed) addCommentMutation.mutate(trimmed);

    if (reminderAt) {
      if (!currentUserId) {
        notifications.show({
          title: t('lid.modals.reminderErrorTitle'),
          message: t('lid.modals.reminderErrorNoOperator'),
          color: 'red',
        });
        return;
      }
      const fullName = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim();
      createReminderMutation.mutate(
        {
          lid_id: lead.id,
          operator_id: currentUserId,
          deadline: reminderAt,
          priority: 'orta',
          description: trimmed || t('lid.modals.reminderDefaultDescription', { name: fullName }),
        },
        {
          onError: () =>
            notifications.show({
              title: t('lid.modals.reminderErrorTitle'),
              message: t('lid.modals.reminderErrorFailed'),
              color: 'red',
            }),
        },
      );
    }
  }, [note, reminderAt, addCommentMutation, createReminderMutation, currentUserId, lead, t]);

  const fullName = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() || '—';

  const sourceName = getLocalized(lead.source, 'name', lang);
  const sourceKey = sourceName !== '-' ? sourceName.toLowerCase() : '';
  const sourceLabel = sourceName !== '-' ? sourceName.toUpperCase() : '—';

  const registrationDate = (() => {
    const d = new Date(lead.created_at);
    if (isNaN(d.getTime())) return '—';

    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${hours}:${minutes} ${day}.${month}.${year}`;
  })();

  return (
    <>
      <div
        className="ldm-overlay"
        role="presentation"
        onClick={handleBackdropClick}
        aria-hidden="false"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ldm-title"
          aria-describedby="ldm-desc"
          className="ldm-container"
        >
          <button
            ref={closeBtnRef}
            className="ldm-close-btn"
            type="button"
            onClick={onClose}
            aria-label={t('leadDetailsModal.closeModal')}
          >
            <i className="fa-solid fa-xmark" />
          </button>

          <div className="ldm-header">
            <div className="ldm-avatar">
              <i className="fa-solid fa-user-graduate" />
            </div>

            <div className="ldm-header-info">
              <h2 id="ldm-title" className="ldm-fullname">
                {fullName.toUpperCase()}
              </h2>

              <div className="ldm-meta-row">
                <span className="ldm-meta-item">
                  <i className="fa-solid fa-id-card ldm-meta-icon" />
                  <span className="ldm-meta-label"># ID: {lead.id}</span>
                </span>

                <span className="ldm-meta-item">
                  <i className="fa-solid fa-calendar ldm-meta-icon" />
                  <span className="ldm-meta-label">
                    {t('leadDetailsModal.registrationTime')}: {registrationDate}
                  </span>
                </span>
              </div>

              <div className="ldm-meta-row">
                <span className="ldm-gender">{formatGender(lead.gender).toUpperCase()}</span>

                <span className="ldm-meta-item">
                  <i className="fa-solid fa-location-dot ldm-meta-icon" />
                  <span className="ldm-meta-label">
                    {(lead.district
                      ? getLocalized(lead.district, 'name', lang)
                      : '—'
                    ).toUpperCase()}
                  </span>
                </span>
              </div>
            </div>

            <div className="ldm-header-right">
              <button type="button" className="ldm-source-btn">
                <span>{SOURCE_ICONS[sourceKey] ?? <i className="fa-solid fa-globe" />}</span>{' '}
                {sourceLabel}
              </button>

              <button type="button" className="ldm-phone-btn" onClick={handlePhoneClick}>
                <i className="fa-solid fa-phone" /> {lead.phone ?? '—'}
              </button>

              <InterestColorPicker
                variant="row"
                value={interestColor.color}
                onChange={interestColor.setColor}
                disabled={interestColor.isPending}
              />
            </div>
          </div>

          <div id="ldm-desc" className="ldm-body">
            <div className="ldm-education">
              <div className="ldm-section-header">
                <div className="ldm-section-header-left">
                  <i className="fa-solid fa-graduation-cap ldm-section-icon" />
                  <span className="ldm-section-title">{t('leadDetailsModal.education')}</span>
                </div>

                {canEditLead && (
                  <button type="button" className="ldm-edit-btn" onClick={handleEditLead}>
                    <i className="fa-solid fa-pen" />
                    Tahrirlash
                  </button>
                )}
              </div>

              <div className="ldm-edu-field">
                <span className="ldm-edu-label">Filial:</span>

                <span className="ldm-edu-value">{getName(lead.branch, lang)}</span>
              </div>

              <div className="ldm-edu-field">
                <span className="ldm-edu-label">{t('leadDetailsModal.course')}:</span>
                <span className="ldm-edu-value">{getName(lead.course, lang)}</span>
              </div>

              <div className="ldm-edu-field">
                <span className="ldm-edu-label">{t('leadDetailsModal.level')}:</span>
                <span className="ldm-edu-value">{getName(lead.level, lang)}</span>
              </div>

              <div className="ldm-edu-field">
                <span className="ldm-edu-label">{t('leadDetailsModal.group')}:</span>
                <span className="ldm-edu-value">{getName(lead.group, lang)}</span>
              </div>
            </div>

            <div className="ldm-note-section">
              <NoteOrReminder
                key={resetKey}
                note={note}
                onNoteChange={setNote}
                onReminderChange={setReminderAt}
                textareaClassName="ldm-note-textarea"
                labelKey="leadDetailsModal.note"
              />

              <button
                type="button"
                className="ldm-save-btn"
                onClick={handleSave}
                disabled={
                  (!note.trim() && !reminderAt) ||
                  addCommentMutation.isPending ||
                  createReminderMutation.isPending
                }
              >
                {t('leadDetailsModal.save')}
              </button>
            </div>
          </div>

          {comments?.length ? (
            <div className="ldm-comments">
              {comments.map((c) => {
                const d = new Date(c.created_at);
                const formatted = isNaN(d.getTime())
                  ? '—'
                  : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
                      2,
                      '0',
                    )} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(
                      2,
                      '0',
                    )}.${d.getFullYear()}`;

                const authorName = c.author_name ? `${c.author_name}` : '—';

                return (
                  <div key={c.created_at} className="ldm-comment-card">
                    <div className="ldm-comment-author">
                      <i className="fa-solid fa-user" /> {authorName || '—'}
                    </div>
                    <p className="ldm-comment-text">{c.text}</p>
                    <div className="ldm-comment-date">
                      <i className="fa-solid fa-clock" /> {formatted}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {(canCreateTask || canCreateContract) && (
            <div className="ldm-actions">
              <WriteGuard>
                {canCreateTask && (
                  <button
                    type="button"
                    className="ldm-action-btn"
                    onClick={() => setShowTaskModal(true)}
                  >
                    Vazifani yaratish
                  </button>
                )}
                {canCreateContract && (
                  <button type="button" className="ldm-action-btn" onClick={handleCreateContract}>
                    Shartnoma tuzish
                  </button>
                )}
              </WriteGuard>
            </div>
          )}
        </div>
      </div>

      {showTaskModal && (
        <TaskModal
          onClose={() => setShowTaskModal(false)}
          initialLidId={lead.id}
          initialLidName={`${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()}
        />
      )}
      {/* {showEditModal && (
        <RegistrationModal
          editId={lead.id}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            setShowAloqaModal(true);
          }}
        />
      )}
      {showAloqaModal && (
        <AloqaModal
          lead={lead}
          onCancel={() => setShowAloqaModal(false)}
          onConfirm={handleConfirmStatus}
        />
      )} */}
    </>
  );
}

export default memo(LeadDetailsModal);
