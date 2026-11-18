/** Bajarilish foiziga qarab progress-bar/matn rangi — reja bo'yicha tahlil jadvali. */
export function fulfillmentClass(percent: number): string {
  if (percent >= 90) return 'mea-fill--good';
  if (percent >= 60) return 'mea-fill--mid';
  return 'mea-fill--low';
}

/** Farq musbat/manfiy bo'lishiga qarab matn rangi. */
export function diffClass(value: number): string {
  return value < 0 ? 'mea-diff--negative' : 'mea-diff--positive';
}
