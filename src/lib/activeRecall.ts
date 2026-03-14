import { supabase, type Database } from '@/lib/supabase'
import type { QuizXpBreakdown } from '@/lib/xp'

type ActiveRecallField = '生物' | '化学' | '物理' | '地学'

export const ACTIVE_RECALL_UNLOCK_LEVEL = 20
export const ACTIVE_RECALL_QUESTION_COUNT = 5

export const ACTIVE_RECALL_PROMPT_TYPES = ['term', 'mechanism', 'process', 'compare', 'cause'] as const
export type ActiveRecallPromptType = typeof ACTIVE_RECALL_PROMPT_TYPES[number]

export const ACTIVE_RECALL_RATINGS = ['strong', 'close', 'review'] as const
export type ActiveRecallRating = typeof ACTIVE_RECALL_RATINGS[number]

export interface ActiveRecallCard {
  id: string
  sourceQuestionId: string | null
  unit: string
  promptType: ActiveRecallPromptType
  prompt: string
  cue: string
  hintKeywords: string[]
  keyPoints: string[]
  modelAnswer: string
  followUpPrompt: string | null
}

export interface ActiveRecallEvaluation {
  rating: ActiveRecallRating
  strengths: string[]
  missingPoints: string[]
  coachReply: string
  modelAnswer: string
  followUpPrompt: string | null
}

export interface ActiveRecallAttemptResult {
  card: ActiveRecallCard
  answer: string
  evaluation: ActiveRecallEvaluation
  attemptCount: number
  createdAt: string
}

const ACTIVE_RECALL_RATING_LABELS: Record<ActiveRecallRating, string> = {
  strong: 'よく思い出せた',
  close: 'おしい',
  review: '要復習',
}

const ACTIVE_RECALL_PROMPT_TYPE_LABELS: Record<ActiveRecallPromptType, string> = {
  term: '用語説明',
  mechanism: 'しくみ説明',
  process: '手順再生',
  compare: '比較',
  cause: '因果',
}

export function getActiveRecallRatingLabel(rating: ActiveRecallRating) {
  return ACTIVE_RECALL_RATING_LABELS[rating] ?? ACTIVE_RECALL_RATING_LABELS.review
}

export function getActiveRecallPromptTypeLabel(promptType: ActiveRecallPromptType) {
  return ACTIVE_RECALL_PROMPT_TYPE_LABELS[promptType] ?? ACTIVE_RECALL_PROMPT_TYPE_LABELS.term
}

export function getActiveRecallRatingAccent(rating: ActiveRecallRating) {
  if (rating === 'strong') return '#22c55e'
  if (rating === 'close') return '#f59e0b'
  return '#ef4444'
}

export function calculateActiveRecallXpBreakdown({
  attempts,
  durationSeconds,
}: {
  attempts: ActiveRecallAttemptResult[]
  durationSeconds: number
}): QuizXpBreakdown {
  const strongCount = attempts.filter(item => item.evaluation.rating === 'strong').length
  const closeCount = attempts.filter(item => item.evaluation.rating === 'close').length
  const totalQuestions = Math.max(1, attempts.length)
  const base = (strongCount * 16) + (closeCount * 10)
  const speed = Math.max(0, Math.floor((600 - Math.max(0, durationSeconds)) / 10))
  const perfect = strongCount === totalQuestions ? 40 : 0

  return {
    base,
    speed,
    perfect,
    total: base + speed + perfect,
  }
}

export function summarizeActiveRecall(attempts: ActiveRecallAttemptResult[]) {
  const strongCount = attempts.filter(item => item.evaluation.rating === 'strong').length
  const closeCount = attempts.filter(item => item.evaluation.rating === 'close').length
  const reviewCount = attempts.filter(item => item.evaluation.rating === 'review').length

  return {
    strongCount,
    closeCount,
    reviewCount,
    totalQuestions: attempts.length,
    needsReviewCount: attempts.filter(item => item.evaluation.rating !== 'strong').length,
  }
}

export type ActiveRecallLogRow = Database['public']['Tables']['active_recall_logs']['Row']
export type ActiveRecallLogInsert = Database['public']['Tables']['active_recall_logs']['Insert']

function isMissingRelationLike(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined, relation: string) {
  if (!error) return false

  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return text.includes(relation.toLowerCase()) && (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('not found')
  )
}

export function isActiveRecallLogsTableMissing(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  return isMissingRelationLike(error, 'active_recall_logs')
}

export function getActiveRecallLogsSchemaMessage(message: string) {
  if (message.includes('active_recall_logs')) {
    return 'Supabase に active_recall_logs テーブルがありません。最新の supabase_schema.sql を SQL Editor で実行してください。'
  }

  return `保存に失敗しました: ${message}`
}

export async function saveActiveRecallLogs({
  sessionId,
  studentId,
  field,
  unit,
  attempts,
}: {
  sessionId: string | null
  studentId: number | null
  field: ActiveRecallField
  unit: string
  attempts: ActiveRecallAttemptResult[]
}) {
  if (!sessionId || studentId === null || attempts.length === 0) {
    return { ok: true as const, message: '' }
  }

  const rows: ActiveRecallLogInsert[] = attempts.map(item => ({
    session_id: sessionId,
    student_id: studentId,
    field,
    unit,
    source_question_id: item.card.sourceQuestionId,
    prompt_type: item.card.promptType,
    prompt_text: item.card.prompt,
    cue_text: item.card.cue,
    hint_keywords: item.card.hintKeywords,
    key_points: item.card.keyPoints,
    student_answer: item.answer,
    rating: item.evaluation.rating,
    strengths: item.evaluation.strengths,
    missing_points: item.evaluation.missingPoints,
    coach_reply: item.evaluation.coachReply,
    model_answer: item.evaluation.modelAnswer,
    follow_up_prompt: item.evaluation.followUpPrompt ?? item.card.followUpPrompt,
    needs_review: item.evaluation.rating !== 'strong',
  }))

  const { error } = await supabase
    .from('active_recall_logs')
    .insert(rows)

  if (!error) {
    return { ok: true as const, message: '' }
  }

  if (isActiveRecallLogsTableMissing(error)) {
    return {
      ok: false as const,
      message: getActiveRecallLogsSchemaMessage('active_recall_logs'),
    }
  }

  return {
    ok: false as const,
    message: getActiveRecallLogsSchemaMessage(error.message || 'active_recall_logs'),
  }
}
