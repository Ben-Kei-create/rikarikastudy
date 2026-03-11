'use client'

export type CustomQuizQuestionType = 'all' | 'choice' | 'text'
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
  if (questionType === 'choice') return '選択肢のみ'
  if (questionType === 'text') return '記述のみ'
  return '形式すべて'
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
