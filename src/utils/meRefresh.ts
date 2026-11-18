import type { QueryClient } from '@tanstack/react-query';

/** Ketma-ket ruxsat xatolarida `/me` shuncha vaqtdan tez-tez qayta so'ralmaydi. */
const MIN_GAP_MS = 30_000;

let lastRequestAt = 0;

/**
 * Backend 403 (ruxsat yo'q) qaytarsa, rol/ruxsat o'zgargan bo'lishi mumkin — `/me` darhol qayta so'raladi (menyu va
 * marshrut tekshiruvi yangilansin). `/me` endi tinmasdan (har 15 soniyada) so'ralmaydi, shu sabab bu — ruxsat
 * o'zgarganini «real vaqtda» bilishning yagona qo'shimcha yo'li. Throttle: 30 soniyada ko'pi bilan bitta so'rov
 * (sahifada bir nechta 403 bo'lsa ham serverga bitta `/me` ketadi).
 */
export function requestMeRefresh(queryClient: QueryClient | undefined, minGapMs = MIN_GAP_MS): void {
  if (!queryClient) return;
  const now = Date.now();
  if (now - lastRequestAt < minGapMs) return;
  lastRequestAt = now;
  void queryClient.invalidateQueries({ queryKey: ['me'], exact: true });
}
