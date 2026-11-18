/**
 * Jadval katagidagi uzun matn (masalan, 17 ta jamg'arma nomi vergul bilan) 2 qatordan oshmaydi, qolgani «…» bilan
 * kesiladi; to'liq matn sichqoncha ustida (`title`) ko'rinadi. Ilgari bunday katak bitta juda uzun qatorga cho'zilib,
 * jadval gorizontal aylantirilardi.
 */
export default function ClampText({ text, lines = 2 }: { text: string; lines?: number }) {
  return (
    <span className="clamp-text" title={text} style={{ WebkitLineClamp: lines }}>
      {text}
    </span>
  );
}
