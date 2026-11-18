import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { getApiErrorMessage } from '@/utils/apiError';
import { useWorkflowAction } from './api';
import type { CorrectPayload, DailyCashReport } from './types';

interface Props {
  report: DailyCashReport | null;
  onClose: () => void;
}

/** Tahrirlanadigan pul maydonlari va ularning i18n label kalitlari. */
const MONEY_FIELDS: { key: keyof CorrectPayload; labelKey: string }[] = [
  { key: 'cash_income', labelKey: 'dailyCashReports.columns.cash' },
  { key: 'card_income', labelKey: 'dailyCashReports.columns.card' },
  { key: 'qr_income', labelKey: 'dailyCashReports.columns.qr' },
  { key: 'bank_income', labelKey: 'dailyCashReports.correct.bank' },
  { key: 'paynet_income', labelKey: 'dailyCashReports.correct.paynet' },
  { key: 'cash_expense', labelKey: 'dailyCashReports.columns.cashExpense' },
  { key: 'non_cash_expense', labelKey: 'dailyCashReports.correct.nonCashExpense' },
];

/**
 * Admin tuzatishi — hisobot `returned` holatida qiymatlarni tahrirlaydi.
 * Faqat o'zgartirilgan maydonlar yuboriladi (bo'sh qoldirilgani tegilmaydi).
 */
const CorrectModal = ({ report, onClose }: Props) => {
  const { t } = useTranslation();
  const workflow = useWorkflowAction();
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  // Hisobot almashsa formani tozalaymiz (effektsiz, render fazasida).
  const [seenId, setSeenId] = useState(report?.id ?? null);
  if (report && report.id !== seenId) {
    setSeenId(report.id);
    setValues({});
    setNote('');
  }

  if (!report) return null;

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const submit = () => {
    const payload: CorrectPayload = {};
    for (const { key } of MONEY_FIELDS) {
      const v = values[key as string];
      if (v !== undefined && v !== '') payload[key] = v;
    }
    if (note.trim()) payload.note = note.trim();

    workflow.mutate(
      { id: report.id, action: 'correct', payload },
      {
        onSuccess: () => {
          notifications.show({
            title: t('dailyCashReports.savedTitle'),
            message: t('dailyCashReports.correct.savedMessage'),
            color: 'green',
          });
          onClose();
        },
        onError: (error) => {
          notifications.show({
            title: t('dailyCashReports.errorTitle'),
            message: getApiErrorMessage(error, t('dailyCashReports.correct.errorMessage')),
            color: 'red',
          });
        },
      },
    );
  };

  return (
    <div className="dcr-overlay" onClick={() => !workflow.isPending && onClose()}>
      <div
        className="dcr-modal dcr-modal--md"
        role="dialog"
        aria-modal="true"
        aria-label={t('dailyCashReports.correct.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dcr-modal-head">
          <div>
            <h2>{t('dailyCashReports.correct.title')}</h2>
            <span className="dcr-modal-sub">{report.report_number}</span>
          </div>
          <button
            className="dcr-modal-close"
            type="button"
            disabled={workflow.isPending}
            onClick={onClose}
            aria-label={t('modalPattern.close')}
          >
            ×
          </button>
        </div>

        <div className="dcr-modal-body dcr-form">
          <p className="dcr-hint">{t('dailyCashReports.correct.hint')}</p>
          <div className="dcr-form-grid">
            {MONEY_FIELDS.map(({ key, labelKey }) => (
              <div className="dcr-field" key={key as string}>
                <label>{t(labelKey)}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder={report[key as keyof DailyCashReport] as string}
                  value={values[key as string] ?? ''}
                  onChange={(e) => set(key as string, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="dcr-field">
            <label>{t('dailyCashReports.correct.note')}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="dcr-modal-actions">
          <button
            className="dcr-btn dcr-btn--primary"
            type="button"
            disabled={workflow.isPending}
            onClick={submit}
          >
            {t('dailyCashReports.correct.submit')}
          </button>
          <button
            className="dcr-btn dcr-btn--ghost"
            type="button"
            disabled={workflow.isPending}
            onClick={onClose}
          >
            {t('dailyCashReports.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CorrectModal;
