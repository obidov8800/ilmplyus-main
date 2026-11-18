import { API, type SilentForbiddenConfig } from '@/api/api';
import { safeList, type RawList } from '@/api/normalize';
import { fetchAllPages } from '@/api/fetchAllPages';
import type { Group, Room, Employee, GroupStudent } from '@/types/group.types';
import type { Lid } from '@/types/lid.types';
import type { Student } from '@/types/studentsAttendance.types';
import type { Payment } from '@/types/payment.types';
import type { Expense } from '@/types/expense.types';
import { collapseCallLegs, type CallRecord } from '@/pages/ip-telephone/callRecord';

// ── Dashboard settings ────────────────────────────────────────────────────
/** Panel "maqsadlar" (progress barlar) — admin sozlamalaridan. */
export interface DashboardGoals {
  /** Davr uchun shartnoma (o'quvchi) maqsadi. */
  shartnoma: number;
  /** Davr uchun tushum maqsadi, MLN so'mda. */
  tushum_mln: number;
  /** Maqbul retention (%) — pastida chiziq qizil bo'ladi. */
  retention: number;
}

export const DEFAULT_GOALS: DashboardGoals = {
  shartnoma: 400,
  tushum_mln: 500,
  retention: 90,
};

export interface DashboardSettings {
  tabNames: Record<string, string>;
  roleVisibility: Record<string, string[]>;
  features: string[];
  pagePermissions?: Record<string, string[]>;
  goals?: Partial<DashboardGoals>;
  /**
   * `rol -> ko'rsatiladigan vidjet id'lari`. Rol bu yerda yo'q bo'lsa — unga
   * barcha vidjetlar ochiq (sozlanmagan holat mavjud xatti-harakatni buzmasin).
   *
   * Vidjet ruxsatlari backenddagi `/permissions` jadvaliga qo'shilmaydi: u
   * ro'yxat migratsiya bilan seed qilingan va frontenddan yangi nom qo'shib
   * bo'lmaydi. Shu sabab ular `roleVisibility` va `pagePermissions` kabi shu
   * erkin hujjat ichida saqlanadi — backendga o'zgartirish kerak emas.
   */
  widgetVisibility?: Record<string, string[]>;
}

export async function fetchDashboardSettings(): Promise<DashboardSettings> {
  const { data } = await API.get<DashboardSettings>('/dashboard-settings');
  return {
    tabNames: data.tabNames ?? {},
    roleVisibility: data.roleVisibility ?? {},
    features: Array.isArray(data.features) ? data.features : [],
    pagePermissions: data.pagePermissions ?? {},
    goals: data.goals ?? {},
    widgetVisibility: data.widgetVisibility ?? {},
  };
}

export async function saveDashboardSettings(settings: DashboardSettings): Promise<void> {
  await API.put('/dashboard-settings', settings);
}

export interface AttendanceRecord {
  id?: number;
  employee_id?: number;
  user_id?: number;
  student_id?: number;
  date?: string;
  created_at?: string;
  status?: string;
}

// ── Students ──────────────────────────────────────────────────────────────────
// TO'LIQ ma'lumot: ilgari `per_page: 500` bilan kesilardi — 500+ o'quvchida
// analitika xato bo'lardi. `fetchAllPages` barcha sahifani yig'adi (cheklovsiz,
// ichki himoya: ~25 000 qator).
export async function fetchStudentsData() {
  const list = await fetchAllPages<Student>('/students', { per_page: 500 });
  return { list, total: list.length };
}

// ── Groups ────────────────────────────────────────────────────────────────────
// `/groups` javobi `{ data }` — sahifalash meta'siz, ya'ni `fetchAllPages` faqat
// 1-sahifani oladi. Shuning uchun `limit`/`per_page` yuqori qo'yiladi — endpoint
// hammasini bitta javobda qaytaradi (yoki cheklovni e'tiborsiz qoldiradi).
export async function fetchGroupsData() {
  const list = await fetchAllPages<Group>('/groups', { per_page: 5000, limit: 5000 });
  return { list, total: list.length };
}

// ── Group students ─────────────────────────────────────────────────────────────
export async function fetchGroupStudents(groupId: number): Promise<GroupStudent[]> {
  const { data } = await API.get<RawList<GroupStudent>>(`/groups/${groupId}/students`);
  return safeList<GroupStudent>(data);
}

// ── Rooms ─────────────────────────────────────────────────────────────────────
export async function fetchRoomsData(): Promise<Room[]> {
  const { data } = await API.get<RawList<Room>>('/rooms');
  return safeList<Room>(data);
}

// ── Employees ─────────────────────────────────────────────────────────────────
export async function fetchEmployeesData(): Promise<Employee[]> {
  const { data } = await API.get<RawList<Employee>>('/employees');
  return safeList<Employee>(data);
}

// ── Payments ──────────────────────────────────────────────────────────────────
export async function fetchPaymentsData() {
  const list = await fetchAllPages<Payment>('/payments', { per_page: 500 });
  return { list, total: list.length };
}

// ── Expenses ──────────────────────────────────────────────────────────────────
export async function fetchExpensesData() {
  const list = await fetchAllPages<Expense>('/expenses', { per_page: 500 });
  return { list, total: list.length };
}

// ── Lids ──────────────────────────────────────────────────────────────────────
export async function fetchLidsData() {
  const list = await fetchAllPages<Lid>('/lids', { per_page: 500 });
  /*
   * BACKEND BUG (aniqlangan 2026-09-22, `pages/lid/lid.service.ts`da
   * tuzatilgan): `GET /lids` `status`ni RAQAM emas, MATN qaytaradi (`"1"`,
   * TS tipi `LidStatus` esa raqam union'i deb e'lon qiladi) — natijada har
   * qanday `l.status === LID_STATUS.X` qattiq taqqoslash jimgina hech qachon
   * mos kelmaydi. Bu funksiya `lid.service.ts`dan EMAS, `fetchAllPages`dan
   * TO'G'RIDAN-TO'G'RI o'qigani uchun o'sha tuzatish bu yerga tegmaydi —
   * shu sabab shu yerda ALOHIDA qo'llanadi. Ta'sirlangan joylar:
   * `widgets/SotuvMetrics.tsx` (dashboard "Sotuv" tabining onlayn/oflayn/
   * kelmoqchi/keldi/... statistikasi — bu tuzatishgacha jimgina noto'g'ri
   * chiqardi) va `notifications/index.tsx` (yangi onlayn lid bildirishnomasi).
   */
  const normalized = list.map((l) =>
    typeof l.status === 'string' ? { ...l, status: Number(l.status) as Lid['status'] } : l,
  );
  return { list: normalized, total: normalized.length };
}

// ── IP telefon (tashqi PBX — `mainoffice.uz:8181`, asosiy backend EMAS) ───────
// Qo'ng'iroqlar tarixi asosiy API'dan emas, PBX'dan to'g'ridan-to'g'ri `fetch`
// bilan olinadi (auth header yo'q — `ip-telephone/index.tsx` ham shunday qiladi).
const PBX_BASE = 'https://mainoffice.uz:8181';

/**
 * PBX har bir qo'ng'iroq uchun bir nechta CDR qatorini (oyoqni) qaytaradi —
 * ularni birlashtirmay sanash qo'ng'iroqlar sonini ham, "javob berilgan"
 * ulushini ham buzardi. Shu sabab statistika `collapseCallLegs` natijasidan
 * (bitta qo'ng'iroq = bitta yozuv) hisoblanadi. `limit` — xom CDR qatorlari soni.
 */
export async function fetchCallHistory(limit = 1500): Promise<CallRecord[]> {
  try {
    const res = await fetch(`${PBX_BASE}/api/v1/history?limit=${limit}`);
    const json = (await res.json()) as { data?: CallRecord[] };
    return Array.isArray(json?.data) ? collapseCallLegs(json.data) : [];
  } catch {
    return [];
  }
}

export interface IpTelefonOperatorLite {
  id: number;
  login: string | number;
  name?: string | null;
  branch_id?: number | null;
  branch?: { id?: number | null } | null;
  /** Operator — endi `users` yozuvi (4 maydon: id, full_name, username, phone); xodim (`employee`) obyekti yo'q. */
  user?: { id?: number; full_name?: string } | null;
}

export async function fetchIpTelefonOperators(): Promise<IpTelefonOperatorLite[]> {
  try {
    const { data } = await API.get<unknown>('/ip-telefon-operators');
    if (Array.isArray(data)) return data as IpTelefonOperatorLite[];
    const inner = (data as { data?: unknown })?.data;
    return Array.isArray(inner) ? (inner as IpTelefonOperatorLite[]) : [];
  } catch {
    return [];
  }
}

// ── Student contracts ─────────────────────────────────────────────────────────
export async function fetchStudentContractsTotal(): Promise<number> {
  const { data } = await API.get<{ total?: number; data?: unknown[] }>('/student-contracts', {
    params: { page: 1, per_page: 1 },
  });
  if (typeof data?.total === 'number') return data.total;
  if (Array.isArray(data)) return (data as unknown[]).length;
  return 0;
}

// ── Employee attendances ──────────────────────────────────────────────────────
export async function fetchAttendancesData(): Promise<AttendanceRecord[]> {
  return fetchAllPages<AttendanceRecord>('/attendances', { per_page: 500 });
}

// ── Student monthly attendance ─────────────────────────────────────────────────
export async function fetchMonthlyAttendance(): Promise<Record<string, AttendanceRecord[]>> {
  // Fon vidjeti so'rovi: «o'z guruhlari» qamrovidagi rolda (o'qituvchi) backend guruhsiz so'rovni 403 bilan rad
  // etadi («Bu guruh sizga biriktirilmagan.») — vidjet bo'sh qoladi, lekin «Ruxsat yo'q» bildirishnomasi chiqmaydi.
  const { data } = await API.get<Record<string, AttendanceRecord[]>>('/student_attendance/monthly', {
    skip403Toast: true,
  } as SilentForbiddenConfig);
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  return {};
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyun',
  'Iyul',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

interface MonthEntry {
  key: string;
  month: string;
  tushum: number;
  xarajat: number;
}

export function aggregateByMonth(
  payments: Payment[],
  expenses: Expense[],
): { month: string; tushum: number; xarajat: number }[] {
  const now = new Date();
  const months: MonthEntry[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      month: MONTH_NAMES[d.getMonth()] ?? '',
      tushum: 0,
      xarajat: 0,
    });
  }

  payments.forEach((p) => {
    const d = new Date(p.paid_at || p.created_at || '');
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const entry = months.find((r) => r.key === key);
    if (entry) entry.tushum += Number(p.amount) / 1_000_000;
  });

  expenses.forEach((e) => {
    const d = new Date(e.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const entry = months.find((r) => r.key === key);
    if (entry) entry.xarajat += Number(e.amount) / 1_000_000;
  });

  return months.map(({ month, tushum, xarajat }) => ({
    month,
    tushum: parseFloat(tushum.toFixed(1)),
    xarajat: parseFloat(xarajat.toFixed(1)),
  }));
}

export function weeklyAttendanceByDay(
  monthlyData: Record<string, AttendanceRecord[]>,
): { day: string; pct: number }[] {
  const days = ['Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'];
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  return days.map((day, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const key = date.toISOString().split('T')[0];
    const records = monthlyData[key] ?? [];
    if (!records.length) return { day, pct: 0 };
    const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
    return { day, pct: Math.round((present / records.length) * 100) };
  });
}
