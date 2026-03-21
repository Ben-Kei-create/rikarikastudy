-- ========================================
-- 不足テーブル追加用 SQL
-- Supabase SQL Editor で実行してください
-- ========================================

-- ----------------------------------------
-- 1. login_updates（ログイン画面アップデート掲示板）
-- ----------------------------------------
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

-- 古い投稿を自動整理するトリガー（最大10件保持）
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

CREATE INDEX IF NOT EXISTS idx_login_updates_created_at ON login_updates(created_at DESC);

ALTER TABLE login_updates DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------
-- 2. admin_messages（管理者メッセージ / 要望掲示板）
-- ----------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_admin_messages_student ON admin_messages(student_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_status ON admin_messages(status);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created_at ON admin_messages(created_at DESC);

ALTER TABLE admin_messages DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------
-- 3. questions テーブルにコラム用カラムを追加
-- ----------------------------------------
ALTER TABLE questions ADD COLUMN IF NOT EXISTS column_title TEXT DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS column_body TEXT DEFAULT NULL;
