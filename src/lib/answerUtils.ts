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

export function hasConfiguredTextKeywords(keywords?: string[] | null) {
  return (keywords ?? []).some(keyword => Boolean(normalizeAnswer(keyword)))
}

export function evaluateTextAnswer(
  studentAnswer: string,
  correctAnswer: string,
  acceptAnswers?: string[] | null,
  keywords?: string[] | null
): TextAnswerResult {
  const normalizedStudentAnswer = normalizeAnswer(studentAnswer)
  if (!normalizedStudentAnswer) return 'incorrect'

  const candidates = [correctAnswer, ...(acceptAnswers ?? [])].map(normalizeAnswer)
  if (candidates.includes(normalizedStudentAnswer)) {
    return 'exact'
  }

  const normalizedKeywords = (keywords ?? [])
    .map(normalizeAnswer)
    .filter(Boolean)

  if (normalizedKeywords.some(keyword => normalizedStudentAnswer === keyword || normalizedStudentAnswer.includes(keyword))) {
    return 'exact'
  }

  if (normalizedKeywords.some(keyword => keyword.includes(normalizedStudentAnswer))) {
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
