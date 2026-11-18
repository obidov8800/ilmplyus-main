import { createContext, useContext } from 'react';
import type { WorkHoursStatus } from '../utils/workHours';

export type { WorkHoursStatus };

/** `null` — foydalanuvchi kirmagan yoki holat hali noma'lum (cheklov qo'llanmaydi, haqiqiy tekshiruv backendda). */
export const WorkHoursContext = createContext<WorkHoursStatus | null>(null);

export const useWorkHoursStatus = () => useContext(WorkHoursContext);

/** Hozir foydalanuvchi faqat ko'rishi mumkinmi (ish vaqtidan tashqarida). */
export const useWriteLocked = (): boolean => useContext(WorkHoursContext)?.can_write === false;
