import type { ReactNode } from 'react';
import ClampText from '@/components/ClampText';

/** Katak qiymati uzun matn bo'lsa — 2 qatorga qisqartiradi; belgi/tugma kabi elementlar o'zgarishsiz qaytadi. */
export function clampCell(value: ReactNode): ReactNode {
  return typeof value === 'string' && value.length > 30 ? <ClampText text={value} /> : value;
}
