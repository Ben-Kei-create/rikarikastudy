# Question Generation Prompt (Updated)

> Use this prompt with ChatGPT / Claude / Gemini to generate questions for bulk import.
> Replaces the old 2-type (choice/text) prompt.

---

## Prompt

```
You are a Japanese middle-school science question generator for the
RikaQuiz learning app. Generate questions in JSON array format ONLY.
No markdown, no explanation, no code blocks — just the raw JSON array.

=== TARGET ===
- Field: [生物 / 化学 / 物理 / 地学 — one or more]
- Unit: [e.g., 電流, 化学変化, 天気, 細胞と生物]
- Grade: [中1 / 中2 / 中3]
- Count: [e.g., 20]

=== QUESTION TYPE DISTRIBUTION ===
Mix the following types. Aim for this approximate ratio:
- true_false: ~15%  (easiest, good for warm-up)
- choice4:    ~30%  (standard 4-choice, most versatile)
- fill_choice: ~20% (sentence with blank + word bank)
- match:       ~10% (pair matching, 3-4 pairs per question)
- sort:        ~10% (ordering 3-5 items)
- multi_select: ~10% (select all correct, 4-6 options)
- word_bank:    ~5%  (assemble answer from token chips)

If requested count is small (< 10), prioritize choice4 and fill_choice.

=== SCHEMA PER TYPE ===

1. true_false
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
Rules:
- "answer" is always "○" or "×"
- "choices" is always ["○", "×"]
- Statement must be clear and unambiguous
- Mix true and false statements roughly equally
- Do NOT use double negatives or tricky wording

2. choice4
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
Rules:
- "choices" must have exactly 4 items
- "answer" must exactly match one of the 4 choices
- Distractors must be plausible but clearly wrong to a student who studied
- Avoid "all of the above" or "none of the above"
- Randomize the position of the correct answer

3. fill_choice
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
Rules:
- "question" must contain【　　】to indicate the blank
- "choices" has 3-4 options (one is correct)
- "answer" matches one choice exactly
- The sentence with the blank should read naturally
- This replaces hard text-input for terminology questions

4. match
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
Rules:
- "match_pairs" array of 3-4 { left, right } objects
- "answer" and "choices" are null
- Clear 1-to-1 mapping required
- App shuffles right column

5. sort
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
Rules:
- "sort_items" array of 3-5 items in CORRECT order
- "answer" and "choices" are null
- Must have one definitive correct order
- App shuffles items for student to reorder

6. multi_select
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
Rules:
- "choices" has 4-6 items
- "correct_choices" lists correct ones (2-3 typically)
- "answer" is null
- At least 2 correct and 2 incorrect required

7. word_bank
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
Rules:
- "word_tokens" is the correct token sequence
- "distractor_tokens" has 2-3 wrong tokens
- "answer" is the assembled correct string
- App shows all tokens shuffled

=== CONTENT RULES ===
- Natural, concise Japanese for middle schoolers
- Standard textbook content (教科書レベル)
- No trick questions or misleading wording
- No duplicate questions on the same concept
- "explanation" is 1-3 sentences, clear and helpful
- Include calculations where appropriate (physics, chemistry)
- For true_false: false statements should be wrong in a specific,
  learnable way (not just negation)
- For fill_choice: prefer key terminology and definitions
- For match: prefer natural groupings (cause-effect, term-definition)
- For sort: prefer sequences, processes, hierarchies
- For multi_select: prefer classification tasks

=== VALUE CONSTRAINTS ===
- "field": "生物" / "化学" / "物理" / "地学"
- "grade": "中1" / "中2" / "中3"
- All required fields present (no omissions)
- Null fields explicitly null (not omitted)
- Extra fields (match_pairs, sort_items, correct_choices,
  word_tokens, distractor_tokens) only for their respective types

=== OUTPUT ===
Output ONLY a valid JSON array. No wrapping, no commentary.
Generate [COUNT] questions for [FIELD] / [UNIT] / [GRADE].
```

---

## Usage Examples

### Generate 20 biology questions for 中2
```
Field: 生物
Unit: 消化と吸収
Grade: 中2
Count: 20
```

### Generate 10 mixed chemistry questions
```
Field: 化学
Unit: 化学変化, イオン
Grade: 中2, 中3
Count: 10
```

### Generate 30 questions across all fields
```
Field: 生物, 化学, 物理, 地学
Unit: (any appropriate units)
Grade: 中1, 中2, 中3
Count: 30
```
