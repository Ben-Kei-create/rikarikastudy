-- ========================================
-- RikaQuiz engagement upgrade migration
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
