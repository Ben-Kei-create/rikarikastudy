/**
 * Utility types, constants, and pure functions extracted from AdminPage.
 * These are used by AdminPage and its tab sub-components.
 */

import { Database, supabase } from '@/lib/supabase'
import { FIELDS } from '@/lib/constants'
import { DEFAULT_STUDENTS } from '@/lib/auth'
import { getLevelTitle } from '@/lib/engagement'
import { BADGE_DEFINITIONS } from '@/lib/badges'
import { buildGlossaryEntryId, ScienceGlossaryField } from '@/lib/scienceGlossary'
import {
  MatchPair,
  QuestionType,
  QUESTION_TYPES,
  normalizeMatchPairs,
  normalizeStringArray,
} from '@/lib/questionTypes'
import {
  LoginUpdateRow,
} from '@/lib/loginUpdates'
import {
  QuestionInquiryRow,
} from '@/lib/questionInquiry'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ADMIN_PW = 'rikaadmin2026'
export const BULK_INSERT_CHUNK_SIZE = 100
export const QUESTION_LIST_PAGE_SIZE = 20
export const QUESTION_LIST_PAGE_WINDOW = 2

export const BULK_JSON_EXAMPLE = `[
  {
    "field": "生物",
    "unit": "植物のつくり",
    "question": "光合成を主に行う部分はどこ？",
    "type": "choice4",
    "choices": ["葉", "根", "茎", "花"],
    "answer": "葉",
    "explanation": "葉の葉緑体で光合成を行います。",
    "grade": "中1"
  },
  {
    "field": "化学",
    "unit": "原子と分子",
    "question": "次のうち、有機物をすべて選びなさい。",
    "type": "multi_select",
    "choices": ["デンプン", "食塩", "エタノール", "水"],
    "correct_choices": ["デンプン", "エタノール"],
    "answer": null,
    "explanation": "有機物は炭素をふくみ、燃えると二酸化炭素と水ができます。",
    "grade": "中2"
  }
]`

export const GLOSSARY_BULK_JSON_EXAMPLE = `[
  {
    "field": "生物",
    "term": "蒸散",
    "reading": "じょうさん",
    "shortDescription": "植物の葉から水分が水蒸気として出ていくこと。",
    "description": "蒸散は、植物の葉の気孔などから水分が水蒸気として外へ出ていく現象です。根から水を吸い上げるはたらきにも関係します。",
    "related": ["気孔", "道管", "葉"],
    "tags": ["植物", "水の移動", "葉"]
  },
  {
    "field": "地学",
    "term": "露点",
    "reading": "ろてん",
    "shortDescription": "空気中の水蒸気が水滴になり始める温度。",
    "description": "露点は、空気を冷やした時に水蒸気が水滴になり始める温度です。湿度や雲のでき方を考える時の手がかりになります。",
    "related": ["湿度", "水蒸気", "雲"],
    "tags": ["天気", "気体", "観測"]
  }
]`

export const XP_RULES = [
  '基本XP: 正解数 × 10',
  'スピードボーナス: max(0, 300 - 解答秒数) / 3 を四捨五入',
  '全問正解ボーナス: +50 XP',
  '今日のチャレンジ: 獲得XPが 2倍',
  'タイムアタック: スコア × 5 XP',
  'テストモード: 正解数 × 4 XP',
  '連続正解モード: 連続数 × 6 XP',
] as const

export const LEVEL_GUIDE = [1, 5, 10, 20, 35, 50, 75, 99].map(level => ({
  level,
  title: getLevelTitle(level),
}))

export const BADGE_CONDITION_GUIDE: Record<string, string> = {
  first_quiz: 'クイズを1セット完了する',
  streak_3: '3日連続で学習する',
  bio_debut: '生物を初めて解く',
  chem_debut: '化学を初めて解く',
  phys_debut: '物理を初めて解く',
  earth_debut: '地学を初めて解く',
  total_30: '累計30問以上に挑戦する',
  bio_50: '生物を50問以上解く',
  chem_50: '化学を50問以上解く',
  phys_50: '物理を50問以上解く',
  earth_50: '地学を50問以上解く',
  perfect_score: '1回の学習で全問正解する',
  streak_7: '7日連続で学習する',
  total_100: '累計100問以上に挑戦する',
  speed_star: 'タイムアタック以外で60秒未満クリア',
  daily_perfect: '今日のチャレンジを全問正解する',
  level_10: 'レベル10に到達する',
  daily_3: 'デイリーチャレンジを3回全問正解する',
  time_attack_10: 'タイムアタックで10点以上を取る',
  streak_mode_5: '連続正解モードで5問連続正解する',
  test_80: 'テストモードで80点以上を取る',
  lab_explorer: '4種類以上のラボや特別モードを遊ぶ',
  streak_14: '14日連続で学習する',
  total_300: '累計300問以上に挑戦する',
  level_20: 'レベル20に到達する',
  streak_30: '30日連続で学習する',
  all_fields_day: '1日のうちに4分野すべて解く',
  total_1000: '累計1000問以上に挑戦する',
  level_50: 'レベル50に到達する',
  level_75: 'レベル75に到達する',
}

export const BADGE_RARITY_STYLES = {
  common: {
    label: 'COMMON',
    borderColor: 'rgba(56, 189, 248, 0.22)',
    background: 'rgba(56, 189, 248, 0.06)',
    textColor: '#bae6fd',
  },
  rare: {
    label: 'RARE',
    borderColor: 'rgba(245, 158, 11, 0.22)',
    background: 'rgba(245, 158, 11, 0.08)',
    textColor: '#fde68a',
  },
  legendary: {
    label: 'LEGEND',
    borderColor: 'rgba(168, 85, 247, 0.24)',
    background: 'rgba(168, 85, 247, 0.08)',
    textColor: '#ddd6fe',
  },
} as const

// ---------------------------------------------------------------------------
// Type aliases (from Supabase schema)
// ---------------------------------------------------------------------------

export type QuizSessionRow = Database['public']['Tables']['quiz_sessions']['Row']
export type AnswerLogRow = Database['public']['Tables']['answer_logs']['Row']
export type QuestionRow = Database['public']['Tables']['questions']['Row']
export type ChatGuardLogRow = Database['public']['Tables']['chat_guard_logs']['Row']
export type DailyChallengeRow = Database['public']['Tables']['daily_challenges']['Row']
export type BadgeRow = Database['public']['Tables']['badges']['Row']
export type StudentBadgeRow = Database['public']['Tables']['student_badges']['Row']
export type TimeAttackRecordRow = Database['public']['Tables']['time_attack_records']['Row']
export type StudentInsert = Database['public']['Tables']['students']['Insert']
export type GlossaryRow = Database['public']['Tables']['science_glossary_entries']['Row']
export type GlossaryInsert = Database['public']['Tables']['science_glossary_entries']['Insert']
export type QuestionAccuracyAnswerLogRow = Pick<AnswerLogRow, 'question_id' | 'student_id' | 'is_correct' | 'created_at'>
export type AdminStudentDetailAnswerLogRow = Pick<AnswerLogRow, 'question_id' | 'is_correct' | 'created_at'> & {
  questions: Pick<QuestionRow, 'unit' | 'field'> | null
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface StudentStats {
  id: number
  nickname: string
  password: string
  totalQ: number
  totalC: number
  lastActivity: string | null
  byField: Record<string, { total: number; correct: number }>
}

export interface ActiveStudentStatus {
  id: number
  nickname: string
  lastSeenAt: string
  sessionCount: number
}

export interface AdminStudentDetailData {
  sessions: QuizSessionRow[]
  answerLogs: AdminStudentDetailAnswerLogRow[]
  studentBadges: StudentBadgeRow[]
}

export interface QuestionAccuracySummary {
  participantCount: number
  correctCount: number
  accuracyRate: number
}

export interface BulkQuestionPayload {
  field: typeof FIELDS[number]
  unit: string
  question: string
  type: QuestionType
  choices: string[] | null
  answer: string
  keywords: string[] | null
  match_pairs: MatchPair[] | null
  sort_items: string[] | null
  correct_choices: string[] | null
  word_tokens: string[] | null
  distractor_tokens: string[] | null
  column_title: string | null
  column_body: string | null
  explanation: string | null
  grade: string
}

export interface BulkGlossaryPayload {
  id: string
  term: string
  reading: string
  field: ScienceGlossaryField
  short_description: string
  description: string
  related: string[]
  tags: string[]
}

export type AdminTab = 'overview' | 'inquiries' | 'questions' | 'add' | 'bulk'

export interface RestoreSnapshot {
  format: string
  students: StudentInsert[]
  questions: QuestionRow[]
  loginUpdates: LoginUpdateRow[]
  glossaryEntries: GlossaryRow[]
  questionInquiries: QuestionInquiryRow[]
  quizSessions: QuizSessionRow[]
  answerLogs: AnswerLogRow[]
  chatGuardLogs: ChatGuardLogRow[]
  dailyChallenges: DailyChallengeRow[]
  badges: BadgeRow[]
  studentBadges: StudentBadgeRow[]
  timeAttackRecords: TimeAttackRecordRow[]
  hasChatGuardLogs: boolean
  hasEngagementTables: boolean
  hasGlossaryEntries: boolean
  hasLoginUpdates: boolean
  hasQuestionInquiries: boolean
  defaultPasswordCount: number
}

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

export function buildBinaryChoices(choices: string[] | null, answer: string, seed: string) {
  if (!choices || choices.length === 0) return null

  const correct = choices.find(choice => choice === answer) ?? answer
  const distractor = choices.find(choice => choice !== answer)
  if (!distractor) return [correct]

  return seed.length % 2 === 0 ? [correct, distractor] : [distractor, correct]
}

export function buildStudentStats(
  students: Array<{ id: number; nickname: string; password: string; student_xp: number }>,
  sessions: QuizSessionRow[]
) {
  const statsMap: Record<number, StudentStats> = {}

  students.forEach(student => {
    statsMap[student.id] = {
      id: student.id,
      nickname: student.nickname,
      password: student.password,
      totalQ: 0,
      totalC: 0,
      lastActivity: null,
      byField: {},
    }
  })

  sessions.forEach(session => {
    const current = statsMap[session.student_id]
    if (!current) return
    current.totalQ += session.total_questions
    current.totalC += session.correct_count
    if (!current.lastActivity || session.created_at > current.lastActivity) {
      current.lastActivity = session.created_at
    }
    if (!current.byField[session.field]) current.byField[session.field] = { total: 0, correct: 0 }
    current.byField[session.field].total += session.total_questions
    current.byField[session.field].correct += session.correct_count
  })

  return Object.values(statsMap)
}

export function buildQuestionAccuracyMap(answerLogs: QuestionAccuracyAnswerLogRow[]) {
  const perQuestion = new Map<string, Map<number, boolean>>()
  const sortedLogs = [...answerLogs].sort((a, b) => a.created_at.localeCompare(b.created_at))

  sortedLogs.forEach(log => {
    if (!perQuestion.has(log.question_id)) {
      perQuestion.set(log.question_id, new Map<number, boolean>())
    }
    const studentFirstAnswers = perQuestion.get(log.question_id)
    if (!studentFirstAnswers || studentFirstAnswers.has(log.student_id)) return
    studentFirstAnswers.set(log.student_id, log.is_correct)
  })

  const result: Record<string, QuestionAccuracySummary> = {}
  perQuestion.forEach((studentFirstAnswers, questionId) => {
    const participantCount = studentFirstAnswers.size
    if (participantCount === 0) return

    let correctCount = 0
    studentFirstAnswers.forEach(isCorrect => {
      if (isCorrect) correctCount += 1
    })

    result[questionId] = {
      participantCount,
      correctCount,
      accuracyRate: Math.round((correctCount / participantCount) * 100),
    }
  })

  return result
}

export function parseKeywordsArray(value: unknown) {
  if (!Array.isArray(value)) return null

  const keywords = value
    .map(keyword => (typeof keyword === 'string' ? keyword.trim() : ''))
    .filter(Boolean)

  return keywords.length > 0 ? keywords : null
}

export function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Bulk JSON parsers
// ---------------------------------------------------------------------------

export function parseBulkQuestions(jsonText: string): BulkQuestionPayload[] {
  const parsed = JSON.parse(jsonText)
  const items: unknown[] | null = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
      ? parsed.questions
      : null

  if (!items || items.length === 0) {
    throw new Error('JSON は配列、または {"questions":[...]} の形で入力してください。')
  }

  return items.map((item, index) => {
    const row = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {}
    const prefix = `${index + 1}問目`
    const field = typeof row.field === 'string' ? row.field.trim() : ''
    const unit = typeof row.unit === 'string' ? row.unit.trim() : ''
    const question = typeof row.question === 'string' ? row.question.trim() : ''
    const type = typeof row.type === 'string' ? row.type.trim() as QuestionType : null
    const answer = typeof row.answer === 'string' ? row.answer.trim() : ''
    const explanation = typeof row.explanation === 'string' && row.explanation.trim()
      ? row.explanation.trim()
      : null
    const grade = typeof row.grade === 'string' && row.grade.trim()
      ? row.grade.trim()
      : '中3'
    const keywords = normalizeStringArray(row.keywords)
    const choices = normalizeStringArray(row.choices)
    const matchPairs = normalizeMatchPairs(row.match_pairs)
    const sortItems = normalizeStringArray(row.sort_items)
    const correctChoices = normalizeStringArray(row.correct_choices)
    const wordTokens = normalizeStringArray(row.word_tokens)
    const distractorTokens = normalizeStringArray(row.distractor_tokens)
    const columnTitle = typeof row.column_title === 'string' && row.column_title.trim()
      ? row.column_title.trim()
      : null
    const columnBody = typeof row.column_body === 'string' && row.column_body.trim()
      ? row.column_body.trim()
      : null

    if (!FIELDS.includes(field as typeof FIELDS[number])) {
      throw new Error(`${prefix}: field は ${FIELDS.join(' / ')} のどれかにしてください。`)
    }
    if (!unit) throw new Error(`${prefix}: unit は必須です。`)
    if (!question) throw new Error(`${prefix}: question は必須です。`)
    if (!type || !QUESTION_TYPES.includes(type)) {
      throw new Error(`${prefix}: type は ${QUESTION_TYPES.join(' / ')} のどれかにしてください。`)
    }

    const basePayload: BulkQuestionPayload = {
      field: field as typeof FIELDS[number],
      unit,
      question,
      type,
      choices,
      answer,
      keywords,
      match_pairs: matchPairs,
      sort_items: sortItems,
      correct_choices: correctChoices,
      word_tokens: wordTokens,
      distractor_tokens: distractorTokens,
      column_title: columnTitle,
      column_body: columnBody,
      explanation,
      grade,
    }

    if (type === 'choice') {
      if (!choices || choices.length !== 2) {
        throw new Error(`${prefix}: choice は choices を2件にしてください。`)
      }
      if (!answer) {
        throw new Error(`${prefix}: choice は answer が必須です。`)
      }
      if (!choices.includes(answer)) {
        throw new Error(`${prefix}: choice の answer は choices と一致させてください。`)
      }
      return { ...basePayload, keywords: null }
    }

    if (type === 'choice4' || type === 'fill_choice') {
      if (!choices || choices.length < 3 || choices.length > 4) {
        throw new Error(`${prefix}: ${type} は choices を3〜4件にしてください。`)
      }
      if (!answer || !choices.includes(answer)) {
        throw new Error(`${prefix}: ${type} の answer は choices と一致させてください。`)
      }
      if (type === 'fill_choice' && !question.includes('【')) {
        throw new Error(`${prefix}: fill_choice の question には【　　】を入れてください。`)
      }
      return { ...basePayload, keywords: null }
    }

    if (type === 'true_false') {
      if (!['○', '×'].includes(answer)) {
        throw new Error(`${prefix}: true_false の answer は ○ か × にしてください。`)
      }
      return {
        ...basePayload,
        choices: ['○', '×'],
        keywords: null,
      }
    }

    if (type === 'match') {
      if (!matchPairs || matchPairs.length < 2) {
        throw new Error(`${prefix}: match は match_pairs を2組以上入れてください。`)
      }
      return { ...basePayload, choices: null, answer: '', keywords: null }
    }

    if (type === 'sort') {
      if (!sortItems || sortItems.length < 3) {
        throw new Error(`${prefix}: sort は sort_items を3件以上入れてください。`)
      }
      return { ...basePayload, choices: null, answer: '', keywords: null }
    }

    if (type === 'multi_select') {
      if (!choices || choices.length < 4) {
        throw new Error(`${prefix}: multi_select は choices を4件以上入れてください。`)
      }
      if (!correctChoices || correctChoices.length < 2) {
        throw new Error(`${prefix}: multi_select は correct_choices を2件以上入れてください。`)
      }
      if (!correctChoices.every(choice => choices.includes(choice))) {
        throw new Error(`${prefix}: multi_select の correct_choices は choices の中から選んでください。`)
      }
      return { ...basePayload, answer: '', keywords: null }
    }

    if (type === 'word_bank') {
      if (!wordTokens || wordTokens.length < 2) {
        throw new Error(`${prefix}: word_bank は word_tokens を2件以上入れてください。`)
      }
      if (!distractorTokens || distractorTokens.length < 1) {
        throw new Error(`${prefix}: word_bank は distractor_tokens を1件以上入れてください。`)
      }
      return {
        ...basePayload,
        choices: null,
        answer: answer || wordTokens.join(' '),
        keywords: null,
      }
    }

    if (!answer) {
      throw new Error(`${prefix}: text は answer が必須です。`)
    }

    return {
      ...basePayload,
      choices: null,
      match_pairs: null,
      sort_items: null,
      correct_choices: null,
      word_tokens: null,
      distractor_tokens: null,
    }
  })
}

export function parseBulkGlossaryEntries(jsonText: string): BulkGlossaryPayload[] {
  const parsed = JSON.parse(jsonText)
  const items: unknown[] | null = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.entries)
      ? parsed.entries
      : Array.isArray(parsed?.glossary)
        ? parsed.glossary
        : null

  if (!items || items.length === 0) {
    throw new Error('JSON は配列、または {"entries":[...]} / {"glossary":[...]} の形で入力してください。')
  }

  const seenIds = new Set<string>()
  const seenTerms = new Set<string>()

  return items.map((item, index) => {
    const row = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {}
    const prefix = `${index + 1}語目`
    const field = typeof row.field === 'string' ? row.field.trim() : ''
    const term = typeof row.term === 'string' ? row.term.trim() : ''
    const reading = typeof row.reading === 'string' ? row.reading.trim() : ''
    const shortDescriptionSource = typeof row.shortDescription === 'string'
      ? row.shortDescription
      : typeof row.short_description === 'string'
        ? row.short_description
        : ''
    const shortDescription = shortDescriptionSource.trim()
    const description = typeof row.description === 'string' ? row.description.trim() : ''
    const related = parseStringArray(row.related)
    const tags = parseStringArray(row.tags)
    const idSource = typeof row.id === 'string' ? row.id.trim() : ''

    if (!FIELDS.includes(field as typeof FIELDS[number])) {
      throw new Error(`${prefix}: field は ${FIELDS.join(' / ')} のどれかにしてください。`)
    }
    if (!term) throw new Error(`${prefix}: term は必須です。`)
    if (!reading) throw new Error(`${prefix}: reading は必須です。`)
    if (!shortDescription) throw new Error(`${prefix}: shortDescription は必須です。`)
    if (!description) throw new Error(`${prefix}: description は必須です。`)

    const id = idSource || buildGlossaryEntryId(field as ScienceGlossaryField, term)
    const termKey = `${field}::${term}`.toLowerCase()

    if (seenIds.has(id)) {
      throw new Error(`${prefix}: id が重複しています (${id})。`)
    }
    if (seenTerms.has(termKey)) {
      throw new Error(`${prefix}: 同じ field + term が重複しています (${field} / ${term})。`)
    }

    seenIds.add(id)
    seenTerms.add(termKey)

    return {
      id,
      term,
      reading,
      field: field as ScienceGlossaryField,
      short_description: shortDescription,
      description,
      related,
      tags,
    }
  })
}

export function parseAdminRestorePayload(jsonText: string): RestoreSnapshot {
  const parsed = JSON.parse(jsonText) as Record<string, unknown>
  const format = typeof parsed.format === 'string' ? parsed.format : ''

  if (!format.startsWith('rikarikastudy-admin-export/')) {
    throw new Error('管理画面から出力したバックアップJSONを読み込んでください。')
  }

  const questionCatalog = Array.isArray(parsed.questionCatalog)
    ? parsed.questionCatalog as QuestionRow[]
    : []
  const hasGlossaryEntries = Array.isArray(parsed.scienceGlossaryEntries)
  const glossaryEntries = hasGlossaryEntries
    ? parsed.scienceGlossaryEntries as GlossaryRow[]
    : []
  const hasLoginUpdates = Array.isArray(parsed.loginUpdates)
  const loginUpdates = hasLoginUpdates
    ? parsed.loginUpdates as LoginUpdateRow[]
    : []
  const hasQuestionInquiries = Array.isArray(parsed.questionInquiries)
  const questionInquiries = hasQuestionInquiries
    ? parsed.questionInquiries as QuestionInquiryRow[]
    : []
  const rawStudents = Array.isArray(parsed.students)
    ? parsed.students as Array<Record<string, unknown>>
    : []
  const quizSessions = rawStudents.flatMap(student =>
    Array.isArray(student.quizSessions) ? student.quizSessions as QuizSessionRow[] : []
  )
  const answerLogs = rawStudents.flatMap(student =>
    Array.isArray(student.answerLogs) ? student.answerLogs as AnswerLogRow[] : []
  )
  const hasChatGuardLogs = Array.isArray(parsed.chatGuardLogs)
  const chatGuardLogs = hasChatGuardLogs
    ? parsed.chatGuardLogs as ChatGuardLogRow[]
    : []
  const hasEngagementTables = Array.isArray(parsed.dailyChallenges)
    || Array.isArray(parsed.badges)
    || Array.isArray(parsed.studentBadges)
    || Array.isArray(parsed.timeAttackRecords)
  const dailyChallenges = Array.isArray(parsed.dailyChallenges)
    ? parsed.dailyChallenges as DailyChallengeRow[]
    : []
  const badges = Array.isArray(parsed.badges)
    ? parsed.badges as BadgeRow[]
    : []
  const studentBadges = Array.isArray(parsed.studentBadges)
    ? parsed.studentBadges as StudentBadgeRow[]
    : []
  const timeAttackRecords = Array.isArray(parsed.timeAttackRecords)
    ? parsed.timeAttackRecords as TimeAttackRecordRow[]
    : []

  if (questionCatalog.length === 0) {
    throw new Error('このバックアップには問題データが含まれていません。')
  }

  let defaultPasswordCount = 0
  const students = DEFAULT_STUDENTS.map(defaultStudent => {
    const current = rawStudents.find(student => Number(student.id) === defaultStudent.id)
    const nickname = typeof current?.nickname === 'string' && current.nickname.trim()
      ? current.nickname.trim()
      : defaultStudent.nickname
    const password = typeof current?.password === 'string' && current.password.trim()
      ? current.password.trim()
      : defaultStudent.password

    if (!current || typeof current.password !== 'string' || !current.password.trim()) {
      defaultPasswordCount += 1
    }

    return {
      id: defaultStudent.id,
      nickname,
      password,
      student_xp: typeof current?.student_xp === 'number' ? current.student_xp : defaultStudent.student_xp,
    }
  })

  return {
    format,
    students,
    questions: questionCatalog,
    loginUpdates,
    glossaryEntries,
    questionInquiries,
    quizSessions,
    answerLogs,
    chatGuardLogs,
    dailyChallenges,
    badges,
    studentBadges,
    timeAttackRecords,
    hasChatGuardLogs,
    hasEngagementTables,
    hasGlossaryEntries,
    hasLoginUpdates,
    hasQuestionInquiries,
    defaultPasswordCount,
  }
}

export async function insertRowsInChunks(
  table: 'questions' | 'login_updates' | 'science_glossary_entries' | 'question_inquiries' | 'quiz_sessions' | 'answer_logs' | 'chat_guard_logs' | 'daily_challenges' | 'badges' | 'student_badges' | 'time_attack_records',
  rows: Record<string, unknown>[]
) {
  if (rows.length === 0) return

  for (let index = 0; index < rows.length; index += BULK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + BULK_INSERT_CHUNK_SIZE)
    const { error } = await (supabase.from(table) as any).insert(chunk)
    if (error) throw new Error(error.message)
  }
}

export function getRestoreErrorMessage(message: string) {
  if (message.includes('relation') && message.includes('does not exist')) {
    return 'Supabase のテーブルがありません。先に supabase_schema.sql を SQL Editor で実行してから復元してください。'
  }
  if (message.includes('password') || message.includes('duration_seconds') || message.includes('created_by_student_id') || message.includes('student_xp') || message.includes('xp_earned') || message.includes('session_mode') || message.includes('image_url') || message.includes('image_display_width') || message.includes('image_display_height')) {
    return 'Supabase の schema が古い可能性があります。最新の supabase_schema.sql を SQL Editor で実行してから復元してください。'
  }
  if (
    message.includes('keywords')
    || message.includes('match_pairs')
    || message.includes('sort_items')
    || message.includes('correct_choices')
    || message.includes('word_tokens')
    || message.includes('distractor_tokens')
  ) {
    return 'Supabase の questions テーブルに新しい問題形式の列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。'
  }
  if (
    message.includes('chat_guard_logs')
    || message.includes('login_updates')
    || message.includes('question_inquiries')
    || message.includes('daily_challenges')
    || message.includes('student_badges')
    || message.includes('time_attack_records')
    || message.includes('badges')
    || message.includes('science_glossary_entries')
    || message.includes('short_description')
    || message.includes('admin_note')
    || message.includes('admin_reply')
    || message.includes('question_text')
  ) {
    return 'Supabase の schema が古い可能性があります。最新の supabase_schema.sql を SQL Editor で実行してから復元してください。'
  }
  return message
}
