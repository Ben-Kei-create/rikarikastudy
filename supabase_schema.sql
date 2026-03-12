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
  accept_answers JSONB DEFAULT NULL,
  keywords JSONB DEFAULT NULL,
  created_by_student_id INTEGER REFERENCES students(id),
  explanation TEXT,
  image_url TEXT,
  image_display_width INTEGER,
  image_display_height INTEGER,
  grade TEXT DEFAULT '中3',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS accept_answers JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS keywords JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by_student_id INTEGER REFERENCES students(id);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_display_width INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_display_height INTEGER;

-- クイズセッションテーブル
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER REFERENCES students(id),
  field TEXT NOT NULL,
  unit TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 0;

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

-- オンライン状態テーブル
CREATE TABLE IF NOT EXISTS active_sessions (
  session_token TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- チャット警告ログ
CREATE TABLE IF NOT EXISTS chat_guard_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('生物', '化学', '物理', '地学')),
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_excerpt TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'draft' CHECK (source IN ('draft', 'send')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 理科辞典テーブル
CREATE TABLE IF NOT EXISTS science_glossary_entries (
  id TEXT PRIMARY KEY,
  term TEXT NOT NULL,
  reading TEXT NOT NULL,
  field TEXT NOT NULL CHECK (field IN ('生物', '化学', '物理', '地学')),
  short_description TEXT NOT NULL,
  description TEXT NOT NULL,
  related JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 旧質問DM機能は廃止
DROP TABLE IF EXISTS student_questions;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student ON quiz_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_answer_logs_student ON answer_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_answer_logs_question ON answer_logs(question_id);
CREATE INDEX IF NOT EXISTS idx_questions_field ON questions(field);
CREATE INDEX IF NOT EXISTS idx_questions_created_by_student ON questions(created_by_student_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_student ON active_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen ON active_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_chat_guard_logs_student ON chat_guard_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_chat_guard_logs_created_at ON chat_guard_logs(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_science_glossary_field_term ON science_glossary_entries(field, term);
CREATE INDEX IF NOT EXISTS idx_science_glossary_reading ON science_glossary_entries(reading);

-- RLS（Row Level Security）を無効に（塾内利用のため簡略化）
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE answer_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_guard_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE science_glossary_entries DISABLE ROW LEVEL SECURITY;

-- ========================================
-- Engagement upgrade (XP / daily / badges / time attack)
-- ========================================

ALTER TABLE students ADD COLUMN IF NOT EXISTS student_xp INTEGER NOT NULL DEFAULT 0;

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS xp_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS session_mode TEXT NOT NULL DEFAULT 'standard';

CREATE TABLE IF NOT EXISTS daily_challenges (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  session_id UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, date)
);

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_emoji TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'legendary')),
  condition_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_badges (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL REFERENCES badges(key) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, badge_key)
);

CREATE TABLE IF NOT EXISTS time_attack_records (
  student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  best_score INTEGER NOT NULL DEFAULT 0,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO badges (key, name, description, icon_emoji, rarity, condition_type) VALUES
  ('first_quiz', '初クイズ', 'はじめてクイズをクリアした', '🌱', 'common', 'first_quiz'),
  ('streak_3', '3日連続', '3日連続で学習した', '🔥', 'common', 'streak'),
  ('bio_debut', '生物デビュー', '生物の問題を初めて解いた', '🌿', 'common', 'field_debut'),
  ('chem_debut', '化学デビュー', '化学の問題を初めて解いた', '⚗️', 'common', 'field_debut'),
  ('phys_debut', '物理デビュー', '物理の問題を初めて解いた', '⚡', 'common', 'field_debut'),
  ('earth_debut', '地学デビュー', '地学の問題を初めて解いた', '🌏', 'common', 'field_debut'),
  ('perfect_score', '全問正解', '1回の学習で全問正解した', '💯', 'rare', 'perfect'),
  ('streak_7', '7日連続', '7日連続で学習した', '🏅', 'rare', 'streak'),
  ('total_100', '100問突破', '合計100問以上に挑戦した', '📚', 'rare', 'total_questions'),
  ('speed_star', 'スピードスター', '60秒未満で1セットをクリアした', '💨', 'rare', 'speed'),
  ('daily_perfect', 'デイリーパーフェクト', '今日のチャレンジを全問正解した', '☀️', 'rare', 'daily_challenge'),
  ('level_10', '研究者見習い', 'レベル10に到達した', '🧪', 'rare', 'level'),
  ('streak_30', '30日連続', '30日連続で学習した', '👑', 'legendary', 'streak'),
  ('all_fields_day', '全分野制覇', '1日のうちに4分野すべてを解いた', '🛰️', 'legendary', 'all_fields_day'),
  ('total_1000', '1000問の壁', '合計1000問以上に挑戦した', '🚀', 'legendary', 'total_questions'),
  ('level_50', '天才科学者', 'レベル50に到達した', '🧠', 'legendary', 'level')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon_emoji = EXCLUDED.icon_emoji,
  rarity = EXCLUDED.rarity,
  condition_type = EXCLUDED.condition_type;

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_created_at ON quiz_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_mode ON quiz_sessions(session_mode);
CREATE INDEX IF NOT EXISTS idx_daily_challenges_date ON daily_challenges(date DESC);
CREATE INDEX IF NOT EXISTS idx_student_badges_student ON student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_time_attack_records_score ON time_attack_records(best_score DESC);

ALTER TABLE daily_challenges DISABLE ROW LEVEL SECURITY;
ALTER TABLE badges DISABLE ROW LEVEL SECURITY;
ALTER TABLE student_badges DISABLE ROW LEVEL SECURITY;
ALTER TABLE time_attack_records DISABLE ROW LEVEL SECURITY;
