import { NextRequest, NextResponse } from 'next/server'
import { detectScienceChatModeration } from '@/lib/chatModeration'
import {
  ACTIVE_RECALL_PROMPT_TYPES,
  ACTIVE_RECALL_QUESTION_COUNT,
  type ActiveRecallCard,
  type ActiveRecallEvaluation,
  type ActiveRecallPromptType,
} from '@/lib/activeRecall'
import { supabase } from '@/lib/supabase'
import { SCIENCE_CHAT_FIELDS, type ScienceChatField } from '@/lib/scienceChat'

interface SourceQuestion {
  id: string
  unit: string
  question: string
  answer: string
  explanation: string | null
  keywords: string[] | null
  type: string
}

interface SourceQuestionRow {
  id: string
  unit: string
  question: string
  answer: string
  explanation: string | null
  keywords: string[] | null
  type: string
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

type RouteMode = 'live' | 'mock'

class GeminiRequestError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GeminiRequestError'
    this.status = status
  }
}

type StartRequestBody = {
  action: 'start'
  field?: string
  unit?: string
  studentId?: number | null
  count?: number
}

type EvaluateRequestBody = {
  action: 'evaluate'
  field?: string
  card?: ActiveRecallCard
  answer?: string
}

function isScienceField(value: string): value is ScienceChatField {
  return SCIENCE_CHAT_FIELDS.includes(value as ScienceChatField)
}

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const GEMINI_TIMEOUT_MS = 12000
const GEMINI_MAX_ATTEMPTS = 2

function getRouteMode(): RouteMode {
  const configuredMode = process.env.SCIENCE_CHAT_MODE?.trim().toLowerCase()
  if (configuredMode === 'live' || configuredMode === 'mock') return configuredMode
  return getApiKey() ? 'live' : 'mock'
}

function shuffleArray<T>(items: T[]) {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

function extractText(payload: GenerateContentResponse) {
  return payload.candidates
    ?.flatMap(candidate => candidate.content?.parts ?? [])
    .map(part => part.text ?? '')
    .join('\n')
    .trim() ?? ''
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

function getFallbackWarning(action: 'start' | 'evaluate', error: unknown) {
  const status = error instanceof GeminiRequestError ? error.status : undefined

  if (status === 429 || status === 503) {
    return action === 'start'
      ? 'Gemini が混み合っていたため、今回は簡易カード生成に切り替えました。'
      : 'Gemini が混み合っていたため、今回は簡易評価に切り替えました。'
  }

  if (status === 504) {
    return action === 'start'
      ? 'Gemini の応答が遅かったため、今回は簡易カード生成に切り替えました。'
      : 'Gemini の応答が遅かったため、今回は簡易評価に切り替えました。'
  }

  return action === 'start'
    ? 'Gemini への接続に失敗したため、今回は簡易カード生成に切り替えました。'
    : 'Gemini への接続に失敗したため、今回は簡易評価に切り替えました。'
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

function splitKeywords(source: SourceQuestion) {
  const fromKeywords = Array.isArray(source.keywords)
    ? source.keywords.map(item => String(item).trim()).filter(Boolean)
    : []

  if (fromKeywords.length > 0) return fromKeywords.slice(0, 3)

  const text = `${source.answer} ${source.explanation ?? ''}`
  return Array.from(
    new Set(
      text
        .split(/[、。・,\s]/)
        .map(item => item.trim())
        .filter(item => item.length >= 2 && item.length <= 10)
    )
  ).slice(0, 3)
}

function splitKeyPoints(source: SourceQuestion) {
  const base = `${source.explanation ?? ''}。${source.answer}`
  const parts = base
    .split(/[。]/)
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  if (parts.length > 0) return parts.slice(0, 3)
  return [source.answer]
}

function truncate(text: string, max = 120) {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= max) return singleLine
  return `${singleLine.slice(0, max)}…`
}

function buildPromptText(source: SourceQuestion, promptType: ActiveRecallPromptType) {
  if (promptType === 'term') {
    return `「${source.answer}」とは何か、中学生にも伝わるように短く説明してみよう。`
  }
  if (promptType === 'mechanism') {
    return `${source.question.replace(/[。？?！!]+$/, '')} に関係するしくみを、自分の言葉で説明してみよう。`
  }
  if (promptType === 'process') {
    return `${source.question.replace(/[。？?！!]+$/, '')} に関係する流れや手順を、順を追って説明してみよう。`
  }
  if (promptType === 'compare') {
    return `「${source.answer}」を、似ているものとの違いが伝わるように説明してみよう。`
  }

  return `${source.question.replace(/[。？?！!]+$/, '')} の理由や原因を説明してみよう。`
}

function buildMockCards(sources: SourceQuestion[]) {
  return sources.map((source, index) => {
    const promptType = ACTIVE_RECALL_PROMPT_TYPES[index % ACTIVE_RECALL_PROMPT_TYPES.length]
    const hintKeywords = splitKeywords(source)
    const keyPoints = splitKeyPoints(source)
    const modelAnswer = truncate(source.explanation?.trim() || `${source.answer}に関する要点を説明できる状態を目指そう。`, 110)

    return {
      id: `mock-${source.id}-${index}`,
      sourceQuestionId: source.id,
      unit: source.unit,
      promptType,
      prompt: truncate(buildPromptText(source, promptType), 140),
      cue: `${source.unit} / ${source.type}`,
      hintKeywords,
      keyPoints,
      modelAnswer,
      followUpPrompt: `では、「${source.answer}」が関係する別の場面も一言で言える？`,
    } satisfies ActiveRecallCard
  })
}

function normalizeCard(input: unknown): ActiveRecallCard | null {
  if (!input || typeof input !== 'object') return null
  const card = input as Partial<ActiveRecallCard>

  if (!card.id || !card.unit || !card.prompt || !card.promptType || !ACTIVE_RECALL_PROMPT_TYPES.includes(card.promptType)) {
    return null
  }

  return {
    id: String(card.id),
    sourceQuestionId: typeof card.sourceQuestionId === 'string' ? card.sourceQuestionId : null,
    unit: String(card.unit),
    promptType: card.promptType,
    prompt: String(card.prompt),
    cue: typeof card.cue === 'string' ? card.cue : '',
    hintKeywords: Array.isArray(card.hintKeywords) ? card.hintKeywords.map(item => String(item)).filter(Boolean).slice(0, 4) : [],
    keyPoints: Array.isArray(card.keyPoints) ? card.keyPoints.map(item => String(item)).filter(Boolean).slice(0, 4) : [],
    modelAnswer: typeof card.modelAnswer === 'string' ? card.modelAnswer : '',
    followUpPrompt: typeof card.followUpPrompt === 'string' ? card.followUpPrompt : null,
  }
}

function normalizeEvaluation(input: unknown, fallbackCard: ActiveRecallCard): ActiveRecallEvaluation | null {
  if (!input || typeof input !== 'object') return null
  const evaluation = input as Partial<ActiveRecallEvaluation>

  if (!evaluation.rating || !['strong', 'close', 'review'].includes(evaluation.rating)) {
    return null
  }

  return {
    rating: evaluation.rating as ActiveRecallEvaluation['rating'],
    strengths: Array.isArray(evaluation.strengths) ? evaluation.strengths.map(item => String(item)).filter(Boolean).slice(0, 2) : [],
    missingPoints: Array.isArray(evaluation.missingPoints) ? evaluation.missingPoints.map(item => String(item)).filter(Boolean).slice(0, 2) : [],
    coachReply: typeof evaluation.coachReply === 'string' ? truncate(evaluation.coachReply, 120) : '要点を短く思い出せるように、もう一度整理してみよう。',
    modelAnswer: typeof evaluation.modelAnswer === 'string' && evaluation.modelAnswer.trim()
      ? truncate(evaluation.modelAnswer, 120)
      : fallbackCard.modelAnswer,
    followUpPrompt: typeof evaluation.followUpPrompt === 'string'
      ? truncate(evaluation.followUpPrompt, 80)
      : fallbackCard.followUpPrompt,
  }
}

function buildMockEvaluation(card: ActiveRecallCard, answer: string): ActiveRecallEvaluation {
  const normalizedAnswer = answer.replace(/\s+/g, '').toLowerCase()
  const matched = card.keyPoints.filter(point => {
    const words = point
      .split(/[、。・,\s]/)
      .map(item => item.trim())
      .filter(item => item.length >= 2)
    return words.some(word => normalizedAnswer.includes(word.replace(/\s+/g, '').toLowerCase()))
  })

  const hintMatched = card.hintKeywords.filter(keyword => normalizedAnswer.includes(keyword.replace(/\s+/g, '').toLowerCase()))
  const matchedCount = new Set([...matched, ...hintMatched]).size

  let rating: ActiveRecallEvaluation['rating'] = 'review'
  if (matchedCount >= Math.max(2, Math.min(3, card.keyPoints.length))) {
    rating = 'strong'
  } else if (matchedCount >= 1 || normalizedAnswer.includes(card.modelAnswer.slice(0, 4).replace(/\s+/g, '').toLowerCase())) {
    rating = 'close'
  }

  return {
    rating,
    strengths: matched.slice(0, 2),
    missingPoints: card.keyPoints.filter(point => !matched.includes(point)).slice(0, 2),
    coachReply:
      rating === 'strong'
        ? '要点を自分の言葉で思い出せています。次は理由や流れも一言足せるとさらに強いです。'
        : rating === 'close'
          ? '方向は合っています。あと1つか2つ、決め手になる語句を足すと説明が完成します。'
          : 'まだ要点が抜けています。キーワードを見て、何がどうなる話かを短く言い直してみよう。',
    modelAnswer: card.modelAnswer,
    followUpPrompt: card.followUpPrompt,
  }
}

async function fetchSourceQuestions(field: ScienceChatField, unit: string, studentId: number | null | undefined, count: number) {
  let query = supabase
    .from('questions')
    .select('id, unit, question, answer, explanation, keywords, type, created_by_student_id')
    .eq('field', field)

  if (unit !== 'all') {
    query = query.eq('unit', unit)
  }

  if (typeof studentId === 'number') {
    query = query.or(`created_by_student_id.is.null,created_by_student_id.eq.${studentId}`)
  } else {
    query = query.is('created_by_student_id', null)
  }

  let { data, error } = await query
  let rows: SourceQuestionRow[] = (data || []).map(item => ({
    id: String(item.id),
    unit: String(item.unit),
    question: String(item.question),
    answer: String(item.answer),
    explanation: typeof item.explanation === 'string' ? item.explanation : null,
    keywords: Array.isArray(item.keywords) ? item.keywords.map(keyword => String(keyword)) : null,
    type: String(item.type),
  }))

  if (error && String(error.message || '').includes('created_by_student_id')) {
    const fallback = await supabase
      .from('questions')
      .select('id, unit, question, answer, explanation, keywords, type')
      .eq('field', field)

    rows = ((unit !== 'all'
      ? (fallback.data || []).filter(item => item.unit === unit)
      : (fallback.data || [])) as SourceQuestionRow[])
    error = fallback.error
  }

  if (error) {
    throw new Error(error.message)
  }

  const filtered = rows
    .filter(item => typeof item.question === 'string' && typeof item.answer === 'string')
    .map(item => ({
      id: item.id,
      unit: item.unit,
      question: item.question,
      answer: item.answer,
      explanation: item.explanation,
      keywords: item.keywords,
      type: item.type,
    } satisfies SourceQuestion))

  return shuffleArray(filtered).slice(0, Math.max(1, Math.min(count, filtered.length)))
}

function buildStartInstruction(field: ScienceChatField) {
  return [
    'あなたは中学生向け理科アプリのアクティブリコール問題作成者です。',
    `対象分野は ${field} です。`,
    '与えられた教材メモだけを使って、思い出して説明する短答式の問題カードを作ってください。',
    '問題はやさしい日本語で、ひっかけ禁止です。',
    '出力はJSONのみです。',
    '各カードには promptType, prompt, cue, hintKeywords, keyPoints, modelAnswer, followUpPrompt を含めてください。',
    'promptType は term / mechanism / process / compare / cause のいずれかです。',
    'hintKeywords は2-3個、keyPoints は2-3個、modelAnswer は2文以内、followUpPrompt は1文にしてください。',
    'answerの丸写しを促す問題にしすぎず、自分の言葉で説明したくなる形にしてください。',
  ].join('\n')
}

function buildEvaluateInstruction(field: ScienceChatField) {
  return [
    'あなたは中学生向け理科アプリの採点コーチです。',
    `対象分野は ${field} です。`,
    '生徒の短文回答を、厳密な完全一致ではなく内容理解で判定してください。',
    '言い換えや軽い表記ゆれ、軽微なタイポでは不正解にしないでください。',
    '評価は strong / close / review の3段階です。',
    'strong は要点が十分、close は方向は合っているが不足あり、review は要点不足です。',
    'strengths と missingPoints はそれぞれ最大2項目にしてください。',
    'coachReply は2-3文以内、modelAnswer は2文以内で返してください。',
    '出力はJSONのみです。',
  ].join('\n')
}

async function requestGeminiJson<T>({
  systemInstruction,
  userText,
}: {
  systemInstruction: string
  userText: string
}) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY または GOOGLE_API_KEY が未設定です。')
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
              parts: [{ text: systemInstruction }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userText }],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 900,
              responseMimeType: 'application/json',
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
      const text = extractText(payload)
      const parsed = parseJsonText<T>(text)
      if (!parsed) {
        throw new GeminiRequestError('Gemini の JSON 応答を解析できませんでした。')
      }

      return parsed
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

async function buildLiveCards(field: ScienceChatField, sources: SourceQuestion[]) {
  const payload = await requestGeminiJson<{ cards?: Array<Partial<ActiveRecallCard>> }>({
    systemInstruction: buildStartInstruction(field),
    userText: JSON.stringify({
      cardsNeeded: sources.length,
      sources: sources.map(source => ({
        sourceQuestionId: source.id,
        unit: source.unit,
        question: source.question,
        answer: source.answer,
        explanation: source.explanation,
        keywords: source.keywords,
      })),
    }),
  })

  const cards = (payload.cards || [])
    .map((card, index) => {
      const source = sources[index] ?? sources[0]
      return normalizeCard({
        id: card.id || `gemini-${source.id}-${index}`,
        sourceQuestionId: card.sourceQuestionId || source.id,
        unit: card.unit || source.unit,
        promptType: card.promptType || ACTIVE_RECALL_PROMPT_TYPES[index % ACTIVE_RECALL_PROMPT_TYPES.length],
        prompt: card.prompt || buildPromptText(source, ACTIVE_RECALL_PROMPT_TYPES[index % ACTIVE_RECALL_PROMPT_TYPES.length]),
        cue: card.cue || `${source.unit} / ${source.type}`,
        hintKeywords: card.hintKeywords || splitKeywords(source),
        keyPoints: card.keyPoints || splitKeyPoints(source),
        modelAnswer: card.modelAnswer || truncate(source.explanation || source.answer, 110),
        followUpPrompt: card.followUpPrompt || `では、${source.answer}が関係する別の場面も言える？`,
      })
    })
    .filter((card): card is ActiveRecallCard => card !== null)

  return cards.slice(0, sources.length)
}

async function buildLiveEvaluation(field: ScienceChatField, card: ActiveRecallCard, answer: string) {
  const payload = await requestGeminiJson<Partial<ActiveRecallEvaluation>>({
    systemInstruction: buildEvaluateInstruction(field),
    userText: JSON.stringify({
      card,
      studentAnswer: answer,
    }),
  })

  return normalizeEvaluation(payload, card)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as StartRequestBody | EvaluateRequestBody
    const mode = getRouteMode()

    if (body.action === 'start') {
      if (!body.field || !isScienceField(body.field)) {
        return NextResponse.json({ error: 'field が不正です。' }, { status: 400 })
      }

      const requestedCount = Math.max(1, Math.min(ACTIVE_RECALL_QUESTION_COUNT, Number(body.count) || ACTIVE_RECALL_QUESTION_COUNT))
      const requestedUnit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : 'all'
      const sources = await fetchSourceQuestions(body.field, requestedUnit, body.studentId, requestedCount)

      if (sources.length === 0) {
        return NextResponse.json({ error: 'この条件ではアクティブリコール用の問題を作れませんでした。' }, { status: 404 })
      }

      let provider: 'mock' | 'gemini' = 'mock'
      let model = mode === 'live' ? 'mock-fallback' : 'mock'
      let warning: string | undefined

      const cards = mode === 'live'
        ? await buildLiveCards(body.field, sources)
            .then(result => {
              provider = 'gemini'
              model = DEFAULT_MODEL
              return result
            })
            .catch(error => {
              console.error('[active-recall] falling back to mock cards', error)
              warning = getFallbackWarning('start', error)
              return buildMockCards(sources)
            })
        : buildMockCards(sources)

      return NextResponse.json({
        provider,
        model,
        cards,
        ...(warning ? { warning } : {}),
      })
    }

    if (body.action === 'evaluate') {
      if (!body.field || !isScienceField(body.field)) {
        return NextResponse.json({ error: 'field が不正です。' }, { status: 400 })
      }

      const card = normalizeCard(body.card)
      if (!card) {
        return NextResponse.json({ error: 'card が不正です。' }, { status: 400 })
      }

      const answer = typeof body.answer === 'string' ? body.answer.trim() : ''
      if (!answer) {
        return NextResponse.json({ error: '回答がありません。' }, { status: 400 })
      }

      const moderation = detectScienceChatModeration(answer)
      if (moderation.blocked) {
        return NextResponse.json(
          { error: moderation.warningMessage, blocked: true },
          { status: 422 },
        )
      }

      let provider: 'mock' | 'gemini' = 'mock'
      let model = mode === 'live' ? 'mock-fallback' : 'mock'
      let warning: string | undefined

      const evaluation = mode === 'live'
        ? await buildLiveEvaluation(body.field, card, answer)
            .then(result => {
              provider = 'gemini'
              model = DEFAULT_MODEL
              return result
            })
            .catch(error => {
              console.error('[active-recall] falling back to mock evaluation', error)
              warning = getFallbackWarning('evaluate', error)
              return buildMockEvaluation(card, answer)
            })
        : buildMockEvaluation(card, answer)

      return NextResponse.json({
        provider,
        model,
        evaluation,
        ...(warning ? { warning } : {}),
      })
    }

    return NextResponse.json({ error: 'action が不正です。' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'active recall request failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
