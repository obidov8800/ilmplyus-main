import type { BaseEntity, PaginatedResponse } from "./common.types";
import type { Course, CourseLevel } from "./course.types";
import type { Branch } from "./user.types";
import type { Group } from "./group.types";

export type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "text_answer";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type TestStatus = "active" | "inactive";

export interface Option {
  id?: number;
  option_text: string;
  is_correct: boolean;
  order: number;
}

export interface Question extends BaseEntity {
  question_text: string;
  question_type: QuestionType;
  difficulty_level: DifficultyLevel;
  course_id: number;
  level_id: number;
  test_id?: number;
  is_active: boolean;
  options: Option[];
  correct_text_answer?: string;
  course?: Course;
  level?: CourseLevel;
}

export interface CreateQuestionPayload {
  question_text: string;
  question_type: QuestionType;
  difficulty_level: DifficultyLevel;
  course_id: number;
  level_id: number;
  test_id: number;
  is_active: boolean;
  options: Omit<Option, "id">[];
  correct_text_answer?: string;
}

export interface Test extends BaseEntity {
  name: string;
  course_id: number;
  level_id: number;
  branch_id: number;
  questions_count: number;
  pass_percentage: number;
  time_limit: number;
  status: TestStatus;
  course?: Course;
  level?: CourseLevel;
  branch?: Branch;
}

export interface CreateTestPayload {
  name: string;
  course_id: number;
  level_id: number;
  branch_id: number;
  questions_count: number;
  pass_percentage: number;
  time_limit: number;
  status: TestStatus;
}

export interface ExamSession extends BaseEntity {
  test_id: number;
  group_id: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  min_attendance_pct: number;
  check_debt: boolean;
  notes: string;
  test?: Test;
  group?: Group;
  status?: "scheduled" | "completed" | "cancelled";
}

export interface CreateExamSessionPayload {
  test_id: number;
  group_id: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  min_attendance_pct: number;
  check_debt: boolean;
  notes: string;
}

export interface ExamAttempt extends BaseEntity {
  exam_session_id: number;
  student_id: number;
  start_time: string;
  end_time?: string;
  status: "started" | "submitted" | "passed" | "failed";
  score?: number;
  percentage?: number;
}

export interface AnswerPayload {
  question_id: number;
  selected_option_id: number | null;
  selected_option_ids: number[] | null;
  text_answer: string | null;
}

export interface ExamSubmitResult {
  message: string;
  total_questions: number;
  correct_count: number;
  incorrect_count: number;
  percentage: number;
  is_passed: boolean;
  pass_percentage: number;
  status_text: string;
}

export interface StudentResult {
  id: number;
  attempt_id: number | null;
  fish: string;
  correct_answers: string;
  percentage: string;
  status: string;
  date_time: string;
  decision?: string | null;
  retake_date?: string | null;
}

export interface TestResultsInfo {
  total_students: number;
  submitted_count: number;
  passed_count: number;
  failed_count: number;
  not_submitted_count: number;
}

export type TestsPaginatedResponse = PaginatedResponse<Test[]>;
export type QuestionsPaginatedResponse = PaginatedResponse<Question[]>;
export type SessionsPaginatedResponse = PaginatedResponse<ExamSession[]>;
