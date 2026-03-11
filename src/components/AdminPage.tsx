'use client'
import { ChangeEvent, useEffect, useState } from 'react'
import { Database, supabase } from '@/lib/supabase'
import { DEFAULT_STUDENTS, fetchStudents, useAuth } from '@/lib/auth'
import { sampleQuestions } from '@/lib/sampleQuestions'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { getChatModerationCategoryLabel } from '@/lib/chatModeration'
import { isMissingColumnError, isMissingRelationError } from '@/lib/schemaCompat'
import { fetchActiveSessions } from '@/lib/activeSessions'

const ADMIN_PW = 'rikaadmin2026'
const FIELDS = ['生物', '化学', '物理', '地学'] as const
const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e',
  '化学': '#f97316',
  '物理': '#3b82f6',
  '地学': '#a855f7',
}
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
type StudentInsert = Database['public']['Tables']['students']['Insert']

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

type AdminTab = 'overview' | 'questions' | 'add' | 'bulk'

interface RestoreSnapshot {
  format: string
  students: StudentInsert[]
  questions: QuestionRow[]
  quizSessions: QuizSessionRow[]
  answerLogs: AnswerLogRow[]
  chatGuardLogs: ChatGuardLogRow[]
  hasChatGuardLogs: boolean
  defaultPasswordCount: number
}

function buildStudentStats(
  students: Array<{ id: number; nickname: string; password: string }>,
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

function parseAdminRestorePayload(jsonText: string): RestoreSnapshot {
  const parsed = JSON.parse(jsonText) as Record<string, unknown>
  const format = typeof parsed.format === 'string' ? parsed.format : ''

  if (!format.startsWith('rikarikastudy-admin-export/')) {
    throw new Error('管理画面から出力したバックアップJSONを読み込んでください。')
  }

  const questionCatalog = Array.isArray(parsed.questionCatalog)
    ? parsed.questionCatalog as QuestionRow[]
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
    }
  })

  return {
    format,
    students,
    questions: questionCatalog,
    quizSessions,
    answerLogs,
    chatGuardLogs,
    hasChatGuardLogs,
    defaultPasswordCount,
  }
}

async function insertRowsInChunks(
  table: 'questions' | 'quiz_sessions' | 'answer_logs' | 'chat_guard_logs',
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
  if (message.includes('password') || message.includes('duration_seconds') || message.includes('created_by_student_id')) {
    return 'Supabase の schema が古い可能性があります。最新の supabase_schema.sql を SQL Editor で実行してから復元してください。'
  }
  if (message.includes('keywords')) {
    return 'Supabase の questions テーブルに keywords 列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。'
  }
  if (message.includes('chat_guard_logs')) {
    return 'Supabase の schema が古い可能性があります。最新の supabase_schema.sql を SQL Editor で実行してから復元してください。'
  }
  return message
}

export default function AdminPage({ onBack }: { onBack: () => void }) {
  const { lockedStudentId, clearDeviceLock } = useAuth()
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [tab, setTab] = useState<AdminTab>('overview')
  const [studentsList, setStudentsList] = useState<Array<{ id: number; nickname: string; password: string }>>([])
  const [stats, setStats] = useState<StudentStats[]>([])
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [activeStudents, setActiveStudents] = useState<ActiveStudentStatus[]>([])
  const [chatGuardLogs, setChatGuardLogs] = useState<ChatGuardLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [bulkInput, setBulkInput] = useState(BULK_JSON_EXAMPLE)
  const [bulkMsg, setBulkMsg] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
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

  const loadData = async () => {
    setLoading(true)

    if (tab === 'overview') {
      const [students, { data: sessions }, activeSessionRows, chatGuardLogsResponse] = await Promise.all([
        fetchStudents(),
        supabase.from('quiz_sessions').select('*'),
        fetchActiveSessions(),
        supabase.from('chat_guard_logs').select('*').order('created_at', { ascending: false }).limit(20),
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
    } else if (tab === 'questions') {
      const { data } = await supabase.from('questions').select('*').order('created_at', { ascending: false })
      setQuestions((data || []) as QuestionRow[])
    }

    setLoading(false)
  }

  const handleDownloadAllPerformance = async () => {
    try {
      setExportLoading(true)
      setExportMsg('')

      const [students, sessionsResponse, answerLogsResponse, questionsResponse, chatGuardLogsResponse] = await Promise.all([
        fetchStudents(),
        supabase.from('quiz_sessions').select('*').order('created_at', { ascending: false }),
        supabase.from('answer_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('questions').select('*').order('created_at', { ascending: false }),
        supabase.from('chat_guard_logs').select('*').order('created_at', { ascending: false }),
      ])

      if (sessionsResponse.error) throw new Error(sessionsResponse.error.message)
      if (answerLogsResponse.error) throw new Error(answerLogsResponse.error.message)
      if (questionsResponse.error) throw new Error(questionsResponse.error.message)
      if (chatGuardLogsResponse.error && !isMissingRelationError(chatGuardLogsResponse.error, 'chat_guard_logs')) {
        throw new Error(chatGuardLogsResponse.error.message)
      }

      const sessions = (sessionsResponse.data || []) as QuizSessionRow[]
      const answerLogs = (answerLogsResponse.data || []) as AnswerLogRow[]
      const questions = (questionsResponse.data || []) as QuestionRow[]
      const chatGuardLogs = (chatGuardLogsResponse.data || []) as ChatGuardLogRow[]
      const statsSnapshot = buildStudentStats(students, sessions)

      const payload = {
        exportedAt: new Date().toISOString(),
        format: 'rikarikastudy-admin-export/v3',
        restoreHint: 'テーブルが消えている場合は、先に supabase_schema.sql を SQL Editor で実行してから復元してください。',
        questionCatalog: questions,
        chatGuardLogs,
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

  const handleBulkImport = async () => {
    try {
      setBulkLoading(true)
      setBulkMsg('')
      const payload = parseBulkQuestions(bulkInput)

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
        `クイズ履歴: ${snapshot.quizSessions.length}件`,
        `解答ログ: ${snapshot.answerLogs.length}件`,
        ...(snapshot.hasChatGuardLogs ? [`チャット警告: ${snapshot.chatGuardLogs.length}件`] : []),
        '',
        'questions / quiz_sessions / answer_logs は入れ替えになります。続けますか？',
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

      if (snapshot.hasChatGuardLogs) {
        const { error: deleteChatGuardLogsError } = await supabase
          .from('chat_guard_logs')
          .delete()
          .not('id', 'is', null)
        if (deleteChatGuardLogsError) throw new Error(deleteChatGuardLogsError.message)
      }

      await insertRowsInChunks('questions', snapshot.questions as unknown as Record<string, unknown>[])
      await insertRowsInChunks('quiz_sessions', snapshot.quizSessions as unknown as Record<string, unknown>[])
      await insertRowsInChunks('answer_logs', snapshot.answerLogs as unknown as Record<string, unknown>[])
      if (snapshot.hasChatGuardLogs) {
        await insertRowsInChunks('chat_guard_logs', snapshot.chatGuardLogs as unknown as Record<string, unknown>[])
      }

      setRestoreMsg(
        `✅ 復元しました。問題${snapshot.questions.length}件 / 履歴${snapshot.quizSessions.length}件 / 解答ログ${snapshot.answerLogs.length}件`
        + (snapshot.hasChatGuardLogs ? ` / チャット警告${snapshot.chatGuardLogs.length}件` : '')
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
            {([['overview', '📊 生徒データ'], ['questions', '📝 問題一覧'], ['add', '➕ 問題追加'], ['bulk', '📥 一括追加']] as const).map(([currentTab, label]) => (
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

      <div className="card mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-white font-bold">この端末のログイン固定</div>
            <div className="text-slate-400 text-sm mt-1">
              {lockedStudentId
                ? `現在は ID ${lockedStudentId} に固定されています。`
                : '現在は固定されていません。'}
            </div>
          </div>
          <button
            onClick={() => {
              clearDeviceLock()
              alert('この端末の固定を解除しました。次回ログイン時にIDを選び直せます。')
            }}
            className="btn-secondary"
          >
            固定を解除
          </button>
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
                      生徒情報、問題、履歴、解答ログ、チャット警告ログを復元用JSONとしてまとめて保存します。
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
                            style={{ background: `${FIELD_COLORS[log.field] ?? '#64748b'}20`, color: FIELD_COLORS[log.field] ?? '#cbd5e1' }}
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
                  管理画面から保存したバックアップJSONを読み込んで、問題・履歴・解答ログ・チャット警告ログを復元します。
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
                                <div className="text-sm font-bold" style={{ color: FIELD_COLORS[field] }}>{fieldRate}%</div>
                                <div className="text-xs text-slate-600">{current!.total}問</div>
                              </>
                            ) : (
                              <div className="text-xs text-slate-600">—</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'questions' && (
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-slate-400">
              {questions.length}問登録済み
              {questions.length > 0 && (
                <span className="ml-2 text-slate-500 text-sm">
                  生徒作成 {questions.filter(question => question.created_by_student_id !== null).length}問
                </span>
              )}
            </p>
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
              {questions.map(question => (
                <div key={question.id} className="subcard p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                        style={{ background: `${FIELD_COLORS[question.field]}20`, color: FIELD_COLORS[question.field] }}
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
                    </div>
                    <p className="text-white text-sm flex-1 line-clamp-2">{question.question}</p>
                    <button
                      onClick={() => handleDeleteQuestion(question.id)}
                      className="text-red-500 hover:text-red-300 text-xs flex-shrink-0 transition-colors"
                    >
                      削除
                    </button>
                  </div>
                  <div className="mt-1 text-slate-500 text-xs">答え: {question.answer}</div>
                  {question.type === 'text' && question.keywords && question.keywords.length > 0 && (
                    <div className="mt-1 text-amber-300 text-xs">キーワード: {question.keywords.join(' / ')}</div>
                  )}
                </div>
              ))}
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
              placeholder={form.type === 'choice' ? '正解をそのまま入力（AかBと同じ文）' : '模範解答を入力'}
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
                回答文にこのどれか1つでも含まれていれば `▲` 判定にします。カンマ区切りで入力してください。
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
          <div className="card">
            <h3 className="text-white font-bold mb-2">JSON 一括追加</h3>
            <p className="text-slate-400 text-sm leading-6">
              JSON をそのまま貼り付けるか、`.json` ファイルを読み込んで一括追加できます。
              choice 問題は `choices` を2件、text 問題は `choices` なしで入力してください。
              記述問題では `keywords` 配列を付けると、回答文に1つでも含まれたときに `▲` 判定になります。
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <label
                className="btn-secondary text-sm cursor-pointer"
              >
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
            <label className="text-slate-400 text-xs mb-2 block">JSON データ</label>
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
              {bulkLoading ? '一括追加中...' : 'JSON を一括追加する'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
