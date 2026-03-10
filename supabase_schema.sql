-- ========================================
-- RikaQuiz Supabase Schema
-- Run this in Supabase SQL Editor
-- ========================================

-- 生徒テーブル（ID 1-5固定）
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 5),
  nickname TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 既存環境向けの移行
ALTER TABLE students ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_id_check;
ALTER TABLE students ADD CONSTRAINT students_id_check CHECK (id BETWEEN 1 AND 5);

-- 初期データ挿入
INSERT INTO students (id, nickname, password) VALUES
  (1, 'S', 'rikalove1'),
  (2, 'M', 'rikalove2'),
  (3, 'T', 'rikalove3'),
  (4, 'K', 'rikalove4'),
  (5, '先生', 'rikaadmin2026')
ON CONFLICT (id) DO NOTHING;

-- 既存の旧デフォルト名だけ新デフォルトへ置換
UPDATE students SET nickname = 'S' WHERE id = 1 AND nickname = 'ゆうき';
UPDATE students SET nickname = 'M' WHERE id = 2 AND nickname = 'あおい';
UPDATE students SET nickname = 'T' WHERE id = 3 AND nickname = 'りく';
UPDATE students SET nickname = 'K' WHERE id = 4 AND nickname = 'はな';
UPDATE students SET nickname = '先生' WHERE id = 5 AND (nickname IS NULL OR BTRIM(nickname) = '');

-- パスワード未設定の既存行に初期PWを投入
UPDATE students SET password = 'rikalove1' WHERE id = 1 AND (password IS NULL OR BTRIM(password) = '' OR password = 'rikarikalove');
UPDATE students SET password = 'rikalove2' WHERE id = 2 AND (password IS NULL OR BTRIM(password) = '' OR password = 'rikarikalove');
UPDATE students SET password = 'rikalove3' WHERE id = 3 AND (password IS NULL OR BTRIM(password) = '' OR password = 'rikarikalove');
UPDATE students SET password = 'rikalove4' WHERE id = 4 AND (password IS NULL OR BTRIM(password) = '' OR password = 'rikarikalove');
UPDATE students SET password = 'rikaadmin2026' WHERE id = 5 AND (password IS NULL OR BTRIM(password) = '');
ALTER TABLE students ALTER COLUMN password SET NOT NULL;

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

-- 生徒から先生への質問テーブル
CREATE TABLE IF NOT EXISTS student_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student ON quiz_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_answer_logs_student ON answer_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_answer_logs_question ON answer_logs(question_id);
CREATE INDEX IF NOT EXISTS idx_questions_field ON questions(field);
CREATE INDEX IF NOT EXISTS idx_student_questions_student ON student_questions(student_id);

-- RLS（Row Level Security）を無効に（塾内利用のため簡略化）
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE answer_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE student_questions DISABLE ROW LEVEL SECURITY;
