-- ========================================
-- RikaQuiz Supabase Schema
-- Run this in Supabase SQL Editor
-- ========================================

-- 生徒テーブル（ID 1-4固定）
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 4),
  nickname TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初期データ挿入
INSERT INTO students (id, nickname) VALUES
  (1, 'ゆうき'),
  (2, 'あおい'),
  (3, 'りく'),
  (4, 'はな')
ON CONFLICT (id) DO NOTHING;

-- 問題テーブル
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field TEXT NOT NULL CHECK (field IN ('生物', '化学', '物理', '地学')),
  unit TEXT NOT NULL,
  question TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('choice', 'text')),
  choices JSONB,
  answer TEXT NOT NULL,
  explanation TEXT,
  grade TEXT DEFAULT '中3',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- クイズセッションテーブル
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER REFERENCES students(id),
  field TEXT NOT NULL,
  unit TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 回答ログテーブル
CREATE TABLE IF NOT EXISTS answer_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id),
  question_id UUID REFERENCES questions(id),
  is_correct BOOLEAN NOT NULL,
  student_answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student ON quiz_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_answer_logs_student ON answer_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_answer_logs_question ON answer_logs(question_id);
CREATE INDEX IF NOT EXISTS idx_questions_field ON questions(field);

-- RLS（Row Level Security）を無効に（塾内利用のため簡略化）
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE answer_logs DISABLE ROW LEVEL SECURITY;
