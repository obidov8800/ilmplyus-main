import { useEffect } from 'react';

/**
 * Ko'p ochiladigan sahifalarni brauzer bo'sh turgan paytda oldindan yuklaydi.
 *
 * Sahifalar `lazy` bo'lgani uchun menyudan birinchi marta bosilganda bo'lak
 * (chunk) yuklanishi kerak. Bu yerda ular fon rejimida, foydalanuvchi hali
 * bosmasidan oldin olib qo'yiladi — bosilganda kutish qolmaydi.
 *
 * Import yo'llari `App.tsx` dagilar bilan bir xil faylga ishora qiladi, shuning
 * uchun bir xil bo'lak ishlatiladi va so'rov takrorlanmaydi.
 */
const ROUTES: Array<() => Promise<unknown>> = [
  () => import('../pages/lid'),
  () => import('../pages/payments'),
  () => import('../pages/students-attendance'),
  () => import('../pages/students-contract'),
  () => import('../pages/lessons'),
  () => import('../pages/tasks'),
];

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** Tejamkor rejim yoki sekin tarmoqda oldindan yuklash o'chiriladi. */
function shouldPrefetch(): boolean {
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  return conn.effectiveType !== 'slow-2g' && conn.effectiveType !== '2g';
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function usePrefetchRoutes(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !shouldPrefetch()) return;

    let cancelled = false;
    const idleWindow = window as IdleWindow;
    const handles: number[] = [];
    const timers: number[] = [];

    // Bittalab yuklanadi — sahifaning o'z so'rovlari bilan tarmoq uchun
    // bellashmasin.
    const runNext = (index: number) => {
      if (cancelled || index >= ROUTES.length) return;

      const schedule = (cb: () => void) => {
        if (idleWindow.requestIdleCallback) {
          handles.push(idleWindow.requestIdleCallback(cb, { timeout: 4000 }));
        } else {
          timers.push(window.setTimeout(cb, 300));
        }
      };

      schedule(() => {
        if (cancelled) return;
        // Bo'lak yuklanmasa hech narsa buzilmaydi — sahifa ochilganda odatdagidek
        // yuklanadi. Shuning uchun xato jim yutiladi.
        ROUTES[index]()
          .catch(() => {})
          .finally(() => runNext(index + 1));
      });
    };

    // Dastlabki so'rovlar ketib bo'lguncha biroz kutamiz.
    const startTimer = window.setTimeout(() => runNext(0), 1500);
    timers.push(startTimer);

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      if (idleWindow.cancelIdleCallback) {
        handles.forEach((h) => idleWindow.cancelIdleCallback?.(h));
      }
    };
  }, [enabled]);
}
