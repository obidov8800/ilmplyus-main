import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DateInput from '@/components/DateInput';
import './noteOrReminder.css';

export type NoteMode = 'note' | 'timer';

interface NoteOrReminderProps {
  note: string;
  onNoteChange: (text: string) => void;
  /**
   * `"YYYY-MM-DD HH:mm:00"` — Taymer rejimida sana+vaqt TO'LIQ va to'g'ri
   * kiritilgach beriladi, aks holda (Izoh rejimi, yoki hali to'liqlanmagan
   * sana/vaqt) `null`. Chaqiruvchi shu qiymat orqali "eslatma o'rnatilganmi"
   * ekanini biladi — submit vaqtida qayta hisoblash shart emas.
   */
  onReminderChange: (deadline: string | null) => void;
  textareaClassName?: string;
  labelKey?: string;
  placeholderKey?: string;
}

function isValidTime(time: string): boolean {
  if (time.length !== 5 || !time.includes(':')) return false;
  const [h, m] = time.split(':').map(Number);
  return !Number.isNaN(h) && !Number.isNaN(m) && h <= 23 && m <= 59;
}

/**
 * Lid uchun izoh yozish joyi — endi ikki rejim: "Izoh" (oddiy matn, avvalgi
 * xatti-harakat) va "Taymer" (matn + sana/vaqt — saqlanganda operatorning
 * o'ziga shu muddatga `/tasks` orqali eslatma-vazifa yaratiladi). Bitta
 * joyda yozilib, `AloqaModal`/`DemoModal`/`ShartnomaModal`/`LeadDetailsModal`
 * to'rttalasida ham ishlatiladi — ular vizual jihatdan bir xil edi.
 */
export default function NoteOrReminder({
  note,
  onNoteChange,
  onReminderChange,
  textareaClassName = 'mp-textarea',
  labelKey = 'lid.modals.noteOptional',
  placeholderKey = 'lid.modals.writeNote',
}: NoteOrReminderProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<NoteMode>('note');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const emitReminder = useCallback(
    (nextMode: NoteMode, nextDate: string, nextTime: string) => {
      onReminderChange(nextMode === 'timer' && nextDate && isValidTime(nextTime) ? `${nextDate} ${nextTime}:00` : null);
    },
    [onReminderChange],
  );

  const handleModeChange = (next: NoteMode) => {
    setMode(next);
    emitReminder(next, date, time);
  };

  const handleDateChange = (v: string) => {
    setDate(v);
    emitReminder(mode, v, time);
  };

  const handleTimeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    setTime(formatted);
    emitReminder(mode, date, formatted);
  };

  const timeTouchedInvalid = mode === 'timer' && time.length === 5 && !isValidTime(time);

  return (
    <div className="nor">
      <div className="nor__header">
        <div className="nor__title">{t(labelKey)}</div>
        <div className="nor__mode-switch" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'note'}
            className={`nor__mode-btn${mode === 'note' ? ' nor__mode-btn--active' : ''}`}
            onClick={() => handleModeChange('note')}
          >
            <i className="fa-regular fa-comment-dots" aria-hidden="true" /> {t('lid.modals.noteMode.note')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'timer'}
            className={`nor__mode-btn${mode === 'timer' ? ' nor__mode-btn--active' : ''}`}
            onClick={() => handleModeChange('timer')}
          >
            <i className="fa-regular fa-clock" aria-hidden="true" /> {t('lid.modals.noteMode.timer')}
          </button>
        </div>
      </div>

      <textarea
        className={textareaClassName}
        placeholder={t(placeholderKey)}
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        rows={4}
      />

      {mode === 'timer' && (
        <div className="nor__reminder-row">
          <i className="fa-solid fa-bell nor__reminder-icon" aria-hidden="true" />
          <DateInput
            className="nor__date-input"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
          />
          <input
            className={`nor__time-input${timeTouchedInvalid ? ' nor__time-input--error' : ''}`}
            placeholder="10:00"
            value={time}
            onChange={(e) => handleTimeChange(e.target.value)}
            maxLength={5}
            aria-label={t('taskModal.time')}
          />
          <span className="nor__reminder-hint">{t('lid.modals.noteMode.reminderHint')}</span>
        </div>
      )}
    </div>
  );
}
