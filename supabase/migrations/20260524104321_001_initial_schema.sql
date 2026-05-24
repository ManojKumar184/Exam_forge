/*
  # ExamForge AI - Initial Database Schema
  
  Core tables for educational platform with role-based access.
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'faculty', 'student')),
  avatar_url TEXT,
  institution TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  class_levels INTEGER[] DEFAULT ARRAY[6,7,8,9,10,11,12],
  icon TEXT,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chapters/Topics table
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  chapter_number INTEGER,
  class_level INTEGER NOT NULL CHECK (class_level BETWEEN 6 AND 12),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'descriptive', 'numerical')),
  question_images TEXT[] DEFAULT '{}',
  question_latex TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  option_images JSONB DEFAULT '{}',
  option_latex JSONB DEFAULT '{}',
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  explanation_latex TEXT,
  class_level INTEGER NOT NULL CHECK (class_level BETWEEN 6 AND 12),
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('neet', 'jee', 'cbse', 'state_board')),
  default_marks INTEGER DEFAULT 4,
  ai_classified BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(5,2),
  needs_review BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES profiles(id),
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  source_page INTEGER,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Question Papers table
CREATE TABLE IF NOT EXISTS question_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('neet', 'jee', 'cbse', 'state_board')),
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  class_level INTEGER CHECK (class_level BETWEEN 6 AND 12),
  total_marks INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  duration_minutes INTEGER DEFAULT 180,
  paper_set TEXT DEFAULT 'A' CHECK (paper_set IN ('A', 'B', 'C')),
  instructions TEXT,
  is_online BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  pdf_url TEXT,
  answer_key_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Question Paper Items
CREATE TABLE IF NOT EXISTS question_paper_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES question_papers(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  section TEXT DEFAULT 'A',
  order_index INTEGER NOT NULL,
  marks INTEGER DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(paper_id, question_id)
);

-- Online Tests
CREATE TABLE IF NOT EXISTS online_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES question_papers(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  test_code TEXT UNIQUE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  access_type TEXT DEFAULT 'open' CHECK (access_type IN ('open', 'restricted', 'invite')),
  allowed_emails TEXT[] DEFAULT '{}',
  shuffle_questions BOOLEAN DEFAULT false,
  shuffle_options BOOLEAN DEFAULT false,
  show_results_immediately BOOLEAN DEFAULT true,
  allow_review BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Test Attempts
CREATE TABLE IF NOT EXISTS test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES online_tests(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  start_time TIMESTAMPTZ DEFAULT now(),
  end_time TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  is_submitted BOOLEAN DEFAULT false,
  total_score DECIMAL(6,2),
  correct_answers INTEGER DEFAULT 0,
  incorrect_answers INTEGER DEFAULT 0,
  unattempted INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'auto_submitted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(test_id, student_id)
);

-- Test Answers
CREATE TABLE IF NOT EXISTS test_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES test_attempts(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  selected_option TEXT,
  written_answer TEXT,
  is_correct BOOLEAN,
  marks_obtained DECIMAL(6,2) DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  visited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(attempt_id, question_id)
);

-- Question Uploads
CREATE TABLE IF NOT EXISTS question_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID REFERENCES profiles(id) NOT NULL,
  filename TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'image')),
  total_questions INTEGER DEFAULT 0,
  processed_questions INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_paper_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_uploads ENABLE ROW LEVEL SECURITY;