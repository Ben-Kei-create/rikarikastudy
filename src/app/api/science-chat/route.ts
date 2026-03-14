import { NextRequest, NextResponse } from 'next/server'
import { detectScienceChatModeration } from '@/lib/chatModeration'
import {
  limitToThreeLines,
  makeMockScienceReply,
  SCIENCE_CHAT_FIELDS,
  ScienceChatApiReply,
  ScienceChatField,
  ScienceChatRole,
} from '@/lib/scienceChat'

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
const GEMINI_TIMEOUT_MS = 12000
const GEMINI_MAX_ATTEMPTS = 2

function getScienceChatApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

function getScienceChatMode() {
  const configuredMode = process.env.SCIENCE_CHAT_MODE?.trim().toLowerCase()
  if (configuredMode === 'live' || configuredMode === 'mock') {
    return configuredMode
  }

  return getScienceChatApiKey() ? 'live' : 'mock'
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

async function requestGeminiReply({
  field,
  messages,
}: {
  field: ScienceChatField
  messages: RequestMessage[]
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
              parts: [{ text: buildSystemInstruction(field) }],
            },
            contents: messages.map(message => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.text.trim() }],
            })),
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 160,
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
      const reply = limitToThreeLines(extractText(payload))
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

export async function POST(request: NextRequest) {
  try {
    const mode = getScienceChatMode()
    const body = await request.json() as {
      field?: string
      messages?: RequestMessage[]
    }

    if (!body.field || !isScienceField(body.field)) {
      return NextResponse.json({ error: 'field が不正です。' }, { status: 400 })
    }

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

    const latestUserPrompt = [...messages].reverse().find(message => message.role === 'user')?.text?.trim()
    if (!latestUserPrompt) {
      return NextResponse.json({ error: '質問文がありません。' }, { status: 400 })
    }

    const moderation = detectScienceChatModeration(latestUserPrompt)
    if (moderation.blocked) {
      return NextResponse.json(
        { error: moderation.warningMessage, blocked: true },
        { status: 422 }
      )
    }

    if (mode !== 'live') {
      const mockReply: ScienceChatApiReply = {
        reply: makeMockScienceReply(body.field, latestUserPrompt),
        provider: 'mock',
        model: 'mock',
      }
      return NextResponse.json(mockReply)
    }

    try {
      const reply = await requestGeminiReply({
        field: body.field,
        messages,
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
        reply: makeMockScienceReply(body.field, latestUserPrompt),
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
