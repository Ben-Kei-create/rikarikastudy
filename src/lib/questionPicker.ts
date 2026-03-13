'use client'

import { CustomQuizOptions } from '@/lib/customQuiz'
import { QuestionType, isChallengeSupportedQuestionType } from '@/lib/questionTypes'

const CORE_FIELDS = ['生物', '化学', '物理', '地学']
export type QuizQuestionCount = 5 | 10 | 15 | 'all'

export interface QuizQuestionLike {
  id: string
  field: string
  unit: string
  type: QuestionType
}

export interface QuestionHistoryLike {
  question_id: string
  is_correct: boolean
}

export function shuffleArray<T>(items: T[]) {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

export function pickStandardQuizQuestions<T extends QuizQuestionLike>(
  pool: T[],
  field: string,
  count: QuizQuestionCount = 10,
) {
  const shuffled = shuffleArray(pool)
  const targetCount = count === 'all' ? shuffled.length : count

  if (field !== 'all') {
    return shuffled.slice(0, targetCount)
  }

  if (count === 'all') return shuffled

  const picked: T[] = []
  const usedIds = new Set<string>()

  for (const currentField of CORE_FIELDS) {
    const candidate = shuffled.find(question => question.field === currentField && !usedIds.has(question.id))
    if (!candidate) continue
    picked.push(candidate)
    usedIds.add(candidate.id)
  }

  for (const question of shuffled) {
    if (usedIds.has(question.id)) continue
    picked.push(question)
    usedIds.add(question.id)
    if (picked.length >= targetCount) break
  }

  return picked.slice(0, targetCount)
}

export function buildQuestionPriorityMap(history: QuestionHistoryLike[]) {
  const map = new Map<string, { attempts: number; wrong: number }>()

  for (const row of history) {
    if (!map.has(row.question_id)) {
      map.set(row.question_id, { attempts: 0, wrong: 0 })
    }
    const current = map.get(row.question_id)
    if (!current) continue
    current.attempts += 1
    if (!row.is_correct) current.wrong += 1
  }

  return map
}

function matchesCustomHistoryFilter(
  questionId: string,
  historyMap: Map<string, { attempts: number; wrong: number }>,
  historyFilter: CustomQuizOptions['historyFilter'],
) {
  if (historyFilter === 'all') return true

  const history = historyMap.get(questionId)
  if (historyFilter === 'unanswered') return !history
  if (historyFilter === 'weak') return Boolean(history && history.wrong > 0)
  return true
}

function matchesCustomQuestionType(type: QuestionType, questionType: CustomQuizOptions['questionType']) {
  if (questionType === 'all') return true
  if (questionType === 'text') return type === 'text'
  return type !== 'text'
}

export function pickCustomQuizQuestions<T extends QuizQuestionLike>(
  pool: T[],
  history: QuestionHistoryLike[],
  options: CustomQuizOptions,
  count: QuizQuestionCount = 10,
) {
  const historyMap = buildQuestionPriorityMap(history)
  const filtered = pool.filter(question => {
    if (!matchesCustomQuestionType(question.type, options.questionType)) {
      return false
    }

    return matchesCustomHistoryFilter(question.id, historyMap, options.historyFilter)
  })

  const shuffled = shuffleArray(filtered)
  return count === 'all' ? shuffled : shuffled.slice(0, count)
}

export function pickDailyChallengeQuestions<T extends QuizQuestionLike>(
  pool: T[],
  history: QuestionHistoryLike[],
  count = 5,
) {
  const historyMap = buildQuestionPriorityMap(history)
  const picked: T[] = []
  const usedIds = new Set<string>()

  const wrongQuestions = shuffleArray(
    pool.filter(question => (historyMap.get(question.id)?.wrong ?? 0) > 0),
  )
  const unseenQuestions = shuffleArray(
    pool.filter(question => !historyMap.has(question.id)),
  )
  const fallbackQuestions = shuffleArray(pool)

  const pushFrom = (source: T[]) => {
    for (const question of source) {
      if (picked.length >= count) break
      if (usedIds.has(question.id)) continue
      picked.push(question)
      usedIds.add(question.id)
    }
  }

  pushFrom(wrongQuestions)
  pushFrom(unseenQuestions)
  pushFrom(fallbackQuestions)

  return picked.slice(0, count)
}

export function pickTimeAttackQuestions<T extends QuizQuestionLike>(pool: T[]) {
  return shuffleArray(pool.filter(question => isChallengeSupportedQuestionType(question.type) && question.type !== 'text'))
}

export function pickChallengeTestQuestions<T extends QuizQuestionLike>(pool: T[], count = 25) {
  const grouped = CORE_FIELDS.map(field =>
    shuffleArray(pool.filter(question => question.field === field)),
  )
  const picked: T[] = []
  const usedIds = new Set<string>()

  while (picked.length < count && grouped.some(group => group.length > 0)) {
    for (const group of grouped) {
      const next = group.shift()
      if (!next || usedIds.has(next.id)) continue
      picked.push(next)
      usedIds.add(next.id)
      if (picked.length >= count) break
    }
  }

  if (picked.length < count) {
    for (const question of shuffleArray(pool)) {
      if (usedIds.has(question.id)) continue
      picked.push(question)
      usedIds.add(question.id)
      if (picked.length >= count) break
    }
  }

  return picked.slice(0, count)
}
