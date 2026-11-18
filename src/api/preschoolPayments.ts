import axios, { type AxiosRequestConfig } from 'axios';
import { API } from './api';
import { fetchJournal, type PaymentState } from './preschool';
import { currentPeriod, normalizePaymentPeriod, periodsBetween, shiftPeriod } from '@/utils/paymentPeriod';

/*
 * Maktabga tayyorlov o'quvchisining OYLIK to'lov holati. Bu yerda balans yo'q: har oy alohida hisoblanadi —
 * to'lov `payment_period` oyiga yoziladi, kutilgan summa — guruh narxi (oylik). Hisob-kitobni backend qiladi
 * (`PreschoolPaymentStatusService`): `POST /payments` dagi oylik cheklov ham aynan shu hisobga tayanadi.
 */

/** Xato toast'i chiqarmaydigan so'rov — ruxsat yo'q yoki o'quvchi guruhda bo'lmasa panel shunchaki chiqmaydi. */
type QuietConfig = AxiosRequestConfig & { silentError?: boolean; skip403Toast?: boolean };
const QUIET: QuietConfig = { silentError: true, skip403Toast: true };

/** Zaxira yo'lida (jurnal) qo'shilgan oydan orqaga qancha oy qarz hisoblanadi (o'quv yili shu doiraga sig'adi). */
const MAX_LOOKBACK_MONTHS = 11;

export interface MonthPayment {
  /** `YYYY-MM` */
  period: string;
  paid: number;
  /** Oylik narx; narx kiritilmagan bo'lsa `null` (qarzni hisoblab bo'lmaydi). */
  expected: number | null;
  /** `expected - paid` (manfiy emas); narx yo'q bo'lsa `null`. */
  debt: number | null;
  status: PaymentState;
  /** Joriy oydan keyingi oy — oldindan to'lash mumkin, lekin qarz hisoblanmaydi. */
  advance: boolean;
}

export interface StudentMonths {
  /** Qo'shilgan oydan joriy oydan KEYINGI oygacha (guruhdan chiqqan bo'lsa — chiqqan oygacha). */
  months: MonthPayment[];
  /** O'tgan va joriy oylar qarzi yig'indisi. */
  totalDebt: number;
  /** Qarzi bor (o'tgan va joriy) oylar soni. */
  debtMonths: number;
}

/** Backend qatori (`GET /preschool-payments/student-months` va jurnaldagi `payment` bilan bir xil shakl). */
interface RawMonth {
  period: string;
  paid_amount: number | string | null;
  expected_amount: number | string | null;
  status: PaymentState;
}

function toMonth(raw: RawMonth, current: string): MonthPayment {
  const period = normalizePaymentPeriod(raw.period) ?? raw.period;
  const paid = Number(raw.paid_amount) || 0;
  const expected = raw.expected_amount == null ? null : Number(raw.expected_amount);
  return {
    period,
    paid,
    expected,
    debt: expected == null ? null : Math.max(0, expected - paid),
    status: raw.status,
    advance: period > current,
  };
}

/**
 * Asosiy yo'l: bitta so'rov — `GET /preschool-payments/student-months` (ruxsat `payments.create|view`).
 * Backend qo'shilgan oydan (`joined_at`, bo'lmasa guruhga biriktirilgan sana) keyingi oygacha oylarni beradi.
 */
async function fetchMonthsFromEndpoint(groupId: number, studentId: number, current: string): Promise<MonthPayment[]> {
  const { data } = await API.get<{ months?: RawMonth[] }>('/preschool-payments/student-months', {
    params: { student_id: studentId, group_id: groupId },
    ...QUIET,
  });
  return (data.months ?? []).map((m) => toMonth(m, current));
}

/**
 * Zaxira yo'l (eski backend, endpoint yo'q — 404): davomat jurnali (`GET /preschool-attendances`, ruxsat
 * `preschool_attendances.view`) har oy uchun alohida chaqiriladi, qo'shilgan sana jurnaldagi `joined_at` dan olinadi.
 */
async function fetchMonthsFromJournal(groupId: number, studentId: number, current: string): Promise<MonthPayment[]> {
  const [currentYear, currentMonth] = current.split('-').map(Number);

  const firstJournal = await fetchJournal(groupId, currentYear, currentMonth, QUIET);
  const me = firstJournal.students.find((s) => s.id === studentId);

  const oldest = shiftPeriod(current, -MAX_LOOKBACK_MONTHS);
  const joined =
    normalizePaymentPeriod(me?.joined_at) ?? normalizePaymentPeriod(firstJournal.group.academic_year?.start_date) ?? current;
  const periods = periodsBetween(joined > oldest ? joined : oldest, shiftPeriod(current, 1));

  const journals = await Promise.all(
    periods.map((period) => {
      if (period === current) return Promise.resolve(firstJournal);
      const [year, month] = period.split('-').map(Number);
      return fetchJournal(groupId, year, month, QUIET);
    }),
  );

  const months: MonthPayment[] = [];
  journals.forEach((journal, i) => {
    const student = journal.students.find((s) => s.id === studentId);
    // O'quvchi o'sha oyda guruhda bo'lmagan (hali qo'shilmagan yoki chiqib ketgan) — qarz hisoblanmaydi.
    if (!student) return;
    months.push(toMonth({ ...student.payment, period: periods[i] }, current));
  });
  return months;
}

/**
 * O'quvchi guruhga qo'shilgan oydan boshlab har oy uchun to'langan/kutilgan summa. Qarz — qo'shilgan oydan joriy oygacha
 * har oy `oylik narx - to'langan` (to'lanmagan oy ham qarz). Joriy oydan keyingi bitta oy oldindan to'lash uchun beriladi.
 */
export async function fetchStudentMonths(groupId: number, studentId: number, today: Date = new Date()): Promise<StudentMonths> {
  const current = currentPeriod(today);

  let months: MonthPayment[];
  try {
    months = await fetchMonthsFromEndpoint(groupId, studentId, current);
  } catch (error) {
    // Endpoint hali yo'q (eski/sinov backend) — jurnal orqali; boshqa xatolar (403, 422) panelni yashiradi.
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      months = await fetchMonthsFromJournal(groupId, studentId, current);
    } else {
      throw error;
    }
  }

  const owed = months.filter((m) => !m.advance && (m.debt ?? 0) > 0);
  return {
    months,
    totalDebt: owed.reduce((sum, m) => sum + (m.debt ?? 0), 0),
    debtMonths: owed.length,
  };
}

/** Yangi to'lov uchun boshlang'ich oy: eng eski qarzdor oy, qarz bo'lmasa — joriy oy. */
export function suggestedPeriod(data: StudentMonths | undefined, today: Date = new Date()): string {
  const firstDebt = data?.months.find((m) => !m.advance && (m.debt ?? 0) > 0);
  return firstDebt?.period ?? currentPeriod(today);
}
