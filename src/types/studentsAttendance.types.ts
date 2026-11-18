/** Backend yangi enum: active/frozen/dropped/graduated. Eski 'Aktiv'/'Noaktiv' ham kelishi mumkin. */
export type StudentStatus =
  | 'active'
  | 'frozen'
  | 'dropped'
  | 'graduated'
  | 'Aktiv'
  | 'Noaktiv';

export interface Student {
  id: number;
  first_name: string;
  last_name: string;
  father_name?: string;
  phone: string;
  status: StudentStatus;
  balance: number | string;
  last_payment_date: string;
  is_active?: boolean;
  groups?: Array<{ id: number; pivot?: { group_id: number } }>;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'reason';

export interface Attendance {
  id?: number;
  student_id: number;
  group_id: number;
  date: string;
  status: AttendanceStatus;
  /** Baho — 1–5 (eski yozuvlarda 100 ballik qiymat bo'lishi mumkin; ustun integer). `null` — baho yo'q. */
  score?: number | null;
  comment_uz?: string | null;
}

/** Davomat/baho oynasidan chiqadigan qiymat. */
export interface AttendanceMark {
  status: AttendanceStatus;
  grade: number | null;
  comment: string;
}

export type MonthlyAttendanceResponse = Record<string, Attendance[]>;

export interface StudentsResponse {
  data: Student[];
}

export interface GroupData {
  id: number;
  name: string;
  days: string[];
  [key: string]: unknown;
}
