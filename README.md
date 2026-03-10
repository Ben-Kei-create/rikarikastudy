# RikaQuiz 📚 - 理科一問一答学習サイト

中学理科4分野（生物・化学・物理・地学）の一問一答学習サイトです。

---

## 🚀 デプロイ手順

### 1. Supabaseセットアップ

1. [supabase.com](https://supabase.com) にアクセスし、新規プロジェクトを作成
2. 「SQL Editor」を開き、`supabase_schema.sql` の内容を全てコピー＆実行
   - 既存プロジェクトでも再実行OK
   - `students.password` 列と初期データ（ID 1〜5 / S, M, T, K, 先生 / `rikalove1〜4`, `rikaadmin2026`）を揃えます
3. 「Project Settings → API」から以下をコピー：
   - `Project URL`
   - `Publishable Key`（推奨）または `Anon Key (Legacy)`

### 2. GitHubにプッシュ

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_NAME/rika-quiz.git
git push -u origin main
```

### 3. Vercelにデプロイ

1. [vercel.com](https://vercel.com) でGitHubリポジトリをインポート
2. 「Environment Variables」に以下を追加：
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = sb_publishable_xxxxx...
   # または NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJxxxxx...
   ```
3. 「Deploy」を押す → 完了！

### 4. サンプル問題の追加

デプロイ後、ログイン画面の「もぎ先生ログイン」→
管理者PW: `rikaadmin2026` → 「問題一覧」タブ → 「サンプル問題を追加」

### 5. 問題の追加方法

1. ログイン画面で「もぎ先生ログイン」
2. 管理者PW `rikaadmin2026` を入力
3. 「問題追加」タブを開く
4. `分野 / 単元 / 問題文 / 正解` を入力
5. 選択問題なら `A・B` の2択だけ入力
6. 「正解」には A か B と同じ文をそのまま入れる
7. 「問題を追加する」を押す

---

## 🔐 ログイン情報

| 種別 | パスワード |
|------|-----------|
| 生徒ログイン | IDごとに固定（`rikalove1` 〜 `rikalove4`, `rikaadmin2026`） |
| 管理者 | `rikaadmin2026` |

### 生徒ID・ニックネーム（変更可能）

| ID | ニックネーム |
|----|------------|
| 1  | S          |
| 2  | M          |
| 3  | T          |
| 4  | K          |
| 5  | 先生       |

ニックネームとパスワードはログイン後の「マイページ → 設定」から変更できます。
管理者画面では各生徒の現在のパスワードを確認できます。
各端末は最初にログインした ID に固定され、切り替えは「もぎ先生ログイン」から解除します。

---

## 📱 機能一覧

- ✅ ID + パスワード認証
- ✅ 5人のID選択（ニックネーム表示）
- ✅ 生物・化学・物理・地学の4分野
- ✅ 単元別 / 全単元ランダム出題
- ✅ 2択問題・記述問題対応
- ✅ 解説表示
- ✅ セッション・回答ログをSupabaseに保存
- ✅ マイページ（正答率・学習履歴）
- ✅ 管理画面（生徒データ閲覧・問題追加・削除）

---

## 🛠 技術スタック

- **フロントエンド**: Next.js 14 (App Router)
- **スタイリング**: Tailwind CSS
- **データベース**: Supabase (PostgreSQL)
- **ホスティング**: Vercel
- **フォント**: Dela Gothic One + Zen Kaku Gothic New

---

## 📝 問題の追加方法

管理画面 → 「問題追加」タブから入力できます。

**2択問題の場合：**
- 選択肢A・Bを入力
- 「正解」に選択肢AかBと**完全一致**する文字列を入力

**記述問題の場合：**
- 「正解」に模範解答を入力（完全一致で判定）

---

## v2 変更点

### 🔐 ログイン仕様
- ID 1〜5 を選んでログイン
- 初期PWは `rikalove1 / rikalove2 / rikalove3 / rikalove4 / rikaadmin2026`
- ニックネーム / パスワードは本人が変更可能
- 管理者画面で各生徒の現在のPWを確認可能
- 各端末は最初にログインした ID に固定

## 🌐 別端末で見る方法

### 同じWi-Fi内ですぐ試す方法

Macで開発サーバーを外部公開で起動:

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

MacのIPを確認:

```bash
ipconfig getifaddr en0
```

他の端末から:

```text
http://MacのIPアドレス:3000
```

### 家の外からも使う方法

Vercel にデプロイしてURLを配るのがいちばん簡単です。
- GitHub に push
- Vercel でリポジトリを読み込む
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  を環境変数に入れて deploy

注意:
- 今のアプリは Supabase をクライアントから直接読んでいます
- 端末固定で「普段の行き来」は防げますが、公開URLでの厳密なユーザー分離ではありません
- 本当に他人のデータ参照を防ぐなら、次に Supabase Auth + RLS か Next.js サーバー経由認証へ変える必要があります

### 📊 マイページ強化
- 🔥 **連続学習日数（ストリーク）** ヘッダーに表示
- 📊 **概要タブ**: 総問題数・正答率・最高連続日数、分野別バー、今週棒グラフ、30日ヒートマップ
- 📅 **履歴タブ**: セッション別の正誤バー付き一覧
- 🎯 **弱点タブ**: 正答率が低い単元ランキング（3問以上解いた単元のみ）
