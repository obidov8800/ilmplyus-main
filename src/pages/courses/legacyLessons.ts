import type { CoursePrice } from '@/types/course.types';

/**
 * Kurs narxi — faqat OYLIK summa. Darslar soni / bir dars narxi guruhdagi dars kunlaridan hisoblanadi, shu sabab
 * narx formasida ular yo'q.
 *
 * Lekin backend (`StoreCoursePriceRequest`) hozircha `lessons_count` va `lesson_price` ni talab qiladi, davomatdan
 * yechishda (`StudentAttendanceBillingService`) esa `lesson_price` ishlatiladi. Shuning uchun yangi narxga shu kurs
 * (filial+kurs+daraja) oldingi narxidagi darslar soni (bo'lmasa `DEFAULT_LESSONS_COUNT`) olinadi va bir dars narxi
 * yangi oylik narxdan shu son bo'yicha hisoblanadi — balansdan yechish avvalgidek qoladi. Backend guruh kunlaridan
 * hisoblashga o'tgach, bu fayl o'chiriladi va maydonlar yuborilmaydi.
 */
export const DEFAULT_LESSONS_COUNT = 12;

/** Shu filial+kurs+daraja bo'yicha eng so'nggi narxdagi darslar soni (yo'q bo'lsa — standart). */
export function previousLessonsCount(
  prices: CoursePrice[],
  branchId: number | string,
  courseId: number | string,
  levelId: number | string,
): number {
  const last = prices
    .filter(
      (p) =>
        String(p.branch_id) === String(branchId) &&
        String(p.course_id) === String(courseId) &&
        String(p.level_id) === String(levelId),
    )
    .sort((a, b) => b.id - a.id)[0];
  return last && last.lessons_count > 0 ? last.lessons_count : DEFAULT_LESSONS_COUNT;
}

/** Backend talab qiladigan `lessons_count` + `lesson_price` (= oylik narx ÷ darslar soni). */
export const legacyLessonFields = (monthlyPrice: number, lessonsCount: number) => ({
  lessons_count: lessonsCount,
  lesson_price: Math.round(monthlyPrice / lessonsCount),
});
