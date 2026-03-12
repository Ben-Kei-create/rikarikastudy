Original prompt: 地学特有のミニゲームを追加。これは地学の岩石・鉱物のペアのカードを順番に押して行って◯か×でペアを消していく感じのミニゲームお作成する。

- 2026-03-12: 既存の導線を確認。化学だけ special mode があり、分野ページから専用ページへ遷移している。
- 2026-03-12: 地学ミニゲームも同じ導線に揃え、`recordStudySession` に保存する方針。
- 2026-03-12: `EarthSciencePracticePage` と `earthSciencePractice.ts` を追加。地学ページに「岩石・鉱物ペア」の special mode を表示する実装を進めた。
- 2026-03-12: キャンバスのクリック対象を安定させるため、`#earth-pair-canvas` を追加。次は実ブラウザでカード操作を確認する。
- 2026-03-12: 実ブラウザ確認でクリア自体は成功。`render_game_to_text` の完了直後の stale 状態を ref ベースに修正し、直前の ○ / × も右パネルに残すようにした。
- 2026-03-12: Playwright MCP でゲストログイン → 地学 → Earth Memory → ミスマッチ 1 回 → 全クリアまで確認。`render_game_to_text` は finished を返し、`npm run build` も成功。
- 2026-03-12: 生物ラボとして「器官・はたらきペア」を追加する方針。地学ラボと同じ canvas ベースのペアゲームを流用し、`生物` 分野から入れるようにする。
