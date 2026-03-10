# CODEX PROMPT — RikaQuiz Project (v2.1)
# Full context, development philosophy, and implementation instructions

---

## 🧭 PROJECT OVERVIEW

**RikaQuiz** is a science quiz web application for a small Japanese cram school (juku).
It is designed for 5 middle school students (grades 7–9) preparing for entrance exams.

The app runs in a browser on shared tablets at the cram school.
No email addresses or personal info are used — only numeric IDs (1–5) with passwords.

**Live target**: Deploy on Vercel (serverless). Database on Supabase (PostgreSQL).
**Current**: Deployed at `https://rikarikastudy.vercel.app`

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
| 1  | S        | rikalove1 |
| 2  | M        | rikalove2 |
| 3  | T        | rikalove3 |
| 4  | K        | rikalove4 |
| 5  | 先生     | rikaadmin2026 |

(Note: Student 5 is the teacher account with admin capabilities)

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

### MyPage Features (v2.1)
**4 Tabs:**
1. **概要 (Overview)** — 🔥 Streak counter, summary cards (total Q / accuracy % / max streak), per-field accuracy bars, 7-day bar chart, 30-day heatmap
2. **履歴 (History)** — All past sessions with date/time, correct/wrong visualization
3. **弱点 (Weak Units)** — Units ranked by low accuracy (min 3 answers required), 8 units shown
4. **設定 (Account Settings)** — Nickname change, password change

### Admin Panel (Teacher/ID 5)
- Password: `rikaadmin2026` (locked to account ID 5)
- **5 Tabs:**
  1. **生徒データ (Student Overview)** — All 5 students: total Q, accuracy %, last activity, per-field breakdown
  2. **問題一覧 (Question List)** — All questions with delete button; "Add sample questions" seeder
  3. **問題追加 (Add Question)** — Form for single question (field, unit, grade, type, choices, answer, explanation)
  4. **一括追加 (Bulk Add)** — JSON paste input for bulk question import
  5. **質問箱 (Question Box)** — Student feedback/inquiry form (planned/TBD)

### Question Import Tools (Already Implemented)
- `scripts/generate_questions_sql.mjs` — Convert CSV/JSON to PostgreSQL INSERT statements
- `examples/questions_bulk_example.json` — Example payload for bulk JSON import via Admin panel

---

## 🔮 PLANNED FEATURES & IMPROVEMENT ROADMAP

### ⚠️ SECURITY CONCERNS (HIGH PRIORITY)
**Current state**:
- Client-side Supabase queries (no RLS enforcement)
- Admin password hardcoded in source
- No backend API layer
- Suitable for closed network (塾内) but unsafe for public internet

**Before public deployment:**
1. Implement Supabase RLS (Row-Level Security) based on `student_id`
2. Move question add/delete/bulk operations to Next.js API Routes (server-side)
3. Move admin authentication to server-side session management
4. Consider: Separate admin from student (different user/password tables)

---

### PRIORITY 1 — Text Answer Flexibility (工数: 小 / 3-5 hours)
**Goal**: Improve learning experience by allowing flexible text matching

**Tasks**:
- Normalize student answer: trim whitespace, convert full→half-width kana, lowercase
- Add `accept_answers TEXT[]` column to `questions` table for variant spellings
- In `QuizPage.tsx`: improve `checkTextAnswer()` logic to support normalized & variant matching
- Show "nearly correct" feedback when student answer is close (edit distance)

**Expected impact**: Reduces false "wrong" answers, improves student morale

---

### PRIORITY 2 — Weak Unit Drill Navigation (工数: 小 / 2-3 hours)
**Goal**: Direct navigation from weak units → focused revision quiz

**Tasks**:
- In `MyPage.tsx` weak units tab: add "復習する →" button per weak unit
- Click button → navigate to `QuizPage` with that field + unit pre-selected
- In `QuizPage.tsx`: if in "drill mode", show amber "復習モード" badge instead of field name
- Ensure quiz loads only questions from that unit

**Expected impact**: Streamlined review workflow, higher engagement

---

### PRIORITY 3 — Security & RLS (工数: 大 / 10-15 hours)
**Goal**: Safe for public deployment

**Tasks**:
1. Create Next.js API Routes:
   - `POST /api/admin/questions/add` — Validate admin password, add questions
   - `POST /api/admin/questions/bulk` — Validate admin, bulk insert
   - `DELETE /api/admin/questions/[id]` — Validate admin, delete
   - `POST /api/auth/change-password` — Validate student session, update password

2. Enable Supabase RLS:
   - Policy: Students can only read their own `quiz_sessions` & `answer_logs`
   - Policy: Admin (ID 5) can read all tables
   - Policy: Prevent direct student table writes (password changes only via API)

3. Move admin password to environment variable or Supabase admin table

4. Remove `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for writes (read-only key)

**Expected impact**: Safe for internet deployment, compliant with best practices

---

### PRIORITY 4 — Image Support in Questions (工数: 中 / 5-8 hours)
**Goal**: Support diagrams, photos, graphs in science questions

**Tasks**:
- Add `image_url TEXT` column to `questions` table
- In `QuizPage.tsx`: display image above question if `image_url` is present
- In `AdminPage.tsx` add question form: text input for image URL (or Supabase Storage upload later)
- Validate image URL format
- Keep backward-compatible — text-only questions still work

**Note**: Requires content preparation (taking/uploading photos). Deferred until questions need images.

**Expected impact**: Better visual engagement for complex topics

---

### PRIORITY 5 — Teacher Comparison Dashboard (工数: 大 / 10-12 hours)
**Goal**: Data-driven insights for pedagogy

**Tasks**:
1. Create new Admin tab: "先生向けレポート" (Teacher Report)
   - Grid: 5 students × 4 fields showing accuracy % per student per field
   - Filter: date range (today / this week / this month / all)
   - Charts: using `recharts` (line/bar for trends)
   - Export: CSV download of student stats

2. Separate teacher role from student admin (optional):
   - Currently ID 5 is teacher; consider separate `teacher_accounts` table

**Expected impact**: Better understanding of student progress, data-driven feedback

---

## 📊 IMPLEMENTATION ROADMAP (Recommended Order)

| Rank | Feature | Est. Hours | Impact | Est. Completion |
|------|---------|-----------|--------|-----------------|
| 1    | Text answer flexibility | 3–5h  | ⭐⭐⭐ High | Week 1 |
| 2    | Weak unit drill | 2–3h  | ⭐⭐⭐ High | Week 1 |
| 3    | Security & RLS | 10–15h | ⭐⭐⭐ Critical | Week 2-3 |
| 4    | Image support | 5–8h  | ⭐⭐ Medium | Week 3 |
| 5    | Teacher dashboard | 10–12h | ⭐⭐ Medium | Week 4 |
| —    | Ranking/badges | TBD   | ⭐ Low | Later |

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

## 🚀 DEPLOY CHECKLIST (Initial Setup)

1. Run `supabase_schema.sql` in Supabase SQL Editor
2. Push code to GitHub (`git push origin main`)
3. Import repo in Vercel → set env vars → Deploy
4. After deploy: open site → Login as ID 5 (先生) → pw: `rikaadmin2026`
5. Go to "問題一覧" tab → click "サンプル問題を追加" to seed 24 sample questions

## ✅ DEPLOYMENT STATUS

- ✅ **v2.0** launched at `https://rikarikastudy.vercel.app`
- ✅ 5 student accounts (IDs 1-5) + authentication working
- ✅ 4 science fields, quiz engine, MyPage dashboard, admin panel
- ✅ JSON bulk import + SQL generation scripts implemented
- ⚠️ **Before public internet deployment**: Implement RLS + backend API (Priority 3)

---

## 🛠️ NEXT DEVELOPER INSTRUCTIONS

You are continuing development of **RikaQuiz** v2.1.

### Work on this branch:
- Branch: `claude/review-repo-improvements-0mHDz` (or feature branch name)
- When complete: `git checkout main && git merge` + `git push origin main`

### Implementation Sequence (Recommended)

**Phase 1 (Week 1) — High-impact, low-effort:**
1. **Text answer normalization** (Priority 1, 3–5 hours)
   - Normalize student input: whitespace, half/full-width kana, case
   - Add `accept_answers TEXT[]` column for variant spellings
   - Update question check logic in `QuizPage.tsx`

2. **Weak unit drill navigation** (Priority 2, 2–3 hours)
   - Add "復習する →" button in MyPage weak units tab
   - Navigate to QuizPage with that unit pre-selected
   - Show "復習モード" badge in quiz

**Phase 2 (Week 2-3) — Critical for public deployment:**
3. **Security & RLS** (Priority 3, 10–15 hours)
   - Create Next.js API routes for admin operations (add/delete questions, change password)
   - Enable Supabase RLS policies
   - Move admin password to environment variable
   - Test with production constraints

**Phase 3 (Week 3-4) — Feature enhancements:**
4. **Image support** (Priority 4, 5–8 hours)
   - Add `image_url` column to questions table
   - Display in QuizPage if present
   - Add URL input in admin add-question form

5. **Teacher dashboard** (Priority 5, 10–12 hours)
   - New "先生向けレポート" admin tab
   - Student × field grid with accuracy data
   - Date range filters
   - CSV export (optional)

### Constraints
- Do NOT change color scheme or dark theme (#0f172a background, field colors)
- Do NOT add npm packages without justification
- Do NOT change core auth logic (session/password storage)
- All student-facing text: Japanese | Code/comments: English
- Each task should be independently completable

### Testing & Delivery
- Run `npm run build` to verify no TypeScript errors
- Test on tablet / mobile viewport
- For each completed task: summarize all file changes
- Commit with clear message: `git commit -m "feat: [task name]"`
