# CODEX PROMPT — RikaQuiz Project
# Current repository state, constraints, and recommended roadmap

---

## Project Overview

**RikaQuiz** is a Japanese science quiz app for a small cram school.

Current usage model:
- Shared browser / tablet access
- No email accounts
- Login by numeric ID + password
- 4 student IDs plus 1 teacher test ID
- Deployed with Vercel
- Database on Supabase

This document reflects the **actual current repository state** as of March 11, 2026.

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
- `npm run questions:import`
- `npm run questions:sql`

Script purposes:
- `questions:import`
  - Directly imports question JSON into Supabase
  - Script: `scripts/import_questions_supabase.mjs`
- `questions:sql`
  - Generates SQL from question JSON
  - Script: `scripts/generate_questions_sql.mjs`

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

Source of truth:
- `src/lib/auth.tsx`

### Admin Login

- Admin password: `rikaadmin2026`
- Admin screen: `src/components/AdminPage.tsx`

Important:
- Admin login button is shown only on the initial login screen
- It is not shown after student login

### Session Behavior

- Logged-in session is stored in `sessionStorage`
- Device lock is stored in `localStorage`
- Device lock persists across browser restarts
- Session auto-logout triggers after 10 minutes of inactivity
- Auto-logout does not clear device lock

### Device Lock

- First student login on a browser locks that browser to that ID
- Another ID cannot log in on that browser unless admin clears the lock
- Admin can clear the lock from the admin panel

### Current Security Reality

The app behaves as if student data is separated in the UI, but this is not strict security yet.

Current DB setup:
- Supabase RLS is disabled
- Supabase is accessed directly from the client
- Privacy is enforced mainly by UI filtering and device lock

This is acceptable for limited private use, but not sufficient for strict public security.

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
- Choice questions are 2-choice
- Text answers use normalized matching
- Optional `accept_answers` support
- Explanation display after answer
- Drill mode badge (`復習モード`)
- Session saving to Supabase
- Answer log saving to Supabase
- Study duration saving to Supabase
- Logout button on quiz screens

Component:
- `src/components/QuizPage.tsx`

### My Page

Current tabs:
1. `概要`
2. `履歴`
3. `弱点`
4. `問題作成`
5. `設定`

Features:
- Summary cards
- Total study time
- Per-field accuracy bars
- 7-day activity chart
- 30-day heatmap
- Session history
- Weak-unit ranking
- Direct drill launch from weak units
- Student custom-question creation
- Student custom-question list
- Nickname change
- Password change
- Logout button

Component:
- `src/components/MyPage.tsx`

### Student Custom Questions

Implemented:
- Students can add their own questions from My Page
- These questions are visible in the admin question list
- These questions are only playable by the student who created them
- Shared questions remain visible to everyone

Important note:
- Per-student visibility is currently UI/query-level behavior, not strict RLS-backed privacy

---

## Current Admin Features

Current admin tabs:
1. `生徒データ`
2. `問題一覧`
3. `問題追加`
4. `一括追加`

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
- See whether a question is shared or student-created
- Show creating student ID for student-created questions

### 問題追加

- Manual question creation
- Supports:
  - `choice`
  - `text`
- Choice questions are 2-choice only

### 一括追加

- Paste JSON directly
- Load `.json` file
- Validate format
- Bulk insert into Supabase

---

## Current Database Schema

Defined in:
- `supabase_schema.sql`

Current tables:
- `students`
- `questions`
- `quiz_sessions`
- `answer_logs`

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
- `accept_answers`
- `created_by_student_id`
- `explanation`
- `grade`
- `created_at`

Notes:
- `accept_answers` is for alternate accepted answers on text questions
- `created_by_student_id` is `NULL` for shared questions
- `created_by_student_id` is set for student-created questions

### quiz_sessions

- `id`
- `student_id`
- `field`
- `unit`
- `total_questions`
- `correct_count`
- `duration_seconds`
- `created_at`

### answer_logs

- `id`
- `session_id`
- `student_id`
- `question_id`
- `is_correct`
- `student_answer`
- `created_at`

### RLS Status

Currently disabled on all tables.

That is intentional for the current simplified setup, but it is a known security limitation.

---

## Current Question Content Workflow

### Manual Input

Teacher can add questions from the admin panel.

### Bulk JSON Import from Admin UI

Teacher can bulk import question JSON from the admin panel.

### Direct JSON Import to Supabase

Script:
- `scripts/import_questions_supabase.mjs`

Command:

```bash
npm run questions:import -- path/to/questions.json
```

Standard input also works:

```bash
npm run questions:import -- - < path/to/questions.json
```

Behavior:
- Validates the JSON format
- Skips duplicates by `field + unit + question`
- Inserts directly into Supabase using local env vars

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
- `src/lib/answerUtils.ts`

### Support Files

- `supabase_schema.sql`
- `README.md`
- `package.json`
- `examples/questions_bulk_example.json`
- `scripts/import_questions_supabase.mjs`
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
8. In-progress quiz state is not persisted until the session is completed
9. Public deployment still relies on trust and limited usage, not strict isolation

---

## Recommended Next Priorities

These are ordered by practical value.

### Priority 1 — Security / RLS Refactor

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

Why first:
- This is now the biggest architectural gap

### Priority 2 — Question Image Support

Goal:
- Support diagrams, charts, and science visuals

Recommended work:
- Add `image_url` to `questions`
- Render optional image in quiz and question list
- Add image input to admin workflow
- Optionally add Supabase Storage upload later

Estimated effort:
- 5 to 8 hours

Why second:
- Strong teaching value for science content

### Priority 3 — Teacher Dashboard

Goal:
- Better teacher-side analysis and comparison

Recommended work:
- Cross-student comparison grid
- Time filtering
- Better chart usage
- CSV / PDF export if needed

Estimated effort:
- 8 to 12 hours

Why third:
- Operationally useful, but less urgent than security

### Priority 4 — Question Authoring Improvements

Goal:
- Make large-scale question input easier

Recommended work:
- Add downloadable JSON template
- Add drag-and-drop import in admin UI
- Add duplicate-check summary in UI
- Add optional CLI wrapper for one-step file import + summary

Estimated effort:
- 3 to 5 hours

Why fourth:
- Useful for daily content operations

---

## Development Rules for Codex

If continuing development in this repository:

1. Do not reintroduce old credentials such as:
   - `yuki2024`
   - `rika_admin_2024`

2. Do not describe the admin panel as 5 tabs.
   Current count is 4.

3. Do not describe MyPage as a question-DM screen.
   Current tab count is 5, and the fourth tab is `問題作成`.

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

7. Before claiming current repo state, verify it from files, not from earlier summaries.

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
   - student custom-question creation
   - admin question list shows student-created items

---

## Short Reality Check

This repository is no longer the older "4 students / simple admin / 3-tab dashboard" version.

It is now:
- 5 IDs
- device-locked
- auto-logout enabled
- text-answer normalization enabled
- weak-unit drill launch enabled
- total study time tracking enabled
- bulk question import enabled
- direct JSON CLI import enabled
- admin export enabled
- student custom-question creation enabled

Any future planning or implementation should start from that reality.
