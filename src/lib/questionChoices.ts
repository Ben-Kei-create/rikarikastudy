'use client'

const CHOICE_INDEX_BY_LABEL: Record<string, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
}

export interface ChoiceCompatibleQuestion {
  id: string
  type: 'choice' | 'text'
  choices: string[] | null
  answer: string
}

function shuffleItems<T>(items: T[]) {
  const next = [...items]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }

  return next
}

function normalizeChoiceText(value: string) {
  return value.normalize('NFKC').trim()
}

function getChoiceIndexFromAnswer(answer: string) {
  const normalized = normalizeChoiceText(answer).toUpperCase()
  if (normalized in CHOICE_INDEX_BY_LABEL) return CHOICE_INDEX_BY_LABEL[normalized]

  const prefixed = normalized.match(/^([A-D1-4])(?:[.)、:：\s]|$)/)
  if (prefixed) {
    return CHOICE_INDEX_BY_LABEL[prefixed[1]] ?? null
  }

  return null
}

function resolveChoiceAnswer(answer: string, choices: string[]) {
  const trimmedAnswer = answer.trim()
  if (choices.includes(trimmedAnswer)) return trimmedAnswer

  const normalizedAnswer = normalizeChoiceText(answer)
  const normalizedChoices = choices.map(choice => normalizeChoiceText(choice))
  const sameTextIndex = normalizedChoices.findIndex(choice => choice === normalizedAnswer)
  if (sameTextIndex >= 0) return choices[sameTextIndex]

  const choiceIndex = getChoiceIndexFromAnswer(answer)
  if (choiceIndex !== null && choiceIndex >= 0 && choiceIndex < choices.length) {
    return choices[choiceIndex]
  }

  return trimmedAnswer
}

export function normalizeQuestionChoices<T extends ChoiceCompatibleQuestion>(
  question: T,
  options?: { shuffleChoices?: boolean },
): T {
  if (question.type !== 'choice') return question

  const cleanedChoices = Array.isArray(question.choices)
    ? question.choices
        .map(choice => (typeof choice === 'string' ? choice.trim() : ''))
        .filter(Boolean)
    : []

  const resolvedAnswer = resolveChoiceAnswer(question.answer, cleanedChoices)
  const shuffledChoices = options?.shuffleChoices && cleanedChoices.length > 1
    ? shuffleItems(cleanedChoices)
    : cleanedChoices

  return {
    ...question,
    choices: shuffledChoices,
    answer: resolvedAnswer,
  }
}

export function hasValidChoiceAnswer<T extends ChoiceCompatibleQuestion>(question: T) {
  if (question.type !== 'choice') return true
  if (!Array.isArray(question.choices) || question.choices.length < 2) return false
  return question.choices.includes(question.answer)
}
