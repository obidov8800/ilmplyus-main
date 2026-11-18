import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/utils/date';
import type { SheetLog } from './types';

interface Props {
  logs: SheetLog[];
  documentNumber: string;
  onClose: () => void;
}

/**
 * «Harakatlar tarixi». Payroll modulida to'liq audit jurnali endpointi yo'q —
 * hozir davrning yopilish qaydi ko'rsatiladi (`/payroll/periods` javobidan).
 * Jurnal endpointi qo'shilsa shu modalga qatorlar qo'shilishi kifoya.
 */
const HistoryModal = ({ logs, documentNumber, onClose }: Props) => {
  const { t } = useTranslation();

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div
        className="ps-modal"
        role="dialog"
        aria-modal="true"
        aria-label={documentNumber}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ps-modal-head">
          <h2>
            {t('payrollSheets.history.title')} — {documentNumber}
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
          {logs.length === 0 ? (
            <p className="ps-empty">{t('payrollSheets.noData')}</p>
          ) : (
            <ol className="ps-timeline">
              {logs.map((log, i) => (
                <li className="ps-timeline-item" key={`${log.action}-${i}`}>
                  <span className="ps-timeline-dot" aria-hidden />
                  <div>
                    <div className="ps-timeline-action">
                      {t(`payrollSheets.log.${log.action}`, { defaultValue: log.action })}
                    </div>
                    <div className="ps-timeline-meta">
                      {log.user ?? '—'} · {formatDateTime(log.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
