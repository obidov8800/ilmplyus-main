/**
 * Ko'rsatkichning oldingi davrga nisbatan o'sish/pasayish badge'i.
 *
 * `invert` — xarajat kabi "ko'payishi yomon" ko'rsatkichlar uchun: o'sish qizil,
 * pasayish yashil (daromad/foydada esa aksincha). Qiymat `NaN` bo'lsa (oldingi
 * davr 0 — cheksizlikka bo'linmaslik uchun) badge umuman ko'rsatilmaydi.
 * Foiz hisoblash: `pctChange` — `./useDashboardFilter`.
 */
interface GrowthBadgeProps {
  value: number;
  invert?: boolean;
  label: string;
  className?: string;
}

export default function GrowthBadge({ value, invert, label, className }: GrowthBadgeProps) {
  if (!Number.isFinite(value)) return null;
  const isUp = value >= 0;
  const good = invert ? !isUp : isUp;
  return (
    <span
      className={`dash-growth${good ? ' dash-growth--good' : ' dash-growth--bad'}${className ? ` ${className}` : ''}`}
      title={label}
    >
      {isUp ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}
