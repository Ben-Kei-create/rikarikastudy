# Question Types Upgrade — Duolingo-Style Multi-Pattern Quiz System

> **Status**: Planned (implement AFTER Codex engagement upgrades are merged to main)
> **Priority**: High — directly impacts learning effectiveness and student enjoyment
> **Prereq**: Merge engagement features (XP, badges, leaderboard, etc.) to main first, then implement this on top.

---

## Problem Statement

The current app has only 2 question types:

1. **choice** (2-choice) — Too easy. 50% guess rate. Low learning value.
2. **text** (free-text input) — Too strict. `answerUtils.ts` does exact-match or keyword-match. Students who *know* the answer get marked wrong due to typos, full-width/half-width differences, or slight wording variations. This kills motivation.

**Core insight from Duolingo**: "Don't make them type. Make them tap." Replace free-text with structured interactions that test knowledge without penalizing input errors.

---

## New Question Types (7 total)

### Type 1: `true_false` (○× — easiest)
- Student sees a statement, taps ○ or ×
- Good for warm-up and rapid-fire rounds
- ~15% of questions

### Type 2: `choice4` (4-choice — standard)
- Classic 4-option multiple choice
- Replaces the current 2-choice as the default
- 25% guess rate = proper difficulty
- ~30% of questions

### Type 3: `fill_choice` (穴埋め選択)
- A sentence with 【　　】blank, student picks from 3-4 word options
- Replaces hard text-input questions for terminology
- Student taps instead of typing = no typo frustration
- ~20% of questions

### Type 4: `match` (マッチング)
- 3-4 pairs shown in two columns, student connects them
- Great for term↔definition, cause↔effect, organ↔function
- ~10% of questions

### Type 5: `sort` (並べ替え)
- 3-5 items shown shuffled, student reorders them
- Great for processes, sequences, hierarchies
- ~10% of questions

### Type 6: `multi_select` (複数選択)
- 4-6 options, student selects ALL correct ones
- Great for classification (有機物/無機物, etc.)
- ~10% of questions

### Type 7: `word_bank` (語群組み立て)
- Tokens shown shuffled + distractors, student assembles the answer
- Already implemented for chemistry (ChemistryPracticePage) — generalize to all fields
- Great for equations, formulas, process descriptions
- ~5% of questions

---

## JSON Schema Per Type

### true_false
```json
{
  "field": "地学",
  "unit": "地震",
  "question": "地震のP波はS波より遅い。",
  "type": "true_false",
  "answer": "×",
  "choices": ["○", "×"],
  "keywords": null,
  "explanation": "P波（Primary wave）はS波より速く伝わります。",
  "grade": "中1"
}
```

### choice4
```json
{
  "field": "化学",
  "unit": "イオン",
  "question": "酸とアルカリが反応して水と塩ができる反応を何というか。",
  "type": "choice4",
  "answer": "中和",
  "choices": ["酸化", "還元", "中和", "電離"],
  "keywords": null,
  "explanation": "酸のH⁺とアルカリのOH⁻が反応してH₂Oが生成される反応を中和といいます。",
  "grade": "中3"
}
```

### fill_choice
```json
{
  "field": "物理",
  "unit": "エネルギー",
  "question": "位置エネルギーと運動エネルギーの和を【　　】という。",
  "type": "fill_choice",
  "answer": "力学的エネルギー",
  "choices": ["力学的エネルギー", "熱エネルギー", "電気エネルギー", "化学エネルギー"],
  "keywords": null,
  "explanation": "力学的エネルギーは位置エネルギーと運動エネルギーの合計で、摩擦がなければ保存されます。",
  "grade": "中3"
}
```

### match
```json
{
  "field": "生物",
  "unit": "消化と吸収",
  "question": "次の消化酵素と、それが分解する栄養素を正しく組み合わせなさい。",
  "type": "match",
  "answer": null,
  "choices": null,
  "keywords": null,
  "match_pairs": [
    { "left": "アミラーゼ", "right": "デンプン" },
    { "left": "ペプシン", "right": "タンパク質" },
    { "left": "リパーゼ", "right": "脂肪" }
  ],
  "explanation": "アミラーゼ→デンプン、ペプシン→タンパク質、リパーゼ→脂肪を分解します。",
  "grade": "中2"
}
```

### sort
```json
{
  "field": "生物",
  "unit": "消化と吸収",
  "question": "食べ物が通る消化管の順番を正しく並べなさい。",
  "type": "sort",
  "answer": null,
  "choices": null,
  "keywords": null,
  "sort_items": ["口", "食道", "胃", "小腸", "大腸"],
  "explanation": "食べ物は口→食道→胃→小腸→大腸の順に通過します。",
  "grade": "中2"
}
```

### multi_select
```json
{
  "field": "化学",
  "unit": "原子と分子",
  "question": "次のうち、有機物をすべて選びなさい。",
  "type": "multi_select",
  "answer": null,
  "choices": ["デンプン", "食塩", "エタノール", "水", "ろう", "鉄"],
  "keywords": null,
  "correct_choices": ["デンプン", "エタノール", "ろう"],
  "explanation": "有機物は炭素を含む化合物で、燃えるとCO₂とH₂Oが出ます。食塩・水・鉄は無機物です。",
  "grade": "中1"
}
```

### word_bank
```json
{
  "field": "化学",
  "unit": "化学変化",
  "question": "銅の酸化を化学反応式で表しなさい。",
  "type": "word_bank",
  "answer": "2Cu + O₂ → 2CuO",
  "choices": null,
  "keywords": null,
  "word_tokens": ["2Cu", "+", "O₂", "→", "2CuO"],
  "distractor_tokens": ["Cu₂", "2O₂", "CuO₂"],
  "explanation": "銅が酸素と結びついて酸化銅(CuO)になります。係数に注意しましょう。",
  "grade": "中2"
}
```

---

## Implementation Plan

### Step 1: Database Schema Update

Update the `questions` table type CHECK constraint and add new columns:

```sql
-- Remove old type constraint
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;

-- Add new type constraint
ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('choice', 'choice4', 'true_false', 'fill_choice',
                  'match', 'sort', 'multi_select', 'word_bank', 'text'));

-- Add new JSONB columns for new types
ALTER TABLE questions ADD COLUMN IF NOT EXISTS match_pairs JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS sort_items JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_choices JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS word_tokens JSONB DEFAULT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS distractor_tokens JSONB DEFAULT NULL;
```

**Backward compatibility**: Existing `choice` and `text` types continue to work. New types are additive.

### Step 2: QuizPage.tsx — Render New Types

The current QuizPage renders based on `q.type`:
- `q.type === 'choice'` → choice buttons
- `q.type === 'text'` → textarea input

Add new renderers for each type. Create separate components to keep QuizPage clean:

```
src/components/quiz/
  TrueFalseQuestion.tsx    — ○× buttons (simple)
  Choice4Question.tsx      — 4-button grid (2×2 on mobile)
  FillChoiceQuestion.tsx   — sentence with blank + option chips
  MatchQuestion.tsx        — two-column matching (tap left then right)
  SortQuestion.tsx         — draggable/tappable reorder list
  MultiSelectQuestion.tsx  — checkbox-style multi-select with submit
  WordBankQuestion.tsx     — token chips → slots (generalize ChemistryPracticePage)
```

### Step 3: Answer Evaluation Per Type

Update `answerUtils.ts` or create `src/lib/questionEval.ts`:

- **true_false**: exact match "○" or "×"
- **choice4**: exact match against answer string
- **fill_choice**: exact match against answer string
- **match**: all pairs correctly matched (order-independent)
- **sort**: array matches sort_items exactly
- **multi_select**: selected set === correct_choices set
- **word_bank**: assembled token sequence === word_tokens

### Step 4: Update Admin Panel

- AdminPage question form: add type selector with all 7 types
- Dynamic form fields based on selected type
- Bulk import: accept all new JSON fields
- Validation per type

### Step 5: Update Question Generation Prompt

Replace the current prompt with the updated version (see QUESTION_GENERATION_PROMPT.md).

### Step 6: Migrate Existing Questions

- Existing `choice` questions with 2 choices: keep as `choice` (backward compat)
- Existing `choice` questions with 4 choices: optionally convert to `choice4`
- Existing `text` questions: optionally convert to `fill_choice` where appropriate
- Write a migration script: `scripts/migrate_question_types.mjs`

---

## UI/UX Design Notes

### Visual Style (match existing glassmorphism aesthetic)

- **true_false**: Two large ○/× buttons side by side, green/red themed
- **choice4**: 2×2 grid on mobile, 1×4 on desktop. Letter labels (A/B/C/D)
- **fill_choice**: Sentence displayed with glowing blank slot. Chips below to tap
- **match**: Left column fixed, right column as tappable chips. Lines drawn on match
- **sort**: Numbered slots (1,2,3...). Items as draggable chips. Snap into place
- **multi_select**: Checkbox-style cards. "判定する" button when ready. Show count "2つ選択中"
- **word_bank**: Same as existing ChemistryPracticePage pattern but generalized

### Animation
- Correct: green glow + confetti particles
- Wrong: red shake + show correct answer
- Match complete: connecting line animates in
- Sort correct: items flash green in sequence

### Mobile Priority
- All interactions must work with tap (no drag required — drag is optional enhancement)
- Match: tap left item, then tap right item to connect
- Sort: tap item, then tap position slot
- Minimum tap target: 48px

---

## Scoring Integration

All new types integrate with the existing scoring system:
- Correct = +1 to score (same as current)
- XP calculation uses the same formula (after engagement upgrade)
- Answer logs record the student's response per type:
  - true_false/choice4/fill_choice: student_answer = selected option
  - match: student_answer = JSON string of student's pairs
  - sort: student_answer = JSON string of student's order
  - multi_select: student_answer = JSON string of selected items
  - word_bank: student_answer = assembled string

---

## Testing Checklist

- [ ] Each question type renders correctly
- [ ] Each question type evaluates answers correctly
- [ ] Mixed-type quizzes work (different types in same session)
- [ ] Admin can add each question type
- [ ] Bulk import handles all types
- [ ] Guest mode works for all types
- [ ] Mobile layout works for all types
- [ ] Existing choice/text questions still work (backward compat)
- [ ] XP awards correctly for all types
- [ ] Answer logs save correctly for all types
