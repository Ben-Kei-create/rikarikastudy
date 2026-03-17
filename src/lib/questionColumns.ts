/**
 * コラム機能のユーティリティ
 *
 * - 問題ごとの正解回数を localStorage で管理
 * - コラム閲覧済み状態を localStorage で管理
 * - コラム表示条件: 3回以上正解 & 未閲覧 & column_title/column_body あり
 */

const CORRECT_COUNTS_KEY = 'rika_column_correct_counts_v1'
const VIEWED_COLUMNS_KEY = 'rika_viewed_columns_v1'

/** コラムボタンが出現するために必要な正解回数 */
export const COLUMN_UNLOCK_THRESHOLD = 3

// ---------- correct counts ----------

function loadCorrectCounts(studentId: number): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(CORRECT_COUNTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, Record<string, number>>) : {}
    return parsed[String(studentId)] ?? {}
  } catch {
    return {}
  }
}

function saveCorrectCounts(studentId: number, counts: Record<string, number>) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(CORRECT_COUNTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, Record<string, number>>) : {}
    parsed[String(studentId)] = counts
    window.localStorage.setItem(CORRECT_COUNTS_KEY, JSON.stringify(parsed))
  } catch { /* ignore */ }
}

/** 問題に正解したとき呼ぶ。カウントをインクリメントして新しい値を返す */
export function incrementCorrectCount(studentId: number | null, questionId: string): number {
  if (!studentId) return 0
  const counts = loadCorrectCounts(studentId)
  const next = (counts[questionId] ?? 0) + 1
  counts[questionId] = next
  saveCorrectCounts(studentId, counts)
  return next
}

/** 現在の正解回数を取得 */
export function getCorrectCount(studentId: number | null, questionId: string): number {
  if (!studentId) return 0
  return loadCorrectCounts(studentId)[questionId] ?? 0
}

// ---------- viewed columns ----------

function loadViewedColumns(studentId: number): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(VIEWED_COLUMNS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
    const ids = Array.isArray(parsed[String(studentId)]) ? parsed[String(studentId)] : []
    return new Set(ids.filter(id => typeof id === 'string' && id))
  } catch {
    return new Set()
  }
}

function saveViewedColumns(studentId: number, ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(VIEWED_COLUMNS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
    parsed[String(studentId)] = Array.from(ids)
    window.localStorage.setItem(VIEWED_COLUMNS_KEY, JSON.stringify(parsed))
  } catch { /* ignore */ }
}

/** コラムを閲覧済みとしてマーク */
export function markColumnViewed(studentId: number | null, questionId: string) {
  if (!studentId) return
  const viewed = loadViewedColumns(studentId)
  viewed.add(questionId)
  saveViewedColumns(studentId, viewed)
}

/** コラムが閲覧済みかどうか */
export function isColumnViewed(studentId: number | null, questionId: string): boolean {
  if (!studentId) return false
  return loadViewedColumns(studentId).has(questionId)
}

/** 閲覧済みコラムの question_id 一覧を返す */
export function getViewedColumnIds(studentId: number | null): Set<string> {
  if (!studentId) return new Set()
  return loadViewedColumns(studentId)
}

/** コラムボタンを表示すべきか判定 */
export function shouldShowColumnButton(
  studentId: number | null,
  questionId: string,
  hasColumn: boolean,
  correctCount: number,
): boolean {
  if (!studentId || !hasColumn) return false
  if (correctCount < COLUMN_UNLOCK_THRESHOLD) return false
  if (isColumnViewed(studentId, questionId)) return false
  return true
}
