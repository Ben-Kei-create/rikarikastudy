# AI問題追加プロンプト

今後、ChatGPT / Claude / Gemini などに問題追加を依頼するときは、下のプロンプトをそのまま使えます。

## 使い方

1. `[FIELD]` `[UNIT]` `[GRADE]` `[COUNT]` を埋める
2. AI にそのまま送る
3. 返ってきた JSON を管理画面の一括登録、または `npm run questions:import` に渡す

## コピペ用プロンプト

```text
あなたは中学理科アプリ「RikaQuiz」の問題作成AIです。
次の条件に従って、問題を JSON 配列だけで出力してください。

Markdown は不要です。
説明文や前置きも不要です。
コードブロックも不要です。
出力は必ず生の JSON 配列のみとしてください。

=== 目的 ===
- 分野: [FIELD]
- 単元: [UNIT]
- 学年: [GRADE]
- 問題数: [COUNT]

=== 基本方針 ===
- 中学理科の教科書レベル
- 日本語は自然で短く、わかりやすく
- ひっかけ問題は禁止
- 同じ知識を重複して何度も聞かない
- 「知っているのに入力ミスで不正解」を避けるため、基本はタップ式を優先する
- `text` は明示的に必要な時だけ使い、通常は `choice4` `true_false` `fill_choice` `match` `sort` `multi_select` `word_bank` を優先する

=== 推奨の出題比率 ===
- true_false: 15%
- choice4: 30%
- fill_choice: 20%
- match: 10%
- sort: 10%
- multi_select: 10%
- word_bank: 5%

問題数が少ないとき（10問未満）は、
`choice4` `fill_choice` `true_false` を優先してください。

=== 使用できる type ===
- choice
- choice4
- true_false
- fill_choice
- match
- sort
- multi_select
- word_bank
- text

=== 共通ルール ===
- `field` は必ず `生物` `化学` `物理` `地学` のいずれか
- `grade` は必ず `中1` `中2` `中3`
- すべての必須キーを含める
- 不要なキーは入れない
- null にする項目は省略せず `null` を入れる
- `explanation` は 1〜3 文で、やさしく具体的に書く

=== typeごとのルール ===

1. true_false
- `answer` は必ず `○` か `×`
- `choices` は必ず `["○", "×"]`
- 文は断定的で、あいまいさを避ける

例:
{
  "field": "地学",
  "unit": "地震",
  "question": "地震のP波はS波より速い。",
  "type": "true_false",
  "answer": "○",
  "choices": ["○", "×"],
  "keywords": null,
  "explanation": "P波は最初に届く速い波で、S波はそのあとに届く遅い波です。",
  "grade": "中1"
}

2. choice4
- `choices` は 4 個
- `answer` は choices のどれかと完全一致
- もっとも標準的な形式として多めに使う

3. fill_choice
- `question` に必ず `【　　】` を含める
- `choices` は 3〜4 個
- `answer` は choices のどれかと完全一致

4. match
- `answer` は null
- `choices` は null
- `match_pairs` は 2〜4 組
- 各要素は `{ "left": "...", "right": "..." }`

例:
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
  "explanation": "アミラーゼはデンプン、ペプシンはタンパク質、リパーゼは脂肪を分解します。",
  "grade": "中2"
}

5. sort
- `answer` は null
- `choices` は null
- `sort_items` は正しい順番で 3〜5 個

6. multi_select
- `answer` は null
- `choices` は 4〜6 個
- `correct_choices` は 2 個以上
- `correct_choices` は必ず `choices` の中から選ぶ

7. word_bank
- `choices` は null
- `word_tokens` は正解トークン列
- `distractor_tokens` はダミーを 1〜3 個
- `answer` は完成形の文字列

8. choice
- 旧形式の後方互換用
- `choices` は 2 個
- `answer` は choices のどちらかと完全一致
- 特別な理由がない限り `choice4` を優先する

9. text
- `answer` は模範解答文
- `keywords` は任意
- 特別な理由がない限り多用しない

=== 内容面の注意 ===
- 生物: 器官のはたらき、分類、消化、呼吸、刺激と反応など
- 化学: 状態変化、密度、溶解度、化学変化、酸化・還元、イオンなど
- 物理: 力、圧力、電流、電圧、仕事、エネルギー、光、音など
- 地学: 天気、地震、火山、地層、天体など

=== 出力形式 ===
- JSON 配列のみ
- 1問につき1オブジェクト
- 余計なテキストは一切出さない

[FIELD] / [UNIT] / [GRADE] / [COUNT] の条件で問題を生成してください。
```

## 入力例

```text
[FIELD] = 化学
[UNIT] = 化学変化, イオン
[GRADE] = 中2, 中3
[COUNT] = 20
```

## 補足

- 迷ったら `choice4` を増やすと安定します
- 用語確認は `fill_choice`
- 対応関係は `match`
- 順序は `sort`
- 分類は `multi_select`
- 化学反応式や語句組み立ては `word_bank`

---

## Claude Code 用

Claude Code には、生成だけでなく「このリポジトリ内に JSON ファイルとして保存する」ところまで依頼できます。

### コピペ用プロンプト

```text
このリポジトリの現在の問題仕様に合わせて、中学理科の問題データを作成してください。

要件:
- 分野: [FIELD]
- 単元: [UNIT]
- 学年: [GRADE]
- 問題数: [COUNT]
- 保存先: [OUTPUT_PATH]

作業ルール:
- まず現在の仕様をコードベースから確認してください
  - `docs/QUESTION_TYPES_UPGRADE.md`
  - `docs/QUESTION_GENERATION_PROMPT.md`
  - `docs/QUESTION_ADDITION_PROMPT.md`
  - `src/lib/questionTypes.ts`
  - `scripts/import_questions_supabase.mjs`
- 現在サポートされている問題タイプと JSON 仕様に厳密に合わせてください
- 問題は教科書レベルの自然な日本語で作ってください
- ひっかけ問題は禁止です
- 同じ知識を重複させすぎないでください
- できるだけ `text` は避け、タップ式を優先してください
- 優先順は `choice4`, `true_false`, `fill_choice`, `match`, `sort`, `multi_select`, `word_bank`
- `choice` と `text` は後方互換用なので、必要な場合だけ使ってください

出題比率の目安:
- true_false: 15%
- choice4: 30%
- fill_choice: 20%
- match: 10%
- sort: 10%
- multi_select: 10%
- word_bank: 5%

問題数が少ない場合:
- 10問未満なら `choice4`, `fill_choice`, `true_false` を優先してください

型ごとの必須条件:
- true_false
  - `answer` は `○` または `×`
  - `choices` は `["○", "×"]`
- choice
  - `choices` は2個
  - `answer` は choices のどれかと完全一致
- choice4
  - `choices` は4個
  - `answer` は choices のどれかと完全一致
- fill_choice
  - `question` に必ず `【　　】` を含める
  - `choices` は3〜4個
  - `answer` は choices のどれかと完全一致
- match
  - `answer` は null
  - `choices` は null
  - `match_pairs` は2〜4組
- sort
  - `answer` は null
  - `choices` は null
  - `sort_items` は正しい順で3〜5個
- multi_select
  - `answer` は null
  - `choices` は4〜6個
  - `correct_choices` は2個以上
  - `correct_choices` は choices の部分集合
- word_bank
  - `choices` は null
  - `word_tokens` は正解トークン列
  - `distractor_tokens` は1〜3個
  - `answer` は完成形
- text
  - `answer` は模範解答文
  - `keywords` は任意

共通制約:
- `field` は `生物` / `化学` / `物理` / `地学`
- `grade` は `中1` / `中2` / `中3`
- `explanation` は1〜3文
- null にする値は省略せず `null`
- 型ごとに不要な追加フィールドは入れない

出力形式:
- JSON 配列
- その JSON を `[OUTPUT_PATH]` に保存してください
- 生成後に自己チェックして、JSON が現在の仕様に合っているか確認してください
- 最後に、作成ファイルのパスと問題数だけを簡潔に報告してください
```

### 入力例

```text
[FIELD] = 生物
[UNIT] = 消化と吸収
[GRADE] = 中2
[COUNT] = 20
[OUTPUT_PATH] = examples/biology_digestive_questions.json
```
