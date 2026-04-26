-- ========================================
-- RikaQuiz Supabase Schema
-- Run this in Supabase SQL Editor
-- ========================================

-- 生徒テーブル（自動登録対応）
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  nickname TEXT NOT NULL,
  password TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 既存環境向けの移行
ALTER TABLE students ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_id_check;
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- 新規登録用シーケンス（ID 6以降を発行）
CREATE SEQUENCE IF NOT EXISTS students_id_seq START WITH 6;
SELECT setval('students_id_seq', GREATEST(6, (SELECT COALESCE(MAX(id), 5) + 1 FROM students)), false);

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

-- Gemini API 利用権限（デフォルトは無効）
ALTER TABLE students ADD COLUMN IF NOT EXISTS gemini_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 既存の生徒（ID 1-5）は承認済み＆Gemini有効にする
UPDATE students SET is_approved = TRUE WHERE id BETWEEN 1 AND 5;
UPDATE students SET gemini_enabled = TRUE WHERE id BETWEEN 1 AND 5;

-- 問題テーブル
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field TEXT NOT NULL CHECK (field IN ('生物', '化学', '物理', '地学')),
  unit TEXT NOT NULL,
  question TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('choice', 'choice4', 'true_false', 'fill_choice', 'match', 'sort', 'multi_select', 'word_bank', 'text')),
  choices JSONB,
  answer TEXT NOT NULL,
  accept_answers JSONB DEFAULT NULL,
  keywords JSONB DEFAULT NULL,
  match_pairs JSONB DEFAULT NULL,
  sort_items JSONB DEFAULT NULL,
  correct_choices JSONB DEFAULT NULL,
  word_tokens JSONB DEFAULT NULL,
  distractor_tokens JSONB DEFAULT NULL,
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
ALTER TABLE questions ADD COLUMN IF NOT EXISTS match_pairs JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS sort_items JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_choices JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS word_tokens JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS distractor_tokens JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by_student_id INTEGER REFERENCES students(id);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_display_width INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_display_height INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS column_title TEXT DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS column_body TEXT DEFAULT NULL;
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('choice', 'choice4', 'true_false', 'fill_choice', 'match', 'sort', 'multi_select', 'word_bank', 'text'));

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

-- アクティブリコール回答ログ
CREATE TABLE IF NOT EXISTS active_recall_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('生物', '化学', '物理', '地学')),
  unit TEXT NOT NULL,
  source_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  prompt_type TEXT NOT NULL CHECK (prompt_type IN ('term', 'mechanism', 'process', 'compare', 'cause')),
  prompt_text TEXT NOT NULL,
  cue_text TEXT NOT NULL DEFAULT '',
  hint_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  student_answer TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('strong', 'close', 'review')),
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  coach_reply TEXT NOT NULL DEFAULT '',
  model_answer TEXT NOT NULL DEFAULT '',
  follow_up_prompt TEXT DEFAULT NULL,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS student_id INTEGER REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS field TEXT;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS source_question_id UUID REFERENCES questions(id) ON DELETE SET NULL;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS prompt_type TEXT;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS prompt_text TEXT;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS cue_text TEXT NOT NULL DEFAULT '';
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS hint_keywords JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS key_points JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS student_answer TEXT;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS rating TEXT;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS strengths JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS missing_points JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS coach_reply TEXT NOT NULL DEFAULT '';
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS model_answer TEXT NOT NULL DEFAULT '';
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS follow_up_prompt TEXT DEFAULT NULL;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE active_recall_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- オンライン状態テーブル
CREATE TABLE IF NOT EXISTS active_sessions (
  session_token TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- オンライン実験ラボ共有ルーム
CREATE TABLE IF NOT EXISTS online_lab_rooms (
  room_key TEXT PRIMARY KEY,
  mode TEXT,
  controller_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  controller_nickname TEXT,
  is_live BOOLEAN NOT NULL DEFAULT FALSE,
  phase TEXT NOT NULL DEFAULT 'idle' CHECK (phase IN ('idle', 'adjusting', 'result', 'finished')),
  round_index INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  state_json JSONB DEFAULT NULL,
  feedback_json JSONB DEFAULT NULL,
  memo_text TEXT NOT NULL DEFAULT '',
  whiteboard_strokes JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_password TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE online_lab_rooms ADD COLUMN IF NOT EXISTS entry_password TEXT NOT NULL DEFAULT '';

INSERT INTO online_lab_rooms (room_key, is_live)
VALUES ('main', FALSE)
ON CONFLICT (room_key) DO NOTHING;

-- オンライン陣取りゲーム共有ルーム
CREATE TABLE IF NOT EXISTS online_territory_rooms (
  room_key TEXT PRIMARY KEY,
  player_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  player_nickname TEXT,
  cpu_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  cpu_nickname TEXT,
  current_turn TEXT NOT NULL DEFAULT 'player' CHECK (current_turn IN ('player', 'cpu')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  winner TEXT DEFAULT NULL CHECK (winner IS NULL OR winner IN ('player', 'cpu', 'draw')),
  board_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_move_json JSONB DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO online_territory_rooms (room_key)
VALUES ('main')
ON CONFLICT (room_key) DO NOTHING;

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

-- 問題問い合わせテーブル
CREATE TABLE IF NOT EXISTS question_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER NOT NULL,
  student_nickname TEXT NOT NULL,
  question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved')),
  category TEXT NOT NULL DEFAULT 'question_content' CHECK (category IN ('question_content', 'answer_content', 'other')),
  message TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL CHECK (field IN ('生物', '化学', '物理', '地学')),
  unit TEXT NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('choice', 'choice4', 'true_false', 'fill_choice', 'match', 'sort', 'multi_select', 'word_bank', 'text')),
  choices JSONB DEFAULT NULL,
  match_pairs JSONB DEFAULT NULL,
  sort_items JSONB DEFAULT NULL,
  correct_choices JSONB DEFAULT NULL,
  word_tokens JSONB DEFAULT NULL,
  distractor_tokens JSONB DEFAULT NULL,
  answer_text TEXT NOT NULL,
  explanation_text TEXT DEFAULT NULL,
  image_url TEXT DEFAULT NULL,
  admin_note TEXT NOT NULL DEFAULT '',
  admin_reply TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  replied_at TIMESTAMPTZ DEFAULT NULL,
  resolved_at TIMESTAMPTZ DEFAULT NULL
);

ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS student_id INTEGER;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS student_nickname TEXT;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS question_id UUID REFERENCES questions(id) ON DELETE SET NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'question_content';
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS field TEXT;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS question_text TEXT;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS question_type TEXT;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS choices JSONB DEFAULT NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS match_pairs JSONB DEFAULT NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS sort_items JSONB DEFAULT NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS correct_choices JSONB DEFAULT NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS word_tokens JSONB DEFAULT NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS distractor_tokens JSONB DEFAULT NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS answer_text TEXT;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS explanation_text TEXT DEFAULT NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT '';
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS admin_reply TEXT NOT NULL DEFAULT '';
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE question_inquiries ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE question_inquiries DROP CONSTRAINT IF EXISTS question_inquiries_question_type_check;
ALTER TABLE question_inquiries ADD CONSTRAINT question_inquiries_question_type_check
  CHECK (question_type IN ('choice', 'choice4', 'true_false', 'fill_choice', 'match', 'sort', 'multi_select', 'word_bank', 'text'));

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

-- ログイン画面アップデート掲示板
CREATE TABLE IF NOT EXISTS login_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE login_updates ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE login_updates ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE login_updates ADD COLUMN IF NOT EXISTS created_by_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL;
ALTER TABLE login_updates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION trim_login_updates()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM login_updates
  WHERE id IN (
    SELECT id
    FROM login_updates
    ORDER BY created_at DESC, id DESC
    OFFSET 10
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_trim_login_updates ON login_updates;
CREATE TRIGGER trigger_trim_login_updates
AFTER INSERT ON login_updates
FOR EACH STATEMENT
EXECUTE FUNCTION trim_login_updates();

-- 管理者メッセージ / 要望掲示板
CREATE TABLE IF NOT EXISTS admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_nickname TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved')),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('request', 'update', 'other')),
  message TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  admin_reply TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replied_at TIMESTAMPTZ DEFAULT NULL,
  resolved_at TIMESTAMPTZ DEFAULT NULL
);

ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS student_id INTEGER REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS student_nickname TEXT;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS admin_reply TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ DEFAULT NULL;

-- 周期表カード所持テーブル
CREATE TABLE IF NOT EXISTS student_element_cards (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  card_key TEXT NOT NULL,
  obtain_count INTEGER NOT NULL DEFAULT 1,
  first_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_source TEXT NOT NULL DEFAULT 'login' CHECK (last_source IN ('login', 'perfect_clear', 'level_up')),
  PRIMARY KEY (student_id, card_key)
);

ALTER TABLE student_element_cards ADD COLUMN IF NOT EXISTS obtain_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE student_element_cards ADD COLUMN IF NOT EXISTS first_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE student_element_cards ADD COLUMN IF NOT EXISTS last_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE student_element_cards ADD COLUMN IF NOT EXISTS last_source TEXT NOT NULL DEFAULT 'login';

-- 周期表カード獲得ログ
CREATE TABLE IF NOT EXISTS element_card_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  card_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('login', 'perfect_clear', 'level_up')),
  reward_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE element_card_rewards ADD COLUMN IF NOT EXISTS student_id INTEGER REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE element_card_rewards ADD COLUMN IF NOT EXISTS card_key TEXT;
ALTER TABLE element_card_rewards ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'login';
ALTER TABLE element_card_rewards ADD COLUMN IF NOT EXISTS reward_date DATE;
ALTER TABLE element_card_rewards ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 旧質問DM機能は廃止
DROP TABLE IF EXISTS student_questions;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student ON quiz_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_answer_logs_student ON answer_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_answer_logs_question ON answer_logs(question_id);
CREATE INDEX IF NOT EXISTS idx_active_recall_logs_student ON active_recall_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_active_recall_logs_session ON active_recall_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_active_recall_logs_review ON active_recall_logs(student_id, needs_review, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_field ON questions(field);
CREATE INDEX IF NOT EXISTS idx_questions_created_by_student ON questions(created_by_student_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_student ON active_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen ON active_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_online_lab_rooms_updated_at ON online_lab_rooms(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_territory_rooms_updated_at ON online_territory_rooms(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_guard_logs_student ON chat_guard_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_chat_guard_logs_created_at ON chat_guard_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_inquiries_student ON question_inquiries(student_id);
CREATE INDEX IF NOT EXISTS idx_question_inquiries_status ON question_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_question_inquiries_created_at ON question_inquiries(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_science_glossary_field_term ON science_glossary_entries(field, term);
CREATE INDEX IF NOT EXISTS idx_science_glossary_reading ON science_glossary_entries(reading);
CREATE INDEX IF NOT EXISTS idx_login_updates_created_at ON login_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_messages_student ON admin_messages(student_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_status ON admin_messages(status);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created_at ON admin_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_element_cards_student ON student_element_cards(student_id);
CREATE INDEX IF NOT EXISTS idx_element_card_rewards_student ON element_card_rewards(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_element_card_rewards_daily_login
  ON element_card_rewards(student_id, source, reward_date)
  WHERE source = 'login';

-- 管理者が指定する「授業の予習・復習」ボタン用のピン留めクイズ
CREATE TABLE IF NOT EXISTS pinned_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field TEXT NOT NULL CHECK (field IN ('生物', '化学', '物理', '地学')),
  grade TEXT NOT NULL DEFAULT 'all' CHECK (grade IN ('all', '中1', '中2', '中3')),
  question_count_limit INTEGER,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_student_id INTEGER REFERENCES students(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pinned_quizzes ADD COLUMN IF NOT EXISTS question_count_limit INTEGER;
ALTER TABLE pinned_quizzes ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE pinned_quizzes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pinned_quizzes ADD COLUMN IF NOT EXISTS created_by_student_id INTEGER REFERENCES students(id);
ALTER TABLE pinned_quizzes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE pinned_quizzes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_pinned_quizzes_active ON pinned_quizzes(is_active, created_at DESC);

-- RLS（Row Level Security）を無効に（塾内利用のため簡略化）
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE answer_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE active_recall_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE online_lab_rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE online_territory_rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_guard_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE question_inquiries DISABLE ROW LEVEL SECURITY;
ALTER TABLE science_glossary_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE login_updates DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE student_element_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE element_card_rewards DISABLE ROW LEVEL SECURITY;
ALTER TABLE pinned_quizzes DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE online_lab_rooms;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE online_territory_rooms;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END
$$;

-- ========================================
-- Engagement upgrade (XP / daily / badges / time attack)
-- ========================================

ALTER TABLE students ADD COLUMN IF NOT EXISTS student_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
UPDATE students
SET xp = student_xp
WHERE COALESCE(xp, 0) = 0
  AND COALESCE(student_xp, 0) > 0;

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS xp_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS session_mode TEXT NOT NULL DEFAULT 'standard';

CREATE TABLE IF NOT EXISTS daily_challenges (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  session_id UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, date)
);

ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS challenge_date DATE;
UPDATE daily_challenges
SET challenge_date = date
WHERE challenge_date IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_challenges_student_challenge_date
  ON daily_challenges(student_id, challenge_date);

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL REFERENCES badges(key) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, badge_key)
);

ALTER TABLE student_badges ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS time_attack_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE time_attack_records ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE time_attack_records ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;
UPDATE time_attack_records
SET score = best_score
WHERE COALESCE(score, 0) = 0
  AND COALESCE(best_score, 0) > 0;

INSERT INTO badges (key, name, description, icon_emoji, rarity, condition_type) VALUES
  ('first_quiz', '初クイズ', 'はじめて問題を最後まで解いた。', '🌱', 'common', 'sessions'),
  ('bio_debut', '生物デビュー', '生物の問題に初挑戦。', '🌿', 'common', 'field'),
  ('chem_debut', '化学デビュー', '化学の問題に初挑戦。', '⚗️', 'common', 'field'),
  ('phys_debut', '物理デビュー', '物理の問題に初挑戦。', '⚡', 'common', 'field'),
  ('earth_debut', '地学デビュー', '地学の問題に初挑戦。', '🌏', 'common', 'field'),
  ('streak_3', '3日連続', '3日連続で学習した。', '🔥', 'common', 'streak'),
  ('ten_sessions', '10回突破', '学習セッションが10回をこえた。', '🎯', 'common', 'sessions'),
  ('first_perfect', '初パーフェクト', 'はじめて全問正解した。', '💯', 'common', 'perfect'),
  ('streak_7', '1週間連続', '7日連続で学習した。', '📅', 'rare', 'streak'),
  ('hundred_questions', '100問突破', '合計100問を解いた。', '📚', 'rare', 'questions'),
  ('speed_star', 'スピードスター', '60秒未満で1セットをクリアした。', '💨', 'rare', 'speed'),
  ('all_fields_day', '全分野制覇', '1日のうちに4分野すべてを解いた。', '🛰️', 'rare', 'daily_mix'),
  ('five_perfects', '完璧主義者', '全問正解を5回達成した。', '🏆', 'rare', 'perfect'),
  ('chem_lab_clear', '化学ラボマスター', '化学の2つの特別モードをクリアした。', '🧪', 'rare', 'chemistry_modes'),
  ('question_creator', '出題者', '自分で問題を1つ作った。', '✍️', 'rare', 'creation'),
  ('streak_30', '30日連続', '30日連続で学習した。', '👑', 'legendary', 'streak'),
  ('thousand_questions', '1000問の壁', '合計1000問を解いた。', '🚀', 'legendary', 'questions'),
  ('accuracy_90', '正答率90%超', '100問以上で正答率90%以上を維持した。', '🎓', 'legendary', 'accuracy'),
  ('daily_challenger', '毎日チャレンジャー', '今日のチャレンジを7回クリアした。', '☀️', 'legendary', 'daily_challenge'),
  ('all_badges_rare', 'コレクター', 'レアバッジをすべて集めた。', '💎', 'legendary', 'collection')
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_student_badge_key ON student_badges(student_id, badge_key);
CREATE INDEX IF NOT EXISTS idx_time_attack_records_score ON time_attack_records(score DESC);

ALTER TABLE daily_challenges DISABLE ROW LEVEL SECURITY;
ALTER TABLE badges DISABLE ROW LEVEL SECURITY;
ALTER TABLE student_badges DISABLE ROW LEVEL SECURITY;
ALTER TABLE time_attack_records DISABLE ROW LEVEL SECURITY;

-- ========================================
-- Online 早押しクイズ テーブル
-- ========================================

CREATE TABLE IF NOT EXISTS online_hayaoshi_rooms (
  room_key            TEXT         PRIMARY KEY,
  phase               TEXT         NOT NULL DEFAULT 'lobby',
  -- 'lobby' | 'revealing' | 'buzzed' | 'result' | 'finished'
  players_json        JSONB        NOT NULL DEFAULT '[]',
  -- [{ student_id, nickname, score, color }]
  current_round       INTEGER      NOT NULL DEFAULT 0,
  total_rounds        INTEGER      NOT NULL DEFAULT 10,
  question_json       JSONB,
  -- { id, question, choices[], answer, field, unit, type }
  question_started_at TIMESTAMPTZ,
  -- 問題表示を開始したUTC時刻（クライアント側でカラオケ進行計算）
  chars_revealed      INTEGER      NOT NULL DEFAULT 0,
  -- ボタンが押された時点で表示されていた文字数（全員に共有）
  buzzed_student_id   INTEGER,
  buzz_answer         TEXT,
  buzz_correct        BOOLEAN,
  used_ids_json       JSONB        NOT NULL DEFAULT '[]',
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE online_hayaoshi_rooms DISABLE ROW LEVEL SECURITY;

-- ロック設定（2026-04）
-- ログインパスワードの有無をユーザーが制御できるカラム
-- TRUE（デフォルト）= パスワード必要 / FALSE = パスワードなしでログイン可
ALTER TABLE students ADD COLUMN IF NOT EXISTS lock_enabled BOOLEAN NOT NULL DEFAULT TRUE;
