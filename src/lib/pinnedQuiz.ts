'use client'

import { Database, supabase } from '@/lib/supabase'
import { isMissingRelationError } from '@/lib/schemaCompat'
import { CustomQuizGradeFilter } from '@/lib/customQuiz'
import { QuizQuestionCount } from '@/lib/questionPicker'

export type PinnedQuizRow = Database['public']['Tables']['pinned_quizzes']['Row']
export type PinnedQuizInsert = Database['public']['Tables']['pinned_quizzes']['Insert']
export type PinnedQuizUpdate = Database['public']['Tables']['pinned_quizzes']['Update']

export const PINNED_QUIZ_QUESTION_COUNT_OPTIONS: QuizQuestionCount[] = ['all', 5, 10, 15]

export function isPinnedQuizTableMissing(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  return isMissingRelationError(error, 'pinned_quizzes')
}

export function getPinnedQuizSchemaErrorMessage(message: string) {
  if (message.includes('pinned_quizzes')) {
    return 'Supabase に pinned_quizzes テーブルがありません。最新の supabase_schema.sql を SQL Editor で実行してください。'
  }
  return message
}

export function pinnedQuizGradeAsFilter(grade: PinnedQuizRow['grade']): CustomQuizGradeFilter {
  return grade
}

export function getPinnedQuizQuestionCount(row: PinnedQuizRow): QuizQuestionCount {
  const limit = row.question_count_limit
  if (limit === 5 || limit === 10 || limit === 15) return limit
  return 'all'
}

export function getPinnedQuizDisplayLabel(row: PinnedQuizRow) {
  const trimmed = row.label?.trim()
  if (trimmed) return trimmed
  const gradePart = row.grade === 'all' ? '全学年' : row.grade
  return `${gradePart} ${row.field}`
}

export async function fetchActivePinnedQuizzes(): Promise<PinnedQuizRow[]> {
  const { data, error } = await supabase
    .from('pinned_quizzes')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    if (isPinnedQuizTableMissing(error)) return []
    return []
  }

  return (data || []) as PinnedQuizRow[]
}
