// User types
export type UserRole = 'super_admin' | 'faculty' | 'student';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  school_institute: string | null;
  phone: string | null;
  is_active: boolean;
  approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

// Subject types
export interface Subject {
  id: string;
  name: string;
  code: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

// Chapter types
export interface Chapter {
  id: string;
  subject_id: string;
  name: string;
  chapter_number: number | null;
  class: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  subject?: Subject;
}

// Exam type
export interface ExamType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

// Question types
export type QuestionType = 'mcq' | 'descriptive' | 'numerical';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionStatus = 'pending' | 'approved' | 'rejected' | 'needs_review';

export interface QuestionOption {
  text: string;
  image?: string;
  latex?: string;
}

export interface Question {
  id: string;
  subject_id: string | null;
  chapter_id: string | null;
  exam_type_id: string | null;
  question_text: string;
  question_type: QuestionType;
  question_latex: string | null;
  question_images: string[];
  options: QuestionOption[];
  option_images: Record<string, string>;
  correct_option: number | null;
  numerical_answer: number | null;
  numerical_tolerance: number;
  answer_text: string | null;
  difficulty: Difficulty;
  marks: number | null;
  class: number;
  explanation: string | null;
  explanation_latex: string | null;
  explanation_images: string[];
  diagrams: Array<{ url?: string; order?: number; type?: string; html?: string; caption?: string }>;
  image_metadata?: Array<{
    url: string;
    order: number;
    caption?: string | null;
    type?: string;
  }>;
  has_diagram: boolean;
  has_equation: boolean;
  has_table?: boolean;
  rendering_metadata?: Record<string, unknown>;
  tags: string[];
  ai_confidence: number;
  ai_metadata: Record<string, any>;
  status: QuestionStatus;
  extraction_warnings?: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  source: string | null;
  source_file: string | null;
  extracted_from: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  subject?: Subject;
  chapter?: Chapter;
  exam_type?: ExamType;
  parser_confidence?: number;
  reconstruction_fidelity?: number;
  semantic_confidence?: number;
  math_preservation_confidence?: number;
  metadata_confidence?: number;
  audit_history?: Array<any>;
  debug_info?: any;
}

// Paper types
export type PaperStatus = 'draft' | 'published' | 'archived';
export type PaperSet = 'A' | 'B' | 'C' | 'D';

export interface PaperSection {
  name: string;
  questionCount: number;
  marksPerQuestion: number;
  negativeMarksPerQuestion?: number;
}

export interface Paper {
  id: string;
  title: string;
  description: string | null;
  paper_code: string;
  exam_type_id: string | null;
  subject_id: string | null;
  class: number;
  total_marks: number;
  total_questions: number;
  duration_minutes: number;
  sections: PaperSection[];
  instructions: string | null;
  paper_set: PaperSet;
  is_online: boolean;
  status: PaperStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  exam_type?: ExamType;
  subject?: Subject;
  questions?: PaperQuestion[];
}

export interface PaperQuestion {
  id?: string;
  paper_id?: string;
  question_id: string;
  section: string;
  section_order: number;
  question_order: number;
  custom_marks: number | null;
  custom_negative_marks?: number | null;
  created_at?: string;
  question?: Question;
}

// Online test types
export type TestStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'archived';

export interface OnlineTest {
  id: string;
  paper_id: string;
  test_code: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results: boolean;
  show_answers: boolean;
  allow_review: boolean;
  is_public: boolean;
  access_code: string | null;
  allowed_users: string[];
  status: TestStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  paper?: Paper;
}

// Test attempt types
export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted' | 'abandoned';

export interface TestAttempt {
  id: string;
  test_id: string;
  user_id: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  time_spent_seconds: number;
  status: AttemptStatus;
  score: number;
  max_score: number;
  percentage: number;
  rank: number | null;
  correct_answers: number;
  wrong_answers: number;
  skipped_answers: number;
  grading_status?: 'not_required' | 'pending' | 'partial' | 'complete';
  graded_at?: string | null;
  graded_by?: string | null;
  user?: { id: string; email: string; full_name: string | null };
  test?: OnlineTest;
  answers?: TestAnswer[];
}

export interface TestAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option: number | null;
  numerical_answer: number | null;
  text_answer: string | null;
  is_correct: boolean | null;
  marks_obtained: number;
  max_marks?: number | null;
  grading_remarks?: string | null;
  graded_at?: string | null;
  graded_by?: string | null;
  is_skipped: boolean;
  is_marked_for_review: boolean;
  answered_at: string | null;
  time_spent_seconds: number;
  question?: Question;
}

// Upload types
export type UploadStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type UploadFileType = 'pdf' | 'docx' | 'image';

export interface Upload {
  id: string;
  filename: string;
  original_name: string;
  file_path: string;
  file_type: UploadFileType;
  file_size: number | null;
  status: UploadStatus;
  processing_stage?: string;
  progress?: number;
  questions_extracted: number;
  questions_approved: number;
  processing_error: string | null;
  extraction_warnings?: string[];
  uploaded_by: string;
  stage_logs?: string[];
  created_at: string;
  processed_at: string | null;
}

// Leaderboard
export interface LeaderboardEntry {
  id: string;
  test_id: string;
  user_id: string;
  score: number;
  percentage: number;
  time_spent_seconds: number;
  rank: number | null;
  updated_at: string;
  profile?: Profile;
}

// Analytics
export interface AnalyticsData {
  total_users: number;
  total_admins: number;
  total_faculty: number;
  total_students: number;
  total_questions: number;
  total_papers: number;
  total_tests: number;
  total_attempts: number;
  pending_questions: number;
  approved_questions: number;
  needs_review_questions?: number;
}

// Filter types
export interface QuestionFilters {
  subject_id?: string;
  chapter_id?: string;
  exam_type_id?: string;
  class?: number;
  difficulty?: Difficulty;
  question_type?: QuestionType;
  status?: QuestionStatus;
  search?: string;
}

export interface PaperGeneratorConfig {
  title: string;
  exam_type_id: string;
  subject_id: string;
  class: number;
  total_marks: number;
  total_questions: number;
  duration_minutes: number;
  difficulty_distribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  chapters: string[];
  question_types: QuestionType[];
  instructions: string;
  paper_set: PaperSet;
}
