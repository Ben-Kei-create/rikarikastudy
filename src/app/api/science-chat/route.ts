import { NextRequest, NextResponse } from 'next/server'
import { detectScienceChatModeration } from '@/lib/chatModeration'
import {
  limitToFiveLines,
  limitToThreeLines,
  makeMockQuizEvaluation,
  makeMockQuizQuestion,
  makeMockScienceReply,
  SCIENCE_CHAT_FIELDS,
  ScienceChatApiReply,
  ScienceChatField,
  ScienceChatRole,
} from '@/lib/scienceChat'

type ChatMode = 'chat' | 'quiz-question' | 'quiz-evaluate'

interface RequestMessage {
  role: ScienceChatRole
  text: string
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

class GeminiRequestError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GeminiRequestError'
    this.status = status
  }
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const GEMINI_TIMEOUT_MS = 18000
const GEMINI_MAX_ATTEMPTS = 2

function getScienceChatApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

function getScienceChatMode(): 'live' | 'mock' {
  // Gemini API は使用しない（常にモック応答）
  return 'mock'
}

function isScienceField(value: string): value is ScienceChatField {
  return SCIENCE_CHAT_FIELDS.includes(value as ScienceChatField)
}

function buildSystemInstruction(field: ScienceChatField) {
  return [
    'あなたは中学生向け理科アシスタントです。',
    `対象分野は ${field} です。`,
    '日本語で、やさしく、断定しすぎずに答えてください。',
    '答えは最大3行で、長い箇条書きは使わず、要点だけ返してください。',
    '専門用語を使う時は短く言い換えてください。',
    '分からない場合は、分からないと短く伝えてください。',
  ].join('\n')
}

function buildQuizQuestionInstruction(field: ScienceChatField) {
  return [
    'あなたは中学生向け理科の先生です。',
    `対象分野は ${field} です。`,
    '生徒に1問だけ出題してください。',
    '「○○について△△文字以内でまとめてみよう」のように、短い記述で回答できる問題を出してください。',
    '問題の冒頭に【問題】をつけてください。',
    '問題だけを出し、答えは書かないでください。',
    '中学理科の範囲内で、基本的だけど説明が必要な内容にしてください。',
    '会話履歴がある場合は、まだ出していないトピックから出題してください。',
  ].join('\n')
}

function buildQuizEvaluateInstruction(field: ScienceChatField) {
  return [
    'あなたは中学生向け理科の先生です。',
    `対象分野は ${field} です。`,
    '生徒が問題に回答しました。以下のフォーマットで最大5行で評価してください：',
    '1行目: 【評価】よくできました / おしい！ / もう少し のいずれか + 短い一言コメント',
    '2行目: 【模範回答】正確で簡潔な模範回答',
    '3行目: 【ポイント】この問題で押さえるべき重要な点',
    '4行目: (必要なら) 補足説明や覚え方のコツ',
    '5行目: (必要なら) 関連する発展的な知識',
    '',
    'やさしく励ましつつ、正確な知識を伝えてください。',
    '生徒の回答が空や的外れでも、叱らず模範回答とポイントを教えてください。',
  ].join('\n')
}

function extractText(payload: GenerateContentResponse) {
  const text = payload.candidates
    ?.flatMap(candidate => candidate.content?.parts ?? [])
    .map(part => part.text ?? '')
    .join('\n')
    .trim()

  return text || ''
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  )
}

function isRetryableStatus(status?: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function getScienceChatFallbackWarning(error: unknown) {
  const status = error instanceof GeminiRequestError ? error.status : undefined

  if (status === 429 || status === 503) {
    return 'Gemini が混み合っていたため、今回は簡易応答に切り替えました。'
  }

  if (status === 504) {
    return 'Gemini の応答が遅かったため、今回は簡易応答に切り替えました。'
  }

  return 'Gemini への接続に失敗したため、今回は簡易応答に切り替えました。'
}

function getSystemInstructionForMode(field: ScienceChatField, chatMode: ChatMode) {
  if (chatMode === 'quiz-question') return buildQuizQuestionInstruction(field)
  if (chatMode === 'quiz-evaluate') return buildQuizEvaluateInstruction(field)
  return buildSystemInstruction(field)
}

function getMaxTokensForMode(chatMode: ChatMode) {
  if (chatMode === 'quiz-question') return 120
  if (chatMode === 'quiz-evaluate') return 300
  return 160
}

function postProcessReply(text: string, chatMode: ChatMode) {
  if (chatMode === 'quiz-evaluate') return limitToFiveLines(text)
  return limitToThreeLines(text)
}

async function requestGeminiReply({
  field,
  messages,
  chatMode = 'chat',
}: {
  field: ScienceChatField
  messages: RequestMessage[]
  chatMode?: ChatMode
}) {
  const apiKey = getScienceChatApiKey()
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    throw new GeminiRequestError('GEMINI_API_KEY または GOOGLE_API_KEY が未設定です。')
  }

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: getSystemInstructionForMode(field, chatMode) }],
            },
            contents: messages.map(message => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.text.trim() }],
            })),
            generationConfig: {
              temperature: chatMode === 'quiz-question' ? 0.8 : 0.4,
              maxOutputTokens: getMaxTokensForMode(chatMode),
            },
          }),
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        if (isRetryableStatus(response.status) && attempt < GEMINI_MAX_ATTEMPTS) {
          await delay(500 * attempt)
          continue
        }
        throw new GeminiRequestError(`Gemini API error: ${errorText}`, response.status)
      }

      const payload = await response.json() as GenerateContentResponse
      const reply = postProcessReply(extractText(payload), chatMode)
      if (!reply) {
        throw new GeminiRequestError('Gemini から応答を取得できませんでした。')
      }

      return reply
    } catch (error) {
      if (isAbortError(error)) {
        if (attempt < GEMINI_MAX_ATTEMPTS) {
          await delay(500 * attempt)
          continue
        }
        throw new GeminiRequestError('Gemini request timed out', 504)
      }

      if (error instanceof GeminiRequestError) {
        if (isRetryableStatus(error.status) && attempt < GEMINI_MAX_ATTEMPTS) {
          await delay(500 * attempt)
          continue
        }
        throw error
      }

      if (attempt < GEMINI_MAX_ATTEMPTS) {
        await delay(500 * attempt)
        continue
      }

      throw new GeminiRequestError(error instanceof Error ? error.message : 'Gemini request failed')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw new GeminiRequestError('Gemini request failed')
}

function getMockReply(field: ScienceChatField, chatMode: ChatMode, latestUserPrompt: string): string {
  if (chatMode === 'quiz-question') return makeMockQuizQuestion(field)
  if (chatMode === 'quiz-evaluate') return makeMockQuizEvaluation(field, latestUserPrompt)
  return makeMockScienceReply(field, latestUserPrompt)
}

export async function POST(request: NextRequest) {
  try {
    const mode = getScienceChatMode()
    const body = await request.json() as {
      field?: string
      messages?: RequestMessage[]
      chatMode?: ChatMode
    }

    if (!body.field || !isScienceField(body.field)) {
      return NextResponse.json({ error: 'field が不正です。' }, { status: 400 })
    }

    const chatMode: ChatMode = body.chatMode === 'quiz-question' || body.chatMode === 'quiz-evaluate'
      ? body.chatMode
      : 'chat'

    const messages = Array.isArray(body.messages)
      ? body.messages
          .filter(message => (
            message &&
            (message.role === 'user' || message.role === 'assistant') &&
            typeof message.text === 'string' &&
            message.text.trim()
          ))
          .slice(-12)
      : []

    if (chatMode === 'quiz-question' && messages.length === 0) {
      messages.push({ role: 'user', text: `${body.field}の問題を1つ出してください。` })
    }

    const latestUserPrompt = [...messages].reverse().find(message => message.role === 'user')?.text?.trim()
    if (!latestUserPrompt) {
      return NextResponse.json({ error: '質問文がありません。' }, { status: 400 })
    }

    if (chatMode === 'chat') {
      const moderation = detectScienceChatModeration(latestUserPrompt)
      if (moderation.blocked) {
        return NextResponse.json(
          { error: moderation.warningMessage, blocked: true },
          { status: 422 }
        )
      }
    }

    if (mode !== 'live') {
      const mockReply: ScienceChatApiReply = {
        reply: getMockReply(body.field, chatMode, latestUserPrompt),
        provider: 'mock',
        model: 'mock',
      }
      return NextResponse.json(mockReply)
    }

    try {
      const reply = await requestGeminiReply({
        field: body.field,
        messages,
        chatMode,
      })

      const apiReply: ScienceChatApiReply = {
        reply,
        provider: 'gemini',
        model: DEFAULT_MODEL,
      }

      return NextResponse.json(apiReply)
    } catch (error) {
      console.error('[science-chat] falling back to mock reply', error)

      const fallbackReply: ScienceChatApiReply = {
        reply: getMockReply(body.field, chatMode, latestUserPrompt),
        provider: 'mock',
        model: 'mock-fallback',
        warning: getScienceChatFallbackWarning(error),
      }

      return NextResponse.json(fallbackReply)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'science chat request failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
