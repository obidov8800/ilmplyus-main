import type { BaseEntity } from "./common.types";

export interface DemoLessonGroup {
  id: number;
  name: string;
}

export interface DemoLessonRoom {
  id: number;
  name?: string;
  name_uz?: string;
  name_ru?: string;
  name_en?: string;
  floor?: number;
}

export interface DemoLessonTeacher {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string;
  full_name?: string;
}

export interface DemoLessonLid {
  id: number;
  first_name: string;
  last_name: string;
  father_name?: string | null;
  phone?: string;
  group_id?: number | null;
}

export interface DemoLesson extends BaseEntity {
  group_id: number;
  group?: DemoLessonGroup;
  date: string;
  start_time: string;
  end_time: string;
  room_id?: number;
  room?: DemoLessonRoom;
  teacher_id?: number;
  teacher?: DemoLessonTeacher;
  status?: string;
  lid_ids?: number[];
  lids?: DemoLessonLid[];
  lid?: DemoLessonLid;
}

export interface DemoLessonFilters {
  lid_ids?: number[];
  date?: string;
  status?: string;
}

export interface CreateDemoLessonPayload {
  group_id: number;
  date: string;
  start_time: string;
  end_time: string;
  room_id: number;
  teacher_id: number;
  lid_ids: number[];
}

export interface UpdateDemoLessonPayload {
  id: number;
  data: Partial<CreateDemoLessonPayload>;
}

export interface AttendancePayload {
  id: number;
  data: Record<string, unknown>;
}

export interface DemoLessonsApiResponse {
  current_page: number;
  data: DemoLesson[];
  last_page?: number;
  total?: number;
}
