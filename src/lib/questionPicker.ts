'use client'

import { CustomQuizOptions } from '@/lib/customQuiz'

const CORE_FIELDS = ['生物', '化学', '物理', '地学']

export interface QuizQuestionLike {
  id: string
  field: string
  unit: string
  type: 'choice' | 'text'
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

export function pickStandardQuizQuestions<T extends QuizQuestionLike>(pool: T[], field: string) {
  const shuffled = shuffleArray(pool)

  if (field !== 'all') {
    return shuffled.slice(0, 10)
  }

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
    if (picked.length >= 10) break
  }

  return picked.slice(0, 10)
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

export function pickCustomQuizQuestions<T extends QuizQuestionLike>(
  pool: T[],
  history: QuestionHistoryLike[],
  options: CustomQuizOptions,
  count = 10,
) {
  const historyMap = buildQuestionPriorityMap(history)
  const filtered = pool.filter(question => {
    if (options.questionType !== 'all' && question.type !== options.questionType) {
      return false
    }

    return matchesCustomHistoryFilter(question.id, historyMap, options.historyFilter)
  })

  return shuffleArray(filtered).slice(0, count)
}

function getDailyChallengeWeight(questionId: string, historyMap: Map<string, { attempts: number; wrong: number }>) {
  const history = historyMap.get(questionId)
  if (!history) return 4
  if (history.wrong > 0) return 6 + history.wrong
  return 2
}

export function pickDailyChallengeQuestions<T extends QuizQuestionLike>(
  pool: T[],
  history: QuestionHistoryLike[],
  count = 5,
) {
  const historyMap = buildQuestionPriorityMap(history)
  const weighted = shuffleArray(pool)
    .map(question => ({
      question,
      weight: getDailyChallengeWeight(question.id, historyMap),
      tieBreaker: Math.random(),
    }))
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight
      return b.tieBreaker - a.tieBreaker
    })

  const picked: T[] = []
  const usedFields = new Set<string>()

  for (const row of weighted) {
    if (picked.length >= count) break
    if (usedFields.has(row.question.field) && picked.length < CORE_FIELDS.length) continue
    picked.push(row.question)
    usedFields.add(row.question.field)
  }

  for (const row of weighted) {
    if (picked.length >= count) break
    if (picked.some(question => question.id === row.question.id)) continue
    picked.push(row.question)
  }

  return picked.slice(0, count)
}

export function pickTimeAttackQuestions<T extends QuizQuestionLike>(pool: T[]) {
  return shuffleArray(pool.filter(question => question.type === 'choice'))
}
