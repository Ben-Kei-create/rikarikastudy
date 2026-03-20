# CODEX PROMPT — RikaQuiz Project
# Current repository state, constraints, and development notes

---

## Project Overview

**RikaQuiz** is a Japanese science study web app for a small cram school.

Current usage model:
- Shared browser / tablet friendly
- Guest trial mode is available
- Login by numeric ID + password
- Default IDs 1-5 are seeded, and new users can self-register as IDs 6+
- Admin entry and online-lab entry both start from the login screen
- Deployed on Vercel
- Data stored in Supabase

This document reflects the repository state as of March 20, 2026.

---

## Current Stack

- Framework: Next.js 14 (App Router, TypeScript)
- Styling: Tailwind CSS + shared utility classes + inline design tokens
- Database / backend service: Supabase via `@supabase/supabase-js`
- Hosting: Vercel
- Charts / dates / icons: `recharts`, `date-fns`, `lucide-react`

Scripts:
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run questions:migrate-types`
- `npm run questions:import`
- `npm run questions:sql`

Script purposes:
- `questions:migrate-types`
  - Migrates older question data into the current multi-format schema.
- `questions:import`
  - Imports question JSON directly into Supabase.
- `questions:sql`
  - Generates SQL from question JSON for manual execution.

---

## Authentication and Roles

### Login Modes

- Guest mode is available with no password and local-only daily progress.
- Default seeded users:
  - `1` -> `S`
  - `2` -> `M`
  - `3` -> `T`
  - `4` -> `K`
  - `5` -> `先生`
- New users can self-register from the login screen.
- Newly registered users can remain unapproved until the admin enables them.

Source of truth:
- `src/lib/auth.tsx`
- `src/components/LoginPage.tsx`

### Admin

- Admin password: `rikaadmin2026`
- Admin UI lives in `src/components/AdminPage.tsx`
- Admin is opened as an overlay from the login screen, not as a separate route

### Session Behavior

- Logged-in session is stored in `sessionStorage`
- Device-lock behavior is stored locally and persists across restarts
- Auto-logout triggers after 10 minutes of inactivity
- Auto-logout does not clear the device lock
- Active presence is synced through `active_sessions`

### Current Security Reality

The product behaves like a per-student app in the UI, but strict multi-tenant security is not in place yet.

Current reality:
- Supabase RLS is disabled
- Supabase is accessed directly from the client
- Admin credentials are still client-visible
- Privacy is enforced mainly by UI filtering, local device lock, and query scoping

This is acceptable for limited private use, but not for strict public deployment.

---

## Current User-Facing Features

### Login Screen

- Student picker with search
- Guest start
- New user registration
- Online-lab entry
- Admin entry
- Weekly leaderboard and login update cards

Component:
- `src/components/LoginPage.tsx`

### Home Screen

- 4 science field cards
- Quick start, daily challenge, review CTA, and time-attack entry
- Science news card
- XP / level / unlock feedback
- SRS due reminder
- My Page entry

Component:
- `src/components/HomePage.tsx`

### Unit and Mode Selection

- Per-field unit selection
- Custom quiz entry points
- Field-specific practice / lab / chat entry points

Component:
- `src/components/UnitSelectPage.tsx`

### Quiz

- Supports 9 question types:
  - `choice`
  - `choice4`
  - `true_false`
  - `fill_choice`
  - `match`
  - `sort`
  - `multi_select`
  - `word_bank`
  - `text`
- Text-answer normalization and keyword-assisted handling
- Optional alternate answers via `accept_answers`
- Explanation display after answer
- Question images are supported
- Favorites are supported
- Question inquiry submission is supported from the quiz UI
- Session / answer log / duration saving
- SRS review flow and review reminders

Component:
- `src/components/QuizPage.tsx`

### My Page

Guest tabs:
1. `概要`
2. `履歴`
3. `弱点`
4. `バッジ`
5. `元素カード`
6. `辞典`
7. `コラム`
8. `設定`

Registered-user tabs:
1. `概要`
2. `履歴`
3. `弱点`
4. `バッジ`
5. `元素カード`
6. `辞典`
7. `コラム`
8. `問題作成`
9. `設定`

Features:
- Study summary, streaks, XP, and heatmaps
- Weak-unit ranking with direct drill launch
- Badge collection
- Periodic element card collection
- Science glossary browsing
- Column / reading content browsing
- Student-authored question creation for registered users
- Nickname / password / theme / sound settings

Components:
- `src/components/MyPage.tsx`
- `src/components/MyPageBadgesTab.tsx`
- `src/components/MyPageGlossaryTab.tsx`
- `src/components/MyPageColumnsTab.tsx`

### Special Modes

- `TimeAttackPage`
  - Includes time attack, test mode, and streak mode
- `BiologyPracticePage`
- `ChemistryPracticePage`
- `EarthSciencePracticePage`
- `ScienceWorkbenchPage`
- `OnlineLabPage`
- `ScienceChatPage`

These modes are routed from `src/app/page.tsx`.

---

## Current Admin Features

Current admin tabs:
1. `生徒データ`
2. `ユーザー管理`
3. `問い合わせ`
4. `問題一覧`
5. `問題追加`
6. `一括登録`

Component:
- `src/components/AdminPage.tsx`

### 生徒データ

- Student analytics and activity summary
- Current online / active session visibility
- Student detail sheet
- Backup export and restore actions

### ユーザー管理

- Approve / unapprove newly registered users
- Toggle Gemini access per user
- Bulk Gemini ON / OFF actions

### 問い合わせ

- Review quiz-origin question inquiries
- Leave internal admin notes
- Send replies
- Resolve / track inquiry status

### 問題一覧

- Search, pagination, and delete
- Shared vs student-created question visibility
- Question accuracy summary
- Question image upload / replace / remove

### 問題追加

- Manual authoring for the current question formats
- Explanation and rich question-type fields supported

### 一括登録

- Bulk question JSON import
- Bulk glossary JSON import

---

## Current Database Schema

Defined in:
- `supabase_schema.sql`
- `src/lib/supabase.ts`

Main tables created by the schema:
- `students`
- `questions`
- `quiz_sessions`
- `answer_logs`
- `active_recall_logs`
- `active_sessions`
- `online_lab_rooms`
- `chat_guard_logs`
- `question_inquiries`
- `science_glossary_entries`
- `login_updates`
- `student_element_cards`
- `element_card_rewards`
- `daily_challenges`
- `badges`
- `student_badges`
- `time_attack_records`

Important schema notes:
- `questions` includes:
  - `accept_answers`
  - `keywords`
  - `match_pairs`
  - `sort_items`
  - `correct_choices`
  - `word_tokens`
  - `distractor_tokens`
  - `created_by_student_id`
  - `image_url`
  - `image_display_width`
  - `image_display_height`
- `quiz_sessions` includes:
  - `duration_seconds`
  - `session_mode`
  - `xp_earned`
- `question_inquiries` stores a frozen copy of the question payload shown to the student

RLS status:
- Disabled on the active tables in the current simplified setup

---

## Current Constraints

1. Authentication is custom and client-driven, not Supabase Auth.
2. Admin credentials still exist in the client code path.
3. RLS is disabled.
4. Many privileged writes still happen directly from the browser.
5. Some privacy boundaries are UX-level rather than security-level.
6. The app shell in `src/app/page.tsx` owns a large amount of screen routing logic.
7. Schema changes require coordinated updates across SQL, TypeScript database types, and UI fallbacks.
8. Guest mode intentionally behaves differently from registered-user mode and should not be described as equivalent.

---

## Recommended Next Priorities

### Priority 1 — Security / Auth Hardening

- Move privileged mutations behind server-side handlers
- Replace client-visible admin assumptions where possible
- Introduce real access boundaries before broader rollout

### Priority 2 — App Shell and UI Simplification

- Reduce the amount of screen orchestration concentrated in `src/app/page.tsx`
- Consolidate overlapping admin and My Page flows where possible
- Keep mobile-first touch targets and the existing visual language

### Priority 3 — Schema and Docs Consistency

- Keep `supabase_schema.sql`, `src/lib/supabase.ts`, `README.md`, and this file aligned
- Treat stale repo-state documentation as a real maintenance bug

### Priority 4 — Admin Operations Polish

- Continue simplifying bulk import / export / restore flows
- Reduce duplicated controls across question management and inquiry handling

---

## Development Rules for Codex

If continuing work in this repository:

1. Do not reintroduce old credentials such as `yuki2024` or `rika_admin_2024`.
2. Do not describe My Page as a 5-tab screen.
   Registered users currently have 9 tabs and guests have 8.
3. Do not describe the admin panel as a 4-tab or 5-tab screen.
   It currently has 6 tabs.
4. If you change the schema, update:
   - `supabase_schema.sql`
   - `src/lib/supabase.ts`
   - `README.md` when setup or user-facing behavior changes
5. If a feature depends on a migration, explicitly tell the user to run the updated SQL in Supabase SQL Editor.
6. Preserve the current UX direction unless the user asks otherwise:
   - dark / high-contrast presentation
   - touch-friendly controls
   - Japanese labels
   - direct, low-friction flows
7. Verify current repo state from files before describing it.

---

## Deploy Checklist

1. Run `supabase_schema.sql` in Supabase SQL Editor.
2. Ensure env vars are set:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

3. Push to GitHub.
4. Deploy on Vercel.
5. After deploy, verify:
   - student login
   - guest login
   - admin login
   - question loading
   - question inquiry submission
   - question image rendering
   - My Page tab flows
   - admin bulk import

---

## Short Reality Check

This repository is no longer the older small quiz-only version.

It now includes:
- guest mode and self-registration
- device lock and auto-logout
- multiple special practice modes
- badges / XP / streak systems
- question inquiries
- glossary / columns / element card collection
- question images
- student-authored questions
- admin backup / restore tooling

Any future planning or implementation should start from that reality.
