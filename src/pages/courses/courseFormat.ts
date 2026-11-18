import { groupDigits } from '@/utils/formatNumber';
import type { CoursePrice, CourseStatus } from '@/types/course.types';
import { parseStartDay } from './autoIndex';

/*
 * Toza (JSX'siz) yordamchilar — `courseComponents.tsx` (belgi/kartochka
 * komponentlari), `index.tsx` (jadval) va `CoursePriceHistoryModal.tsx`
 * (tarix) uchun umumiy. Alohida `.ts` faylda: agar bular komponentlar bilan
 * bitta faylda bo'lsa, `react-refresh/only-export-components` qoidasi
 * buzilardi (Vite Fast Refresh faqat "faqat komponent eksport qiladigan"
 * fayllarda ishlaydi).
 */

// `pending` = yangi yaratilgan (hali tasdiqlashga yuborilmagan),
// `submitted` = tasdiqlashga yuborilgan va ko'rib chiqilayotgan.
export const STATUS_DISPLAY: Record<CourseStatus, { labelKey: string; cls: string }> = {
  pending: { labelKey: 'course.tabs.pending', cls: 'courses-badge--blue' },
  submitted: { labelKey: 'course.tabs.submitted', cls: 'courses-badge--orange' },
  approved: { labelKey: 'course.tabs.approved', cls: 'courses-badge--green' },
  rejected: { labelKey: 'course.tabs.rejected', cls: 'courses-badge--red' },
  old_price: { labelKey: 'course.tabs.old_price', cls: 'courses-badge--red' },
};

/**
 * O'zgarish sanasi — har yili takrorlanadigan kun.oy, yilsiz ko'rsatiladi.
 * Backend `"17.10"` qaytaradi; uni `new Date()` ga bersak 2001-yil deb talqin
 * qilinadi, shuning uchun kun/oy `parseStartDay` bilan ajratib olinadi.
 */
export function formatCourseDate(value: string): string {
  const parts = parseStartDay(value);
  if (!parts) return value ?? '';
  return `${String(parts.day).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}`;
}

export function formatNarx(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(n) ? String(val) : groupDigits(n);
}

/**
 * Avtomatik indeksatsiya (cron) `pending` holatida yozuv qo'shadi, lekin
 * hech kim tomonidan qo'lda yaratilmaydi (`creator` bo'sh keladi). "Yaratdi"
 * ustunida odam ismi o'rniga shu holatni bildirish kerak.
 */
export function isAutoPriceRow(row: CoursePrice): boolean {
  return row.holat === 'pending' && !row.creator?.full_name;
}

/**
 * Bitta kurs + daraja + filial birikmasi — bitta "narx yo'nalishi". Har safar
 * shu birikma uchun yangi narx so'rovi yaratilganda, oldingisi o'chirilmaydi:
 * backend uni `old_price` deb belgilab, tarix sifatida saqlab qo'yadi. Shu
 * sababli jadval qatorlari haqiqatda BITTA yo'nalishning bir necha tarixiy
 * bosqichi bo'lib chiqadi, lekin hammasi alohida qator sifatida ko'rinib,
 * jadvalni "bir xil narx bir necha marta" holida to'ldirib yuborardi.
 * `groupKey` shu birikmani aniqlaydigan kalit.
 */
export function groupKey(row: CoursePrice): string {
  return `${row.branch_id}-${row.course_id}-${row.level_id}`;
}

/**
 * Har bir guruhdan (bir xil kurs+daraja+filial) jadvalda ko'rsatiladigan
 * BITTA "dolzarb" yozuvni tanlaydi va guruhning to'liq tarixini alohida
 * saqlaydi ("Ko'rish" tugmasi shuni ochadi).
 *
 * Dolzarblik qoidasi: guruh ichida `old_price` bo'lmagan (ya'ni hali kuchda
 * turgan/ko'rib chiqilayotgan) eng so'nggi yozuv bor bo'lsa — aynan shu
 * dolzarb hisoblanadi (masalan "Jarayonda" so'rov). Agar guruhdagi barcha
 * yozuvlar allaqachon `old_price` bo'lsa (hech qanday yangi so'rov kutib
 * turmaydi) — eng so'nggi (oxirgi yaratilgan) `old_price` yozuv ko'rsatiladi,
 * chunki u shu yo'nalishning ma'lum bo'lgan oxirgi holati.
 *
 * `oldPriceRows` — dedup qilinmagan, guruhdagi FAOL yozuv bor-yo'qligidan
 * qat'i nazar barcha `old_price` holatidagi yozuvlar. Faqat `representativeRows`
 * ishlatilsa, guruhda hali kuchda turgan (faol) narx bo'lsa, o'sha guruhning
 * eski narx tarixi "Eski narx" tabida umuman ko'rinmay qolardi — bu yerda
 * shunday yashiringan yozuvlar ham hisobga olinadi.
 */
export function groupCoursePrices(rows: CoursePrice[]): {
  representativeRows: CoursePrice[];
  historyByGroup: Map<string, CoursePrice[]>;
  oldPriceRows: CoursePrice[];
} {
  const groups = new Map<string, CoursePrice[]>();
  rows.forEach((row) => {
    const key = groupKey(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  });

  const representativeRows: CoursePrice[] = [];
  const historyByGroup = new Map<string, CoursePrice[]>();

  groups.forEach((groupRows, key) => {
    // Eng yangisi tepada — sana teng bo'lsa id kattaroq (keyinroq yaratilgan) tepada.
    const sorted = [...groupRows].sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return diff !== 0 ? diff : b.id - a.id;
    });
    const active = sorted.find((r) => r.holat !== 'old_price');
    representativeRows.push(active ?? sorted[0]);
    historyByGroup.set(key, sorted);
  });

  const oldPriceRows = [...rows]
    .filter((r) => r.holat === 'old_price')
    .sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return diff !== 0 ? diff : b.id - a.id;
    });

  return { representativeRows, historyByGroup, oldPriceRows };
}
