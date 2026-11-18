import {
  fetchExpensesData,
  fetchGroupsData,
  fetchPaymentsData,
  fetchRoomsData,
  fetchStudentsData,
} from './dashboard.service';
import { useGatedQuery } from './useGatedQuery';

/**
 * Birinchi tab (`UmumiyTab`) ma'lumotlarini panel chizilishini kutmasdan
 * yuklaydi.
 *
 * Nega kerak: panel `dashboard-settings` javobi kelmaguncha hech narsa
 * chizmaydi (ruxsatsiz foydalanuvchida miltillamasligi uchun). Tab so'rovlari
 * tab komponenti ichida bo'lgani uchun, ular ham shuncha kutib turardi —
 * ya'ni ma'lumot bir so'rov naviga kechikardi. Bu yerda ular mount paytida,
 * sozlamalar bilan barobar boshlanadi.
 *
 * Kalitlar tabdagilar bilan bir xil — react-query so'rovni takrorlamaydi,
 * tab chizilganda tayyor natijani oladi. Ruxsati yo'q blok baribir
 * yuborilmaydi (`useGatedQuery` ichidagi `enabled`).
 */
export function usePrefetchDashboard() {
  useGatedQuery(['dash-students'], fetchStudentsData, 'students.view');
  useGatedQuery(['dash-groups'], fetchGroupsData, 'groups.view');
  useGatedQuery(['dash-rooms'], fetchRoomsData, 'rooms.view');
  useGatedQuery(['dash-payments'], fetchPaymentsData, 'payments.view');
  useGatedQuery(['dash-expenses'], fetchExpensesData, 'expenses.view');
}
