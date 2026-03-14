'use client'

import { getQuestionTypeLabel, QuestionType } from '@/lib/questionTypes'

export type CustomQuizQuestionType = 'all' | QuestionType
export type CustomQuizHistoryFilter = 'all' | 'unanswered' | 'weak'
export type CustomQuizGradeFilter = 'all' | '中1' | '中2' | '中3'

export const CUSTOM_QUIZ_GRADE_OPTIONS: CustomQuizGradeFilter[] = ['all', '中1', '中2', '中3']

export interface CustomQuizOptions {
  unit: string
  grade: CustomQuizGradeFilter
  questionType: CustomQuizQuestionType
  historyFilter: CustomQuizHistoryFilter
}

export const DEFAULT_CUSTOM_QUIZ_OPTIONS: CustomQuizOptions = {
  unit: 'all',
  grade: 'all',
  questionType: 'all',
  historyFilter: 'all',
}

export function getCustomQuizQuestionTypeLabel(questionType: CustomQuizQuestionType) {
  if (questionType === 'all') return '形式すべて'
  return getQuestionTypeLabel(questionType)
}

export function getCustomQuizHistoryFilterLabel(historyFilter: CustomQuizHistoryFilter) {
  if (historyFilter === 'unanswered') return '未回答だけ'
  if (historyFilter === 'weak') return '苦手だけ'
  return '履歴条件なし'
}

export function getCustomQuizGradeFilterLabel(grade: CustomQuizGradeFilter) {
  if (grade === 'all') return '学年すべて'
  return grade
}

export function getCustomQuizSummaryParts(options: CustomQuizOptions) {
  const parts: string[] = []

  if (options.unit !== 'all') {
    parts.push(options.unit)
  } else {
    parts.push('全単元')
  }

  if (options.grade !== 'all') {
    parts.push(getCustomQuizGradeFilterLabel(options.grade))
  }

  if (options.questionType !== 'all') {
    parts.push(getCustomQuizQuestionTypeLabel(options.questionType))
  }

  if (options.historyFilter !== 'all') {
    parts.push(getCustomQuizHistoryFilterLabel(options.historyFilter))
  }

  return parts
}

export function getCustomQuizSessionLabel(options: CustomQuizOptions) {
  return `カスタム: ${getCustomQuizSummaryParts(options).join(' / ')}`
}
