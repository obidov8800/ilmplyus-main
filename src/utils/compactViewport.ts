/**
 * «Ixcham» (mobil ilova) ko'rinish: telefon (≤50em) YOKI sensorli planshet (barmoq asosiy ko'rsatkich, ekran ≤1600px).
 * CSS'dagi `@media (max-width: …)` qoidalariga planshetni qo'shuvchi plagin (`vite.config.ts` → `tabletMobileCss`) bilan
 * BIR XIL shart — oyna to'liq ekran bo'lishi (JS) va CSS tartibi bir-biriga mos kelishi uchun.
 */
export const COMPACT_VIEWPORT_QUERY =
  '(max-width: 50em), (pointer: coarse) and (max-device-width: 1600px), (pointer: coarse) and (max-width: 1600px)';
