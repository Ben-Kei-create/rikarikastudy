# NotebookLM 問題作成ガイド

> RikaQuiz用の問題をNotebookLMで作成するための指示文とフォーマット集です。
> 教科書や授業ノートをNotebookLMにアップロードし、このガイドの指示文を貼り付けることで問題を生成できます。

---

## 1. NotebookLMの準備

### アップロードする資料（ソース）

NotebookLMに以下の資料をアップロードしてから問題を生成してください：

- 対象単元の教科書ページ（PDF・画像）
- 授業ノート・プリント
- 参考書・問題集（著作権に注意）

### ノートブックの設定

1. NotebookLMで新規ノートブックを作成
2. 対象の教材をソースとしてアップロード
3. 下記「問題作成の指示文」をチャットに貼り付けて実行

---

## 2. 問題作成の指示文（NotebookLMに貼り付けるプロンプト）

以下の指示文をコピーして、NotebookLMのチャット欄に貼り付けてください。
`[　]` の部分を実際の値に変更してから使用してください。

---

```
あなたは日本の中学理科の一問一答問題を作成するAIです。
アップロードされた資料の内容をもとに、RikaQuizアプリ用の問題をJSON形式で作成してください。

=== 作成条件 ===
- 分野：[生物 / 化学 / 物理 / 地学 のいずれか]
- 単元：[例：消化と吸収、電流、化学変化 など]
- 学年：[中1 / 中2 / 中3]
- 問題数：[例：20]

=== 問題タイプの配分 ===
以下の比率を目安に、複数のタイプを混ぜて作成してください：
- true_false（○×問題）：約15%　← 簡単・ウォームアップ向け
- choice4（4択問題）：約30%　← 標準的な選択問題
- fill_choice（穴埋め選択）：約20%　← 文中の空欄を選択肢から選ぶ
- match（マッチング）：約10%　← 左右を正しく組み合わせる
- sort（並べ替え）：約10%　← 正しい順番に並べる
- multi_select（複数選択）：約10%　← 正しいものをすべて選ぶ
- word_bank（語群組み立て）：約5%　← トークンを並べて答えを作る

問題数が10問未満の場合は choice4 と fill_choice を優先してください。

=== 出力形式 ===
有効なJSONの配列のみを出力してください。
マークダウン・説明文・コードブロックは不要です。生のJSON配列だけを出力してください。

=== 各タイプのフォーマット ===

【true_false】
{
  "field": "分野",
  "unit": "単元名",
  "question": "文章（正しいか誤りかを判定する文）",
  "type": "true_false",
  "answer": "○" または "×",
  "choices": ["○", "×"],
  "keywords": null,
  "explanation": "解説文（1〜3文）",
  "grade": "中1" または "中2" または "中3"
}

【choice4】
{
  "field": "分野",
  "unit": "単元名",
  "question": "問題文",
  "type": "choice4",
  "answer": "正解の選択肢",
  "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
  "keywords": null,
  "explanation": "解説文（1〜3文）",
  "grade": "学年"
}

【fill_choice】
{
  "field": "分野",
  "unit": "単元名",
  "question": "【　　】を含む穴埋め文",
  "type": "fill_choice",
  "answer": "正解の語句",
  "choices": ["正解の語句", "誤答1", "誤答2", "誤答3"],
  "keywords": null,
  "explanation": "解説文（1〜3文）",
  "grade": "学年"
}

【match】
{
  "field": "分野",
  "unit": "単元名",
  "question": "組み合わせの問題文",
  "type": "match",
  "answer": null,
  "choices": null,
  "keywords": null,
  "match_pairs": [
    { "left": "左側の語句1", "right": "右側の語句1" },
    { "left": "左側の語句2", "right": "右側の語句2" },
    { "left": "左側の語句3", "right": "右側の語句3" }
  ],
  "explanation": "解説文（1〜3文）",
  "grade": "学年"
}

【sort】
{
  "field": "分野",
  "unit": "単元名",
  "question": "正しい順番に並べる問題文",
  "type": "sort",
  "answer": null,
  "choices": null,
  "keywords": null,
  "sort_items": ["1番目", "2番目", "3番目", "4番目"],
  "explanation": "解説文（1〜3文）",
  "grade": "学年"
}

【multi_select】
{
  "field": "分野",
  "unit": "単元名",
  "question": "すべて選ぶ問題文",
  "type": "multi_select",
  "answer": null,
  "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4", "選択肢5"],
  "keywords": null,
  "correct_choices": ["正解1", "正解2"],
  "explanation": "解説文（1〜3文）",
  "grade": "学年"
}

【word_bank】
{
  "field": "分野",
  "unit": "単元名",
  "question": "語句・式を組み立てる問題文",
  "type": "word_bank",
  "answer": "完成した正解文字列",
  "choices": null,
  "keywords": null,
  "word_tokens": ["トークン1", "トークン2", "トークン3"],
  "distractor_tokens": ["ダミー1", "ダミー2"],
  "explanation": "解説文（1〜3文）",
  "grade": "学年"
}

=== 内容のルール ===
- アップロードされた資料の内容に基づいて問題を作成すること
- 中学生が理解できる自然な日本語を使うこと
- 教科書レベルの標準的な内容にすること
- ひっかけ問題・紛らわしい表現は避けること
- 同じ概念の重複問題を作らないこと
- 解説は1〜3文で、学習に役立つ内容にすること
- true_falseの「×」の文は、具体的に何が誤りかわかるようにすること
- fill_choiceの空欄は【　　】で表し、文が自然に読めるようにすること
- matchは1対1の対応が明確なペアにすること（3〜4ペア）
- sortは正しい順番が一通りに決まるものにすること（3〜5項目）
- multi_selectは正解が2〜3個、不正解が2〜3個になるようにすること
- word_bankのdistractor_tokensは2〜3個にすること

=== 値の制約 ===
- "field"："生物" / "化学" / "物理" / "地学" のいずれか
- "grade"："中1" / "中2" / "中3" のいずれか
- 全フィールドを必ず含めること（省略禁止）
- そのタイプに不要なフィールドは null にすること（省略しない）
- match_pairs / sort_items / correct_choices / word_tokens / distractor_tokens は、
  対応するタイプの問題にのみ追加すること

[COUNT]問、[FIELD] / [UNIT] / [GRADE] の問題を作成してください。
```

---

## 3. 使用例

### 例1：中2生物「消化と吸収」を20問作成する場合

指示文の末尾を以下のように変更：

```
20問、生物 / 消化と吸収 / 中2 の問題を作成してください。
```

### 例2：中3化学「イオン」を10問作成する場合

```
10問、化学 / イオン / 中3 の問題を作成してください。
```

### 例3：複数単元をまとめて作成する場合

```
30問、化学 / 化学変化・イオン・酸とアルカリ / 中2・中3 の問題を作成してください。
```

---

## 4. 生成した問題のインポート方法

NotebookLMが出力したJSON配列を、RikaQuizに登録する方法は3通りあります：

### 方法A：管理画面から一括登録（推奨）

1. 管理者パスワードでログイン
2. 「管理」→「一括登録」タブを開く
3. 生成されたJSON配列をテキストエリアに貼り付ける
4. 「登録する」ボタンを押す

### 方法B：JSONファイルをアップロード

1. 生成されたJSONを `.json` ファイルとして保存
2. 管理画面の「一括登録」タブでファイルをアップロード

### 方法C：コマンドラインで直接インポート（開発者向け）

```bash
npm run questions:import -- path/to/your_questions.json
```

---

## 5. よくあるエラーと対処法

| エラー内容 | 原因 | 対処法 |
|-----------|------|-------|
| JSONのパースエラー | マークダウンや余分なテキストが混入 | JSON部分だけを取り出して再貼り付け |
| `answer` が `choices` に含まれていない | choice4/fill_choiceのミス | answerとchoicesを確認・修正 |
| `match_pairs` がない | matchタイプにフィールド不足 | 指示文を再確認して再生成 |
| 登録後に問題が表示されない | `field` や `grade` の値が不正 | "生物"/"化学"/"物理"/"地学"、"中1"/"中2"/"中3" に修正 |
| true_falseの`answer`が○×以外 | 生成ミス | "○" または "×" に手動修正 |

---

## 6. 問題の品質チェックリスト

登録前に以下を確認してください：

- [ ] JSON配列として有効な形式か（JSONlintなどで検証）
- [ ] `field` の値が "生物"/"化学"/"物理"/"地学" のいずれかか
- [ ] `grade` の値が "中1"/"中2"/"中3" のいずれかか
- [ ] `type` ごとに必須フィールドがすべて揃っているか
- [ ] `answer` が `choices` の中の1つと完全一致しているか（choice4/fill_choice）
- [ ] `match_pairs` が3〜4ペアあるか（match）
- [ ] `sort_items` が3〜5項目あるか（sort）
- [ ] `correct_choices` が `choices` の部分集合になっているか（multi_select）
- [ ] `word_tokens` を順番に並べると `answer` になるか（word_bank）
- [ ] 同じ問題が重複していないか
- [ ] 解説が学習に役立つ内容か

---

## 7. フォーマットクイックリファレンス

| タイプ | 主なフィールド | 特有フィールド |
|--------|--------------|-------------|
| true_false | field, unit, question, type, answer（"○"or"×"）, choices（["○","×"]）, explanation, grade | — |
| choice4 | field, unit, question, type, answer, choices（4つ）, explanation, grade | — |
| fill_choice | field, unit, question（【　　】含む）, type, answer, choices（3〜4つ）, explanation, grade | — |
| match | field, unit, question, type, explanation, grade | match_pairs（3〜4ペア） |
| sort | field, unit, question, type, explanation, grade | sort_items（3〜5項目、正しい順） |
| multi_select | field, unit, question, type, choices（4〜6つ）, explanation, grade | correct_choices（2〜3つ） |
| word_bank | field, unit, question, type, answer, explanation, grade | word_tokens, distractor_tokens（2〜3つ） |

> **注意**：match / sort / multi_select / word_bank では、タイプに不要な `answer` や `choices` には **null** を明示してください（省略不可）。
