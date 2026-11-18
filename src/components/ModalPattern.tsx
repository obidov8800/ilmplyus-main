import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './ModalPattern.css';

interface ModalPatternProps {
  title: string;
  onCancel: () => void;
  children: ReactNode;
}

export default function ModalPattern({ title, onCancel, children }: ModalPatternProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="mp-overlay" onClick={onCancel}>
      <div className="mp-container" onClick={(e) => e.stopPropagation()}>
        <div className="mp-header">
          <h2 className="mp-title">{title}</h2>
          <button className="mp-close-btn" onClick={onCancel} type="button" aria-label={t('modalPattern.close')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="mp-body">{children}</div>
      </div>
    </div>
  );
}
