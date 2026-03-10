# CODEX PROMPT — RikaQuiz Project
# Current repository state, constraints, and recommended roadmap

---

## Project Overview

**RikaQuiz** is a Japanese science quiz web app for a small cram school.

Current usage model:
- Shared browser / tablet access
- No email accounts
- Login by numeric ID + password
- 4 student IDs plus 1 teacher test ID
- Deployed with Vercel
- Database on Supabase

This document reflects the **actual current repository state** as of March 10, 2026.

---

## Current Stack

- Framework: Next.js 14 (App Router, TypeScript)
- Styling: Tailwind CSS + inline styles
- Database: Supabase via `@supabase/supabase-js`
- Hosting: Vercel
- Date utilities: `date-fns`
- Chart library installed: `recharts`
- Icons library installed: `lucide-react`

Scripts:
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run questions:sql`

`questions:sql` generates SQL from question JSON:
- `node scripts/generate_questions_sql.mjs`

---

## Authentication and Roles

### Student IDs

There are 5 selectable IDs in the app:

| ID | Default nickname | Default password |
|----|------------------|------------------|
| 1  | S                | `rikalove1`      |
| 2  | M                | `rikalove2`      |
| 3  | T                | `rikalove3`      |
| 4  | K                | `rikalove4`      |
| 5  | 先生             | `rikaadmin2026`  |

Source of truth in code:
- `src/lib/auth.tsx`

### Admin Login

- Admin password: `rikaadmin2026`
- Current implementation is in:
  - `src/components/AdminPage.tsx`

Important:
- Admin login button is shown only on the **initial login screen**
- It is **not** shown after student login

### Session Behavior

- Logged-in session is stored in `sessionStorage`
- Device lock is stored in `localStorage`
- Device lock persists across browser restarts
- Session auto-logout triggers after 10 minutes of inactivity
- Auto-logout does **not** clear device lock

### Device Lock

- First student login on a browser locks that browser to that ID
- Another ID cannot log in on that browser unless admin clears the lock
- Admin can clear the lock from the admin panel

### Current Security Reality

The app behaves as if student data is separated in the UI, but this is **not strict security** yet.

Current DB setup:
- Supabase RLS is disabled
- Supabase is accessed directly from the client
- Privacy is enforced mainly by UI filtering and device lock

This is acceptable for limited private use, but **not sufficient for strict public security**.

---

## Current User-Facing Features

### Login

- ID selection UI
- Password input
- Device lock notice
- Session-expiry notice
- Admin login entry point

Component:
- `src/components/LoginPage.tsx`

### Home Screen

- Greeting with nickname
- 4 science field cards
- Per-field accuracy summaries
- Logout button

Component:
- `src/components/HomePage.tsx`

### Unit Selection

- Unit list for the chosen field
- "All units random" option
- Per-unit progress view
- Logout button

Component:
- `src/components/UnitSelectPage.tsx`

### Quiz

- Random question selection
- `choice` and `text` question support
- Choice questions are currently **2-choice**
- Explanation display after answer
- Session saving to Supabase
- Answer log saving to Supabase
- Logout button on quiz screens

Component:
- `src/components/QuizPage.tsx`

### My Page

Current tabs:
1. `概要`
2. `履歴`
3. `弱点`
4. `質問`
5. `設定`

Features:
- Summary cards
- Per-field accuracy bars
- 7-day activity chart
- 30-day heatmap
- Session history
- Weak-unit ranking
- Student-to-teacher question posting
- Student-only question history view
- Nickname change
- Password change
- Logout button

Component:
- `src/components/MyPage.tsx`

### Student Questions

Implemented:
- Students can submit questions to the teacher
- Students can see only their own submitted questions in the app
- Admin can see all submitted questions in the admin panel

Important note:
- This is currently **UI-level separation**, not strict RLS-backed privacy

---

## Current Admin Features

Current admin tabs:
1. `生徒データ`
2. `問題一覧`
3. `問題追加`
4. `一括追加`
5. `質問箱`

Component:
- `src/components/AdminPage.tsx`

### 生徒データ

- Per-student total answered count
- Per-student accuracy
- Per-field breakdown
- Last activity
- Current password visibility
- Device lock clear action
- Full performance JSON export

### 問題一覧

- View all questions
- Delete questions
- Seed sample questions

### 問題追加

- Manual question creation
- Supports:
  - `choice`
  - `text`
- Choice questions are currently 2-choice only

### 一括追加

- Paste JSON directly
- Load `.json` file
- Validate format
- Bulk insert into Supabase

### 質問箱

- View all student questions
- Display student ID and nickname
- Read-only teacher-side inbox

---

## Current Database Schema

Defined in:
- `supabase_schema.sql`

Current tables:
- `students`
- `questions`
- `quiz_sessions`
- `answer_logs`
- `student_questions`

### students

- `id`
- `nickname`
- `password`
- `created_at`

### questions

- `id`
- `field`
- `unit`
- `question`
- `type`
- `choices`
- `answer`
- `explanation`
- `grade`
- `created_at`

### quiz_sessions

- `id`
- `student_id`
- `field`
- `unit`
- `total_questions`
- `correct_count`
- `created_at`

### answer_logs

- `id`
- `session_id`
- `student_id`
- `question_id`
- `is_correct`
- `student_answer`
- `created_at`

### student_questions

- `id`
- `student_id`
- `title`
- `message`
- `created_at`

### RLS Status

Currently disabled on all tables.
That is intentional for the current simplified setup, but it is a known security limitation.

---

## Current Question Content Workflow

### Manual Input

Teacher can add questions from the admin panel.

### Bulk JSON Import

Teacher can bulk import question JSON from the admin panel.

### SQL Generation from JSON

Script:
- `scripts/generate_questions_sql.mjs`

Example input:
- `examples/questions_bulk_example.json`

Command:
```bash
npm run questions:sql -- examples/questions_bulk_example.json > questions_bulk.sql
```

Then paste `questions_bulk.sql` into Supabase SQL Editor.

---

## File Map

### App Shell

- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/globals.css`

### Components

- `src/components/LoginPage.tsx`
- `src/components/HomePage.tsx`
- `src/components/UnitSelectPage.tsx`
- `src/components/QuizPage.tsx`
- `src/components/MyPage.tsx`
- `src/components/AdminPage.tsx`

### Library Files

- `src/lib/auth.tsx`
- `src/lib/supabase.ts`
- `src/lib/sampleQuestions.ts`

### Support Files

- `supabase_schema.sql`
- `README.md`
- `package.json`
- `examples/questions_bulk_example.json`
- `scripts/generate_questions_sql.mjs`

---

## Current Constraints

1. Authentication is custom and simple, not Supabase Auth
2. Admin password is hardcoded in the client
3. Student passwords are readable by admin
4. RLS is disabled
5. Supabase public client is used directly in the browser
6. Student privacy is only partially enforced
7. Question images are not supported yet
8. Text answers are still judged by exact match
9. Weak-unit view has no direct drill-launch flow yet

---

## Recommended Next Priorities

These are ordered by practical value, not by novelty.

### Priority 1 — Better Text Answer Judgement

Goal:
- Improve text-answer correctness without major UI changes

Recommended work:
- Normalize whitespace
- Normalize full-width / half-width differences
- Normalize case where relevant
- Add optional alternate accepted answers

Suggested schema extension:
- `questions.accept_answers JSONB`

Estimated effort:
- 3 to 5 hours

Why first:
- Small change
- Immediate improvement in student experience

### Priority 2 — Weak-Unit Drill Flow

Goal:
- Let students jump directly from weak-unit analysis into focused review

Recommended work:
- Add `復習する` button in weak-unit tab
- Route directly into quiz filtered by field + unit
- Optionally bias future drill mode toward missed questions

Estimated effort:
- 2 to 4 hours for the basic flow
- more if missed-question prioritization is added

Why second:
- Strong educational value
- Works with existing data model

### Priority 3 — Security / RLS Refactor

Goal:
- Make the app safer for broader public use

Recommended work:
- Move privileged write operations to server-side handlers
- Introduce real session handling
- Enable Supabase RLS
- Limit students to their own records
- Replace "admin can read every password" with reset-based management if desired

Estimated effort:
- 10 to 15 hours

Why third:
- This is the highest-risk architectural gap
- It becomes important before wider public distribution

### Priority 4 — Question Image Support

Goal:
- Support diagrams, charts, and science visuals

Recommended work:
- Add `image_url` to `questions`
- Render optional image in quiz and question list
- Add image input to admin workflow
- Optionally add Supabase Storage upload later

Estimated effort:
- 5 to 8 hours

Why fourth:
- High value for science teaching
- Slightly higher content-management overhead than priorities 1 and 2

### Priority 5 — Teacher Dashboard

Goal:
- Better teacher-side analysis and comparison

Recommended work:
- Cross-student comparison grid
- Time filtering
- More chart usage
- CSV / PDF export if needed

Estimated effort:
- 8 to 12 hours

Why fifth:
- Valuable for operations
- Less urgent than learning-flow and security improvements

---

## Development Rules for Codex

If continuing development in this repository:

1. Do not reintroduce old credentials such as:
   - `yuki2024`
   - `rika_admin_2024`

2. Do not describe the admin panel as 3 or 4 tabs.
   Current count is 5.

3. Do not describe MyPage as 3 or 4 tabs.
   Current count is 5.

4. If you change the database schema, update all of:
   - `supabase_schema.sql`
   - `src/lib/supabase.ts`
   - `README.md` when user-facing setup changes

5. If a new feature depends on DB migration, explicitly tell the user to rerun `supabase_schema.sql` or the relevant SQL in Supabase SQL Editor.

6. Preserve existing UX assumptions unless the user asks otherwise:
   - dark theme
   - large touch-friendly controls
   - Japanese UI labels
   - simple direct workflows

7. Treat current student-question visibility as a convenience feature, not strict security.

8. Before claiming current repo state, verify it from files, not from earlier summaries.

---

## Deploy Checklist

1. Run `supabase_schema.sql` in Supabase SQL Editor
2. Ensure env vars are set:
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```
3. Push to GitHub
4. Deploy on Vercel
5. After deploy, verify:
   - student login
   - admin login
   - question loading
   - question bulk import
   - student question posting
   - admin question inbox

---

## Short Reality Check

This repository is no longer the older "4 students / simple admin / 3-tab dashboard" version.

It is now:
- 5 IDs
- device-locked
- auto-logout enabled
- bulk question import enabled
- admin export enabled
- student question posting enabled
- admin question inbox enabled

Any future planning or implementation should start from that reality.
