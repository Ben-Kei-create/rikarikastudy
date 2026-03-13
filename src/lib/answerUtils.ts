const FULL_WIDTH_KANA_MAP: Record<string, string> = {
  '。': '｡',
  '、': '､',
  '・': '･',
  'ー': 'ｰ',
  '「': '｢',
  '」': '｣',
  'ァ': 'ｧ',
  'ィ': 'ｨ',
  'ゥ': 'ｩ',
  'ェ': 'ｪ',
  'ォ': 'ｫ',
  'ャ': 'ｬ',
  'ュ': 'ｭ',
  'ョ': 'ｮ',
  'ッ': 'ｯ',
  'ア': 'ｱ',
  'イ': 'ｲ',
  'ウ': 'ｳ',
  'エ': 'ｴ',
  'オ': 'ｵ',
  'カ': 'ｶ',
  'キ': 'ｷ',
  'ク': 'ｸ',
  'ケ': 'ｹ',
  'コ': 'ｺ',
  'サ': 'ｻ',
  'シ': 'ｼ',
  'ス': 'ｽ',
  'セ': 'ｾ',
  'ソ': 'ｿ',
  'タ': 'ﾀ',
  'チ': 'ﾁ',
  'ツ': 'ﾂ',
  'テ': 'ﾃ',
  'ト': 'ﾄ',
  'ナ': 'ﾅ',
  'ニ': 'ﾆ',
  'ヌ': 'ﾇ',
  'ネ': 'ﾈ',
  'ノ': 'ﾉ',
  'ハ': 'ﾊ',
  'ヒ': 'ﾋ',
  'フ': 'ﾌ',
  'ヘ': 'ﾍ',
  'ホ': 'ﾎ',
  'マ': 'ﾏ',
  'ミ': 'ﾐ',
  'ム': 'ﾑ',
  'メ': 'ﾒ',
  'モ': 'ﾓ',
  'ヤ': 'ﾔ',
  'ユ': 'ﾕ',
  'ヨ': 'ﾖ',
  'ラ': 'ﾗ',
  'リ': 'ﾘ',
  'ル': 'ﾙ',
  'レ': 'ﾚ',
  'ロ': 'ﾛ',
  'ワ': 'ﾜ',
  'ヲ': 'ｦ',
  'ン': 'ﾝ',
  'ガ': 'ｶﾞ',
  'ギ': 'ｷﾞ',
  'グ': 'ｸﾞ',
  'ゲ': 'ｹﾞ',
  'ゴ': 'ｺﾞ',
  'ザ': 'ｻﾞ',
  'ジ': 'ｼﾞ',
  'ズ': 'ｽﾞ',
  'ゼ': 'ｾﾞ',
  'ゾ': 'ｿﾞ',
  'ダ': 'ﾀﾞ',
  'ヂ': 'ﾁﾞ',
  'ヅ': 'ﾂﾞ',
  'デ': 'ﾃﾞ',
  'ド': 'ﾄﾞ',
  'バ': 'ﾊﾞ',
  'ビ': 'ﾋﾞ',
  'ブ': 'ﾌﾞ',
  'ベ': 'ﾍﾞ',
  'ボ': 'ﾎﾞ',
  'パ': 'ﾊﾟ',
  'ピ': 'ﾋﾟ',
  'プ': 'ﾌﾟ',
  'ペ': 'ﾍﾟ',
  'ポ': 'ﾎﾟ',
  'ヴ': 'ｳﾞ',
  'ヮ': 'ﾜ',
  'ヵ': 'ｶ',
  'ヶ': 'ｹ',
}

function toHalfWidthKana(input: string) {
  return Array.from(input).map(char => FULL_WIDTH_KANA_MAP[char] ?? char).join('')
}

export function normalizeAnswer(input: string) {
  return toHalfWidthKana(input.trim().normalize('NFKC')).toLowerCase()
}

export type TextAnswerResult = 'exact' | 'keyword' | 'incorrect'
export interface TextBlankPrompt {
  promptText: string
  target: string
  label: string
  helperText: string
  placeholder: string
  usesInlineBlank: boolean
}

const INLINE_BLANK = '＿＿＿＿'

function uniqueNormalizedStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeAnswer(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(value.trim())
  }

  return result
}

function getConfiguredTextKeywords(keywords?: string[] | null) {
  return uniqueNormalizedStrings((keywords ?? []).filter(Boolean))
}

function replaceFirstOccurrence(text: string, target: string, replacement: string) {
  const index = text.indexOf(target)
  if (index < 0) return text
  return `${text.slice(0, index)}${replacement}${text.slice(index + target.length)}`
}

function getTrailingFormulaPart(answer: string) {
  const arrowMatch = answer.match(/(?:→|->|⇒)\s*(.+)$/)
  if (arrowMatch?.[1]?.trim()) return arrowMatch[1].trim()

  const equalMatch = answer.match(/(?:=|＝)\s*(.+)$/)
  if (equalMatch?.[1]?.trim()) return equalMatch[1].trim()

  return ''
}

function deriveBlankTargetFromAnswer(answer: string) {
  const trimmedAnswer = answer.trim()
  if (!trimmedAnswer) return ''

  const formulaPart = getTrailingFormulaPart(trimmedAnswer)
  if (formulaPart && normalizeAnswer(formulaPart) !== normalizeAnswer(trimmedAnswer)) {
    return formulaPart
  }

  const chunks = trimmedAnswer.match(/[一-龠々]+|[ァ-ヶー]+|[A-Za-z0-9⁺⁻₊₋₀₁₂₃₄₅₆₇₈₉]+/gu) ?? []
  const shortChunk = [...chunks]
    .reverse()
    .find(chunk => chunk.length >= 2 && normalizeAnswer(chunk) !== normalizeAnswer(trimmedAnswer))

  if (shortChunk) return shortChunk
  return trimmedAnswer
}

function getPrimaryBlankTarget(correctAnswer: string, keywords?: string[] | null) {
  const configuredKeywords = getConfiguredTextKeywords(keywords)
  if (configuredKeywords.length > 0) {
    const matchingKeyword = configuredKeywords.find(keyword => correctAnswer.includes(keyword))
    return matchingKeyword ?? configuredKeywords[0]
  }
  return deriveBlankTargetFromAnswer(correctAnswer)
}

function getTextExactCandidates(
  correctAnswer: string,
  acceptAnswers?: string[] | null,
  keywords?: string[] | null
) {
  const candidates = uniqueNormalizedStrings([correctAnswer, ...(acceptAnswers ?? []), ...getConfiguredTextKeywords(keywords)])
  const blankTarget = getPrimaryBlankTarget(correctAnswer, keywords)
  const normalizedCorrectAnswer = normalizeAnswer(correctAnswer)

  if (blankTarget && normalizeAnswer(blankTarget) !== normalizedCorrectAnswer) {
    candidates.push(blankTarget)
  }

  return uniqueNormalizedStrings(candidates)
}

export function hasConfiguredTextKeywords(keywords?: string[] | null) {
  return getConfiguredTextKeywords(keywords).length > 0
}

export function buildTextBlankPrompt(
  correctAnswer: string,
  acceptAnswers?: string[] | null,
  keywords?: string[] | null
): TextBlankPrompt {
  const trimmedAnswer = correctAnswer.trim()
  const target = getPrimaryBlankTarget(trimmedAnswer, keywords)
  const normalizedAnswer = normalizeAnswer(trimmedAnswer)
  const normalizedTarget = normalizeAnswer(target)
  const configuredKeywords = getConfiguredTextKeywords(keywords)
  const usesConfiguredKeyword = configuredKeywords.length > 0
  const usesInlineBlank = Boolean(
    target
    && normalizedTarget
    && normalizedTarget !== normalizedAnswer
    && trimmedAnswer.includes(target)
  )

  let promptText = INLINE_BLANK
  if (usesInlineBlank) {
    promptText = replaceFirstOccurrence(trimmedAnswer, target, INLINE_BLANK)
  } else if (target && normalizedTarget !== normalizedAnswer && trimmedAnswer.length <= 8) {
    promptText = `${trimmedAnswer} = ${INLINE_BLANK}`
  }

  return {
    promptText,
    target: target || trimmedAnswer,
    label: usesInlineBlank ? '模範解答の穴埋め' : '答えに入る語句',
    helperText: usesConfiguredKeyword
      ? '空欄に入る理科用語だけを入力してください。文章全体は打たなくて大丈夫です。'
      : '空欄に入る語句や式だけを短く入力してください。',
    placeholder: usesConfiguredKeyword ? '空欄に入る理科用語' : '空欄に入る答え',
    usesInlineBlank,
  }
}

export function evaluateTextAnswer(
  studentAnswer: string,
  correctAnswer: string,
  acceptAnswers?: string[] | null,
  keywords?: string[] | null
): TextAnswerResult {
  const normalizedStudentAnswer = normalizeAnswer(studentAnswer)
  if (!normalizedStudentAnswer) return 'incorrect'

  const candidates = getTextExactCandidates(correctAnswer, acceptAnswers, keywords).map(normalizeAnswer)
  if (candidates.includes(normalizedStudentAnswer)) {
    return 'exact'
  }

  if (candidates.some(candidate => normalizedStudentAnswer.includes(candidate))) {
    return 'exact'
  }

  if (candidates.some(candidate => candidate.includes(normalizedStudentAnswer))) {
    return 'keyword'
  }

  return 'incorrect'
}

export function isAnswerMatch(
  studentAnswer: string,
  correctAnswer: string,
  acceptAnswers?: string[] | null,
  keywords?: string[] | null
) {
  return evaluateTextAnswer(studentAnswer, correctAnswer, acceptAnswers, keywords) === 'exact'
}
