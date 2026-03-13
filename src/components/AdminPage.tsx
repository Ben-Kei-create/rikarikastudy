'use client'
import { ChangeEvent, useEffect, useState } from 'react'
import { Database, supabase } from '@/lib/supabase'
import { DEFAULT_STUDENTS, fetchStudents } from '@/lib/auth'
import { sampleQuestions } from '@/lib/sampleQuestions'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import AdminStudentDetailSheet from '@/components/AdminStudentDetailSheet'
import { getChatModerationCategoryLabel } from '@/lib/chatModeration'
import { ensureNoDuplicateQuestions } from '@/lib/questionDuplicates'
import { isMissingColumnError, isMissingRelationError } from '@/lib/schemaCompat'
import { fetchActiveSessions } from '@/lib/activeSessions'
import { BADGE_DEFINITIONS } from '@/lib/badges'
import { getLevelTitle } from '@/lib/engagement'
import {
  clampQuestionImageDisplayValue,
  compressQuestionImageFile,
  getQuestionImageDisplaySize,
  QUESTION_IMAGE_DEFAULT_DISPLAY_SIZE,
  QUESTION_IMAGE_MAX_DISPLAY_SIZE,
  QUESTION_IMAGE_MIN_DISPLAY_SIZE,
} from '@/lib/questionImages'
import {
  getQuestionInquiryCategoryLabel,
  getQuestionInquirySchemaErrorMessage,
  isQuestionInquiryTableMissing,
  QUESTION_INQUIRY_STATUS_META,
  QuestionInquiryRow,
  QuestionInquiryStatus,
} from '@/lib/questionInquiry'
import { buildGlossaryEntryId, ScienceGlossaryField } from '@/lib/scienceGlossary'
import { FIELD_COLORS, FIELDS } from '@/lib/constants'

const ADMIN_PW = 'rikaadmin2026'
const BULK_INSERT_CHUNK_SIZE = 100
const BULK_JSON_EXAMPLE = `[
  {
    "field": "生物",
    "unit": "植物のつくり",
    "question": "光合成を主に行う部分はどこ？",
    "type": "choice",
    "choices": ["葉", "根"],
    "answer": "葉",
    "explanation": "葉の葉緑体で光合成を行います。",
    "grade": "中1"
  },
  {
    "field": "物理",
    "unit": "電流",
    "question": "電流の単位は何ですか？",
    "type": "text",
    "answer": "A",
    "keywords": ["アンペア"],
    "explanation": "電流の単位はアンペアです。",
    "grade": "中2"
  }
]`

const GLOSSARY_BULK_JSON_EXAMPLE = `[
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

const XP_RULES = [
  '基本XP: 正解数 × 10',
  'スピードボーナス: max(0, 300 - 解答秒数) / 3 を四捨五入',
  '全問正解ボーナス: +50 XP',
  '今日のチャレンジ: 獲得XPが 2倍',
  'タイムアタック: スコア × 5 XP',
  'テストモード: 正解数 × 4 XP',
  '連続正解モード: 連続数 × 6 XP',
] as const

const LEVEL_GUIDE = [1, 5, 10, 20, 35, 50, 75, 99].map(level => ({
  level,
  title: getLevelTitle(level),
}))

const BADGE_CONDITION_GUIDE: Record<string, string> = {
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

const BADGE_RARITY_STYLES = {
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

function getFieldColor(field: string) {
  return FIELD_COLORS[field as keyof typeof FIELD_COLORS] ?? '#64748b'
}

function buildBinaryChoices(choices: string[] | null, answer: string, seed: string) {
  if (!choices || choices.length === 0) return null

  const correct = choices.find(choice => choice === answer) ?? answer
  const distractor = choices.find(choice => choice !== answer)
  if (!distractor) return [correct]

  return seed.length % 2 === 0 ? [correct, distractor] : [distractor, correct]
}

interface StudentStats {
  id: number
  nickname: string
  password: string
  totalQ: number
  totalC: number
  lastActivity: string | null
  byField: Record<string, { total: number; correct: number }>
}

interface ActiveStudentStatus {
  id: number
  nickname: string
  lastSeenAt: string
  sessionCount: number
}

type QuizSessionRow = Database['public']['Tables']['quiz_sessions']['Row']
type AnswerLogRow = Database['public']['Tables']['answer_logs']['Row']
type QuestionRow = Database['public']['Tables']['questions']['Row']
type ChatGuardLogRow = Database['public']['Tables']['chat_guard_logs']['Row']
type DailyChallengeRow = Database['public']['Tables']['daily_challenges']['Row']
type BadgeRow = Database['public']['Tables']['badges']['Row']
type StudentBadgeRow = Database['public']['Tables']['student_badges']['Row']
type TimeAttackRecordRow = Database['public']['Tables']['time_attack_records']['Row']
type StudentInsert = Database['public']['Tables']['students']['Insert']
type GlossaryRow = Database['public']['Tables']['science_glossary_entries']['Row']
type GlossaryInsert = Database['public']['Tables']['science_glossary_entries']['Insert']
type AdminStudentDetailAnswerLogRow = Pick<AnswerLogRow, 'question_id' | 'is_correct' | 'created_at'> & {
  questions: Pick<QuestionRow, 'unit' | 'field'> | null
}

interface AdminStudentDetailData {
  sessions: QuizSessionRow[]
  answerLogs: AdminStudentDetailAnswerLogRow[]
  studentBadges: StudentBadgeRow[]
}

interface BulkQuestionPayload {
  field: typeof FIELDS[number]
  unit: string
  question: string
  type: 'choice' | 'text'
  choices: string[] | null
  answer: string
  keywords: string[] | null
  explanation: string | null
  grade: string
}

interface BulkGlossaryPayload {
  id: string
  term: string
  reading: string
  field: ScienceGlossaryField
  short_description: string
  description: string
  related: string[]
  tags: string[]
}

type AdminTab = 'overview' | 'inquiries' | 'questions' | 'add' | 'bulk'

interface RestoreSnapshot {
  format: string
  students: StudentInsert[]
  questions: QuestionRow[]
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
  hasQuestionInquiries: boolean
  defaultPasswordCount: number
}

function buildStudentStats(
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

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function parseKeywordsArray(value: unknown) {
  if (!Array.isArray(value)) return null

  const keywords = value
    .map(keyword => (typeof keyword === 'string' ? keyword.trim() : ''))
    .filter(Boolean)

  return keywords.length > 0 ? keywords : null
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function parseKeywordInput(input: string) {
  const keywords = input
    .split(/[,、\n]/)
    .map(keyword => keyword.trim())
    .filter(Boolean)

  return keywords.length > 0 ? keywords : null
}

function parseBulkQuestions(jsonText: string): BulkQuestionPayload[] {
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
    const type = row.type
    const answer = typeof row.answer === 'string' ? row.answer.trim() : ''
    const explanation = typeof row.explanation === 'string' && row.explanation.trim()
      ? row.explanation.trim()
      : null
    const grade = typeof row.grade === 'string' && row.grade.trim()
      ? row.grade.trim()
      : '中3'
    const keywords = parseKeywordsArray(row.keywords)

    if (!FIELDS.includes(field as typeof FIELDS[number])) {
      throw new Error(`${prefix}: field は ${FIELDS.join(' / ')} のどれかにしてください。`)
    }
    if (!unit) throw new Error(`${prefix}: unit は必須です。`)
    if (!question) throw new Error(`${prefix}: question は必須です。`)
    if (!answer) throw new Error(`${prefix}: answer は必須です。`)
    if (type !== 'choice' && type !== 'text') {
      throw new Error(`${prefix}: type は "choice" か "text" にしてください。`)
    }

    if (type === 'choice') {
      if (!Array.isArray(row.choices)) {
        throw new Error(`${prefix}: choice 問題は choices 配列が必要です。`)
      }
      const choices = row.choices
        .map((choice: unknown) => (typeof choice === 'string' ? choice.trim() : ''))
        .filter(Boolean)

      if (choices.length !== 2) {
        throw new Error(`${prefix}: choice 問題の choices は2件にしてください。`)
      }
      if (!choices.includes(answer)) {
        throw new Error(`${prefix}: answer は choices のどちらかと一致させてください。`)
      }

      return {
        field: field as typeof FIELDS[number],
        unit,
        question,
        type,
        choices,
        answer,
        keywords: null,
        explanation,
        grade,
      }
    }

    return {
      field: field as typeof FIELDS[number],
      unit,
      question,
      type,
      choices: null,
      answer,
      keywords,
      explanation,
      grade,
    }
  })
}

function parseBulkGlossaryEntries(jsonText: string): BulkGlossaryPayload[] {
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

function parseAdminRestorePayload(jsonText: string): RestoreSnapshot {
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
    hasQuestionInquiries,
    defaultPasswordCount,
  }
}

async function insertRowsInChunks(
  table: 'questions' | 'science_glossary_entries' | 'question_inquiries' | 'quiz_sessions' | 'answer_logs' | 'chat_guard_logs' | 'daily_challenges' | 'badges' | 'student_badges' | 'time_attack_records',
  rows: Record<string, unknown>[]
) {
  if (rows.length === 0) return

  for (let index = 0; index < rows.length; index += BULK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + BULK_INSERT_CHUNK_SIZE)
    const { error } = await (supabase.from(table) as any).insert(chunk)
    if (error) throw new Error(error.message)
  }
}

function getRestoreErrorMessage(message: string) {
  if (message.includes('relation') && message.includes('does not exist')) {
    return 'Supabase のテーブルがありません。先に supabase_schema.sql を SQL Editor で実行してから復元してください。'
  }
  if (message.includes('password') || message.includes('duration_seconds') || message.includes('created_by_student_id') || message.includes('student_xp') || message.includes('xp_earned') || message.includes('session_mode') || message.includes('image_url') || message.includes('image_display_width') || message.includes('image_display_height')) {
    return 'Supabase の schema が古い可能性があります。最新の supabase_schema.sql を SQL Editor で実行してから復元してください。'
  }
  if (message.includes('keywords')) {
    return 'Supabase の questions テーブルに keywords 列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。'
  }
  if (
    message.includes('chat_guard_logs')
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

export default function AdminPage({ onBack }: { onBack: () => void }) {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [tab, setTab] = useState<AdminTab>('overview')
  const [studentsList, setStudentsList] = useState<Array<{ id: number; nickname: string; password: string; student_xp: number }>>([])
  const [stats, setStats] = useState<StudentStats[]>([])
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [activeStudents, setActiveStudents] = useState<ActiveStudentStatus[]>([])
  const [chatGuardLogs, setChatGuardLogs] = useState<ChatGuardLogRow[]>([])
  const [questionInquiries, setQuestionInquiries] = useState<QuestionInquiryRow[]>([])
  const [questionInquiryLoadError, setQuestionInquiryLoadError] = useState('')
  const [questionInquiryActionId, setQuestionInquiryActionId] = useState<string | null>(null)
  const [questionInquiryNoteDrafts, setQuestionInquiryNoteDrafts] = useState<Record<string, string>>({})
  const [questionInquiryReplyDrafts, setQuestionInquiryReplyDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [bulkInput, setBulkInput] = useState(BULK_JSON_EXAMPLE)
  const [bulkMsg, setBulkMsg] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [glossaryBulkInput, setGlossaryBulkInput] = useState(GLOSSARY_BULK_JSON_EXAMPLE)
  const [glossaryBulkMsg, setGlossaryBulkMsg] = useState('')
  const [glossaryBulkLoading, setGlossaryBulkLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const [restoreInput, setRestoreInput] = useState('')
  const [restoreMsg, setRestoreMsg] = useState('')
  const [restoreLoading, setRestoreLoading] = useState(false)

  const [form, setForm] = useState({
    field: '生物' as typeof FIELDS[number],
    unit: '',
    question: '',
    type: 'choice' as 'choice' | 'text',
    choices: ['', ''],
    answer: '',
    keywords: '',
    explanation: '',
    grade: '中3',
  })
  const [addMsg, setAddMsg] = useState('')
  const [questionImageBusy, setQuestionImageBusy] = useState<{
    questionId: string
    action: 'upload' | 'size' | 'remove'
  } | null>(null)
  const [questionImageStatus, setQuestionImageStatus] = useState<{
    questionId: string
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [questionImageSizeDrafts, setQuestionImageSizeDrafts] = useState<Record<string, { width: string; height: string }>>({})
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<AdminStudentDetailData | null>(null)
  const [selectedStudentDetailLoading, setSelectedStudentDetailLoading] = useState(false)
  const [selectedStudentDetailError, setSelectedStudentDetailError] = useState<string | null>(null)

  const checkPw = () => {
    if (pw === ADMIN_PW) {
      setAuthed(true)
      setPwError(false)
      return
    }
    setPwError(true)
    setPw('')
  }

  useEffect(() => {
    if (!authed) return
    loadData()
  }, [authed, tab])

  useEffect(() => {
    if (!authed || tab !== 'overview') return

    const intervalId = window.setInterval(() => {
      void loadData()
    }, 60 * 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [authed, tab])

  useEffect(() => {
    if (tab === 'overview') return
    setSelectedStudentId(null)
    setSelectedStudentDetail(null)
    setSelectedStudentDetailLoading(false)
    setSelectedStudentDetailError(null)
  }, [tab])

  const loadData = async () => {
    setLoading(true)

    if (tab === 'overview') {
      const [students, { data: sessions }, activeSessionRows, chatGuardLogsResponse, questionInquiriesResponse] = await Promise.all([
        fetchStudents(),
        supabase.from('quiz_sessions').select('*'),
        fetchActiveSessions(),
        supabase.from('chat_guard_logs').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('question_inquiries').select('*').order('created_at', { ascending: false }).limit(20),
      ])
      setStudentsList(students)
      setStats(buildStudentStats(students, (sessions || []) as QuizSessionRow[]))
      const activeStudentMap = new Map<number, ActiveStudentStatus>()
      activeSessionRows
        .filter(session => session.student_id !== 5)
        .forEach(session => {
          const currentStudent = students.find(student => student.id === session.student_id)
          if (!currentStudent) return
          const current = activeStudentMap.get(session.student_id)
          if (!current) {
            activeStudentMap.set(session.student_id, {
              id: session.student_id,
              nickname: currentStudent.nickname,
              lastSeenAt: session.last_seen_at,
              sessionCount: 1,
            })
            return
          }

          current.sessionCount += 1
          if (session.last_seen_at > current.lastSeenAt) {
            current.lastSeenAt = session.last_seen_at
          }
        })
      setActiveStudents(Array.from(activeStudentMap.values()).sort((a, b) => +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt)))
      if (chatGuardLogsResponse.error) {
        if (!isMissingRelationError(chatGuardLogsResponse.error, 'chat_guard_logs')) {
          console.error(chatGuardLogsResponse.error)
        }
        setChatGuardLogs([])
      } else {
        setChatGuardLogs((chatGuardLogsResponse.data || []) as ChatGuardLogRow[])
      }
      if (questionInquiriesResponse.error) {
        if (!isQuestionInquiryTableMissing(questionInquiriesResponse.error)) {
          console.error(questionInquiriesResponse.error)
          setQuestionInquiryLoadError(questionInquiriesResponse.error.message)
        } else {
          setQuestionInquiryLoadError('')
        }
        setQuestionInquiries([])
      } else {
        setQuestionInquiries((questionInquiriesResponse.data || []) as QuestionInquiryRow[])
        setQuestionInquiryLoadError('')
      }
    } else if (tab === 'inquiries') {
      const { data, error } = await supabase
        .from('question_inquiries')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        setQuestionInquiries([])
        setQuestionInquiryLoadError(getQuestionInquirySchemaErrorMessage(error.message))
      } else {
        setQuestionInquiries((data || []) as QuestionInquiryRow[])
        setQuestionInquiryLoadError('')
      }
    } else if (tab === 'questions') {
      const { data } = await supabase.from('questions').select('*').order('created_at', { ascending: false })
      setQuestions((data || []) as QuestionRow[])
    }

    setLoading(false)
  }

  useEffect(() => {
    if (!authed || tab !== 'overview' || selectedStudentId === null) return

    let active = true

    const loadStudentDetail = async () => {
      try {
        setSelectedStudentDetail(null)
        setSelectedStudentDetailLoading(true)
        setSelectedStudentDetailError(null)

        const [sessionsResponse, answerLogsResponse, studentBadgesResponse] = await Promise.all([
          supabase
            .from('quiz_sessions')
            .select('*')
            .eq('student_id', selectedStudentId)
            .order('created_at', { ascending: false }),
          supabase
            .from('answer_logs')
            .select('question_id, is_correct, created_at, questions(unit, field)')
            .eq('student_id', selectedStudentId)
            .order('created_at', { ascending: false }),
          supabase
            .from('student_badges')
            .select('*')
            .eq('student_id', selectedStudentId)
            .order('earned_at', { ascending: false }),
        ])

        if (!active) return

        if (sessionsResponse.error) throw new Error(sessionsResponse.error.message)
        if (answerLogsResponse.error) throw new Error(answerLogsResponse.error.message)

        let studentBadges: StudentBadgeRow[] = []
        if (studentBadgesResponse.error) {
          if (!isMissingRelationError(studentBadgesResponse.error, 'student_badges')) {
            throw new Error(studentBadgesResponse.error.message)
          }
        } else {
          studentBadges = (studentBadgesResponse.data || []) as StudentBadgeRow[]
        }

        const answerLogs = ((answerLogsResponse.data || []) as Array<
          Pick<AnswerLogRow, 'question_id' | 'is_correct' | 'created_at'> & {
            questions: Pick<QuestionRow, 'unit' | 'field'> | Array<Pick<QuestionRow, 'unit' | 'field'>> | null
          }
        >).map(log => ({
          question_id: log.question_id,
          is_correct: log.is_correct,
          created_at: log.created_at,
          questions: Array.isArray(log.questions) ? (log.questions[0] ?? null) : (log.questions ?? null),
        }))

        setSelectedStudentDetail({
          sessions: (sessionsResponse.data || []) as QuizSessionRow[],
          answerLogs,
          studentBadges,
        })
      } catch (error) {
        if (!active) return
        setSelectedStudentDetail(null)
        setSelectedStudentDetailError(
          error instanceof Error ? error.message : '生徒の詳細データを読み込めませんでした。'
        )
      } finally {
        if (active) setSelectedStudentDetailLoading(false)
      }
    }

    void loadStudentDetail()

    return () => {
      active = false
    }
  }, [authed, selectedStudentId, tab])

  useEffect(() => {
    if (questionInquiries.length === 0) return

    setQuestionInquiryNoteDrafts(current => {
      const next = { ...current }
      questionInquiries.forEach(inquiry => {
        if (next[inquiry.id] === undefined) {
          next[inquiry.id] = inquiry.admin_note ?? ''
        }
      })
      return next
    })

    setQuestionInquiryReplyDrafts(current => {
      const next = { ...current }
      questionInquiries.forEach(inquiry => {
        if (next[inquiry.id] === undefined) {
          next[inquiry.id] = inquiry.admin_reply ?? ''
        }
      })
      return next
    })
  }, [questionInquiries])

  const handleQuestionInquiryStatusChange = async (inquiry: QuestionInquiryRow, status: QuestionInquiryStatus) => {
    try {
      setQuestionInquiryActionId(inquiry.id)

      const payload: Database['public']['Tables']['question_inquiries']['Update'] = {
        status,
        updated_at: new Date().toISOString(),
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      }

      const { error } = await supabase
        .from('question_inquiries')
        .update(payload)
        .eq('id', inquiry.id)

      if (error) throw new Error(getQuestionInquirySchemaErrorMessage(error.message))

      setQuestionInquiries(current => current.map(item => item.id === inquiry.id ? {
        ...item,
        ...payload,
      } as QuestionInquiryRow : item))
    } catch (error) {
      alert(error instanceof Error ? error.message : '問い合わせの更新に失敗しました。')
    } finally {
      setQuestionInquiryActionId(null)
    }
  }

  const handleSaveQuestionInquiryNote = async (inquiryId: string) => {
    try {
      setQuestionInquiryActionId(inquiryId)

      const payload: Database['public']['Tables']['question_inquiries']['Update'] = {
        admin_note: questionInquiryNoteDrafts[inquiryId] ?? '',
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('question_inquiries')
        .update(payload)
        .eq('id', inquiryId)

      if (error) throw new Error(getQuestionInquirySchemaErrorMessage(error.message))

      setQuestionInquiries(current => current.map(item => item.id === inquiryId ? {
        ...item,
        ...payload,
      } as QuestionInquiryRow : item))
    } catch (error) {
      alert(error instanceof Error ? error.message : '対応メモの保存に失敗しました。')
    } finally {
      setQuestionInquiryActionId(null)
    }
  }

  const handleSaveQuestionInquiryReply = async (inquiryId: string) => {
    try {
      setQuestionInquiryActionId(inquiryId)

      const replyText = questionInquiryReplyDrafts[inquiryId] ?? ''
      const payload: Database['public']['Tables']['question_inquiries']['Update'] = {
        admin_reply: replyText,
        updated_at: new Date().toISOString(),
        replied_at: replyText.trim() ? new Date().toISOString() : null,
      }

      const { error } = await supabase
        .from('question_inquiries')
        .update(payload)
        .eq('id', inquiryId)

      if (error) throw new Error(getQuestionInquirySchemaErrorMessage(error.message))

      setQuestionInquiries(current => current.map(item => item.id === inquiryId ? {
        ...item,
        ...payload,
      } as QuestionInquiryRow : item))
    } catch (error) {
      alert(error instanceof Error ? error.message : '返信の保存に失敗しました。')
    } finally {
      setQuestionInquiryActionId(null)
    }
  }

  const handleDownloadAllPerformance = async () => {
    try {
      setExportLoading(true)
      setExportMsg('')

      const [
        students,
        sessionsResponse,
        answerLogsResponse,
        questionsResponse,
        glossaryResponse,
        chatGuardLogsResponse,
        questionInquiriesResponse,
        dailyChallengesResponse,
        badgesResponse,
        studentBadgesResponse,
        timeAttackResponse,
      ] = await Promise.all([
        fetchStudents(),
        supabase.from('quiz_sessions').select('*').order('created_at', { ascending: false }),
        supabase.from('answer_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('questions').select('*').order('created_at', { ascending: false }),
        supabase.from('science_glossary_entries').select('*').order('reading', { ascending: true }).order('term', { ascending: true }),
        supabase.from('chat_guard_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('question_inquiries').select('*').order('created_at', { ascending: false }),
        supabase.from('daily_challenges').select('*').order('completed_at', { ascending: false }),
        supabase.from('badges').select('*').order('created_at', { ascending: false }),
        supabase.from('student_badges').select('*').order('earned_at', { ascending: false }),
        supabase.from('time_attack_records').select('*').order('best_score', { ascending: false }),
      ])

      if (sessionsResponse.error) throw new Error(sessionsResponse.error.message)
      if (answerLogsResponse.error) throw new Error(answerLogsResponse.error.message)
      if (questionsResponse.error) throw new Error(questionsResponse.error.message)
      if (glossaryResponse.error && !isMissingRelationError(glossaryResponse.error, 'science_glossary_entries')) {
        throw new Error(glossaryResponse.error.message)
      }
      if (chatGuardLogsResponse.error && !isMissingRelationError(chatGuardLogsResponse.error, 'chat_guard_logs')) {
        throw new Error(chatGuardLogsResponse.error.message)
      }
      if (questionInquiriesResponse.error && !isQuestionInquiryTableMissing(questionInquiriesResponse.error)) {
        throw new Error(questionInquiriesResponse.error.message)
      }
      if (dailyChallengesResponse.error) throw new Error(dailyChallengesResponse.error.message)
      if (badgesResponse.error) throw new Error(badgesResponse.error.message)
      if (studentBadgesResponse.error) throw new Error(studentBadgesResponse.error.message)
      if (timeAttackResponse.error) throw new Error(timeAttackResponse.error.message)

      const sessions = (sessionsResponse.data || []) as QuizSessionRow[]
      const answerLogs = (answerLogsResponse.data || []) as AnswerLogRow[]
      const questions = (questionsResponse.data || []) as QuestionRow[]
      const glossaryEntries = (glossaryResponse.data || []) as GlossaryRow[]
      const hasGlossaryTable = !glossaryResponse.error
      const chatGuardLogs = (chatGuardLogsResponse.data || []) as ChatGuardLogRow[]
      const questionInquiries = (questionInquiriesResponse.data || []) as QuestionInquiryRow[]
      const hasQuestionInquiryTable = !questionInquiriesResponse.error
      const dailyChallenges = (dailyChallengesResponse.data || []) as DailyChallengeRow[]
      const badges = (badgesResponse.data || []) as BadgeRow[]
      const studentBadges = (studentBadgesResponse.data || []) as StudentBadgeRow[]
      const timeAttackRecords = (timeAttackResponse.data || []) as TimeAttackRecordRow[]
      const statsSnapshot = buildStudentStats(students, sessions)

      const payload = {
        exportedAt: new Date().toISOString(),
        format: 'rikarikastudy-admin-export/v6',
        restoreHint: 'テーブルが消えている場合は、先に supabase_schema.sql を SQL Editor で実行してから復元してください。',
        questionCatalog: questions,
        ...(hasGlossaryTable ? { scienceGlossaryEntries: glossaryEntries } : {}),
        chatGuardLogs,
        ...(hasQuestionInquiryTable ? { questionInquiries } : {}),
        dailyChallenges,
        badges,
        studentBadges,
        timeAttackRecords,
        students: students.map(student => {
          const summary = statsSnapshot.find(current => current.id === student.id)
          const studentSessions = sessions.filter(session => session.student_id === student.id)
          const studentAnswerLogs = answerLogs.filter(log => log.student_id === student.id)
          const correctRate = summary && summary.totalQ > 0
            ? Math.round((summary.totalC / summary.totalQ) * 100)
            : 0

          return {
            id: student.id,
            nickname: student.nickname,
            password: student.password,
            student_xp: student.student_xp,
            summary: {
              totalQuestions: summary?.totalQ ?? 0,
              totalCorrect: summary?.totalC ?? 0,
              correctRate,
              lastActivity: summary?.lastActivity ?? null,
              sessionCount: studentSessions.length,
              answerLogCount: studentAnswerLogs.length,
              byField: summary?.byField ?? {},
            },
            quizSessions: studentSessions,
            answerLogs: studentAnswerLogs,
          }
        }),
      }

      const filename = `rikarikastudy-grades-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`
      downloadJsonFile(filename, payload)
      setExportMsg(`✅ ${filename} をダウンロードしました。`)
    } catch (error) {
      setExportMsg(`エラー: ${error instanceof Error ? error.message : '成績データの書き出しに失敗しました。'}`)
    } finally {
      setExportLoading(false)
    }
  }

  const handleSeedQuestions = async () => {
    if (!confirm(`サンプル問題（${sampleQuestions.length}問）を追加しますか？`)) return
    const toInsert = sampleQuestions.map(question => ({
      ...question,
      choices: question.type === 'choice'
        ? buildBinaryChoices(question.choices, question.answer, question.question)
        : null,
    }))
    try {
      await ensureNoDuplicateQuestions(
        toInsert.map(question => ({
          field: question.field,
          unit: question.unit,
          question: question.question,
          type: question.type,
          choices: question.choices,
          answer: question.answer,
        })),
      )
    } catch (error) {
      alert(error instanceof Error ? error.message : '重複問題の確認に失敗しました。')
      return
    }
    const { error } = await supabase.from('questions').insert(toInsert)
    if (error) alert('エラー: ' + error.message)
    else {
      alert('サンプル問題を追加しました！')
      loadData()
    }
  }

  const handleAddQuestion = async () => {
    if (!form.unit || !form.question || !form.answer) {
      setAddMsg('単元・問題・答えは必須です')
      return
    }

    const payload: any = {
      field: form.field,
      unit: form.unit,
      question: form.question,
      type: form.type,
      answer: form.answer,
      explanation: form.explanation || null,
      grade: form.grade,
    }

    if (form.type === 'choice') {
      const filled = form.choices.filter(choice => choice.trim())
      if (filled.length !== 2) {
        setAddMsg('選択肢を2つ入力してください')
        return
      }
      if (!filled.includes(form.answer.trim())) {
        setAddMsg('正解は選択肢AかBのどちらかと同じ内容にしてください')
        return
      }
      payload.choices = filled
    }

    if (form.type === 'text') {
      payload.keywords = parseKeywordInput(form.keywords)
    }

    try {
      await ensureNoDuplicateQuestions([{
        field: payload.field,
        unit: payload.unit,
        question: payload.question,
        type: payload.type,
        choices: payload.choices ?? null,
        answer: payload.answer,
      }])
    } catch (error) {
      setAddMsg(`エラー: ${error instanceof Error ? error.message : '重複問題の確認に失敗しました。'}`)
      return
    }

    const { error } = await supabase.from('questions').insert([payload])
    if (error && isMissingColumnError(error, 'keywords')) {
      setAddMsg('エラー: Supabase の questions テーブルに keywords 列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。')
      return
    }
    if (error) {
      setAddMsg('エラー: ' + error.message)
      return
    }

    setAddMsg('✅ 問題を追加しました！')
    setForm({
      field: '生物',
      unit: '',
      question: '',
      type: 'choice',
      choices: ['', ''],
      answer: '',
      keywords: '',
      explanation: '',
      grade: '中3',
    })
    setTimeout(() => setAddMsg(''), 3000)
  }

  const handleBulkFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setBulkInput(text)
    setBulkMsg(`📄 ${file.name} を読み込みました。`)
    event.target.value = ''
  }

  const handleGlossaryBulkFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setGlossaryBulkInput(text)
    setGlossaryBulkMsg(`📄 ${file.name} を読み込みました。`)
    event.target.value = ''
  }

  const handleBulkImport = async () => {
    try {
      setBulkLoading(true)
      setBulkMsg('')
      const payload = parseBulkQuestions(bulkInput)

      await ensureNoDuplicateQuestions(
        payload.map(question => ({
          field: question.field,
          unit: question.unit,
          question: question.question,
          type: question.type,
          choices: question.choices,
          answer: question.answer,
        })),
      )

      for (let index = 0; index < payload.length; index += BULK_INSERT_CHUNK_SIZE) {
        const chunk = payload.slice(index, index + BULK_INSERT_CHUNK_SIZE)
        const { error } = await supabase.from('questions').insert(chunk)
        if (error && isMissingColumnError(error, 'keywords')) {
          throw new Error('Supabase の questions テーブルに keywords 列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。')
        }
        if (error) throw new Error(error.message)
      }

      setBulkMsg(`✅ ${payload.length}問を一括追加しました。`)
      if (tab === 'questions') await loadData()
    } catch (error) {
      setBulkMsg(`エラー: ${error instanceof Error ? error.message : '一括追加に失敗しました。'}`)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleGlossaryBulkImport = async () => {
    try {
      setGlossaryBulkLoading(true)
      setGlossaryBulkMsg('')
      const payload = parseBulkGlossaryEntries(glossaryBulkInput)

      for (let index = 0; index < payload.length; index += BULK_INSERT_CHUNK_SIZE) {
        const chunk = payload.slice(index, index + BULK_INSERT_CHUNK_SIZE)
        const { error } = await supabase
          .from('science_glossary_entries')
          .upsert(chunk as GlossaryInsert[], { onConflict: 'field,term' })

        if (error && isMissingRelationError(error, 'science_glossary_entries')) {
          throw new Error('Supabase に science_glossary_entries テーブルがありません。最新の supabase_schema.sql を SQL Editor で実行してください。')
        }
        if (error) throw new Error(error.message)
      }

      setGlossaryBulkMsg(`✅ ${payload.length}語を一括登録しました。既存の同じ field + term は上書きされています。`)
    } catch (error) {
      setGlossaryBulkMsg(`エラー: ${error instanceof Error ? error.message : '辞書の一括登録に失敗しました。'}`)
    } finally {
      setGlossaryBulkLoading(false)
    }
  }

  const handleRestoreFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setRestoreInput(text)
    setRestoreMsg(`📄 ${file.name} を読み込みました。`)
    event.target.value = ''
  }

  const handleRestoreBackup = async () => {
    if (!restoreInput.trim()) {
      setRestoreMsg('バックアップJSONを読み込んでください。')
      return
    }

    try {
      const snapshot = parseAdminRestorePayload(restoreInput)
      const confirmMessage = [
        '現在のバックアップ対象データを、このJSONの内容で置き換えて復元します。',
        `生徒: ${snapshot.students.length}件`,
        `問題: ${snapshot.questions.length}件`,
        ...(snapshot.hasGlossaryEntries ? [`辞書: ${snapshot.glossaryEntries.length}件`] : []),
        ...(snapshot.hasQuestionInquiries ? [`問い合わせ: ${snapshot.questionInquiries.length}件`] : []),
        `クイズ履歴: ${snapshot.quizSessions.length}件`,
        `解答ログ: ${snapshot.answerLogs.length}件`,
        ...(snapshot.hasChatGuardLogs ? [`チャット警告: ${snapshot.chatGuardLogs.length}件`] : []),
        ...(snapshot.hasEngagementTables ? [
          `デイリーチャレンジ: ${snapshot.dailyChallenges.length}件`,
          `学生バッジ: ${snapshot.studentBadges.length}件`,
          `タイムアタック記録: ${snapshot.timeAttackRecords.length}件`,
        ] : []),
        '',
        `questions${snapshot.hasGlossaryEntries ? ' / science_glossary_entries' : ''}${snapshot.hasQuestionInquiries ? ' / question_inquiries' : ''} / quiz_sessions / answer_logs は入れ替えになります。続けますか？`,
      ].join('\n')

      if (!confirm(confirmMessage)) return

      setRestoreLoading(true)
      setRestoreMsg('')

      const { error: studentError } = await supabase
        .from('students')
        .upsert(snapshot.students as any, { onConflict: 'id' })

      if (studentError) throw new Error(studentError.message)

      const { error: deleteAnswerLogsError } = await supabase
        .from('answer_logs')
        .delete()
        .not('id', 'is', null)
      if (deleteAnswerLogsError) throw new Error(deleteAnswerLogsError.message)

      const { error: deleteSessionsError } = await supabase
        .from('quiz_sessions')
        .delete()
        .not('id', 'is', null)
      if (deleteSessionsError) throw new Error(deleteSessionsError.message)

      const { error: deleteQuestionsError } = await supabase
        .from('questions')
        .delete()
        .not('id', 'is', null)
      if (deleteQuestionsError) throw new Error(deleteQuestionsError.message)

      if (snapshot.hasGlossaryEntries) {
        const { error: deleteGlossaryError } = await supabase
          .from('science_glossary_entries')
          .delete()
          .not('id', 'is', null)
        if (deleteGlossaryError) throw new Error(deleteGlossaryError.message)
      }

      if (snapshot.hasQuestionInquiries) {
        const { error: deleteQuestionInquiriesError } = await supabase
          .from('question_inquiries')
          .delete()
          .not('id', 'is', null)
        if (deleteQuestionInquiriesError) throw new Error(deleteQuestionInquiriesError.message)
      }

      if (snapshot.hasChatGuardLogs) {
        const { error: deleteChatGuardLogsError } = await supabase
          .from('chat_guard_logs')
          .delete()
          .not('id', 'is', null)
        if (deleteChatGuardLogsError) throw new Error(deleteChatGuardLogsError.message)
      }

      if (snapshot.hasEngagementTables) {
        const { error: deleteDailyChallengesError } = await supabase
          .from('daily_challenges')
          .delete()
          .not('student_id', 'is', null)
        if (deleteDailyChallengesError) throw new Error(deleteDailyChallengesError.message)

        const { error: deleteStudentBadgesError } = await supabase
          .from('student_badges')
          .delete()
          .not('student_id', 'is', null)
        if (deleteStudentBadgesError) throw new Error(deleteStudentBadgesError.message)

        const { error: deleteTimeAttackError } = await supabase
          .from('time_attack_records')
          .delete()
          .not('student_id', 'is', null)
        if (deleteTimeAttackError) throw new Error(deleteTimeAttackError.message)

        const { error: deleteBadgesError } = await supabase
          .from('badges')
          .delete()
          .not('id', 'is', null)
        if (deleteBadgesError) throw new Error(deleteBadgesError.message)
      }

      await insertRowsInChunks('questions', snapshot.questions as unknown as Record<string, unknown>[])
      if (snapshot.hasGlossaryEntries) {
        await insertRowsInChunks('science_glossary_entries', snapshot.glossaryEntries as unknown as Record<string, unknown>[])
      }
      if (snapshot.hasQuestionInquiries) {
        await insertRowsInChunks('question_inquiries', snapshot.questionInquiries as unknown as Record<string, unknown>[])
      }
      await insertRowsInChunks('quiz_sessions', snapshot.quizSessions as unknown as Record<string, unknown>[])
      await insertRowsInChunks('answer_logs', snapshot.answerLogs as unknown as Record<string, unknown>[])
      if (snapshot.hasChatGuardLogs) {
        await insertRowsInChunks('chat_guard_logs', snapshot.chatGuardLogs as unknown as Record<string, unknown>[])
      }
      if (snapshot.hasEngagementTables) {
        await insertRowsInChunks('badges', snapshot.badges as unknown as Record<string, unknown>[])
        await insertRowsInChunks('student_badges', snapshot.studentBadges as unknown as Record<string, unknown>[])
        await insertRowsInChunks('time_attack_records', snapshot.timeAttackRecords as unknown as Record<string, unknown>[])
        await insertRowsInChunks('daily_challenges', snapshot.dailyChallenges as unknown as Record<string, unknown>[])
      }

      setRestoreMsg(
        `✅ 復元しました。問題${snapshot.questions.length}件 / 履歴${snapshot.quizSessions.length}件 / 解答ログ${snapshot.answerLogs.length}件`
        + (snapshot.hasGlossaryEntries ? ` / 辞書${snapshot.glossaryEntries.length}件` : '')
        + (snapshot.hasQuestionInquiries ? ` / 問い合わせ${snapshot.questionInquiries.length}件` : '')
        + (snapshot.hasChatGuardLogs ? ` / チャット警告${snapshot.chatGuardLogs.length}件` : '')
        + (snapshot.hasEngagementTables ? ` / デイリー${snapshot.dailyChallenges.length}件 / バッジ${snapshot.studentBadges.length}件 / タイムアタック${snapshot.timeAttackRecords.length}件` : '')
        + ' を反映しました。'
        + (snapshot.defaultPasswordCount > 0
          ? ` 旧形式JSONだったため、生徒${snapshot.defaultPasswordCount}件のパスワードは既定値で補完しました。`
          : '')
      )
      await loadData()
    } catch (error) {
      const message = error instanceof Error ? getRestoreErrorMessage(error.message) : 'バックアップの復元に失敗しました。'
      setRestoreMsg(`エラー: ${message}`)
    } finally {
      setRestoreLoading(false)
    }
  }

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('この問題を削除しますか？')) return
    await supabase.from('questions').delete().eq('id', id)
    setQuestions(current => current.filter(question => question.id !== id))
  }

  const setQuestionImageSizeDraft = (questionId: string, next: { width?: string; height?: string }) => {
    setQuestionImageSizeDrafts(current => {
      const existing = current[questionId] ?? {
        width: String(QUESTION_IMAGE_DEFAULT_DISPLAY_SIZE),
        height: String(QUESTION_IMAGE_DEFAULT_DISPLAY_SIZE),
      }

      return {
        ...current,
        [questionId]: {
          width: next.width ?? existing.width,
          height: next.height ?? existing.height,
        },
      }
    })
  }

  const clearQuestionImageSizeDraft = (questionId: string) => {
    setQuestionImageSizeDrafts(current => {
      const next = { ...current }
      delete next[questionId]
      return next
    })
  }

  const getQuestionImageDraftSize = (question: QuestionRow) => {
    const stored = getQuestionImageDisplaySize(question)
    const draft = questionImageSizeDrafts[question.id]

    return {
      width: draft?.width ?? String(stored.width),
      height: draft?.height ?? String(stored.height),
      storedWidth: stored.width,
      storedHeight: stored.height,
    }
  }

  const parseQuestionImageDraftValue = (value: string, fallback: number) => {
    if (!value.trim()) return clampQuestionImageDisplayValue(fallback)
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return clampQuestionImageDisplayValue(fallback)
    return clampQuestionImageDisplayValue(parsed)
  }

  const handleQuestionImageChange = async (questionId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const currentQuestion = questions.find(question => question.id === questionId)
    const currentDisplay = currentQuestion
      ? getQuestionImageDisplaySize(currentQuestion)
      : {
          width: QUESTION_IMAGE_DEFAULT_DISPLAY_SIZE,
          height: QUESTION_IMAGE_DEFAULT_DISPLAY_SIZE,
        }

    try {
      setQuestionImageBusy({ questionId, action: 'upload' })
      setQuestionImageStatus(null)
      const compressed = await compressQuestionImageFile(file)
      const { data, error } = await supabase
        .from('questions')
        .update({
          image_url: compressed.dataUrl,
          image_display_width: currentDisplay.width,
          image_display_height: currentDisplay.height,
        })
        .eq('id', questionId)
        .select('*')
        .single()

      if (
        error
        && (
          isMissingColumnError(error, 'image_url')
          || isMissingColumnError(error, 'image_display_width')
          || isMissingColumnError(error, 'image_display_height')
        )
      ) {
        throw new Error('Supabase の questions テーブルの画像列が古いです。最新の supabase_schema.sql を SQL Editor で実行してください。')
      }
      if (error) throw new Error(error.message)

      setQuestions(current => current.map(question => (
        question.id === questionId
          ? data as QuestionRow
          : question
      )))
      setQuestionImageSizeDraft(questionId, {
        width: String(data.image_display_width ?? currentDisplay.width),
        height: String(data.image_display_height ?? currentDisplay.height),
      })
      setQuestionImageStatus({
        questionId,
        type: 'success',
        text: `画像を標準画質で保存しました。元画像 ${compressed.width} × ${compressed.height} / ${compressed.sizeLabel} / 表示 ${currentDisplay.width} × ${currentDisplay.height}`,
      })
    } catch (error) {
      setQuestionImageStatus({
        questionId,
        type: 'error',
        text: error instanceof Error ? error.message : '画像の保存に失敗しました。',
      })
    } finally {
      setQuestionImageBusy(null)
    }
  }

  const handleSaveQuestionImageSize = async (question: QuestionRow) => {
    const draft = getQuestionImageDraftSize(question)
    const width = parseQuestionImageDraftValue(draft.width, draft.storedWidth)
    const height = parseQuestionImageDraftValue(draft.height, draft.storedHeight)

    try {
      setQuestionImageBusy({ questionId: question.id, action: 'size' })
      setQuestionImageStatus(null)
      const { data, error } = await supabase
        .from('questions')
        .update({
          image_display_width: width,
          image_display_height: height,
        })
        .eq('id', question.id)
        .select('*')
        .single()

      if (
        error
        && (
          isMissingColumnError(error, 'image_display_width')
          || isMissingColumnError(error, 'image_display_height')
        )
      ) {
        throw new Error('Supabase の questions テーブルに画像サイズ列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。')
      }
      if (error) throw new Error(error.message)

      setQuestions(current => current.map(currentQuestion => (
        currentQuestion.id === question.id
          ? data as QuestionRow
          : currentQuestion
      )))
      setQuestionImageSizeDraft(question.id, {
        width: String(width),
        height: String(height),
      })
      setQuestionImageStatus({
        questionId: question.id,
        type: 'success',
        text: `表示サイズを保存しました。${width} × ${height}`,
      })
    } catch (error) {
      setQuestionImageStatus({
        questionId: question.id,
        type: 'error',
        text: error instanceof Error ? error.message : '画像サイズの保存に失敗しました。',
      })
    } finally {
      setQuestionImageBusy(null)
    }
  }

  const handleRemoveQuestionImage = async (questionId: string) => {
    try {
      setQuestionImageBusy({ questionId, action: 'remove' })
      setQuestionImageStatus(null)
      const { data, error } = await supabase
        .from('questions')
        .update({
          image_url: null,
          image_display_width: null,
          image_display_height: null,
        })
        .eq('id', questionId)
        .select('*')
        .single()

      if (
        error
        && (
          isMissingColumnError(error, 'image_url')
          || isMissingColumnError(error, 'image_display_width')
          || isMissingColumnError(error, 'image_display_height')
        )
      ) {
        throw new Error('Supabase の questions テーブルの画像列が古いです。最新の supabase_schema.sql を SQL Editor で実行してください。')
      }
      if (error) throw new Error(error.message)

      setQuestions(current => current.map(question => (
        question.id === questionId
          ? data as QuestionRow
          : question
      )))
      clearQuestionImageSizeDraft(questionId)
      setQuestionImageStatus({
        questionId,
        type: 'success',
        text: '画像を外しました。',
      })
    } catch (error) {
      setQuestionImageStatus({
        questionId,
        type: 'error',
        text: error instanceof Error ? error.message : '画像の削除に失敗しました。',
      })
    } finally {
      setQuestionImageBusy(null)
    }
  }

  if (!authed) {
    return (
      <div className="page-shell flex flex-col items-center justify-center">
        <button onClick={onBack} className="btn-secondary self-start mb-8">もどる</button>
        <div className="hero-card w-full max-w-sm p-6">
          <h2 className="text-2xl font-semibold mb-2 text-center text-white">もぎ先生ログイン</h2>
          <p className="text-slate-500 text-sm text-center mb-6">管理者パスワードを入力</p>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkPw()}
            placeholder="管理者パスワード"
            className="input-surface text-center mb-3"
            style={{ borderColor: pwError ? '#ef4444' : undefined }}
            autoFocus
          />
          {pwError && <p className="text-red-400 text-sm text-center mb-3">パスワードが違います</p>}
          <button onClick={checkPw} className="btn-primary w-full">ログイン</button>
        </div>
      </div>
    )
  }

  const studentNameMap = new Map(studentsList.map(student => [student.id, student.nickname]))
  const selectedStudent = selectedStudentId === null
    ? null
    : studentsList.find(student => student.id === selectedStudentId) ?? null

  return (
    <div className="page-shell-wide">
      <div className="hero-card science-surface p-5 sm:p-6 mb-6">
        <ScienceBackdrop />
        <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="btn-secondary">もどる</button>
            <div>
              <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2">Admin</div>
              <h1 className="font-display text-3xl text-white">管理画面</h1>
            </div>
          </div>
          <div className="segment-bar">
            {([['overview', '📊 生徒データ'], ['inquiries', '📨 問い合わせ'], ['questions', '📝 問題一覧'], ['add', '➕ 問題追加'], ['bulk', '📥 一括登録']] as const).map(([currentTab, label]) => (
              <button
                key={currentTab}
                onClick={() => setTab(currentTab)}
                className={`segment-button ${tab === currentTab ? 'is-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'overview' && (
        <div>
          {loading ? (
            <div className="text-slate-400 text-center py-12">読み込み中...</div>
          ) : (
            <div className="space-y-4">
              <div className="card">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-white font-bold">現在ログイン中</div>
                    <div className="text-slate-400 text-sm mt-1">
                      生徒には人数だけを出し、管理画面では誰がログイン中か確認できます。
                    </div>
                  </div>
                  <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(10, 132, 255, 0.12)', border: '1px solid rgba(10, 132, 255, 0.22)' }}>
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">ONLINE</div>
                    <div className="mt-2 font-display text-3xl text-white">{activeStudents.length}人</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {activeStudents.length > 0 ? activeStudents.map(student => (
                    <div key={student.id} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-white">{student.nickname}</div>
                          <div className="text-slate-400 text-xs mt-1">ID {student.id}</div>
                        </div>
                        <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-300">
                          ログイン中
                        </span>
                      </div>
                      <div className="text-slate-400 text-xs mt-3">
                        最終更新: {format(new Date(student.lastSeenAt), 'M/d HH:mm:ss', { locale: ja })}
                      </div>
                      <div className="text-slate-500 text-xs mt-1">
                        端末数: {student.sessionCount}
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
                      いまログイン中の生徒はいません。
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-white font-bold">全成績データをダウンロード</div>
                      <div className="text-slate-400 text-sm mt-1">
                      生徒情報、問題、辞書、問い合わせ、履歴、解答ログ、チャット警告ログを復元用JSONとしてまとめて保存します。
                      </div>
                    {exportMsg && (
                      <div
                        className="text-sm mt-2"
                        style={{ color: exportMsg.startsWith('✅') ? '#4ade80' : '#f87171' }}
                      >
                        {exportMsg}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleDownloadAllPerformance}
                    disabled={exportLoading}
                    className="btn-primary whitespace-nowrap disabled:opacity-60"
                  >
                    {exportLoading ? '作成中...' : '⬇️ 復元用JSONを保存'}
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[0.72fr_1.28fr]">
                  <div className="space-y-4">
                    <div>
                      <div className="text-white font-bold">リワード条件一覧</div>
                      <div className="text-slate-400 text-sm mt-1">
                        XP の入り方、称号レベル、バッジの条件をここで確認できます。
                      </div>
                    </div>

                    <div className="rounded-2xl border border-sky-500/16 bg-sky-500/6 p-4">
                      <div className="text-white font-semibold">XP の入り方</div>
                      <div className="mt-3 space-y-2">
                        {XP_RULES.map(rule => (
                          <div key={rule} className="rounded-xl bg-slate-950/35 px-3 py-2 text-sm text-slate-200">
                            {rule}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-violet-500/16 bg-violet-500/6 p-4">
                      <div className="text-white font-semibold">称号レベル</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {LEVEL_GUIDE.map(item => (
                          <div
                            key={item.level}
                            className="rounded-full border border-violet-400/20 bg-slate-950/35 px-3 py-2 text-xs font-semibold text-violet-100"
                          >
                            Lv.{item.level} {item.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-white font-semibold">バッジ条件</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {BADGE_DEFINITIONS.map(badge => {
                        const rarityStyle = BADGE_RARITY_STYLES[badge.rarity]
                        return (
                          <div
                            key={badge.key}
                            className="rounded-2xl border p-4"
                            style={{
                              borderColor: rarityStyle.borderColor,
                              background: rarityStyle.background,
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <div className="text-2xl">{badge.iconEmoji}</div>
                                <div>
                                  <div className="font-semibold text-white">{badge.name}</div>
                                  <div className="text-xs text-slate-400 mt-1">{badge.description}</div>
                                </div>
                              </div>
                              <span
                                className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em]"
                                style={{
                                  color: rarityStyle.textColor,
                                  background: 'rgba(2, 6, 23, 0.42)',
                                }}
                              >
                                {rarityStyle.label}
                              </span>
                            </div>
                            <div className="mt-3 rounded-xl bg-slate-950/35 px-3 py-2 text-sm text-slate-200">
                              条件: {BADGE_CONDITION_GUIDE[badge.key] ?? badge.description}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-white font-bold">問題問い合わせ</div>
                    <div className="text-slate-400 text-sm mt-1">
                      生徒が問題文や解答について送ってきた連絡をここで確認できます。
                    </div>
                  </div>
                  <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.22)' }}>
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">OPEN</div>
                    <div className="mt-2 font-display text-3xl text-white">
                      {questionInquiries.filter(inquiry => inquiry.status !== 'resolved').length}件
                    </div>
                  </div>
                </div>

                {questionInquiryLoadError ? (
                  <div className="mt-4 rounded-2xl border border-rose-500/18 bg-rose-500/6 px-4 py-5 text-sm text-rose-200">
                    {questionInquiryLoadError}
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {questionInquiries.length > 0 ? questionInquiries.slice(0, 6).map(inquiry => {
                      const statusMeta = QUESTION_INQUIRY_STATUS_META[inquiry.status]
                      return (
                        <div key={inquiry.id} className="rounded-2xl border border-sky-500/18 bg-sky-500/6 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white">{inquiry.student_nickname}</span>
                              <span className="text-slate-500 text-xs">ID {inquiry.student_id}</span>
                              <span
                                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                style={{ background: `${getFieldColor(inquiry.field)}20`, color: getFieldColor(inquiry.field) }}
                              >
                                {inquiry.field}
                              </span>
                              <span
                                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                style={{ background: statusMeta.background, color: statusMeta.color }}
                              >
                                {statusMeta.label}
                              </span>
                              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                                {getQuestionInquiryCategoryLabel(inquiry.category)}
                              </span>
                            </div>
                            <div className="text-slate-500 text-xs">
                              {format(new Date(inquiry.created_at), 'M/d HH:mm', { locale: ja })}
                            </div>
                          </div>
                          <div className="mt-3 text-sm leading-6 text-slate-200">
                            {inquiry.message || '追加メッセージなし'}
                          </div>
                          <div className="mt-3 rounded-xl bg-slate-950/40 px-3 py-3 text-xs leading-6 text-slate-300">
                            <div className="font-semibold text-white">{inquiry.unit}</div>
                            <div className="mt-1">{inquiry.question_text}</div>
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
                        まだ問題問い合わせはありません。
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-white font-bold">チャット警告</div>
                    <div className="text-slate-400 text-sm mt-1">
                      悪口や下ネタを含む入力を検知すると、ここに記録します。
                    </div>
                  </div>
                  <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(248, 113, 113, 0.12)', border: '1px solid rgba(248, 113, 113, 0.22)' }}>
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">ALERT</div>
                    <div className="mt-2 font-display text-3xl text-white">{chatGuardLogs.length}件</div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {chatGuardLogs.length > 0 ? chatGuardLogs.map(log => (
                    <div key={log.id} className="rounded-2xl border border-rose-500/18 bg-rose-500/6 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-white">
                            {studentNameMap.get(log.student_id) ?? `ID ${log.student_id}`}
                          </span>
                          <span className="text-slate-500 text-xs">ID {log.student_id}</span>
                          <span
                            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={{ background: `${getFieldColor(log.field)}20`, color: getFieldColor(log.field) }}
                          >
                            {log.field}
                          </span>
                          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                            {log.source === 'send' ? '送信時' : '入力中'}
                          </span>
                        </div>
                        <div className="text-slate-500 text-xs">
                          {format(new Date(log.created_at), 'M/d HH:mm:ss', { locale: ja })}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {log.categories.map(category => (
                          <span
                            key={`${log.id}-${category}`}
                            className="rounded-full bg-rose-500/12 px-2.5 py-1 text-[11px] font-semibold text-rose-200"
                          >
                            {getChatModerationCategoryLabel(category as 'abuse' | 'sexual')}
                          </span>
                        ))}
                        {log.matched_terms.map(term => (
                          <span
                            key={`${log.id}-${term}`}
                            className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300"
                          >
                            {term}
                          </span>
                        ))}
                      </div>

                      <div className="mt-3 text-sm leading-6 text-slate-200">
                        {log.message_excerpt}
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
                      まだチャット警告はありません。
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="text-white font-bold">バックアップJSONから復元</div>
                <div className="text-slate-400 text-sm mt-1 leading-6">
                  管理画面から保存したバックアップJSONを読み込んで、問題・辞書・問い合わせ・履歴・解答ログ・チャット警告ログを復元します。
                  テーブル自体が消えている場合は、先に `supabase_schema.sql` を SQL Editor で実行してください。
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  <label className="btn-secondary text-sm cursor-pointer">
                    バックアップJSONを読み込む
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleRestoreFileChange}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => {
                      setRestoreInput('')
                      setRestoreMsg('')
                    }}
                    className="btn-ghost text-sm"
                  >
                    入力をクリア
                  </button>
                </div>
                <label className="text-slate-400 text-xs mt-4 mb-2 block">バックアップJSON</label>
                <textarea
                  value={restoreInput}
                  onChange={event => setRestoreInput(event.target.value)}
                  rows={10}
                  className="input-surface resize-y font-mono text-sm"
                  placeholder="ここにバックアップJSONを貼り付けるか、上のボタンから読み込んでください。"
                  spellCheck={false}
                />
                {restoreMsg && (
                  <p className={`mt-3 text-sm ${restoreMsg.startsWith('✅') || restoreMsg.startsWith('📄') ? 'text-green-400' : 'text-red-400'}`}>
                    {restoreMsg}
                  </p>
                )}
                <button
                  onClick={handleRestoreBackup}
                  className="btn-primary w-full mt-4"
                  disabled={restoreLoading}
                  style={{ opacity: restoreLoading ? 0.7 : 1 }}
                >
                  {restoreLoading ? '復元中...' : 'JSONから復元する'}
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {stats.map(student => {
                const rate = student.totalQ > 0 ? Math.round((student.totalC / student.totalQ) * 100) : 0
                const isOnline = activeStudents.some(current => current.id === student.id)
                return (
                  <div key={student.id} className="card">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
                      <div className="flex items-start gap-3">
                        <div className="font-display text-3xl text-blue-400">{student.id}</div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-bold text-white text-lg">{student.nickname}</div>
                            {isOnline && (
                              <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                                ログイン中
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500 text-xs mt-1">PW: <span className="text-slate-200 font-mono">{student.password}</span></div>
                          <div className="text-slate-500 text-xs mt-1">
                            {student.lastActivity
                              ? `最終: ${format(new Date(student.lastActivity), 'M/d HH:mm', { locale: ja })}`
                              : '未使用'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-2xl" style={{
                          color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444',
                        }}>{rate}%</div>
                        <div className="text-slate-400 text-sm">{student.totalQ}問</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {FIELDS.map(field => {
                        const current = student.byField[field]
                        const fieldRate = current && current.total > 0 ? Math.round((current.correct / current.total) * 100) : null
                        return (
                          <div key={field} className="text-center">
                            <div className="text-xs text-slate-500 mb-1">{field}</div>
                            {fieldRate !== null ? (
                              <>
                                <div className="text-sm font-bold" style={{ color: getFieldColor(field) }}>{fieldRate}%</div>
                                <div className="text-xs text-slate-600">{current!.total}問</div>
                              </>
                            ) : (
                              <div className="text-xs text-slate-600">—</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <button
                      onClick={() => setSelectedStudentId(student.id)}
                      className="btn-secondary mt-4 w-full text-sm"
                      style={{
                        background: selectedStudentId === student.id ? 'rgba(56, 189, 248, 0.16)' : undefined,
                        borderColor: selectedStudentId === student.id ? 'rgba(56, 189, 248, 0.24)' : undefined,
                        color: selectedStudentId === student.id ? '#bae6fd' : undefined,
                      }}
                    >
                      {selectedStudentId === student.id ? '詳細を表示中' : '詳細を見る'}
                    </button>
                  </div>
                )
              })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'inquiries' && (
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-slate-400">
                {questionInquiries.length}件の問い合わせ
                {questionInquiries.length > 0 && (
                  <span className="ml-2 text-slate-500 text-sm">
                    未対応 {questionInquiries.filter(inquiry => inquiry.status !== 'resolved').length}件
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                問題文・選択肢・正解・解説は、生徒が送信した時点の内容を自動添付しています。
              </p>
            </div>
          </div>

          {loading ? (
            <div className="text-slate-400 text-center py-12">読み込み中...</div>
          ) : questionInquiryLoadError ? (
            <div className="card text-red-300">{questionInquiryLoadError}</div>
          ) : questionInquiries.length === 0 ? (
            <div className="card text-slate-400 text-center py-12">
              まだ問い合わせはありません。
            </div>
          ) : (
            <div className="space-y-3">
              {questionInquiries.map(inquiry => {
                const statusMeta = QUESTION_INQUIRY_STATUS_META[inquiry.status]
                const isBusy = questionInquiryActionId === inquiry.id
                const noteDirty = (questionInquiryNoteDrafts[inquiry.id] ?? '') !== (inquiry.admin_note ?? '')
                const replyDirty = (questionInquiryReplyDrafts[inquiry.id] ?? '') !== (inquiry.admin_reply ?? '')

                return (
                  <div key={inquiry.id} className="card">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{inquiry.student_nickname}</span>
                            <span className="text-slate-500 text-xs">ID {inquiry.student_id}</span>
                            <span
                              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{ background: `${getFieldColor(inquiry.field)}20`, color: getFieldColor(inquiry.field) }}
                            >
                              {inquiry.field}
                            </span>
                            <span
                              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{ background: statusMeta.background, color: statusMeta.color }}
                            >
                              {statusMeta.label}
                            </span>
                            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                              {getQuestionInquiryCategoryLabel(inquiry.category)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            受信: {format(new Date(inquiry.created_at), 'yyyy/M/d HH:mm', { locale: ja })}
                            {inquiry.resolved_at ? ` / 対応完了: ${format(new Date(inquiry.resolved_at), 'M/d HH:mm', { locale: ja })}` : ''}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(['open', 'reviewing', 'resolved'] as const).map(status => (
                            <button
                              key={status}
                              onClick={() => {
                                void handleQuestionInquiryStatusChange(inquiry, status)
                              }}
                              className="btn-secondary text-sm"
                              disabled={isBusy || inquiry.status === status}
                              style={{
                                opacity: isBusy || inquiry.status === status ? 0.7 : 1,
                                borderColor: inquiry.status === status ? statusMeta.color : undefined,
                              }}
                            >
                              {QUESTION_INQUIRY_STATUS_META[status].label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-sky-500/14 bg-slate-950/35 px-4 py-3">
                        <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">生徒メッセージ</div>
                        <div className="mt-2 text-sm leading-6 text-slate-100">
                          {inquiry.message || '追加メッセージなし'}
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-4">
                          <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">自動添付された問題内容</div>
                          <div className="mt-3 space-y-3 text-sm leading-6 text-slate-200">
                            <div>
                              <div className="text-xs text-slate-500">単元</div>
                              <div className="mt-1 text-white">{inquiry.unit}</div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500">問題文</div>
                              <div className="mt-1 text-white">{inquiry.question_text}</div>
                            </div>
                            {inquiry.choices && inquiry.choices.length > 0 && (
                              <div>
                                <div className="text-xs text-slate-500">選択肢</div>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {inquiry.choices.map(choice => (
                                    <span key={`${inquiry.id}-${choice}`} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">
                                      {choice}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div>
                              <div className="text-xs text-slate-500">正解</div>
                              <div className="mt-1 text-emerald-300">{inquiry.answer_text}</div>
                            </div>
                            {inquiry.explanation_text && (
                              <div>
                                <div className="text-xs text-slate-500">解説</div>
                                <div className="mt-1">{inquiry.explanation_text}</div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          {inquiry.image_url && (
                            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-4">
                              <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">問題画像</div>
                              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50">
                                <img
                                  src={inquiry.image_url}
                                  alt={`${inquiry.question_text} の画像`}
                                  className="block max-h-72 w-full object-contain"
                                  loading="lazy"
                                />
                              </div>
                            </div>
                          )}

                          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">生徒への返信</div>
                              {inquiry.replied_at && (
                                <div className="text-[11px] text-slate-500">
                                  {format(new Date(inquiry.replied_at), 'M/d HH:mm', { locale: ja })}
                                </div>
                              )}
                            </div>
                            <textarea
                              value={questionInquiryReplyDrafts[inquiry.id] ?? ''}
                              onChange={event => {
                                const value = event.target.value
                                setQuestionInquiryReplyDrafts(current => ({ ...current, [inquiry.id]: value }))
                              }}
                              rows={5}
                              className="input-surface mt-3 resize-y text-sm"
                              placeholder="生徒に見せる返信を書けます。空にすると返信なしになります。"
                            />
                            <button
                              onClick={() => {
                                void handleSaveQuestionInquiryReply(inquiry.id)
                              }}
                              className="btn-primary mt-3 w-full text-sm"
                              disabled={isBusy || !replyDirty}
                              style={{ opacity: isBusy || !replyDirty ? 0.7 : 1 }}
                            >
                              {isBusy ? '保存中...' : '返信を保存'}
                            </button>
                          </div>

                          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-4">
                            <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">対応メモ</div>
                            <textarea
                              value={questionInquiryNoteDrafts[inquiry.id] ?? ''}
                              onChange={event => {
                                const value = event.target.value
                                setQuestionInquiryNoteDrafts(current => ({ ...current, [inquiry.id]: value }))
                              }}
                              rows={5}
                              className="input-surface mt-3 resize-y text-sm"
                              placeholder="管理側メモを残せます。"
                            />
                            <button
                              onClick={() => {
                                void handleSaveQuestionInquiryNote(inquiry.id)
                              }}
                              className="btn-secondary mt-3 w-full text-sm"
                              disabled={isBusy || !noteDirty}
                              style={{ opacity: isBusy || !noteDirty ? 0.7 : 1 }}
                            >
                              {isBusy ? '保存中...' : 'メモを保存'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'questions' && (
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-slate-400">
                {questions.length}問登録済み
                {questions.length > 0 && (
                  <span className="ml-2 text-slate-500 text-sm">
                    生徒作成 {questions.filter(question => question.created_by_student_id !== null).length}問
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                ここから画像を追加すると、ブラウザ側で圧縮して保存し、出題画面にもそのまま表示されます。
              </p>
            </div>
            <button
              onClick={handleSeedQuestions}
              className="btn-secondary text-sm"
            >
              📦 サンプル問題を追加
            </button>
          </div>
          {loading ? (
            <div className="text-slate-400 text-center py-12">読み込み中...</div>
          ) : (
            <div className="space-y-2">
              {questions.map(question => {
                const previewImageSize = getQuestionImageDisplaySize(question)
                const draftImageSize = getQuestionImageDraftSize(question)
                const busyAction = questionImageBusy?.questionId === question.id ? questionImageBusy.action : null
                const isImageBusy = questionImageBusy?.questionId === question.id
                const nextWidth = parseQuestionImageDraftValue(draftImageSize.width, draftImageSize.storedWidth)
                const nextHeight = parseQuestionImageDraftValue(draftImageSize.height, draftImageSize.storedHeight)
                const sizeDirty = nextWidth !== draftImageSize.storedWidth || nextHeight !== draftImageSize.storedHeight

                return (
                <div key={question.id} className="subcard p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                          style={{ background: `${getFieldColor(question.field)}20`, color: getFieldColor(question.field) }}
                        >
                          {question.field}
                        </span>
                        <span className="text-slate-400 text-xs flex-shrink-0">{question.unit}</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                          style={{
                            background: question.created_by_student_id ? '#f59e0b20' : 'var(--surface-elevated-border)',
                            color: question.created_by_student_id ? '#fbbf24' : 'var(--text-muted)',
                          }}
                        >
                          {question.created_by_student_id ? `ID ${question.created_by_student_id} 作成` : '共有問題'}
                        </span>
                        {question.image_url && (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                            style={{ background: 'rgba(56, 189, 248, 0.14)', color: '#7dd3fc' }}
                          >
                            画像あり
                          </span>
                        )}
                      </div>
                      <p className="text-white text-sm flex-1 line-clamp-2">{question.question}</p>
                      <button
                        onClick={() => handleDeleteQuestion(question.id)}
                        className="text-red-500 hover:text-red-300 text-xs flex-shrink-0 transition-colors"
                      >
                        削除
                      </button>
                    </div>
                    {question.image_url && (
                      <div className="space-y-3">
                        <div className="flex justify-center">
                          <div
                            className="overflow-hidden rounded-2xl border bg-slate-950/50"
                            style={{
                              borderColor: 'rgba(148, 163, 184, 0.16)',
                              width: `min(100%, ${previewImageSize.width}px)`,
                              aspectRatio: previewImageSize.aspectRatio,
                            }}
                          >
                            <img
                              src={question.image_url}
                              alt={`${question.question} の画像`}
                              className="block h-full w-full object-fill"
                              loading="lazy"
                            />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">表示サイズ</div>
                              <div className="mt-1 text-xs text-slate-500">
                                基本は正方形ですが、幅と高さを別々に変えて自由に変形できます。
                              </div>
                            </div>
                            <div className="text-xs text-slate-400">
                              現在 {draftImageSize.storedWidth} × {draftImageSize.storedHeight}
                            </div>
                          </div>
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <label className="block">
                              <span className="text-xs text-slate-400">幅</span>
                              <div className="mt-2 flex items-center gap-3">
                                <input
                                  type="range"
                                  min={QUESTION_IMAGE_MIN_DISPLAY_SIZE}
                                  max={QUESTION_IMAGE_MAX_DISPLAY_SIZE}
                                  step={10}
                                  value={nextWidth}
                                  onChange={event => {
                                    setQuestionImageSizeDraft(question.id, { width: event.target.value })
                                  }}
                                  className="flex-1 accent-sky-400"
                                />
                                <input
                                  type="number"
                                  min={QUESTION_IMAGE_MIN_DISPLAY_SIZE}
                                  max={QUESTION_IMAGE_MAX_DISPLAY_SIZE}
                                  step={10}
                                  value={draftImageSize.width}
                                  onChange={event => {
                                    setQuestionImageSizeDraft(question.id, { width: event.target.value })
                                  }}
                                  className="input-surface w-24 text-sm"
                                />
                              </div>
                            </label>
                            <label className="block">
                              <span className="text-xs text-slate-400">高さ</span>
                              <div className="mt-2 flex items-center gap-3">
                                <input
                                  type="range"
                                  min={QUESTION_IMAGE_MIN_DISPLAY_SIZE}
                                  max={QUESTION_IMAGE_MAX_DISPLAY_SIZE}
                                  step={10}
                                  value={nextHeight}
                                  onChange={event => {
                                    setQuestionImageSizeDraft(question.id, { height: event.target.value })
                                  }}
                                  className="flex-1 accent-emerald-400"
                                />
                                <input
                                  type="number"
                                  min={QUESTION_IMAGE_MIN_DISPLAY_SIZE}
                                  max={QUESTION_IMAGE_MAX_DISPLAY_SIZE}
                                  step={10}
                                  value={draftImageSize.height}
                                  onChange={event => {
                                    setQuestionImageSizeDraft(question.id, { height: event.target.value })
                                  }}
                                  className="input-surface w-24 text-sm"
                                />
                              </div>
                            </label>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => {
                                void handleSaveQuestionImageSize(question)
                              }}
                              className="btn-secondary text-sm"
                              disabled={isImageBusy || !sizeDirty}
                            >
                              {busyAction === 'size' ? 'サイズを保存中...' : 'サイズを保存'}
                            </button>
                            <button
                              onClick={() => {
                                setQuestionImageSizeDraft(question.id, {
                                  width: String(QUESTION_IMAGE_DEFAULT_DISPLAY_SIZE),
                                  height: String(QUESTION_IMAGE_DEFAULT_DISPLAY_SIZE),
                                })
                              }}
                              className="btn-ghost text-sm"
                              disabled={isImageBusy}
                            >
                              正方形に戻す
                            </button>
                            <span className="text-xs text-slate-500">
                              保存後は出題画面でも {nextWidth} × {nextHeight} の比率で表示されます。
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="btn-secondary cursor-pointer text-sm">
                        {busyAction === 'upload' ? '画像を保存中...' : question.image_url ? '画像を差し替える' : '画像を挿入する'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={isImageBusy}
                          onChange={event => {
                            void handleQuestionImageChange(question.id, event)
                          }}
                        />
                      </label>
                      {question.image_url && (
                        <button
                          onClick={() => {
                            void handleRemoveQuestionImage(question.id)
                          }}
                          className="btn-ghost text-sm"
                          disabled={isImageBusy}
                        >
                          {busyAction === 'remove' ? '画像を外し中...' : '画像を外す'}
                        </button>
                      )}
                    </div>
                    {questionImageStatus?.questionId === question.id && (
                      <div
                        className="rounded-2xl px-4 py-3 text-sm"
                        style={{
                          background: questionImageStatus.type === 'success' ? '#052e16' : '#450a0a',
                          border: `1px solid ${questionImageStatus.type === 'success' ? '#166534' : '#991b1b'}`,
                          color: questionImageStatus.type === 'success' ? '#86efac' : '#fca5a5',
                        }}
                      >
                        {questionImageStatus.text}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-slate-500 text-xs">答え: {question.answer}</div>
                  {question.type === 'text' && question.keywords && question.keywords.length > 0 && (
                    <div className="mt-1 text-amber-300 text-xs">キーワード: {question.keywords.join(' / ')}</div>
                  )}
                </div>
              )})}
              {questions.length === 0 && (
                <div className="text-slate-500 text-center py-12 card">
                  問題がありません。サンプルを追加するか、「問題追加」タブから入力してください。
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'add' && (
        <div className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">分野 *</label>
              <select
                value={form.field}
                onChange={e => setForm(current => ({ ...current, field: e.target.value as typeof FIELDS[number] }))}
                className="input-surface"
              >
                {FIELDS.map(field => <option key={field}>{field}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">種別 *</label>
              <select
                value={form.type}
                onChange={e => setForm(current => ({ ...current, type: e.target.value as 'choice' | 'text' }))}
                className="input-surface"
              >
                <option value="choice">2択</option>
                <option value="text">記述</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">単元 *</label>
              <input
                value={form.unit}
                onChange={e => setForm(current => ({ ...current, unit: e.target.value }))}
                placeholder="例: 細胞と生物"
                className="input-surface"
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">学年</label>
              <select
                value={form.grade}
                onChange={e => setForm(current => ({ ...current, grade: e.target.value }))}
                className="input-surface"
              >
                {['中1', '中2', '中3', '高校'].map(grade => <option key={grade}>{grade}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-xs mb-1 block">問題文 *</label>
            <textarea
              value={form.question}
              onChange={e => setForm(current => ({ ...current, question: e.target.value }))}
              placeholder="問題文を入力..."
              rows={3}
              className="input-surface resize-none"
            />
          </div>

          {form.type === 'choice' && (
            <div>
              <label className="text-slate-400 text-xs mb-1 block">選択肢（A・B）</label>
              <div className="grid grid-cols-1 gap-2">
                {form.choices.map((choice, index) => (
                  <input
                    key={index}
                    value={choice}
                    onChange={e => setForm(current => ({
                      ...current,
                      choices: current.choices.map((currentChoice, currentIndex) => currentIndex === index ? e.target.value : currentChoice),
                    }))}
                    placeholder={`${'AB'[index]}. 選択肢`}
                    className="input-surface"
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-slate-400 text-xs mb-1 block">正解 *</label>
            <input
              value={form.answer}
              onChange={e => setForm(current => ({ ...current, answer: e.target.value }))}
              placeholder={form.type === 'choice' ? '正解をそのまま入力（AかBと同じ文）' : '模範解答文を入力'}
              className="input-surface"
            />
          </div>

          {form.type === 'text' && (
            <div>
              <label className="text-slate-400 text-xs mb-1 block">キーワード（任意）</label>
              <input
                value={form.keywords}
                onChange={e => setForm(current => ({ ...current, keywords: e.target.value }))}
                placeholder="例: アンペア, 電流"
                className="input-surface"
              />
              <p className="text-slate-500 text-xs mt-2">
                記述問題は、`answer` の模範解答文に対する穴埋めとして出題されます。ここに空欄にしたい理科キーワードを入れておくと、生徒はその語句だけ入力すれば正解になります。
              </p>
            </div>
          )}

          <div>
            <label className="text-slate-400 text-xs mb-1 block">解説（任意）</label>
            <textarea
              value={form.explanation}
              onChange={e => setForm(current => ({ ...current, explanation: e.target.value }))}
              placeholder="解説文..."
              rows={2}
              className="input-surface resize-none"
            />
          </div>

          {addMsg && <p className={`text-sm ${addMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{addMsg}</p>}
          <button onClick={handleAddQuestion} className="btn-primary w-full">問題を追加する</button>
        </div>
      )}

      {tab === 'bulk' && (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="card">
                <h3 className="text-white font-bold mb-2">問題 JSON 一括追加</h3>
                <p className="text-slate-400 text-sm leading-6">
                  JSON をそのまま貼り付けるか、`.json` ファイルを読み込んで一括追加できます。
                  choice 問題は `choices` を2件、text 問題は `choices` なしで入力してください。
                  記述問題では `answer` に模範解答文、`keywords` に空欄にしたい理科キーワードを入れると、穴埋め形式で出題できます。
                </p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <label className="btn-secondary text-sm cursor-pointer">
                    JSONファイルを読み込む
                    <input type="file" accept=".json,application/json" onChange={handleBulkFileChange} className="hidden" />
                  </label>
                  <button
                    onClick={() => setBulkInput(BULK_JSON_EXAMPLE)}
                    className="btn-ghost text-sm"
                  >
                    サンプルJSONを入れる
                  </button>
                </div>
              </div>

              <div className="card">
                <label className="text-slate-400 text-xs mb-2 block">問題 JSON データ</label>
                <textarea
                  value={bulkInput}
                  onChange={event => setBulkInput(event.target.value)}
                  rows={18}
                  className="input-surface resize-y font-mono text-sm"
                  spellCheck={false}
                />
                {bulkMsg && (
                  <p className={`mt-3 text-sm ${bulkMsg.startsWith('✅') || bulkMsg.startsWith('📄') ? 'text-green-400' : 'text-red-400'}`}>
                    {bulkMsg}
                  </p>
                )}
                <button
                  onClick={handleBulkImport}
                  className="btn-primary w-full mt-4"
                  disabled={bulkLoading}
                  style={{ opacity: bulkLoading ? 0.7 : 1 }}
                >
                  {bulkLoading ? '一括追加中...' : '問題JSONを一括追加する'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card">
                <h3 className="text-white font-bold mb-2">辞書 JSON 一括登録</h3>
                <p className="text-slate-400 text-sm leading-6">
                  辞書語句も管理画面からまとめて登録できます。
                  `shortDescription` は一覧用の短い説明、`description` は詳細説明です。
                  `related` と `tags` は文字列配列で、同じ `field + term` は上書き更新されます。
                </p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <label className="btn-secondary text-sm cursor-pointer">
                    JSONファイルを読み込む
                    <input type="file" accept=".json,application/json" onChange={handleGlossaryBulkFileChange} className="hidden" />
                  </label>
                  <button
                    onClick={() => setGlossaryBulkInput(GLOSSARY_BULK_JSON_EXAMPLE)}
                    className="btn-ghost text-sm"
                  >
                    サンプルJSONを入れる
                  </button>
                </div>
              </div>

              <div className="card">
                <label className="text-slate-400 text-xs mb-2 block">辞書 JSON データ</label>
                <textarea
                  value={glossaryBulkInput}
                  onChange={event => setGlossaryBulkInput(event.target.value)}
                  rows={18}
                  className="input-surface resize-y font-mono text-sm"
                  spellCheck={false}
                />
                {glossaryBulkMsg && (
                  <p className={`mt-3 text-sm ${glossaryBulkMsg.startsWith('✅') || glossaryBulkMsg.startsWith('📄') ? 'text-green-400' : 'text-red-400'}`}>
                    {glossaryBulkMsg}
                  </p>
                )}
                <button
                  onClick={handleGlossaryBulkImport}
                  className="btn-primary w-full mt-4"
                  disabled={glossaryBulkLoading}
                  style={{ opacity: glossaryBulkLoading ? 0.7 : 1 }}
                >
                  {glossaryBulkLoading ? '登録中...' : '辞書JSONを一括登録する'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedStudentId !== null && (
        <AdminStudentDetailSheet
          student={selectedStudent}
          detail={selectedStudentDetail}
          loading={selectedStudentDetailLoading}
          error={selectedStudentDetailError}
          onClose={() => {
            setSelectedStudentId(null)
            setSelectedStudentDetail(null)
            setSelectedStudentDetailLoading(false)
            setSelectedStudentDetailError(null)
          }}
        />
      )}
    </div>
  )
}
