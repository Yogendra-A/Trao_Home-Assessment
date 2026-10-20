import type { InterviewKit, Question } from "../../../shared/schemas/kit";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface KitRecord {
  id: string;
  userId: string;
  title: string;
  company: string;
  status: "generating" | "completed" | "failed";
  kit: InterviewKit;
  // Tracking for Interactive Builder (Phase 3)
  pinnedQuestionIds: string[];
  customQuestionIds: string[];
  editedQuestions: Record<string, Partial<Question>>;
  // Tracking for Practice Mode (Phase 4)
  confidenceRatings: Record<string, "low" | "medium" | "high">;
  coveredCardIds: string[];
  createdAt: string;
  updatedAt: string;
}
