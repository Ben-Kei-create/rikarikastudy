# CODEX PROMPT — RikaQuiz Project
# Full context, development philosophy, and implementation instructions

---

## 🧭 PROJECT OVERVIEW

**RikaQuiz** is a science quiz web application for a small Japanese cram school (juku).
It is designed for 4 middle school students (grade 9, preparing for high school entrance exams)
who study all science topics from grades 7–9.

The app runs in a browser on shared tablets at the cram school.
No email addresses or personal info are used — only numeric IDs (1–4) with fixed nicknames.

**Live target**: Deploy on Vercel (serverless). Database on Supabase (PostgreSQL).

---

## ✅ WHAT HAS BEEN BUILT (v2 — current state)

### Tech Stack
- **Framework**: Next.js 14 (App Router, TypeScript)
- **Styling**: Tailwind CSS + inline styles (dark theme, custom CSS vars)
- **Database**: Supabase (PostgreSQL via supabase-js)
- **Fonts**: Dela Gothic One (display) + Zen Kaku Gothic New (body)
- **Hosting**: Vercel
- **Dependencies**: `date-fns`, `lucide-react`, `recharts`

### Authentication
- Each student has their own password (no email, no OAuth)
- Password → studentId mapping is hardcoded in `src/lib/auth.tsx`
- Session stored in `sessionStorage` (survives page refresh, cleared on tab close)
- Passwords: yuki2024 / aoi2024 / riku2024 / hana2024
- Logging in as one student gives NO access to another student's data

### Student Profiles
| ID | Nickname | Password  |
|----|----------|-----------|
| 1  | ゆうき   | yuki2024  |
| 2  | あおい   | aoi2024   |
| 3  | りく     | riku2024  |
| 4  | はな     | hana2024  |

### Science Fields (4 domains)
- 生物 (Biology) 🌿 — color: #22c55e
- 化学 (Chemistry) ⚗️ — color: #f97316
- 物理 (Physics) ⚡ — color: #3b82f6
- 地学 (Earth Science) 🌏 — color: #a855f7

### Question Types
- `choice`: 4-option multiple choice
- `text`: short written answer (exact string match)

### Database Schema (Supabase)
```sql
students          -- id(1-4), nickname
questions         -- id, field, unit, question, type, choices(jsonb), answer, explanation, grade
quiz_sessions     -- id, student_id, field, unit, total_questions, correct_count, created_at
answer_logs       -- id, session_id, student_id, question_id, is_correct, student_answer, created_at
```

### Screens / Components
| File | Role |
|------|------|
| `LoginPage.tsx` | Password input → auto-login to matched studentId |
| `HomePage.tsx` | 4-field selection cards with per-field accuracy bars |
| `UnitSelectPage.tsx` | Unit list for a field + "all units random" option |
| `QuizPage.tsx` | Quiz engine: choice/text answering, explanation, score, save session |
| `MyPage.tsx` | Student dashboard (3 tabs: overview, history, weak units) |
| `AdminPage.tsx` | Admin panel: student stats, question list, question add form |
| `auth.tsx` | Auth context (login, logout, sessionStorage persistence) |
| `supabase.ts` | Supabase client + TypeScript types |
| `sampleQuestions.ts` | 24 sample questions across all 4 fields |

### MyPage Features (v2)
- 🔥 Streak counter (consecutive study days)
- Summary cards: total questions, overall accuracy %, best streak
- Per-field accuracy bars (Biology / Chemistry / Physics / Earth Science)
- Bar chart: questions answered per day (last 7 days)
- Heatmap: 30-day study activity grid (like GitHub contribution graph)
- History tab: all past sessions with correct/wrong ratio bar
- Weak units tab: units ranked by low accuracy (min 3 answers required)

### Admin Panel
- Password: `rika_admin_2024`
- Tab 1 — Student overview: per-student total Q, accuracy, last activity, per-field breakdown
- Tab 2 — Question list: all questions with delete button; "Add sample questions" button
- Tab 3 — Add question form: field, unit, grade, type, choices, answer, explanation

---

## 🔮 PLANNED FEATURES (next implementation)

### Priority 1 — Image support in questions
Questions should optionally include an image (diagram, graph, photo).
- Add `image_url TEXT` column to `questions` table
- Store images in **Supabase Storage** (bucket: `question-images`)
- In `QuizPage.tsx`: render `<img>` if `image_url` is present, above the question text
- In `AdminPage.tsx` add question form: add image upload input
  - Upload to Supabase Storage, get public URL, store in DB
- Keep image optional — text-only questions still work as-is

### Priority 2 — Weak-unit drill mode
- From the "weak units" tab in MyPage, tap a unit → launch QuizPage filtered to that unit
- Label it "復習モード" (review mode) with distinct UI color (amber/yellow)

### Priority 3 — Teacher dashboard (read-only, separate password)
- A dedicated view (not mixed into admin) for the teacher to:
  - See all 4 students' stats at a glance (grid layout)
  - Compare accuracy by field across students
  - See who studied today / this week
  - Export data as CSV (optional)
- Password: `teacher_2024` (separate from admin)

### Priority 4 — Ranking / motivation
- Anonymous ranking among the 4 students (show nicknames)
- Weekly "most questions solved" leaderboard on HomePage
- Badges / achievements (first 100 questions, 7-day streak, 90%+ accuracy, etc.)

### Priority 5 — Better text answer judgment
- Currently: exact string match only
- Add soft matching: trim whitespace, ignore full/half-width differences
- Optional: show "close but wrong" feedback with hint

---

## 🏗️ DEVELOPMENT PHILOSOPHY

1. **Simplicity first** — No complex auth, no email, no accounts. Tablets at the cram school just need a URL and a password.

2. **Data ownership** — All student data stays in Supabase under the teacher's account. Nothing is shared externally.

3. **Mobile-first** — UI must work well on tablets and smartphones. Touch targets are large, fonts are readable.

4. **Dark theme always** — The app uses a consistent dark color scheme (#0f172a background). This reduces eye strain during study sessions.

5. **Modular and extensible** — Each screen is a standalone component. Adding features = adding/editing one file. The question DB is separate from the UI logic.

6. **Japanese context** — All student-facing UI text is in Japanese. Code, comments, and this document are in English for Codex compatibility.

7. **No over-engineering** — sessionStorage over complex JWT. Inline styles where Tailwind falls short. Simple boolean `is_correct` over complex scoring. Keep it working and deployable.

---

## 📁 FILE STRUCTURE

```
rika-quiz/
├── src/
│   ├── app/
│   │   ├── globals.css         ← fonts, CSS vars, animations, utility classes
│   │   ├── layout.tsx          ← HTML shell, metadata
│   │   └── page.tsx            ← root: AuthProvider + screen router + AdminFloatButton
│   ├── components/
│   │   ├── LoginPage.tsx       ← password input, auto-login
│   │   ├── HomePage.tsx        ← field selection, per-field accuracy
│   │   ├── UnitSelectPage.tsx  ← unit list per field
│   │   ├── QuizPage.tsx        ← quiz engine
│   │   ├── MyPage.tsx          ← student dashboard (3 tabs)
│   │   └── AdminPage.tsx       ← admin panel (3 tabs)
│   └── lib/
│       ├── auth.tsx            ← AuthContext, STUDENT_PASSWORDS, STUDENTS
│       ├── supabase.ts         ← createClient, Database types
│       └── sampleQuestions.ts  ← 24 seed questions
├── supabase_schema.sql         ← run this in Supabase SQL editor first
├── .env.local.example          ← NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
├── vercel.json
└── package.json
```

---

## ⚙️ ENVIRONMENT VARIABLES

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Set these in Vercel → Project Settings → Environment Variables before deploying.

---

## 🚀 DEPLOY CHECKLIST

1. Run `supabase_schema.sql` in Supabase SQL Editor
2. Push code to GitHub (`git push origin main`)
3. Import repo in Vercel → set env vars → Deploy
4. After deploy: open site → click "管理者" button (bottom-right) → pw: `rika_admin_2024`
5. Go to "問題一覧" tab → click "サンプル問題を追加" to seed 24 questions

---

## 🛠️ INSTRUCTIONS FOR CODEX

You are continuing development of **RikaQuiz**, a Next.js 14 + Supabase quiz app for a Japanese cram school.

The codebase is in the attached ZIP (`rika-quiz-v2.zip`). Extract it and work inside the `rika-quiz/` directory.

### Immediate tasks:

**Task 1 — Image support**
- Add `image_url TEXT` column to `questions` table (update `supabase_schema.sql` too)
- Update `Database` type in `supabase.ts` to include `image_url: string | null`
- In `QuizPage.tsx`: if `q.image_url` is present, render it above the question text
  ```tsx
  {q.image_url && (
    <img src={q.image_url} alt="問題の図" className="w-full rounded-xl mb-4 object-contain max-h-48" />
  )}
  ```
- In `AdminPage.tsx` add question form: add a text input for `image_url` (URL paste, not file upload yet)
- Keep fully backward-compatible — existing questions without images must work unchanged

**Task 2 — Weak unit drill mode**
- In `MyPage.tsx` weak units tab: add a "復習する →" button on each weak unit card
- Tapping it should call a new prop `onDrillUnit(field: string, unit: string)`
- In `page.tsx`: handle this prop to navigate to `QuizPage` with that field+unit
- In `QuizPage.tsx`: if coming from drill mode, show a amber "復習モード" badge instead of the normal field badge

**Task 3 — Code quality**
- Ensure all components compile with `next build` without TypeScript errors
- Remove any unused imports
- Make sure `answer_logs` Supabase insert in `QuizPage.tsx` correctly references `questions` table foreign key

### Constraints:
- Do NOT change the color scheme or dark theme
- Do NOT add new npm packages unless absolutely necessary
- Do NOT change the authentication logic
- Keep all student-facing text in Japanese
- Keep code comments and variable names in English
- Each task should be completable independently — do not couple them

### When done:
- Run `npm run build` to verify no errors
- Output a summary of every file changed and what was changed
