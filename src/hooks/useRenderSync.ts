import { useState } from 'react';

/**
 * Qiymat(lar) o'zgarganda holatni RENDER paytida moslaydi — `useEffect` ichida `setState` chaqirish o'rniga.
 *
 * Forma oynalari tashqaridan kelgan yozuv (`initialData`, so'rov javobi…) o'zgarganda maydonlarini qayta
 * to'ldiradi. Buni effect ichida qilish ortiqcha «bo'sh forma → to'lgan forma» renderini beradi (bir zum eski
 * qiymat ko'rinadi) va React tavsiyasiga zid (https://react.dev/learn/you-might-not-need-an-effect). Bu hook
 * `deps` avvalgi renderdagidan farq qilsa `sync` ni shu renderning o'zida chaqiradi — React komponentni darhol
 * yangi holat bilan qayta chizadi, ekranga oraliq holat chiqmaydi.
 *
 * `deps` — barqaror havolalar bo'lsin (prop, so'rov javobi, satr/son): har renderda yangi obyekt/massiv berilsa
 * cheksiz qayta chizish bo'ladi. Birinchi renderda ham chaqiriladi (effect ham shunday qilardi).
 */
export function useRenderSync(deps: readonly unknown[], sync: () => void): void {
  const [seen, setSeen] = useState<readonly unknown[] | null>(null);
  const changed =
    seen === null || seen.length !== deps.length || deps.some((dep, i) => !Object.is(dep, seen[i]));
  if (changed) {
    setSeen(deps);
    sync();
  }
}
