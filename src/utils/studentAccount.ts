/**
 * O'quvchining shaxsiy hisob raqami (SMS'dagi «Shaxsiy hisobvaraq»):
 * filial kodi (4 xona) + o'quvchi kodi (7 xona). Backendda alohida ustun YO'Q —
 * `branches.branch_code` va `students.student_code` dan yig'iladi, shuning uchun
 * to'lovga alohida yozilmaydi: hisob raqami faqat o'quvchini topish uchun.
 */

interface AccountStudent {
  student_code?: string | null;
  branch_code?: string | string[] | null;
}

/** `/options/students` filial kodini massiv bilan beradi (`["0101"]`), `/options/branches` — satr bilan. */
export function toBranchCodes(value: string | string[] | undefined | null): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((code): code is string => Boolean(code));
}

/** Qidirishda bo'sh joy va chiziqchalar olib tashlanadi, katta-kichik harf farqlanmaydi ("0101 1234567" ham mos). */
export function normalizeAccount(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[\s-]/g, '')
    .toLowerCase();
}

export interface AccountMatch<T> {
  student: T;
  /** To'liq raqam (filial kodi + o'quvchi kodi) kiritilgan bo'lsa — mos kelgan filial kodi, aks holda `null`. */
  branchCode: string | null;
}

/**
 * Kiritilgan raqamga mos o'quvchini topadi. Ikki ko'rinish ham qabul qilinadi:
 * faqat o'quvchi kodi (`1234567`) yoki to'liq hisob raqami (`01011234567`).
 */
export function findStudentByAccount<T extends AccountStudent>(
  students: T[],
  raw: string,
): AccountMatch<T> | null {
  const query = normalizeAccount(raw);
  if (!query) return null;

  const byCode = students.find((s) => normalizeAccount(s.student_code) === query);
  if (byCode) return { student: byCode, branchCode: null };

  for (const student of students) {
    const code = normalizeAccount(student.student_code);
    if (!code) continue;
    const branchCode = toBranchCodes(student.branch_code).find(
      (bc) => normalizeAccount(bc) + code === query,
    );
    if (branchCode) return { student, branchCode };
  }
  return null;
}
