export const SCIENCE_CHAT_FIELDS = ['生物', '化学', '物理', '地学'] as const

export type ScienceChatField = typeof SCIENCE_CHAT_FIELDS[number]
export type ScienceChatRole = 'user' | 'assistant'
export type ScienceChatProvider = 'mock' | 'gemini'

export interface ScienceChatMessage {
  id: string
  role: ScienceChatRole
  text: string
  createdAt: string
}

export interface ScienceChatThread {
  id: string
  field: ScienceChatField
  title: string
  createdAt: string
  updatedAt: string
  messages: ScienceChatMessage[]
}

export interface ScienceChatApiReply {
  reply: string
  provider: ScienceChatProvider
  model: string
  warning?: string
}

export const SCIENCE_CHAT_STORAGE_KEY = 'rika_science_chat_threads_v1'
export const SCIENCE_CHAT_MAX_THREADS_PER_FIELD = 5
export const SCIENCE_CHAT_MAX_RALLIES_PER_THREAD = 50
export const SCIENCE_CHAT_GUEST_MAX_THREADS_PER_FIELD = 2
export const SCIENCE_CHAT_GUEST_MAX_RALLIES_PER_THREAD = 8

export function getScienceChatStorageKey(studentId: number | null) {
  return `${SCIENCE_CHAT_STORAGE_KEY}__${studentId ?? 'anon'}`
}

function trimLine(line: string) {
  return line.replace(/\s+/g, ' ').trim()
}

export function limitToThreeLines(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map(trimLine)
    .filter(Boolean)
    .slice(0, 3)

  return lines.join('\n').trim()
}

export function limitToFiveLines(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map(trimLine)
    .filter(Boolean)
    .slice(0, 5)

  return lines.join('\n').trim()
}

export function buildThreadTitle(input: string) {
  const singleLine = trimLine(input)
  if (!singleLine) return '新しいテーマ'
  return singleLine.length > 18 ? `${singleLine.slice(0, 18)}…` : singleLine
}

export function createThread(field: ScienceChatField): ScienceChatThread {
  const now = new Date().toISOString()
  const id = `chat-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`
  return {
    id,
    field,
    title: '新しいテーマ',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

export function sanitizeThreads(input: unknown): ScienceChatThread[] {
  if (!Array.isArray(input)) return []

  return input.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Partial<ScienceChatThread>
    if (!candidate.id || !candidate.field || !SCIENCE_CHAT_FIELDS.includes(candidate.field)) return []
    if (!Array.isArray(candidate.messages)) return []

    const messages = candidate.messages.flatMap(message => {
      if (!message || typeof message !== 'object') return []
      const current = message as Partial<ScienceChatMessage>
      if (!current.id || !current.createdAt || !current.text) return []
      if (current.role !== 'user' && current.role !== 'assistant') return []

      return [{
        id: current.id,
        role: current.role,
        text: String(current.text),
        createdAt: current.createdAt,
      }]
    })

    return [{
      id: candidate.id,
      field: candidate.field,
      title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim() : '新しいテーマ',
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
      updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
      messages,
    }]
  })
}

export function capThreadsPerField(
  threads: ScienceChatThread[],
  maxThreadsPerField = SCIENCE_CHAT_MAX_THREADS_PER_FIELD
) {
  const grouped = new Map<ScienceChatField, ScienceChatThread[]>()

  for (const thread of threads) {
    const current = grouped.get(thread.field) ?? []
    current.push(thread)
    grouped.set(thread.field, current)
  }

  return Array.from(grouped.values()).flatMap(group =>
    group
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .slice(0, maxThreadsPerField)
  )
}

export function countUserMessages(thread: ScienceChatThread) {
  return thread.messages.filter(message => message.role === 'user').length
}

export function makeMockScienceReply(field: ScienceChatField, prompt: string) {
  const title = buildThreadTitle(prompt).replace(/…$/, '')
  const lines = [
    `${field}の質問「${title}」ですね。`,
    '本番接続後は、ここで要点を3行以内でまとめて返します。',
    'いまはプレースホルダー応答です。',
  ]
  return lines.join('\n')
}

const MOCK_QUIZ_QUESTIONS: Record<ScienceChatField, string[]> = {
  '生物': [
    '【問題】光合成のしくみを60文字以内でまとめてみよう。',
    '【問題】細胞分裂の流れを80文字以内で説明してみよう。',
    '【問題】植物と動物の細胞の違いを50文字以内で説明してみよう。',
  ],
  '化学': [
    '【問題】酸化と還元の違いを60文字以内でまとめてみよう。',
    '【問題】イオンとは何かを50文字以内で説明してみよう。',
    '【問題】化学反応式のつくり方を80文字以内で説明してみよう。',
  ],
  '物理': [
    '【問題】オームの法則を50文字以内で説明してみよう。',
    '【問題】力のつり合いとは何かを60文字以内でまとめてみよう。',
    '【問題】光の屈折のしくみを60文字以内で説明してみよう。',
  ],
  '地学': [
    '【問題】地震のP波とS波の違いを60文字以内で説明してみよう。',
    '【問題】前線の種類と天気の変化を80文字以内でまとめてみよう。',
    '【問題】火成岩の分類を50文字以内で説明してみよう。',
  ],
}

export function makeMockQuizQuestion(field: ScienceChatField) {
  const questions = MOCK_QUIZ_QUESTIONS[field]
  return questions[Math.floor(Math.random() * questions.length)]
}

export function makeMockQuizEvaluation(field: ScienceChatField, _answer: string) {
  return [
    '【評価】おしい！方向性は合っています。',
    '【模範回答】' + MOCK_QUIZ_QUESTIONS[field][0].replace(/^【問題】/, '').replace(/を\d+文字以内で.*$/, 'とは、基本的なしくみのことです。'),
    '【ポイント】キーワードを含めるともっと良くなります。',
    '（プレースホルダー応答です）',
  ].join('\n')
}
