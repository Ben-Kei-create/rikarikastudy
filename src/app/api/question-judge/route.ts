import { NextRequest, NextResponse } from 'next/server'
import { evaluateTextAnswer, type TextAnswerResult } from '@/lib/answerUtils'

interface JudgeRequestBody {
  field?: string
  unit?: string
  question?: string
  correctAnswer?: string
  acceptAnswers?: string[] | null
  keywords?: string[] | null
  explanation?: string | null
  studentAnswer?: string
}

interface GeminiJudgeResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

interface SemanticJudgePayload {
  semanticCorrect?: boolean
  reason?: string
}

type JudgeSource = 'local' | 'gemini' | 'fallback'

class GeminiJudgeError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GeminiJudgeError'
    this.status = status
  }
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const GEMINI_TIMEOUT_MS = 9000
const GEMINI_MAX_ATTEMPTS = 2

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

function getJudgeMode() {
  const configuredMode = process.env.SCIENCE_CHAT_MODE?.trim().toLowerCase()
  if (configuredMode === 'live' || configuredMode === 'mock') return configuredMode
  return getApiKey() ? 'live' : 'mock'
}

function extractText(payload: GeminiJudgeResponse) {
  return payload.candidates
    ?.flatMap(candidate => candidate.content?.parts ?? [])
    .map(part => part.text ?? '')
    .join('\n')
    .trim() ?? ''
}

function parseJsonText<T>(text: string): T | null {
  if (!text.trim()) return null

  try {
    return JSON.parse(text) as T
  } catch {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1]
      ?? text.match(/```([\s\S]*?)```/i)?.[1]

    if (fenced) {
      try {
        return JSON.parse(fenced) as T
      } catch {
        return null
      }
    }

    const objectStart = text.indexOf('{')
    const objectEnd = text.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(text.slice(objectStart, objectEnd + 1)) as T
      } catch {
        return null
      }
    }

    return null
  }
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

function getFallbackWarning(error: unknown) {
  const status = error instanceof GeminiJudgeError ? error.status : undefined

  if (status === 429 || status === 503) {
    return 'Gemini が混み合っていたため、今回は通常の記述判定に切り替えました。'
  }

  if (status === 504) {
    return 'Gemini の応答が遅かったため、今回は通常の記述判定に切り替えました。'
  }

  return 'Gemini の意味判定が使えなかったため、今回は通常の記述判定に切り替えました。'
}

function buildSystemInstruction() {
  return [
    'あなたは中学生向け理科アプリの記述問題採点補助です。',
    '役割は、完全一致では不正解になるが、意味としては正しい短文回答を救うことです。',
    'ただし、科学的に誤っている回答や、核心が抜けている回答を正解にしてはいけません。',
    '言い換え、軽い表記ゆれ、軽微な typo、中学生らしい短い言い方は許容してください。',
    '「一部だけ合っている」「重要語が足りない」「意味が逆」は不正解にしてください。',
    '出力は JSON のみで、semanticCorrect と reason を返してください。',
    'reason は日本語で1文、短く書いてください。',
  ].join('\n')
}

async function requestSemanticJudge(body: JudgeRequestBody) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new GeminiJudgeError('GEMINI_API_KEY または GOOGLE_API_KEY が未設定です。')
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
              parts: [{ text: buildSystemInstruction() }],
            },
            contents: [
              {
                role: 'user',
                parts: [{
                  text: JSON.stringify({
                    field: body.field,
                    unit: body.unit,
                    question: body.question,
                    correctAnswer: body.correctAnswer,
                    acceptAnswers: body.acceptAnswers ?? [],
                    keywords: body.keywords ?? [],
                    explanation: body.explanation ?? '',
                    studentAnswer: body.studentAnswer,
                  }),
                }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 160,
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        if (isRetryableStatus(response.status) && attempt < GEMINI_MAX_ATTEMPTS) {
          await delay(400 * attempt)
          continue
        }
        throw new GeminiJudgeError(`Gemini API error: ${errorText}`, response.status)
      }

      const payload = await response.json() as GeminiJudgeResponse
      const text = extractText(payload)
      const parsed = parseJsonText<SemanticJudgePayload>(text)
      if (!parsed || typeof parsed.semanticCorrect !== 'boolean') {
        throw new GeminiJudgeError('Gemini の意味判定応答を解析できませんでした。')
      }

      return {
        semanticCorrect: parsed.semanticCorrect,
        reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : '',
      }
    } catch (error) {
      if (isAbortError(error)) {
        if (attempt < GEMINI_MAX_ATTEMPTS) {
          await delay(400 * attempt)
          continue
        }
        throw new GeminiJudgeError('Gemini request timed out', 504)
      }

      if (error instanceof GeminiJudgeError) {
        if (isRetryableStatus(error.status) && attempt < GEMINI_MAX_ATTEMPTS) {
          await delay(400 * attempt)
          continue
        }
        throw error
      }

      if (attempt < GEMINI_MAX_ATTEMPTS) {
        await delay(400 * attempt)
        continue
      }

      throw new GeminiJudgeError(error instanceof Error ? error.message : 'Gemini request failed')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw new GeminiJudgeError('Gemini request failed')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as JudgeRequestBody
    const studentAnswer = typeof body.studentAnswer === 'string' ? body.studentAnswer.trim() : ''
    const correctAnswer = typeof body.correctAnswer === 'string' ? body.correctAnswer.trim() : ''
    const question = typeof body.question === 'string' ? body.question.trim() : ''

    if (!studentAnswer || !correctAnswer || !question) {
      return NextResponse.json({ error: '判定に必要な値が足りません。' }, { status: 400 })
    }

    const localResult = evaluateTextAnswer(
      studentAnswer,
      correctAnswer,
      Array.isArray(body.acceptAnswers) ? body.acceptAnswers : null,
      Array.isArray(body.keywords) ? body.keywords : null,
    )

    if (localResult === 'exact') {
      return NextResponse.json({
        result: localResult satisfies TextAnswerResult,
        judgeSource: 'local' satisfies JudgeSource,
        model: 'local',
      })
    }

    if (getJudgeMode() !== 'live') {
      return NextResponse.json({
        result: localResult satisfies TextAnswerResult,
        judgeSource: 'local' satisfies JudgeSource,
        model: 'local',
      })
    }

    try {
      const semantic = await requestSemanticJudge(body)
      return NextResponse.json({
        result: (semantic.semanticCorrect ? 'semantic' : localResult) satisfies TextAnswerResult,
        judgeSource: 'gemini' satisfies JudgeSource,
        model: DEFAULT_MODEL,
        reason: semantic.reason,
      })
    } catch (error) {
      console.error('[question-judge] falling back to local judge', error)

      return NextResponse.json({
        result: localResult satisfies TextAnswerResult,
        judgeSource: 'fallback' satisfies JudgeSource,
        model: 'local-fallback',
        warning: getFallbackWarning(error),
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'question judge request failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
