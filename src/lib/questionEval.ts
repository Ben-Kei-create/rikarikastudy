import { buildTextBlankPrompt, evaluateTextAnswer, TextAnswerResult } from '@/lib/answerUtils'
import {
  MatchPair,
  QuestionShape,
  QuestionType,
  getQuestionCorrectAnswerText,
  getQuestionStudentAnswerFallback,
} from '@/lib/questionTypes'

export type QuestionJudgeResult = TextAnswerResult

export type QuestionSubmission =
  | { kind: 'single'; value: string }
  | { kind: 'text'; value: string }
  | { kind: 'match'; pairs: MatchPair[] }
  | { kind: 'sort'; items: string[] }
  | { kind: 'multi_select'; selected: string[] }
  | { kind: 'word_bank'; tokens: string[] }

export interface EvaluatedQuestionAnswer {
  result: QuestionJudgeResult
  studentAnswerText: string
  answerLogValue: string
  correctAnswerText: string
}

function normalizeText(value: string) {
  return value.normalize('NFKC').trim()
}

function formatMatchPairs(pairs: MatchPair[]) {
  return pairs
    .filter(pair => pair.left.trim() && pair.right.trim())
    .map(pair => `${pair.left} → ${pair.right}`)
    .join(' / ')
}

function formatSortItems(items: string[]) {
  return items.filter(Boolean).join(' → ')
}

function formatMultiSelect(items: string[]) {
  return items.filter(Boolean).join(' / ')
}

function formatWordTokens(tokens: string[]) {
  return tokens.filter(Boolean).join(' ')
}

function serializeStringArray(items: string[]) {
  return JSON.stringify(items.filter(Boolean))
}

function serializeMatchPairs(pairs: MatchPair[]) {
  return JSON.stringify(
    pairs
      .filter(pair => pair.left.trim() && pair.right.trim())
      .map(pair => ({ left: pair.left, right: pair.right })),
  )
}

function compareStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((item, index) => normalizeText(item) === normalizeText(right[index]))
}

function compareStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false

  const leftSet = new Set(left.map(normalizeText))
  const rightSet = new Set(right.map(normalizeText))
  if (leftSet.size !== rightSet.size) return false

  for (const item of Array.from(leftSet)) {
    if (!rightSet.has(item)) return false
  }

  return true
}

function compareMatchPairs(submitted: MatchPair[], expected: MatchPair[]) {
  if (submitted.length !== expected.length) return false

  const expectedMap = new Map(
    expected.map(pair => [normalizeText(pair.left), normalizeText(pair.right)]),
  )

  for (const pair of submitted) {
    const key = normalizeText(pair.left)
    const right = normalizeText(pair.right)
    if (!key || !right) return false
    if (expectedMap.get(key) !== right) return false
  }

  return true
}

export function getQuestionBlankPrompt(question: Pick<QuestionShape, 'type' | 'answer' | 'accept_answers' | 'keywords'>) {
  if (question.type !== 'text') return null
  return buildTextBlankPrompt(question.answer, question.accept_answers, question.keywords)
}

export function evaluateQuestionAnswer(
  question: Pick<QuestionShape, 'type' | 'answer' | 'accept_answers' | 'keywords' | 'match_pairs' | 'sort_items' | 'correct_choices' | 'word_tokens'>,
  submission: QuestionSubmission,
): EvaluatedQuestionAnswer {
  const correctAnswerText = getQuestionCorrectAnswerText(question)

  if (question.type === 'text' && submission.kind === 'text') {
    const result = evaluateTextAnswer(submission.value, question.answer, question.accept_answers, question.keywords)
    const prompt = buildTextBlankPrompt(question.answer, question.accept_answers, question.keywords)
    return {
      result,
      studentAnswerText: submission.value.trim() || getQuestionStudentAnswerFallback(question.type),
      answerLogValue: submission.value.trim() || getQuestionStudentAnswerFallback(question.type),
      correctAnswerText: prompt.target || correctAnswerText,
    }
  }

  if ((question.type === 'choice' || question.type === 'choice4' || question.type === 'true_false' || question.type === 'fill_choice') && submission.kind === 'single') {
    return {
      result: normalizeText(submission.value) === normalizeText(question.answer) ? 'exact' : 'incorrect',
      studentAnswerText: submission.value.trim() || getQuestionStudentAnswerFallback(question.type),
      answerLogValue: submission.value.trim() || getQuestionStudentAnswerFallback(question.type),
      correctAnswerText,
    }
  }

  if (question.type === 'match' && submission.kind === 'match') {
    return {
      result: compareMatchPairs(submission.pairs, question.match_pairs ?? []) ? 'exact' : 'incorrect',
      studentAnswerText: formatMatchPairs(submission.pairs) || getQuestionStudentAnswerFallback(question.type),
      answerLogValue: serializeMatchPairs(submission.pairs),
      correctAnswerText,
    }
  }

  if (question.type === 'sort' && submission.kind === 'sort') {
    return {
      result: compareStringArray(submission.items, question.sort_items ?? []) ? 'exact' : 'incorrect',
      studentAnswerText: formatSortItems(submission.items) || getQuestionStudentAnswerFallback(question.type),
      answerLogValue: serializeStringArray(submission.items),
      correctAnswerText,
    }
  }

  if (question.type === 'multi_select' && submission.kind === 'multi_select') {
    return {
      result: compareStringSet(submission.selected, question.correct_choices ?? []) ? 'exact' : 'incorrect',
      studentAnswerText: formatMultiSelect(submission.selected) || getQuestionStudentAnswerFallback(question.type),
      answerLogValue: serializeStringArray(submission.selected),
      correctAnswerText,
    }
  }

  if (question.type === 'word_bank' && submission.kind === 'word_bank') {
    return {
      result: compareStringArray(submission.tokens, question.word_tokens ?? []) ? 'exact' : 'incorrect',
      studentAnswerText: formatWordTokens(submission.tokens) || getQuestionStudentAnswerFallback(question.type),
      answerLogValue: formatWordTokens(submission.tokens) || getQuestionStudentAnswerFallback(question.type),
      correctAnswerText,
    }
  }

  return {
    result: 'incorrect',
    studentAnswerText: getQuestionStudentAnswerFallback(question.type as QuestionType),
    answerLogValue: getQuestionStudentAnswerFallback(question.type as QuestionType),
    correctAnswerText,
  }
}
