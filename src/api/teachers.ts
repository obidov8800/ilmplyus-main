import { useMemo } from 'react';
import { useOptions, type Option } from './options';

/*
 * Guruhga o'qituvchi tanlash ro'yxati. Admin va User ilovalarida bir xil fayl.
 *
 * `GET /options/teachers?branch_id=` (backend, 2026-10-24) faqat shu FILIALning O'QITUVCHILARINI qaytaradi: pedagogik
 * (`departments.is_pedagogical`) bo'limda FAOL shartnomasi bor xodimlar (`Employee::scopeTeachers`). Guruh saqlashda backend
 * ham shuni tekshiradi (`422 errors.teacher_id`).
 *
 * Eski usul olib tashlandi: `employees` + `GET /contracts` (ruxsat `employee_contracts.view` kerak edi) + bo'lim nomida
 * «pedagog» so'zini qidirish (bo'lim nomi o'zgarsa buzilardi). Shuningdek Admin ro'yxatni mavjud guruhlardan yig'ardi,
 * shu sabab yangi xodim (hali guruhi yo'q) hech qachon chiqmasdi.
 */

/** Tahrirlanayotgan guruhning joriy o'qituvchisi — endi pedagogik bo'lmasa ham ro'yxatda ko'rinib turadi. */
export interface KeptTeacher {
  id: number;
  label: string;
}

const NO_OPTIONS: Option[] = [];

export interface TeacherOptions {
  teachers: Option[];
  isLoading: boolean;
}

/** @param branchId guruh filiali; tanlanmagan bo'lsa ro'yxat bo'sh va so'rov ketmaydi. */
export function useTeacherOptions(branchId: number | null, keep: KeptTeacher[] = []): TeacherOptions {
  const { data = NO_OPTIONS, isLoading } = useOptions(
    'teachers',
    { branch_id: branchId ?? undefined },
    { enabled: !!branchId },
  );
  const keepKey = JSON.stringify(keep);

  return useMemo(() => {
    if (!branchId) return { teachers: NO_OPTIONS, isLoading: false };
    const extra = (JSON.parse(keepKey) as KeptTeacher[])
      .filter((k) => !data.some((o) => o.id === k.id))
      .map((k) => ({ id: k.id, label: k.label }) as Option);
    return { teachers: extra.length ? [...data, ...extra] : data, isLoading };
  }, [branchId, data, isLoading, keepKey]);
}
