import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateRow } from './api';
import type { SheetRow, SheetType } from './types';

interface Props {
  sheetId: number;
  row: SheetRow;
  type: SheetType;
  onClose: () => void;
}

/** Backend 422/xato javobidan birinchi xabar. */
const errorMessage = (err: unknown, fallback: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (err as any)?.response?.data;
  const first = data?.errors ? (Object.values(data.errors)[0] as string[] | undefined)?.[0] : undefined;
  return first || data?.message || fallback;
};

/**
 * «Tuzatish» — bitta xodimning oylik qatorini qo'lda to'g'rilash: KPI (faqat oylik vedomosti) va izoh.
 * Faqat tahrirlanadigan (qoralama / rad etilgan) vedomostda; soliq, jami va yig'indilar backendda qayta hisoblanadi.
 */
const AdjustModal = ({ sheetId, row, type, onClose }: Props) => {
  const { t } = useTranslation();
  const update = useUpdateRow(sheetId);
  const [kpi, setKpi] = useState(String(row.kpi_amount || ''));
  const [note, setNote] = useState(row.note ?? '');
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    const payload: { rowId: number; kpi_amount?: number; note?: string } = { rowId: row.id, note };
    if (type === 'salary') {
      const cleaned = kpi.replace(/\s/g, '').replace(',', '.');
      const n = cleaned === '' ? 0 : Number(cleaned);
      if (!Number.isFinite(n)) {
        setError(t('payrollSheets.actions.adjustInvalid'));
        return;
      }
      payload.kpi_amount = n;
    }
    try {
      await update.mutateAsync(payload);
      onClose();
    } catch (err) {
      setError(errorMessage(err, t('payrollSheets.actionError')));
    }
  };

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div
        className="ps-modal"
        role="dialog"
        aria-modal="true"
        aria-label={row.employee_name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ps-modal-head">
          <h2>
            {t('payrollSheets.actions.adjust')} — {row.employee_name}
          </h2>
          <button
            className="ps-modal-close"
            type="button"
            onClick={onClose}
            aria-label={t('modalPattern.close')}
          >
            ×
          </button>
        </div>
        <div className="ps-modal-body">
          {type === 'salary' && (
            <div className="ps-field" style={{ marginBottom: 12 }}>
              <label>{t('payrollSheets.columns.kpi')}</label>
              <input
                type="text"
                inputMode="decimal"
                value={kpi}
                onChange={(e) => setKpi(e.target.value)}
                placeholder="0"
              />
            </div>
          )}
          <div className="ps-field">
            <label>{t('payrollSheets.actions.adjustNote')}</label>
            <input
              type="text"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <p className="ps-modal-note">{t('payrollSheets.actions.adjustHint')}</p>
          {error && <p className="ps-modal-note ps-negative">{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="ps-btn" type="button" onClick={onClose}>
              {t('payrollSheets.actions.adjustCancel')}
            </button>
            <button
              className="ps-btn ps-btn--primary"
              type="button"
              disabled={update.isPending}
              onClick={save}
            >
              {t('payrollSheets.actions.adjustSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdjustModal;
