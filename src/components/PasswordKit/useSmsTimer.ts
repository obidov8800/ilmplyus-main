import { useEffect, useState } from 'react';

/** SMS'dagi vaqtinchalik parolning amal qilish muddati (soniya). */
export const SMS_CODE_SECONDS = 180;

/**
 * SMS so'ralgan paytdan teskari sanoq (backend yetkazilish vaqtini bermaydi — hisob frontendda).
 * - `left` — qolgan soniya;
 * - `timedOut` — vaqt tugadi: eski kod ilovadan qabul qilinmaydi;
 * - `expired` — «Qayta yuborish» ko'rsatiladi: vaqt tugagan YOKI server kodni noto'g'ri/eskirgan degan.
 */
export function useSmsTimer(total = SMS_CODE_SECONDS) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [forced, setForced] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  const timedOut = endsAt !== null && left === 0;

  return {
    left,
    timedOut,
    expired: forced || timedOut,
    /** Sanoqni boshlash. `from` — SMS so'rovi ketgan vaqt (berilmasa hozir). */
    start: (from: number = Date.now()) => {
      setNow(Date.now());
      setForced(false);
      setEndsAt(from + total * 1000);
    },
    /** Qayta yuborishni ko'rsatish (server kodni noto'g'ri/eskirgan degan bo'lsa) — Saqlash bloklanmaydi. */
    expire: () => setForced(true),
    reset: () => {
      setForced(false);
      setEndsAt(null);
    },
  };
}
