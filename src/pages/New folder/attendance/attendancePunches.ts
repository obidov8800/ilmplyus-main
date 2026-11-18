import { API } from '../../api/api';

/**
 * `/attendances` endi kun bo'yicha yig'ilgan yozuv emas, har bir Face ID o'tishini
 * alohida hodisa qilib qaytaradi: `type: 'in' | 'out'` va `time`. Kunlik ko'rinish
 * (birinchi kirish / oxirgi chiqish) shu yerda hodisalardan yig'iladi.
 */
export type PunchType = 'in' | 'out';
export type DayStatus = 'present' | 'late' | 'absent' | 'excused';

export interface BranchName {
  name_uz: string | null;
  name_ru: string | null;
  name_en: string | null;
}

/** `/attendances` har bir hodisada xodimning bo'limini ham qaytaradi —
 *  masalan "Pedagog xodimlar", "Mamuriy xodimlar". */
export interface AttendanceDepartment {
  id: number;
  name_uz: string | null;
  name_ru: string | null;
  name_en: string | null;
}

export interface AttendancePunch {
  id: number;
  employee_id: number;
  employee: string;
  position: string | null;
  department: AttendanceDepartment | null;
  branch_id: number | null;
  branch: BranchName | null;
  date: string;
  /** `HH:mm:ss` */
  time: string;
  type: PunchType;
  status: string[];
  comment: string | null;
}

export interface AttendanceDay {
  date: string;
  /** Kunning barcha kirish vaqtlari, o'sish tartibida. */
  ins: string[];
  /** Kunning barcha chiqish vaqtlari, o'sish tartibida. */
  outs: string[];
  firstIn: string | null;
  lastOut: string | null;
  /** Birinchi kirish va oxirgi chiqish orasidagi daqiqalar. */
  minutes: number;
  status: DayStatus | null;
  comments: string[];
}

export interface EmployeeDays {
  employeeId: number;
  fullName: string;
  position: string | null;
  department: AttendanceDepartment | null;
  branch: BranchName | null;
  /** `YYYY-MM-DD` → kun. */
  days: Record<string, AttendanceDay>;
}

/** Bir kunda bir nechta status uchrasa — eng "og'iri" ko'rsatiladi. */
const STATUS_PRIORITY: DayStatus[] = ['absent', 'excused', 'late', 'present'];

const isDayStatus = (value: string): value is DayStatus =>
  (STATUS_PRIORITY as string[]).includes(value);

const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value !== null && typeof value === 'object') {
    const nested = Object.values(value as Record<string, unknown>).find(Array.isArray);
    if (nested) return nested as T[];
  }
  return [];
};

export const monthRange = (year: number, month: number): { from: string; to: string } => {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
};

export const fetchPunches = async (year: number, month: number): Promise<AttendancePunch[]> => {
  const { from, to } = monthRange(year, month);
  const { data } = await API.get<unknown>(`/attendances?from=${from}&to=${to}`);
  return normalizeArray<AttendancePunch>(data);
};

/** `HH:mm:ss` → yarim tundan boshlab daqiqalar. */
const toMinutes = (time: string): number => {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
};

/** `HH:mm:ss` → `HH:mm`. */
export const shortTime = (time: string): string => time.slice(0, 5);

/** Daqiqalarni `2s 35d` ko'rinishida beradi. */
export const formatDuration = (minutes: number): string =>
  `${Math.floor(minutes / 60)}s ${minutes % 60}d`;

/**
 * Hodisalarni xodim va sana bo'yicha guruhlaydi. Kunning davomiyligi birinchi
 * kirish va oxirgi chiqish orasidagi farq — oraliqdagi har bir kirish/chiqish
 * juftligi emas, chunki xodim kun davomida turnikettan bir necha marta o'tadi.
 */
export const groupPunches = (punches: AttendancePunch[]): Record<number, EmployeeDays> => {
  const byEmployee: Record<number, EmployeeDays> = {};

  for (const punch of punches) {
    let employee = byEmployee[punch.employee_id];
    if (!employee) {
      employee = {
        employeeId: punch.employee_id,
        // `employee` bo'sh (null) kelsa jadval `localeCompare` da butunlay qulamasin.
        fullName: punch.employee ?? '',
        position: punch.position,
        department: punch.department,
        branch: punch.branch,
        days: {},
      };
      byEmployee[punch.employee_id] = employee;
    }
    if (!employee.position && punch.position) employee.position = punch.position;
    if (!employee.department && punch.department) employee.department = punch.department;
    if (!employee.branch && punch.branch) employee.branch = punch.branch;

    let day = employee.days[punch.date];
    if (!day) {
      day = {
        date: punch.date,
        ins: [],
        outs: [],
        firstIn: null,
        lastOut: null,
        minutes: 0,
        status: null,
        comments: [],
      };
      employee.days[punch.date] = day;
    }

    if (punch.type === 'in') day.ins.push(punch.time);
    else day.outs.push(punch.time);

    for (const status of punch.status) {
      if (!isDayStatus(status)) continue;
      if (day.status === null || STATUS_PRIORITY.indexOf(status) < STATUS_PRIORITY.indexOf(day.status)) {
        day.status = status;
      }
    }

    if (punch.comment && !day.comments.includes(punch.comment)) day.comments.push(punch.comment);
  }

  for (const employee of Object.values(byEmployee)) {
    for (const day of Object.values(employee.days)) {
      day.ins.sort();
      day.outs.sort();
      day.firstIn = day.ins[0] ?? null;
      day.lastOut = day.outs[day.outs.length - 1] ?? null;
      day.minutes =
        day.firstIn && day.lastOut
          ? Math.max(0, toMinutes(day.lastOut) - toMinutes(day.firstIn))
          : 0;
    }
  }

  return byEmployee;
};
