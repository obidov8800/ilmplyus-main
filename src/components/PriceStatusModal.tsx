import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  PRICE_STATUSES,
  changePreschoolPriceStatus,
  priceStatus,
  type PreschoolPrice,
  type PreschoolPriceStatus,
} from '@/api/preschool';
import '@/styles/preschool.css';

/*
 * Maktabga tayyorlov narxining tasdiqlash holatini o'zgartirish oynasi (`PATCH /preschool-prices/{id}/status`).
 * Admin va User ilovalarida bir xil fayl. Holatlar: Kutilmoqda / Tasdiqlangan / Tasdiqlanmagan / Bekor qilingan.
 */

/** Joriy holatdan keyin odatda qilinadigan amal oldindan tanlanadi. */
const SUGGESTED: Record<PreschoolPriceStatus, PreschoolPriceStatus> = {
  pending: 'approved',
  approved: 'cancelled',
  rejected: 'approved',
  cancelled: 'pending',
};

interface PriceStatusModalProps {
  price: PreschoolPrice;
  /** «500 000 so'm · 2026-2027 · Umumiy» kabi qisqa tavsif. */
  summary: string;
  onClose: () => void;
  onSaved: () => void;
}

const PriceStatusModal = ({ price, summary, onClose, onSaved }: PriceStatusModalProps) => {
  const { t } = useTranslation();
  const current = priceStatus(price) ?? 'pending';
  const [status, setStatus] = useState<PreschoolPriceStatus>(SUGGESTED[current]);
  const [reason, setReason] = useState('');

  const save = useMutation({
    mutationFn: () => changePreschoolPriceStatus(price.id, status, reason),
    onSuccess: onSaved,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !save.isPending) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, save.isPending]);

  return (
    <div className="pp-overlay">
      <div className="pp-modal" role="dialog" aria-modal="true">
        <h3 className="pp-title">{t('preschoolPrices.statusModal.title')}</h3>
        <p className="pp-sub">{summary}</p>

        <form
          className="pp-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="pp-field">
            <label>{t('preschoolPrices.statusModal.current')}</label>
            <input type="text" readOnly value={t(`preschoolPrices.statuses.${current}`)} />
          </div>

          <div className="pp-field">
            <label>{t('preschoolPrices.statusModal.next')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as PreschoolPriceStatus)}>
              {PRICE_STATUSES.filter((s) => s !== current).map((s) => (
                <option key={s} value={s}>
                  {t(`preschoolPrices.statuses.${s}`)}
                </option>
              ))}
            </select>
            <span className="pp-hint">{t(`preschoolPrices.statusModal.hint.${status}`)}</span>
          </div>

          <div className="pp-field">
            <label>{t('preschoolPrices.statusModal.reason')}</label>
            <textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <div className="pp-actions">
            <button type="submit" className="pp-btn pp-btn--primary" disabled={save.isPending}>
              {save.isPending ? t('preschoolPrices.statusModal.saving') : t('preschoolPrices.statusModal.save')}
            </button>
            <button type="button" className="pp-btn pp-btn--cancel" onClick={onClose} disabled={save.isPending}>
              {t('preschoolPrices.statusModal.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PriceStatusModal;
