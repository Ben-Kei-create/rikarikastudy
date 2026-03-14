'use client'

import { getQuestionTypeLabel, QuestionType } from '@/lib/questionTypes'

export type CustomQuizQuestionType = 'all' | QuestionType
export type CustomQuizHistoryFilter = 'all' | 'unanswered' | 'weak'

export interface CustomQuizOptions {
  unit: string
  questionType: CustomQuizQuestionType
  historyFilter: CustomQuizHistoryFilter
}

export const DEFAULT_CUSTOM_QUIZ_OPTIONS: CustomQuizOptions = {
  unit: 'all',
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

export function getCustomQuizSummaryParts(options: CustomQuizOptions) {
  const parts: string[] = []

  if (options.unit !== 'all') {
    parts.push(options.unit)
  } else {
    parts.push('全単元')
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
