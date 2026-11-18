import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './formModal.css';

/* ------------------------------------------------------------------ *
 * Forma oynasi — sarlavha (brend rangi) + tana + pastki tugmalar.
 * `ConfirmModal` (cm-) va `ModalPattern` (mp-) bilan bir xil dizayn tili;
 * klasslar `fm-` prefiksi bilan scope qilingan (umumiy `.modal-header`,
 * `.form-group` kabi nomlar sahifalar orasida "oqib" o'tardi).
 *
 * Xulq-atvor: Escape va parda (oyna tashqarisi) bosilganda yopiladi,
 * `busy` paytida yopilmaydi. Telefonda — pastdan chiqadigan varaq.
 * `document.body` ga portal qilinadi: sahifaning `position: fixed`
 * panellari (pastki tab bar, dars tugmasi) oyna ustiga chiqib qolmaydi.
 * ------------------------------------------------------------------ */

interface FormModalProps {
  open: boolean;
  title: string;
  /** Sarlavha ostidagi izoh (guruh, sana, o'quvchi…). */
  subtitle?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** So'rov ketayotganda oyna yopilmaydi. */
  busy?: boolean;
  onClose: () => void;
  /** Berilsa — tana va tugmalar `<form>` ichida (Enter bilan saqlash). */
  onSubmit?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  /** Sinov/uslub uchun qo'shimcha klass. */
  className?: string;
}

const FormModal = ({
  open,
  title,
  subtitle,
  size = 'md',
  busy = false,
  onClose,
  onSubmit,
  footer,
  children,
  className,
}: FormModalProps) => {
  const { t } = useTranslation();
  // Matnni belgilab, sichqonchani oyna tashqarisida qo'yib yuborganda yopilib ketmasin:
  // bosish ham, qo'yib yuborish ham pardaning o'zida bo'lishi kerak.
  const pressedOnOverlay = useRef(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };

  const content = (
    <>
      <div className="fm-body">{children}</div>
      {footer && <div className="fm-footer">{footer}</div>}
    </>
  );

  return createPortal(
    <div
      className="fm-overlay"
      onMouseDown={(e) => {
        pressedOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnOverlay.current && !busy) onClose();
      }}
    >
      <div
        className={`fm-dialog fm-dialog--${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="fm-header">
          <div className="fm-header__text">
            <h2 className="fm-title">{title}</h2>
            {subtitle && <p className="fm-subtitle">{subtitle}</p>}
          </div>
          <button
            className="fm-close"
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label={t('modalPattern.close')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {onSubmit ? (
          <form className="fm-form" onSubmit={handleSubmit} noValidate>
            {content}
          </form>
        ) : (
          <div className="fm-form">{content}</div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default FormModal;
