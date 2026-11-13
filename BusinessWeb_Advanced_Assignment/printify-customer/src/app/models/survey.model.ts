export type TamDimension = 'PU' | 'EOU' | 'SAT' | 'PI';

export type SurveyBlockedReason =
  | 'ALREADY_RESPONDED'
  | 'NEED_DESIGN_OR_COMPLETED_ORDER'
  | 'NO_ACTIVE_QUESTIONS'
  | null;

export interface SurveyQuestion {
  _id: string;
  dimension: TamDimension;
  text: string;
  scaleType: 'LIKERT_5';
  orderIndex: number;
  isActive: boolean;
}

/** Shape returned by GET /api/survey/questions */
export interface SurveyQuestionsResponse {
  questions: SurveyQuestion[];
  eligible: boolean;
  hasResponded: boolean;
  canSubmit: boolean;
  reason: SurveyBlockedReason;
}

export interface SurveyAnswer {
  questionId: string;
  score: number; // Integer 1..5, validated by backend
}

/** Do NOT send userId: backend takes it from authenticated session. */
export interface SubmitSurveyRequest {
  answers: SurveyAnswer[];
  comment: string;
}

export interface SubmitSurveyResponse {
  message: string;
  submittedAt: string;
}