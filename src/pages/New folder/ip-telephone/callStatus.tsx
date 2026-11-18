/**
 * Qo'ng'iroq holati — belgi (ikonka), rang va izoh.
 *
 * Ilgari holat ikonkasi to'g'ridan-to'g'ri `index.tsx` ichida, uchta `case`
 * bilan chizilardi (`ANSWERED` / `FAILED` / `NO ANSWER`), qolgan hamma narsa
 * esa `default:` shoxiga tushib, RANGSIZ (qora) telefon ikonkasi bo'lib
 * chiqardi. PBX esa bulardan tashqari `BUSY` ham yuboradi — shu sabab
 * jadvalda vaqti-vaqti bilan tushunarsiz qora belgi ko'rinardi.
 *
 * Bu modul holatni YO'NALISH bilan birga hisoblaydi (kiruvchi/chiquvchi),
 * har biriga alohida rang, matnli yorliq va tushuntirish beradi. Notanish
 * holat ham endi "qora ikonka" emas — savol belgisi va PBX yuborgan xom
 * matn ko'rsatiladi.
 *
 * Ikonkalar ATAYLAB inline SVG: Font Awesome nomlari CDN'dagi to'plamga
 * bog'liq (bepul to'plamda yo'q glif jimgina bo'sh kvadrat bo'lib chiqadi),
 * SVG esa har doim bir xil chiziladi.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Holat + yo'nalishdan kelib chiqadigan yakuniy natija. */
export type CallOutcome =
  | 'inAnswered'
  | 'outAnswered'
  | 'inMissed'
  | 'outNoAnswer'
  | 'busy'
  | 'failed'
  | 'unknown';

/**
 * CDR holati va yo'nalishini bitta tushunarli natijaga keltiradi.
 *
 * PBX `status` maydonida Asterisk disposition'i keladi: `ANSWERED`,
 * `NO ANSWER`, `FAILED`, `BUSY` (va nazariy jihatdan `CONGESTION`).
 */
function getCallOutcome(status: string, direction: string): CallOutcome {
  const s = (status || '').toUpperCase().trim();
  const isIn = direction === 'in';

  switch (s) {
    case 'ANSWERED':
      return isIn ? 'inAnswered' : 'outAnswered';
    case 'NO ANSWER':
    case 'NOANSWER':
      return isIn ? 'inMissed' : 'outNoAnswer';
    case 'BUSY':
      return 'busy';
    case 'FAILED':
    case 'CONGESTION':
      return 'failed';
    default:
      return 'unknown';
  }
}

/** Har bir natijaning rang guruhi — CSS `ipt-outcome--<tone>` bilan bog'lanadi. */
const OUTCOME_TONE: Record<CallOutcome, string> = {
  inAnswered: 'green',
  outAnswered: 'blue',
  inMissed: 'red',
  outNoAnswer: 'amber',
  busy: 'violet',
  failed: 'slate',
  unknown: 'slate',
};

// ── Ikonkalar ───────────────────────────────────────────────────────────────
// Hammasi 20×20, `currentColor` bilan chiziladi — rangni o'rab turgan element
// beradi, shuning uchun bitta SVG hamma holatga yaraydi.

const svgProps = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Kiruvchi — pastga-chapga qaragan strelka. */
const ArrowIn = () => (
  <svg {...svgProps}>
    <path d="M15 5 L6.5 13.5" />
    <path d="M6.5 8 V13.5 H12" />
  </svg>
);

/** Chiquvchi — yuqoriga-o'ngga qaragan strelka. */
const ArrowOut = () => (
  <svg {...svgProps}>
    <path d="M5 15 L13.5 6.5" />
    <path d="M8 6.5 H13.5 V12" />
  </svg>
);

/** Band — ichida qiya chiziq bo'lgan doira. */
const BanCircle = () => (
  <svg {...svgProps}>
    <circle cx="10" cy="10" r="6.5" />
    <path d="M5.4 5.4 L14.6 14.6" />
  </svg>
);

/** Ulanmadi — ichida krestcha bo'lgan doira. */
const XCircle = () => (
  <svg {...svgProps}>
    <circle cx="10" cy="10" r="6.5" />
    <path d="M7.6 7.6 L12.4 12.4" />
    <path d="M12.4 7.6 L7.6 12.4" />
  </svg>
);

/** Noma'lum holat — savol belgisi. PBX kutilmagan disposition yuborsa. */
const QuestionCircle = () => (
  <svg {...svgProps}>
    <circle cx="10" cy="10" r="6.5" />
    <path d="M8.2 8.1 a1.9 1.9 0 1 1 2.4 1.9 c-.4.13-.6.5-.6.9v.3" />
    <path d="M10 14.1 v.1" />
  </svg>
);

const OUTCOME_ICON: Record<CallOutcome, () => React.ReactElement> = {
  inAnswered: ArrowIn,
  outAnswered: ArrowOut,
  inMissed: ArrowIn,
  outNoAnswer: ArrowOut,
  busy: BanCircle,
  failed: XCircle,
  unknown: QuestionCircle,
};

/** Legendada va jadvalda bir xil tartib — o'quvchi ikkalasini solishtira oladi. */
const OUTCOME_ORDER: CallOutcome[] = [
  'inAnswered',
  'outAnswered',
  'inMissed',
  'outNoAnswer',
  'busy',
  'failed',
];

/** Faqat ikonka — legendada va tor joylarda ishlatiladi. */
export function CallOutcomeIcon({ outcome }: { outcome: CallOutcome }) {
  const Icon = OUTCOME_ICON[outcome];
  return (
    <span className={`ipt-outcome-icon ipt-outcome--${OUTCOME_TONE[outcome]}`}>
      <Icon />
    </span>
  );
}

interface BadgeProps {
  status: string;
  direction: string;
  /** Hozirgina tugagan, PBX yozuvi hali kelmagan qator. */
  pending?: boolean;
}

/**
 * Jadval katagi uchun to'liq belgi: ikonka + matn.
 *
 * Matn ATAYLAB har qatorda turadi — legenda faqat qo'shimcha, ikonkaning
 * o'zi ma'noni tashimasligi kerak.
 */
export function CallStatusBadge({ status, direction, pending }: BadgeProps) {
  const { t } = useTranslation();
  const outcome = getCallOutcome(status, direction);
  const Icon = OUTCOME_ICON[outcome];
  const label =
    outcome === 'unknown' ? status || t('ipTelephone.outcome.unknown.label') : t(`ipTelephone.outcome.${outcome}.label`);

  return (
    <span
      className={`ipt-outcome ipt-outcome--${OUTCOME_TONE[outcome]}${pending ? ' ipt-outcome--pending' : ''}`}
      title={t(`ipTelephone.outcome.${outcome}.hint`)}
    >
      <span className="ipt-outcome__icon">
        <Icon />
      </span>
      <span className="ipt-outcome__label">{label}</span>
    </span>
  );
}

/**
 * Belgilar izohi — filtr tugmalari qatorida ("Rad etilgan"dan keyin) turgan
 * undov (ℹ) belgisini bosganda ochiladigan popover.
 *
 * Ilgari bu blok jadval TEPASIDA doim ochiq turardi — doim joy egallab,
 * qatorlarni pastga surardi. Endi faqat kerak bo'lganda ochiladi.
 */
export function CallStatusLegend() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="ipt-legend-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`ipt-legend-trigger${open ? ' ipt-legend-trigger--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('ipTelephone.legendTitle')}
        title={t('ipTelephone.legendTitle')}
      >
        <i className="fa-solid fa-circle-info" aria-hidden="true" />
      </button>

      {open && (
        <div className="ipt-legend" role="note">
          <span className="ipt-legend__title">
            <i className="fa-solid fa-circle-info" aria-hidden="true" />
            {t('ipTelephone.legendTitle')}
          </span>

          <div className="ipt-legend__items">
            {OUTCOME_ORDER.map((outcome) => (
              <span key={outcome} className="ipt-legend__item">
                <CallOutcomeIcon outcome={outcome} />
                <span className="ipt-legend__text">
                  <b>{t(`ipTelephone.outcome.${outcome}.label`)}</b>
                  <span>{t(`ipTelephone.outcome.${outcome}.hint`)}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
