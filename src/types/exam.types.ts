import type { DifficultyLevel, QuestionType } from "./studentsTest.types";

export type AttemptStatus = "in_progress" | "submitted" | "timed_out";
export type DecisionType = "passed" | "held_back" | "individual" | "retake";
export type IneligibleReason = "attendance_low" | "has_debt";

export interface ExamOption {
  id: number;
  question_id: number;
  option_text: string;
  order: number;
}

export interface ExamQuestion {
  order: number;
  question_id: number;
  question_text: string;
  question_type: QuestionType;
  difficulty_level?: DifficultyLevel;
  options: ExamOption[];
}

export interface ExamAttemptInfo {
  id: number;
  status: AttemptStatus;
  attempt_number: number;
  started_at: string;
  remaining_seconds: number;
  student_name: string;
  group_name: string;
  course: string;
  level: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  time_limit: number;
}

export interface ExamAttemptData {
  attempt: ExamAttemptInfo;
  questions: ExamQuestion[];
  answered_count: number;
  total_questions: number;
}

export interface StartAttemptResponse {
  attempt_id: number;
  status: AttemptStatus;
  attempt_number: number;
  started_at: string;
  remaining_seconds: number;
  total_questions: number;
}

export interface ExamAnswerPayload {
  question_id: number;
  selected_option_id?: number | null;
  selected_option_ids?: number[] | null;
  text_answer?: string | null;
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

export interface StoredAnswer {
  selected_option_id?: number;
  selected_option_ids?: number[];
  text_answer?: string;
}

export interface EligibleStudent {
  student_id: number;
  full_name: string;
  attendance_pct: number;
  balance?: string;
  has_debt: boolean;
  is_eligible: boolean;
  ineligible_reason: IneligibleReason | null;
  attempt_status: AttemptStatus | null;
  attempt_id: number | null;
  is_passed: boolean | null;
  decision: DecisionType | null;
  retake_date: string | null;
}
