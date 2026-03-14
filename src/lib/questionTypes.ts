export const QUESTION_TYPES = [
  'choice',
  'choice4',
  'true_false',
  'fill_choice',
  'match',
  'sort',
  'multi_select',
  'word_bank',
  'text',
] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

export interface MatchPair {
  left: string
  right: string
}

export interface QuestionShape {
  id: string
  field: string
  unit: string
  question: string
  type: QuestionType
  choices: string[] | null
  answer: string
  accept_answers: string[] | null
  keywords: string[] | null
  explanation: string | null
  image_url: string | null
  image_display_width: number | null
  image_display_height: number | null
  match_pairs: MatchPair[] | null
  sort_items: string[] | null
  correct_choices: string[] | null
  word_tokens: string[] | null
  distractor_tokens: string[] | null
  grade?: string
}

export const QUESTION_TYPE_META: Record<QuestionType, {
  label: string
  shortLabel: string
}> = {
  choice: { label: '2択', shortLabel: '2択' },
  choice4: { label: '4択', shortLabel: '4択' },
  true_false: { label: '○×', shortLabel: '○×' },
  fill_choice: { label: '穴埋め', shortLabel: '穴埋め' },
  match: { label: 'マッチ', shortLabel: 'マッチ' },
  sort: { label: '並べ替え', shortLabel: '並べ替え' },
  multi_select: { label: '複数選択', shortLabel: '複数選択' },
  word_bank: { label: '語群', shortLabel: '語群' },
  text: { label: '記述', shortLabel: '記述' },
}

export function getQuestionTypeLabel(type: QuestionType) {
  return QUESTION_TYPE_META[type]?.label ?? type
}

export function getQuestionTypeShortLabel(type: QuestionType) {
  return QUESTION_TYPE_META[type]?.shortLabel ?? type
}

export function isSingleChoiceQuestionType(type: QuestionType) {
  return type === 'choice' || type === 'choice4' || type === 'true_false' || type === 'fill_choice'
}

export function isChoiceArrayQuestionType(type: QuestionType) {
  return isSingleChoiceQuestionType(type) || type === 'multi_select'
}

export function isChallengeSupportedQuestionType(type: QuestionType) {
  return QUESTION_TYPES.includes(type)
}

export function isTimedChallengeSupportedQuestionType(type: QuestionType) {
  return type !== 'text'
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return null

  const items = value
    .map(item => cleanString(item))
    .filter(Boolean)

  return items.length > 0 ? items : null
}

export function normalizeMatchPairs(value: unknown) {
  if (!Array.isArray(value)) return null

  const pairs = value
    .map(item => {
      const row = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {}
      const left = cleanString(row.left)
      const right = cleanString(row.right)
      if (!left || !right) return null
      return { left, right }
    })
    .filter((pair): pair is MatchPair => pair !== null)

  return pairs.length > 0 ? pairs : null
}

export function normalizeQuestionRecord(question: Partial<QuestionShape>): QuestionShape {
  const type = (question.type ?? 'choice') as QuestionType
  const choices = normalizeStringArray(question.choices) ?? (type === 'true_false' ? ['○', '×'] : null)

  return {
    id: cleanString(question.id) || crypto.randomUUID(),
    field: cleanString(question.field),
    unit: cleanString(question.unit),
    question: cleanString(question.question),
    type,
    choices,
    answer: cleanString(question.answer),
    accept_answers: normalizeStringArray(question.accept_answers),
    keywords: normalizeStringArray(question.keywords),
    explanation: cleanString(question.explanation) || null,
    image_url: cleanString(question.image_url) || null,
    image_display_width: typeof question.image_display_width === 'number' ? question.image_display_width : null,
    image_display_height: typeof question.image_display_height === 'number' ? question.image_display_height : null,
    match_pairs: normalizeMatchPairs(question.match_pairs),
    sort_items: normalizeStringArray(question.sort_items),
    correct_choices: normalizeStringArray(question.correct_choices),
    word_tokens: normalizeStringArray(question.word_tokens),
    distractor_tokens: normalizeStringArray(question.distractor_tokens),
    grade: cleanString(question.grade) || '中3',
  }
}

export function getQuestionCorrectAnswerText(question: Pick<QuestionShape, 'type' | 'answer' | 'match_pairs' | 'sort_items' | 'correct_choices' | 'word_tokens'>) {
  if (question.type === 'match') {
    return question.match_pairs?.map(pair => `${pair.left} → ${pair.right}`).join(' / ') || ''
  }

  if (question.type === 'sort') {
    return question.sort_items?.join(' → ') || ''
  }

  if (question.type === 'multi_select') {
    return question.correct_choices?.join(' / ') || ''
  }

  if (question.type === 'word_bank') {
    return question.answer || question.word_tokens?.join(' ') || ''
  }

  return question.answer
}

export function getQuestionStudentAnswerFallback(type: QuestionType) {
  if (type === 'match') return '未接続'
  if (type === 'sort') return '未並び替え'
  if (type === 'multi_select') return '未選択'
  if (type === 'word_bank') return '未組み立て'
  return '未入力'
}
