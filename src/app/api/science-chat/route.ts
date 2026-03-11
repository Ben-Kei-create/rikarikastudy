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

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const DEFAULT_MODE = process.env.SCIENCE_CHAT_MODE || 'mock'

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

export async function POST(request: NextRequest) {
  try {
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

    if (DEFAULT_MODE !== 'live') {
      const mockReply: ScienceChatApiReply = {
        reply: makeMockScienceReply(body.field, latestUserPrompt),
        provider: 'mock',
        model: DEFAULT_MODEL,
      }
      return NextResponse.json(mockReply)
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY が未設定です。' },
        { status: 500 }
      )
    }

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
            parts: [{ text: buildSystemInstruction(body.field) }],
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
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Gemini API error: ${errorText}` },
        { status: 502 }
      )
    }

    const payload = await response.json() as GenerateContentResponse
    const reply = limitToThreeLines(extractText(payload))

    if (!reply) {
      return NextResponse.json(
        { error: 'Gemini から応答を取得できませんでした。' },
        { status: 502 }
      )
    }

    const apiReply: ScienceChatApiReply = {
      reply,
      provider: 'gemini',
      model: DEFAULT_MODEL,
    }

    return NextResponse.json(apiReply)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'science chat request failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
