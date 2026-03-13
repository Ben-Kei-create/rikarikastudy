'use client'

import { QuestionType } from '@/lib/questionTypes'

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
  type: QuestionType
  choices: string[] | null
  answer: string
  match_pairs?: Array<{ left: string; right: string }> | null
  sort_items?: string[] | null
  correct_choices?: string[] | null
  word_tokens?: string[] | null
  distractor_tokens?: string[] | null
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

function shouldShuffleChoices(type: QuestionType, options?: { shuffleChoices?: boolean }) {
  if (options?.shuffleChoices === false) return false
  return type === 'choice' || type === 'choice4' || type === 'fill_choice' || type === 'multi_select'
}

export function normalizeQuestionChoices<T extends ChoiceCompatibleQuestion>(
  question: T,
  options?: { shuffleChoices?: boolean },
): T {
  const cleanedChoices = Array.isArray(question.choices)
    ? question.choices
        .map(choice => (typeof choice === 'string' ? choice.trim() : ''))
        .filter(Boolean)
    : []

  if (question.type === 'true_false') {
    return {
      ...question,
      choices: ['○', '×'],
      answer: normalizeChoiceText(question.answer) === '○' ? '○' : '×',
    }
  }

  if (question.type !== 'choice' && question.type !== 'choice4' && question.type !== 'fill_choice' && question.type !== 'multi_select') {
    return {
      ...question,
      choices: cleanedChoices.length > 0 ? cleanedChoices : null,
    }
  }

  const resolvedAnswer = question.type === 'multi_select'
    ? question.answer
    : resolveChoiceAnswer(question.answer, cleanedChoices)
  const normalizedChoices = shouldShuffleChoices(question.type, options) && cleanedChoices.length > 1
    ? shuffleItems(cleanedChoices)
    : cleanedChoices

  return {
    ...question,
    choices: normalizedChoices.length > 0 ? normalizedChoices : null,
    answer: resolvedAnswer,
  }
}

export function hasValidChoiceAnswer<T extends ChoiceCompatibleQuestion>(question: T) {
  if (question.type === 'choice' || question.type === 'choice4' || question.type === 'fill_choice') {
    if (!Array.isArray(question.choices) || question.choices.length < 2) return false
    return question.choices.includes(question.answer)
  }

  if (question.type === 'true_false') {
    return question.answer === '○' || question.answer === '×'
  }

  if (question.type === 'multi_select') {
    if (!Array.isArray(question.choices) || question.choices.length < 4) return false
    if (!Array.isArray(question.correct_choices) || question.correct_choices.length < 2) return false
    return question.correct_choices.every(choice => question.choices?.includes(choice))
  }

  if (question.type === 'match') {
    return Array.isArray(question.match_pairs) && question.match_pairs.length >= 2
  }

  if (question.type === 'sort') {
    return Array.isArray(question.sort_items) && question.sort_items.length >= 3
  }

  if (question.type === 'word_bank') {
    return Array.isArray(question.word_tokens) && question.word_tokens.length >= 2
  }

  return true
}
