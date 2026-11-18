export type AttendanceStatusKey =
  | '+'
  | 'NB'
  | 'S'
  | 'F'
  | 'K'
  | 'absent'
  | 'present'
  | 'no_uniform'
  | 'late'
  | 'excused';
export type AttendanceStatus = AttendanceStatusKey | null;

export interface AttendanceRecord {
  id?: number;
  employee_id: number;
  date: string; // YYYY-MM-DD
  status: AttendanceStatusKey | string[];
  comment_uz?: string;
  check_in?: string;
  check_out?: string;
}

/** `/attendances` har bir yozuvda xodimning bo'limini ham qaytaradi. */
export interface AttendanceDepartment {
  id: number;
  name_uz: string | null;
  name_ru: string | null;
  name_en: string | null;
}

export interface FlatAttendanceRecord {
  id: number;
  employee_id: number;
  employee: string;
  position: string;
  department?: AttendanceDepartment | null;
  branch_id?: number | null;
  branch?: { name_uz?: string; name_ru?: string; name_en?: string } | null;
  date: string;
  check_in: string;
  check_out: string;
  comment: string | null;
  status: string[];
}

export interface EmployeeAttendance {
  id: number;
  full_name: string;
  position?: string | null;
  department?: string | null;
  /** Bo'lim id'si — bo'lim filtri uchun. */
  department_id?: number | null;
  attendances: (Omit<AttendanceRecord, 'status'> & {
    status: AttendanceStatusKey[];
    comment?: string | null;
  })[];
}

export interface AttendanceResponse {
  data: FlatAttendanceRecord[] | EmployeeAttendance[];
}
