'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { Database, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { isThemeUnlockedAtLevel, THEME_OPTIONS, Theme, useTheme } from '@/lib/theme'
import { BADGE_DEFINITIONS } from '@/lib/badges'
import { FIELD_EMOJI, FIELDS } from '@/lib/constants'
import { getLevelInfo, getTotalXpFromSessions } from '@/lib/engagement'
import { format, subDays, subWeeks, startOfDay, startOfWeek, eachDayOfInterval, eachWeekOfInterval, differenceInCalendarDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ensureNoDuplicateQuestions } from '@/lib/questionDuplicates'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  isMissingRelationError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import MyPageBadgesTab from '@/components/MyPageBadgesTab'
import MyPageGlossaryTab from '@/components/MyPageGlossaryTab'
import MyPageCardsTab from '@/components/MyPageCardsTab'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { loadEarnedBadgeRecords } from '@/lib/studyRewards'
import {
  getPeriodicCardSchemaErrorMessage,
  loadPeriodicCardCollection,
  PeriodicCardCollectionEntry,
} from '@/lib/periodicCardCollection'
import {
  ScienceGlossaryEntry,
} from '@/lib/scienceGlossary'
import {
  getQuestionCorrectAnswerText,
  getQuestionTypeLabel,
  normalizeQuestionRecord,
  QUESTION_TYPES,
  QuestionType,
} from '@/lib/questionTypes'

interface Session {
  id: string; field: string; unit: string
  total_questions: number; correct_count: number; duration_seconds: number; created_at: string
}
interface AnswerLog {
  question_id: string; is_correct: boolean
  questions: { unit: string; field: string } | null
}
interface AnswerLogQueryRow {
  question_id: string
  is_correct: boolean
  questions: { unit: string; field: string } | Array<{ unit: string; field: string }> | null
}
type QuestionRow = Database['public']['Tables']['questions']['Row']
type GlossaryRow = Database['public']['Tables']['science_glossary_entries']['Row']

interface CustomQuestionForm {
  field: string
  unit: string
  question: string
  type: QuestionType
  choices: string[]
  answer: string
  keywords: string
  matchPairsText: string
  sortItemsText: string
  correctChoicesText: string
  wordTokensText: string
  distractorTokensText: string
  explanation: string
  grade: string
}

const INITIAL_CUSTOM_QUESTION_FORM: CustomQuestionForm = {
  field: '生物',
  unit: '',
  question: '',
  type: 'choice',
  choices: ['', '', '', '', '', ''],
  answer: '',
  keywords: '',
  matchPairsText: '',
  sortItemsText: '',
  correctChoicesText: '',
  wordTokensText: '',
  distractorTokensText: '',
  explanation: '',
  grade: '中3',
}

import { parseKeywordInput, parseListInput, parseMatchPairsText, getFieldColor, formatStudyTime } from '@/lib/formUtils'
import { getRateColor } from '@/lib/uiUtils'

function getThemePreview(theme: Theme) {
  if (theme === 'light') {
    return 'linear-gradient(135deg, #ffffff 0%, #f6f9ff 52%, #dbeafe 100%)'
  }

  if (theme === 'cute') {
    return 'linear-gradient(135deg, #fff8fb 0%, #ffe4f0 52%, #fff0c9 100%)'
  }

  return 'linear-gradient(135deg, #07111f 0%, #12233f 48%, #050816 100%)'
}

function toGlossaryEntry(row: GlossaryRow): ScienceGlossaryEntry {
  return {
    id: row.id,
    term: row.term,
    reading: row.reading,
    field: row.field,
    shortDescription: row.short_description,
    description: row.description,
    related: Array.isArray(row.related) ? row.related.filter(Boolean) : [],
    tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : [],
  }
}

function normalizeAnswerLogs(rows: AnswerLogQueryRow[] | null | undefined): AnswerLog[] {
  return (rows || []).map(row => ({
    question_id: row.question_id,
    is_correct: row.is_correct,
    questions: Array.isArray(row.questions) ? row.questions[0] ?? null : row.questions,
  }))
}

function getFieldEmoji(field: string) {
  return FIELD_EMOJI[field as keyof typeof FIELD_EMOJI] ?? '🔬'
}

type Tab = 'overview' | 'history' | 'weak' | 'badges' | 'cards' | 'glossary' | 'questions' | 'account'
const HISTORY_SESSION_LIMIT = 10

export default function MyPage({
  onBack,
  onStartDrill,
}: {
  onBack: () => void
  onStartDrill: (field: string, unit: string) => void
}) {
  const { studentId, nickname, updateProfile, logout } = useAuth()
  const { theme, setTheme, ready: themeReady } = useTheme()
  const isGuest = isGuestStudentId(studentId)
  const [sessions, setSessions] = useState<Session[]>([])
  const [answerLogs, setAnswerLogs] = useState<AnswerLog[]>([])
  const [myQuestions, setMyQuestions] = useState<QuestionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [nicknameInput, setNicknameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState<'nickname' | 'password' | null>(null)
  const [questionForm, setQuestionForm] = useState<CustomQuestionForm>(INITIAL_CUSTOM_QUESTION_FORM)
  const [questionMsg, setQuestionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [studentXp, setStudentXp] = useState(0)
  const [earnedBadges, setEarnedBadges] = useState<Array<{ badge_key: string; earned_at: string }>>([])
  const [customGlossaryEntries, setCustomGlossaryEntries] = useState<ScienceGlossaryEntry[]>([])
  const [periodicCards, setPeriodicCards] = useState<PeriodicCardCollectionEntry[]>([])
  const [periodicCardsLoading, setPeriodicCardsLoading] = useState(true)
  const [periodicCardsSchemaMessage, setPeriodicCardsSchemaMessage] = useState<string | null>(null)
  const tabContentRef = useRef<HTMLDivElement | null>(null)
  const tabScrollPositionsRef = useRef<Partial<Record<Tab, number>>>({})
  const hasMountedTabRef = useRef(false)

  useEffect(() => {
    if (studentId === null) return
    const load = async () => {
      if (isGuest) {
        const store = loadGuestStudyStore()
        setSessions(store.sessions as Session[])
        setAnswerLogs(store.answerLogs.map(log => ({
          question_id: log.question_id,
          is_correct: log.is_correct,
          questions: { unit: log.unit, field: log.field },
        })))
        setStudentXp(getTotalXpFromSessions(store.sessions))
        setEarnedBadges(store.badges.filter(badge => BADGE_DEFINITIONS.some(definition => definition.key === badge.badge_key)))
        setMyQuestions([])
        setLoading(false)
        return
      }

      const shouldLoadMyQuestions = getCachedColumnSupport('created_by_student_id') !== false
      const [sessionsResponse, answerLogsResponse, questionResponse, studentResponse, badgeResponse] = await Promise.all([
        supabase.from('quiz_sessions').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
        supabase.from('answer_logs').select('question_id, is_correct, questions(unit, field)').eq('student_id', studentId),
        shouldLoadMyQuestions
          ? supabase.from('questions').select('*').eq('created_by_student_id', studentId).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase.from('students').select('student_xp').eq('id', studentId).single(),
        loadEarnedBadgeRecords(studentId),
      ])

      const sData = sessionsResponse.data
      const aData = answerLogsResponse.data as AnswerLogQueryRow[] | null
      let qData = questionResponse.data

      if (questionResponse.error && isMissingColumnError(questionResponse.error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        qData = []
      } else if (!questionResponse.error && shouldLoadMyQuestions) {
        markColumnSupported('created_by_student_id')
      }

      setSessions(sData || [])
      setAnswerLogs(normalizeAnswerLogs(aData))
      setMyQuestions((qData as QuestionRow[]) || [])
      setStudentXp(studentResponse.data?.student_xp ?? 0)
      setEarnedBadges(badgeResponse)
      setLoading(false)
    }
    load()
  }, [isGuest, studentId])

  useEffect(() => {
    let active = true

    const loadGlossaryEntries = async () => {
      const response = await supabase
        .from('science_glossary_entries')
        .select('*')
        .order('reading', { ascending: true })
        .order('term', { ascending: true })

      if (!active) return

      if (response.error) {
        setCustomGlossaryEntries([])
        return
      }

      setCustomGlossaryEntries(((response.data || []) as GlossaryRow[]).map(toGlossaryEntry))
    }

    void loadGlossaryEntries()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadPeriodicCards = async () => {
      if (studentId === null) {
        if (!active) return
        setPeriodicCards([])
        setPeriodicCardsSchemaMessage(null)
        setPeriodicCardsLoading(false)
        return
      }

      setPeriodicCardsLoading(true)
      const response = await loadPeriodicCardCollection(studentId)
      if (!active) return

      setPeriodicCards(response.entries)
      setPeriodicCardsSchemaMessage(response.missingSchema ? getPeriodicCardSchemaErrorMessage('student_element_cards') : null)
      setPeriodicCardsLoading(false)
    }

    void loadPeriodicCards()

    return () => {
      active = false
    }
  }, [studentId])

  useEffect(() => {
    setNicknameInput(nickname || '')
  }, [nickname])

  const totalQ = sessions.reduce((a, s) => a + s.total_questions, 0)
  const totalC = sessions.reduce((a, s) => a + s.correct_count, 0)
  const totalStudySeconds = sessions.reduce((a, s) => a + (s.duration_seconds ?? 0), 0)
  const overallRate = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0
  const levelInfo = useMemo(() => getLevelInfo(studentXp), [studentXp])

  const byField = useMemo(() => {
    const m: Record<string, { total: number; correct: number }> = {}
    sessions.forEach(s => {
      if (!m[s.field]) m[s.field] = { total: 0, correct: 0 }
      m[s.field].total += s.total_questions
      m[s.field].correct += s.correct_count
    })
    return m
  }, [sessions])

  const weakUnits = useMemo(() => {
    const m: Record<string, { field: string; total: number; correct: number }> = {}
    answerLogs.forEach(log => {
      const unit = log.questions?.unit
      const field = log.questions?.field
      if (!unit || !field) return
      const key = `${field}::${unit}`
      if (!m[key]) m[key] = { field, total: 0, correct: 0 }
      m[key].total++
      if (log.is_correct) m[key].correct++
    })
    return Object.entries(m)
      .map(([key, v]) => ({ unit: key.split('::')[1], field: v.field, total: v.total, correct: v.correct, rate: Math.round((v.correct / v.total) * 100) }))
      .filter(u => u.total >= 3)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3)
  }, [answerLogs])

  const dailyData = useMemo(() => {
    const today = startOfDay(new Date())
    const days = eachDayOfInterval({ start: subDays(today, 29), end: today })
    const map: Record<string, { count: number; correct: number }> = {}
    sessions.forEach(s => {
      const key = format(new Date(s.created_at), 'yyyy-MM-dd')
      if (!map[key]) map[key] = { count: 0, correct: 0 }
      map[key].count += s.total_questions
      map[key].correct += s.correct_count
    })
    return days.map(d => {
      const key = format(d, 'yyyy-MM-dd')
      return { date: d, key, ...(map[key] || { count: 0, correct: 0 }) }
    })
  }, [sessions])

  const streak = useMemo(() => {
    const activeDays = new Set(sessions.map(s => format(new Date(s.created_at), 'yyyy-MM-dd')))
    let count = 0
    let d = new Date()
    while (true) {
      const key = format(d, 'yyyy-MM-dd')
      if (!activeDays.has(key)) break
      count++
      d = subDays(d, 1)
    }
    return count
  }, [sessions])

  const maxStreak = useMemo(() => {
    const activeDays = Array.from(
      new Set(sessions.map(s => format(new Date(s.created_at), 'yyyy-MM-dd')))
    ).sort()
    let max = 0, cur = 0, prev: string | null = null
    for (const day of activeDays) {
      if (prev && differenceInCalendarDays(new Date(day), new Date(prev)) === 1) cur++
      else cur = 1
      if (cur > max) max = cur
      prev = day
    }
    return max
  }, [sessions])

  const heatColor = (count: number) => {
    if (count === 0) return 'var(--surface-elevated)'
    if (count < 10) return 'var(--color-accent-deeper)'
    if (count < 30) return 'var(--color-accent-strong)'
    if (count < 60) return 'var(--color-accent)'
    return 'var(--color-sky-heading)'
  }

  const weekData = dailyData.slice(-7)
  const weekMax = Math.max(...weekData.map(d => d.count), 1)

  // 週ごとの正答率推移（最大8週間）
  const weeklyAccuracyTrend = useMemo(() => {
    const today = startOfDay(new Date())
    const weeksAgo8 = subWeeks(today, 7)
    const weekStarts = eachWeekOfInterval({ start: weeksAgo8, end: today }, { weekStartsOn: 1 })
    return weekStarts.map(ws => {
      const weekEnd = subDays(startOfWeek(subDays(ws, -7), { weekStartsOn: 1 }), 1)
      const weekSessions = sessions.filter(s => {
        const d = startOfDay(new Date(s.created_at))
        return d >= ws && d <= weekEnd
      })
      const total = weekSessions.reduce((a, s) => a + s.total_questions, 0)
      const correct = weekSessions.reduce((a, s) => a + s.correct_count, 0)
      const rate = total > 0 ? Math.round((correct / total) * 100) : null
      return { weekStart: ws, total, correct, rate, label: format(ws, 'M/d') }
    })
  }, [sessions])

  const historySessions = useMemo(
    () => sessions.slice(0, HISTORY_SESSION_LIMIT),
    [sessions]
  )
  const tabs = isGuest
    ? ([['overview', '📊 概要'], ['history', '📅 履歴'], ['weak', '🎯 弱点'], ['badges', '🏅 バッジ'], ['cards', '🧪 元素カード'], ['glossary', '📘 辞典'], ['account', '⚙️ 設定']] as const)
    : ([['overview', '📊 概要'], ['history', '📅 履歴'], ['weak', '🎯 弱点'], ['badges', '🏅 バッジ'], ['cards', '🧪 元素カード'], ['glossary', '📘 辞典'], ['questions', '✍️ 問題作成'], ['account', '⚙️ 設定']] as const)

  const handleSaveNickname = async () => {
    setSaving('nickname')
    const result = await updateProfile({ nickname: nicknameInput })
    setSaving(null)
    setAccountMsg({ type: result.ok ? 'success' : 'error', text: result.message })
  }

  const handleSavePassword = async () => {
    if (passwordInput.trim() !== passwordConfirm.trim()) {
      setAccountMsg({ type: 'error', text: 'パスワードが一致していません。' })
      return
    }

    setSaving('password')
    const result = await updateProfile({ password: passwordInput })
    setSaving(null)
    setAccountMsg({ type: result.ok ? 'success' : 'error', text: result.message })

    if (result.ok) {
      setPasswordInput('')
      setPasswordConfirm('')
    }
  }

  const handleTabChange = (nextTab: Tab) => {
    if (nextTab === tab) return
    if (typeof window !== 'undefined') {
      tabScrollPositionsRef.current[tab] = window.scrollY
    }
    setTab(nextTab)
  }

  useEffect(() => {
    if (!hasMountedTabRef.current) {
      hasMountedTabRef.current = true
      return
    }

    if (typeof window === 'undefined') return

    const savedScrollY = tabScrollPositionsRef.current[tab]
    const fallbackTop = tabContentRef.current
      ? window.scrollY + tabContentRef.current.getBoundingClientRect().top - 12
      : 0
    const targetTop = typeof savedScrollY === 'number' ? savedScrollY : Math.max(0, fallbackTop)

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetTop, behavior: 'auto' })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [tab])

  const handleAddQuestion = async () => {
    if (!studentId) return
    if (!questionForm.unit.trim() || !questionForm.question.trim()) {
      setQuestionMsg({ type: 'error', text: '分野・単元・問題文を入力してください。' })
      return
    }

    try {
      setSavingQuestion(true)
      setQuestionMsg(null)
      const payload = {
        created_by_student_id: studentId,
        field: questionForm.field,
        unit: questionForm.unit.trim(),
        question: questionForm.question.trim(),
        type: questionForm.type,
        choices: null as string[] | null,
        answer: questionForm.answer.trim(),
        keywords: null as string[] | null,
        match_pairs: null as Array<{ left: string; right: string }> | null,
        sort_items: null as string[] | null,
        correct_choices: null as string[] | null,
        word_tokens: null as string[] | null,
        distractor_tokens: null as string[] | null,
        explanation: questionForm.explanation.trim() || null,
        grade: questionForm.grade,
      }

      if (questionForm.type === 'choice') {
        const filledChoices = questionForm.choices.slice(0, 2).map(choice => choice.trim()).filter(Boolean)
        if (filledChoices.length !== 2) {
          setQuestionMsg({ type: 'error', text: '2択問題は選択肢を2つ入力してください。' })
          return
        }
        if (!filledChoices.includes(questionForm.answer.trim())) {
          setQuestionMsg({ type: 'error', text: '答えは選択肢AかBと同じ内容にしてください。' })
          return
        }
        payload.choices = filledChoices
      } else if (questionForm.type === 'choice4' || questionForm.type === 'fill_choice') {
        const filledChoices = questionForm.choices.slice(0, 4).map(choice => choice.trim()).filter(Boolean)
        if (filledChoices.length < 3 || filledChoices.length > 4) {
          setQuestionMsg({ type: 'error', text: `${getQuestionTypeLabel(questionForm.type)} は選択肢を3〜4個入力してください。` })
          return
        }
        if (!filledChoices.includes(questionForm.answer.trim())) {
          setQuestionMsg({ type: 'error', text: '正解は選択肢と同じ内容にしてください。' })
          return
        }
        if (questionForm.type === 'fill_choice' && !questionForm.question.includes('【')) {
          setQuestionMsg({ type: 'error', text: '穴埋め問題の問題文には【　　】を入れてください。' })
          return
        }
        payload.choices = filledChoices
      } else if (questionForm.type === 'true_false') {
        if (questionForm.answer !== '○' && questionForm.answer !== '×') {
          setQuestionMsg({ type: 'error', text: '○×問題の正解は ○ か × にしてください。' })
          return
        }
        payload.choices = ['○', '×']
      } else if (questionForm.type === 'text') {
        if (!questionForm.answer.trim()) {
          setQuestionMsg({ type: 'error', text: '記述問題は模範解答文が必要です。' })
          return
        }
        payload.keywords = parseKeywordInput(questionForm.keywords)
      } else if (questionForm.type === 'match') {
        const pairs = parseMatchPairsText(questionForm.matchPairsText)
        if (!pairs || pairs.length < 2) {
          setQuestionMsg({ type: 'error', text: 'マッチ問題は「左 | 右」を2組以上入力してください。' })
          return
        }
        payload.match_pairs = pairs
        payload.answer = ''
      } else if (questionForm.type === 'sort') {
        const items = parseListInput(questionForm.sortItemsText)
        if (items.length < 3) {
          setQuestionMsg({ type: 'error', text: '並べ替え問題は3件以上入力してください。' })
          return
        }
        payload.sort_items = items
        payload.answer = ''
      } else if (questionForm.type === 'multi_select') {
        const choices = questionForm.choices.map(choice => choice.trim()).filter(Boolean)
        const correctChoices = parseListInput(questionForm.correctChoicesText)
        if (choices.length < 4) {
          setQuestionMsg({ type: 'error', text: '複数選択は選択肢を4件以上入力してください。' })
          return
        }
        if (correctChoices.length < 2) {
          setQuestionMsg({ type: 'error', text: '複数選択の正解は2件以上入れてください。' })
          return
        }
        if (!correctChoices.every(choice => choices.includes(choice))) {
          setQuestionMsg({ type: 'error', text: '複数選択の正解は選択肢の中から入力してください。' })
          return
        }
        payload.choices = choices
        payload.correct_choices = correctChoices
        payload.answer = ''
      } else if (questionForm.type === 'word_bank') {
        const wordTokens = parseListInput(questionForm.wordTokensText)
        const distractorTokens = parseListInput(questionForm.distractorTokensText)
        if (wordTokens.length < 2) {
          setQuestionMsg({ type: 'error', text: '語群問題は正解トークンを2件以上入力してください。' })
          return
        }
        if (distractorTokens.length < 1) {
          setQuestionMsg({ type: 'error', text: '語群問題はダミートークンを1件以上入力してください。' })
          return
        }
        payload.word_tokens = wordTokens
        payload.distractor_tokens = distractorTokens
        payload.answer = questionForm.answer.trim() || wordTokens.join(' ')
      }

      await ensureNoDuplicateQuestions([{
        field: payload.field,
        unit: payload.unit,
        question: payload.question,
        type: payload.type,
        choices: payload.choices,
        answer: payload.answer,
        match_pairs: payload.match_pairs,
        sort_items: payload.sort_items,
        correct_choices: payload.correct_choices,
        word_tokens: payload.word_tokens,
        distractor_tokens: payload.distractor_tokens,
      }])

      const { data, error } = await supabase
        .from('questions')
        .insert(payload)
        .select()
        .single()

      if (error && isMissingColumnError(error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        throw new Error('Supabase の questions テーブルに created_by_student_id 列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。')
      }

      if (error && isMissingColumnError(error, 'keywords')) {
        throw new Error('Supabase の questions テーブルに keywords 列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。')
      }

      if (
        error
        && (
          isMissingColumnError(error, 'match_pairs')
          || isMissingColumnError(error, 'sort_items')
          || isMissingColumnError(error, 'correct_choices')
          || isMissingColumnError(error, 'word_tokens')
          || isMissingColumnError(error, 'distractor_tokens')
        )
      ) {
        throw new Error('Supabase の questions テーブルが新しい問題タイプ列に対応していません。最新の supabase_schema.sql を SQL Editor で実行してください。')
      }

      if (!error) {
        markColumnSupported('created_by_student_id')
      }

      if (error) throw new Error(error.message)

      if (data) {
        setMyQuestions(current => [data as QuestionRow, ...current])
      }
      setQuestionForm(INITIAL_CUSTOM_QUESTION_FORM)
      setQuestionMsg({ type: 'success', text: '自分用の問題を追加しました。' })
    } catch (error) {
      setQuestionMsg({
        type: 'error',
        text: error instanceof Error ? `問題の保存に失敗しました: ${error.message}` : '問題の保存に失敗しました。',
      })
    } finally {
      setSavingQuestion(false)
    }
  }

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="text-slate-400">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="page-shell page-shell-dashboard">
      {/* ヘッダー */}
      <div className="px-1 pt-0.5 pb-1.5 sm:pt-1 sm:pb-3">
        <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
          <button onClick={onBack} className="btn-secondary text-sm !px-3 !py-1.5 sm:!px-4 sm:!py-2.5">
            もどる
          </button>
          <button
            onClick={() => logout()}
            className="btn-ghost text-sm !px-3 !py-1.5 sm:!px-4 sm:!py-2.5"
          >
            ログアウト
          </button>
        </div>
        <div className="hero-card science-surface px-3 py-3 sm:px-5 sm:py-5 lg:px-6">
          <ScienceBackdrop />
          <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
            <div>
              <div className="mb-1 text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase sm:mb-2 sm:text-[11px] sm:tracking-[0.18em]">My Page</div>
              <h1 className="font-display text-[1.45rem] leading-none text-white sm:text-3xl">マイページ</h1>
              <p className="mt-1 text-[11px] text-slate-400 sm:text-sm">
                {isGuest ? `${nickname}さんの当日成績` : `${nickname}さんの成績`}
              </p>

              <div className="mt-2 flex flex-wrap gap-2 sm:hidden">
                <div className="rounded-full border border-sky-300/16 bg-sky-300/8 px-3 py-1.5 text-[11px] text-sky-100">
                  <span className="font-display text-base leading-none text-white">Lv.{levelInfo.level}</span>
                  <span className="ml-1.5 font-semibold text-sky-200">{levelInfo.title}</span>
                </div>
                <div className="rounded-full border border-white/10 bg-slate-950/32 px-3 py-1.5 text-[11px] text-slate-300">
                  XP <span className="ml-1 font-display text-sm leading-none text-sky-300">{levelInfo.totalXp}</span>
                </div>
                {streak > 0 && (
                  <div className="rounded-full border border-orange-400/18 bg-orange-500/10 px-3 py-1.5 text-[11px] text-orange-200">
                    🔥 <span className="font-display text-sm leading-none">{streak}</span> 日連続
                  </div>
                )}
              </div>

              <div className="mt-2 hidden sm:block">
                <div className="soft-track" style={{ height: 6 }}>
                  <div
                    style={{
                      width: `${levelInfo.progressRate}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--color-accent), var(--color-info))',
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="hidden gap-2.5 sm:grid md:min-w-[280px] lg:min-w-[320px]">
              <div className="rounded-[20px] border px-3.5 py-3.5 sm:rounded-[22px] sm:px-4 sm:py-4" style={{
                borderColor: 'var(--color-info-soft-border)',
                background: 'rgba(8, 13, 24, 0.48)',
              }}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Level</div>
                    <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-1 sm:mt-2">
                      <div className="font-display text-3xl leading-none text-white sm:text-4xl">Lv.{levelInfo.level}</div>
                      <div className="pb-0.5 text-xs font-semibold text-sky-200 sm:pb-1 sm:text-sm">{levelInfo.title}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">XP</div>
                    <div className="mt-1.5 font-display text-xl leading-none text-sky-300 sm:mt-2 sm:text-2xl">{levelInfo.totalXp}</div>
                  </div>
                </div>
                <div className="mt-3 soft-track sm:mt-4" style={{ height: 8 }}>
                  <div
                    style={{
                      width: `${levelInfo.progressRate}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--color-accent), var(--color-info))',
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500 sm:text-xs">
                  <span>{levelInfo.progressXp} / {levelInfo.progressMax} XP</span>
                  <span>次まで {Math.max(0, levelInfo.nextLevelXp - levelInfo.totalXp)} XP</span>
                </div>
              </div>
              {streak > 0 && (
                <div className="flex w-fit items-center gap-2 rounded-[18px] px-3.5 py-2.5 sm:rounded-[20px] sm:px-4 sm:py-3" style={{ background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.18)' }}>
                  <span className="text-xl sm:text-2xl">🔥</span>
                  <span className="font-display text-xl leading-none text-orange-300 sm:text-2xl">{streak}</span>
                  <span className="text-[11px] text-slate-400 sm:text-xs">日連続</span>
                </div>
              )}
            </div>
          </div>
          {isGuest && (
            <div
              className="mt-2 rounded-[16px] px-3 py-2 text-[11px] leading-5 text-sky-100 sm:mt-4 sm:rounded-[20px] sm:px-4 sm:py-3 sm:text-sm sm:leading-6"
              style={{ background: 'var(--color-info-soft-bg)', border: '1px solid var(--color-info-soft-border)' }}
            >
              ゲストモードでは、成績は当日分だけ保存されます。ニックネーム変更や自分用問題の作成は使えません。
            </div>
          )}
        </div>
      </div>

      <div className="sticky top-0 z-10 px-1 pb-3 pt-1 floating-header">
        <div className="segment-bar" role="tablist" aria-label="マイページ">
          {tabs.map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={(e) => {
                handleTabChange(t)
                ;(e.currentTarget as HTMLButtonElement).scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
              }}
              className={`segment-button ${tab === t ? 'is-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div ref={tabContentRef} className="px-1" role="tabpanel">

        {/* ===== 概要タブ ===== */}
        {tab === 'overview' && (
          <div className="space-y-4 anim-fade">
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {[
                { label: '総問題数', display: `${totalQ}問`, color: 'var(--color-accent-strong)' },
                { label: '総合正答率', display: `${overallRate}%`, color: overallRate >= 70 ? 'var(--color-success)' : overallRate >= 50 ? 'var(--color-warning)' : 'var(--color-danger)' },
                { label: '総勉強時間', display: formatStudyTime(totalStudySeconds), color: 'var(--color-info)', compact: true },
                { label: '最高連続', display: `${maxStreak}日`, color: 'var(--chem)' },
              ].map(item => (
                <div key={item.label} className="card mobile-mini-card text-center !px-2.5 !py-3 sm:!px-3 sm:!py-4">
                  <div
                    className={`font-display leading-none ${item.compact ? 'text-[1rem] sm:text-xl' : 'text-[1.2rem] sm:text-2xl'}`}
                    style={{ color: item.color }}
                  >
                    {item.display}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 sm:text-xs">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="card mobile-action-card">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">XP / Level</div>
                  <div className="mt-2 flex flex-wrap items-end gap-2.5 sm:gap-3">
                    <div className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1.5 text-xs font-semibold text-sky-100 sm:px-4 sm:py-2 sm:text-sm">
                      Lv.{levelInfo.level} {levelInfo.title}
                    </div>
                    <div className="font-display text-[1.55rem] text-white sm:text-3xl">{levelInfo.totalXp}<span className="ml-1.5 text-sm text-slate-500 sm:ml-2 sm:text-base">XP</span></div>
                  </div>
                </div>
                <div className="text-xs text-slate-400 sm:text-sm">
                  次まで {Math.max(0, levelInfo.nextLevelXp - levelInfo.totalXp)} XP
                </div>
              </div>
              <div className="mt-4 soft-track" style={{ height: 8 }}>
                <div
                  style={{
                    width: `${levelInfo.progressRate}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--color-info-muted), var(--color-info))',
                    borderRadius: 999,
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {levelInfo.progressXp} / {levelInfo.progressMax} XP
              </div>
            </div>

            {/* 正答率の推移グラフ（週単位） */}
            {(() => {
              const points = weeklyAccuracyTrend.filter(w => w.rate !== null) as { weekStart: Date; total: number; correct: number; rate: number; label: string }[]
              if (points.length < 2) return null
              const svgW = 320
              const svgH = 140
              const padX = 36
              const padY = 20
              const padBottom = 28
              const chartW = svgW - padX * 2
              const chartH = svgH - padY - padBottom
              const minRate = Math.max(0, Math.min(...points.map(p => p.rate)) - 10)
              const maxRate = Math.min(100, Math.max(...points.map(p => p.rate)) + 10)
              const range = maxRate - minRate || 1
              const coords = points.map((p, i) => ({
                x: padX + (i / (points.length - 1)) * chartW,
                y: padY + chartH - ((p.rate - minRate) / range) * chartH,
                ...p,
              }))
              const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
              const firstRate = points[0].rate
              const lastRate = points[points.length - 1].rate
              const diff = lastRate - firstRate
              return (
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">正答率の推移</h3>
                    {diff !== 0 && (
                      <span className="text-xs font-bold" style={{ color: diff > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {diff > 0 ? '↑' : '↓'} {Math.abs(diff)}%
                      </span>
                    )}
                  </div>
                  <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: 180 }}>
                    {/* grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                      const y = padY + chartH - ratio * chartH
                      const val = Math.round(minRate + ratio * range)
                      return (
                        <g key={ratio}>
                          <line x1={padX} y1={y} x2={svgW - padX} y2={y} stroke="rgba(148,163,184,0.12)" strokeWidth={1} />
                          <text x={padX - 6} y={y + 3} textAnchor="end" fill="rgba(148,163,184,0.5)" fontSize={9}>{val}%</text>
                        </g>
                      )
                    })}
                    {/* area fill */}
                    <path
                      d={`${pathD} L${coords[coords.length - 1].x},${padY + chartH} L${coords[0].x},${padY + chartH} Z`}
                      fill="url(#accuracyGradient)"
                    />
                    <defs>
                      <linearGradient id="accuracyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    {/* line */}
                    <path d={pathD} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    {/* dots + labels */}
                    {coords.map((c, i) => (
                      <g key={i}>
                        <circle cx={c.x} cy={c.y} r={4} fill="var(--color-accent)" stroke="var(--surface-main)" strokeWidth={2} />
                        <text x={c.x} y={c.y - 10} textAnchor="middle" fill="white" fontSize={10} fontWeight={700}>{c.rate}%</text>
                        <text x={c.x} y={svgH - 6} textAnchor="middle" fill="rgba(148,163,184,0.6)" fontSize={9}>{c.label}</text>
                      </g>
                    ))}
                  </svg>
                  {diff > 0 && (
                    <div className="mt-3 rounded-[14px] px-3 py-2 text-xs text-emerald-200" style={{ background: 'rgba(52,211,153,0.08)' }}>
                      直近 {points.length} 週間で正答率が <span className="font-bold">+{diff}%</span> 上がっています！
                    </div>
                  )}
                  {diff < 0 && (
                    <div className="mt-3 rounded-[14px] px-3 py-2 text-xs text-amber-200" style={{ background: 'rgba(251,191,36,0.08)' }}>
                      苦手分野を復習して正答率を上げましょう！
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 分野別正答率バー */}
            <div className="card">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">分野別正答率</h3>
              <div className="space-y-3">
                {FIELDS.map(f => {
                  const s = byField[f]
                  const rate = s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : null
                  const color = getFieldColor(f)
                  return (
                    <div key={f}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 16 }}>{getFieldEmoji(f)}</span>
                          <span className="text-sm font-bold" style={{ color }}>{f}</span>
                          {s && <span className="text-slate-600 text-xs">{s.total}問</span>}
                        </div>
                        <span className="font-bold text-sm" style={{
                          color: getRateColor(rate)
                        }}>
                          {rate === null ? '—' : `${rate}%`}
                        </span>
                      </div>
                      <div className="soft-track" style={{ height: 8 }}>
                        <div style={{
                          width: `${rate ?? 0}%`, height: '100%',
                          background: `linear-gradient(90deg, ${color}, ${color}80)`,
                          borderRadius: 8, transition: 'width 1.2s ease',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 今週の棒グラフ */}
            <div className="card">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">今週の学習量（問題数）</h3>
              <div className="flex items-end justify-between gap-2" style={{ height: 96 }}>
                {weekData.map((d, i) => {
                  const h = d.count > 0 ? Math.max((d.count / weekMax) * 80, 8) : 0
                  const isToday = format(d.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-slate-500 text-xs" style={{ minHeight: 16 }}>
                        {d.count > 0 ? d.count : ''}
                      </div>
                      <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{
                          width: '100%', height: h,
                          background: isToday
                            ? 'linear-gradient(180deg, var(--color-accent), var(--color-accent-strong))'
                            : d.count > 0 ? 'linear-gradient(180deg, var(--text-soft), var(--text-muted))' : 'var(--surface-elevated)',
                          borderRadius: '6px 6px 2px 2px',
                          transition: 'height 1s ease',
                        }} />
                      </div>
                      <div className="text-xs" style={{ color: isToday ? 'var(--color-accent)' : 'var(--text-soft)' }}>
                        {format(d.date, 'E', { locale: ja })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 30日ヒートマップ */}
            <div className="card">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">30日間の学習記録</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                {dailyData.map((d, i) => (
                  <div
                    key={i}
                    title={`${format(d.date, 'M/d')} : ${d.count}問`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 5,
                      background: heatColor(d.count),
                      transition: 'transform 0.15s',
                      cursor: 'default',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.25)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = '' }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-slate-600 text-xs">0問</span>
                {['var(--surface-elevated)', 'var(--color-accent-deeper)', 'var(--color-accent-strong)', 'var(--color-accent)', 'var(--color-sky-heading)'].map(c => (
                  <div key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c }} />
                ))}
                <span className="text-slate-600 text-xs">100問+</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== 履歴タブ ===== */}
        {tab === 'history' && (
          <div className="space-y-2 anim-fade">
            <p className="text-slate-500 text-xs mb-2">最新{HISTORY_SESSION_LIMIT}件だけ表示しています。</p>
            {historySessions.length === 0 ? (
                <div className="card text-center text-slate-500 py-12">
                  履歴はまだありません。
                </div>
              ) : historySessions.map(s => {
              const rate = Math.round((s.correct_count / s.total_questions) * 100)
              const color = getFieldColor(s.field)
              const dateStr = format(new Date(s.created_at), 'M月d日(E) HH:mm', { locale: ja })
              return (
                <div key={s.id} className="subcard p-4">
                  <div className="flex items-start gap-3">
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{getFieldEmoji(s.field)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm" style={{ color }}>{s.field}</span>
                        <span className="text-slate-400 text-xs">{s.unit}</span>
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">{dateStr}</div>
                      <div className="mt-2 flex rounded-full overflow-hidden" style={{ height: 5 }}>
                        <div style={{ width: `${rate}%`, background: 'var(--color-success)' }} />
                        <div style={{ width: `${100 - rate}%`, background: 'var(--color-danger-soft-border)' }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold" style={{
                        color: getRateColor(rate),
                        fontSize: 20,
                      }}>{s.correct_count}<span className="text-slate-500 text-sm">/{s.total_questions}</span></div>
                      <div className="text-xs" style={{
                        color: getRateColor(rate)
                      }}>{rate}%</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ===== 弱点タブ ===== */}
        {tab === 'weak' && (
          <div className="anim-fade">
            <p className="text-slate-500 text-xs mb-4">3問以上解いた単元を正答率の低い順に表示</p>
            {weakUnits.length === 0 ? (
              <div className="card text-center text-slate-500 py-12">
                {totalQ < 10 ? 'もっと問題を解くと弱点が分かるよ！' : '弱点単元なし！全部得意だね 🎉'}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {weakUnits.map((u, i) => {
                  const color = getFieldColor(u.field)
                  const medal = i === 0 ? '🚨' : i === 1 ? '⚠️' : i === 2 ? '📌' : '📍'
                  return (
                    <div key={`${u.field}-${u.unit}`} className="subcard p-4"
                      style={{ borderColor: u.rate < 50 ? 'var(--color-danger-soft-border)' : 'var(--surface-elevated-border)' }}>
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: 24 }}>{medal}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${color}20`, color }}>{u.field}</span>
                            <span className="font-bold text-white text-sm">{u.unit}</span>
                          </div>
                          <div className="soft-track" style={{ height: 6, borderRadius: 6 }}>
                            <div style={{
                              width: `${u.rate}%`, height: '100%',
                              background: u.rate < 50 ? 'var(--color-danger)' : 'var(--color-warning)',
                              borderRadius: 6,
                            }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-lg" style={{
                            color: u.rate < 50 ? 'var(--color-danger)' : 'var(--color-warning)'
                          }}>{u.rate}%</div>
                          <div className="text-slate-500 text-xs">{u.total}問</div>
                        </div>
                      </div>
                      <button
                        onClick={() => onStartDrill(u.field, u.unit)}
                        className="btn-secondary mt-3 w-full !py-2.5 text-sm"
                      >
                        復習する →
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'badges' && (
          <MyPageBadgesTab earnedBadges={earnedBadges} />
        )}

        {tab === 'cards' && (
          <MyPageCardsTab
            periodicCards={periodicCards}
            periodicCardsLoading={periodicCardsLoading}
            periodicCardsSchemaMessage={periodicCardsSchemaMessage}
            level={levelInfo.level}
          />
        )}

        {tab === 'glossary' && (
          <MyPageGlossaryTab customGlossaryEntries={customGlossaryEntries} />
        )}

        {tab === 'questions' && (
          <div className="anim-fade md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-start md:gap-4">
            <div className="space-y-4">
              <div className="card">
                <h3 className="text-slate-300 font-bold mb-1">自分の問題を追加</h3>
                <p className="text-slate-500 text-xs leading-6">
                  ここで作った問題は、自分だけが解けます。先生は管理画面の問題一覧で確認できます。
                </p>
                <div className="grid grid-cols-1 gap-3 mt-4 sm:grid-cols-2">
                  <select
                    value={questionForm.field}
                    onChange={e => setQuestionForm(current => ({ ...current, field: e.target.value as typeof FIELDS[number] }))}
                    className="input-surface"
                  >
                    {FIELDS.map(field => <option key={field}>{field}</option>)}
                  </select>
                  <select
                    value={questionForm.type}
                    onChange={e => setQuestionForm(current => ({ ...current, type: e.target.value as QuestionType }))}
                    className="input-surface"
                  >
                    {QUESTION_TYPES.map(type => (
                      <option key={type} value={type}>{getQuestionTypeLabel(type)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 mt-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={questionForm.unit}
                    onChange={e => setQuestionForm(current => ({ ...current, unit: e.target.value }))}
                    placeholder="単元"
                    className="input-surface"
                  />
                  <select
                    value={questionForm.grade}
                    onChange={e => setQuestionForm(current => ({ ...current, grade: e.target.value }))}
                    className="input-surface"
                  >
                    {['中1', '中2', '中3', '高校'].map(grade => <option key={grade}>{grade}</option>)}
                  </select>
                </div>
                <div className="space-y-3 mt-3">
                  <textarea
                    value={questionForm.question}
                    onChange={e => setQuestionForm(current => ({ ...current, question: e.target.value }))}
                    placeholder="問題文"
                    rows={4}
                    className="input-surface resize-y"
                  />
                  {(questionForm.type === 'choice' || questionForm.type === 'choice4' || questionForm.type === 'fill_choice' || questionForm.type === 'multi_select') && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {questionForm.choices
                        .slice(0, questionForm.type === 'choice' ? 2 : questionForm.type === 'multi_select' ? 6 : 4)
                        .map((choice, index) => (
                          <input
                            key={`${questionForm.type}-choice-${index}`}
                            type="text"
                            value={choice}
                            onChange={e => setQuestionForm(current => {
                              const nextChoices = [...current.choices]
                              nextChoices[index] = e.target.value
                              return { ...current, choices: nextChoices }
                            })}
                            placeholder={`${'ABCDEF'[index]}. 選択肢`}
                            className="input-surface"
                          />
                        ))}
                    </div>
                  )}
                  {(questionForm.type === 'choice' || questionForm.type === 'choice4' || questionForm.type === 'fill_choice' || questionForm.type === 'text' || questionForm.type === 'word_bank') && (
                    <input
                      type="text"
                      value={questionForm.answer}
                      onChange={e => setQuestionForm(current => ({ ...current, answer: e.target.value }))}
                      placeholder={
                        questionForm.type === 'text'
                          ? '模範解答文'
                          : questionForm.type === 'word_bank'
                            ? '完成形（空欄なら語群から自動生成）'
                            : '正解（選択肢と同じ内容）'
                      }
                      className="input-surface"
                    />
                  )}
                  {questionForm.type === 'true_false' && (
                    <select
                      value={questionForm.answer}
                      onChange={e => setQuestionForm(current => ({ ...current, answer: e.target.value }))}
                      className="input-surface"
                    >
                      <option value="">正解を選ぶ</option>
                      <option value="○">○</option>
                      <option value="×">×</option>
                    </select>
                  )}
                  {questionForm.type === 'text' && (
                    <div>
                      <input
                        type="text"
                        value={questionForm.keywords}
                        onChange={e => setQuestionForm(current => ({ ...current, keywords: e.target.value }))}
                        placeholder="空欄にしたいキーワード（任意 / カンマ区切り）"
                        className="input-surface"
                      />
                      <p className="text-slate-500 text-xs mt-2">
                        `answer` の模範解答文に入る理科キーワードをここへ入れると、生徒はその空欄だけ入力する形になります。
                      </p>
                    </div>
                  )}
                  {questionForm.type === 'match' && (
                    <div>
                      <textarea
                        value={questionForm.matchPairsText}
                        onChange={e => setQuestionForm(current => ({ ...current, matchPairsText: e.target.value }))}
                        placeholder={'左 | 右\nアミラーゼ | デンプン'}
                        rows={4}
                        className="input-surface resize-y"
                      />
                      <p className="text-slate-500 text-xs mt-2">1行に1組ずつ、`左 | 右` の形で書きます。</p>
                    </div>
                  )}
                  {questionForm.type === 'sort' && (
                    <div>
                      <textarea
                        value={questionForm.sortItemsText}
                        onChange={e => setQuestionForm(current => ({ ...current, sortItemsText: e.target.value }))}
                        placeholder={'口\n食道\n胃\n小腸\n大腸'}
                        rows={4}
                        className="input-surface resize-y"
                      />
                      <p className="text-slate-500 text-xs mt-2">正しい順番で、1行に1つずつ書きます。</p>
                    </div>
                  )}
                  {questionForm.type === 'multi_select' && (
                    <div>
                      <textarea
                        value={questionForm.correctChoicesText}
                        onChange={e => setQuestionForm(current => ({ ...current, correctChoicesText: e.target.value }))}
                        placeholder={'デンプン\nエタノール'}
                        rows={3}
                        className="input-surface resize-y"
                      />
                      <p className="text-slate-500 text-xs mt-2">正解にする選択肢だけを、1行に1つずつ書きます。</p>
                    </div>
                  )}
                  {questionForm.type === 'word_bank' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <textarea
                        value={questionForm.wordTokensText}
                        onChange={e => setQuestionForm(current => ({ ...current, wordTokensText: e.target.value }))}
                        placeholder={'2Cu\n+\nO₂\n→\n2CuO'}
                        rows={4}
                        className="input-surface resize-y"
                      />
                      <textarea
                        value={questionForm.distractorTokensText}
                        onChange={e => setQuestionForm(current => ({ ...current, distractorTokensText: e.target.value }))}
                        placeholder={'Cu₂\n2O₂'}
                        rows={4}
                        className="input-surface resize-y"
                      />
                    </div>
                  )}
                  <textarea
                    value={questionForm.explanation}
                    onChange={e => setQuestionForm(current => ({ ...current, explanation: e.target.value }))}
                    placeholder="解説（任意）"
                    rows={3}
                    className="input-surface resize-y"
                  />
                </div>
                <button
                  onClick={handleAddQuestion}
                  className="btn-primary w-full mt-3"
                  disabled={savingQuestion}
                  style={{ opacity: savingQuestion ? 0.7 : 1 }}
                >
                  {savingQuestion ? '追加中...' : 'この問題を追加'}
                </button>
                {questionMsg && (
                  <div
                    className="rounded-2xl px-4 py-3 text-sm mt-3"
                    style={{
                      background: questionMsg.type === 'success' ? 'var(--color-success-soft-bg)' : 'var(--color-danger-soft-bg)',
                      border: `1px solid ${questionMsg.type === 'success' ? 'var(--color-success-soft-border)' : 'var(--color-danger-soft-border)'}`,
                      color: questionMsg.type === 'success' ? 'var(--color-success-muted)' : 'var(--color-danger-muted)',
                    }}
                  >
                    {questionMsg.text}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 lg:sticky lg:top-[5.5rem]">
              <div className="card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-slate-300 font-bold">自分の問題</h3>
                    <div className="mt-1 text-xs text-slate-500">{myQuestions.length}問</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
                {myQuestions.length === 0 ? (
                  <div className="card text-center text-slate-500 py-10">
                    まだ自分で作った問題はありません。
                  </div>
                ) : (
                  myQuestions.map(question => (
                    <div key={question.id} className="card">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="px-2 py-1 rounded-full text-xs font-bold"
                            style={{ background: `${getFieldColor(question.field)}20`, color: getFieldColor(question.field) }}
                          >
                            {question.field}
                          </span>
                          <span className="text-white font-bold">{question.unit}</span>
                          <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-300">
                            {getQuestionTypeLabel(normalizeQuestionRecord(question).type)}
                          </span>
                        </div>
                        <div className="text-slate-500 text-xs mt-1">
                          {format(new Date(question.created_at), 'M月d日(E) HH:mm', { locale: ja })}
                        </div>
                      </div>
                      <span
                        className="px-2 py-1 rounded-full text-xs font-bold"
                        style={{ background: 'var(--color-warning-soft-bg)', color: 'var(--color-warning-muted)' }}
                      >
                        自分専用
                      </span>
                    </div>
                    <p className="text-white text-sm leading-7 mt-3 whitespace-pre-wrap">{question.question}</p>
                    <div className="text-slate-400 text-sm mt-3">答え: {getQuestionCorrectAnswerText(normalizeQuestionRecord(question))}</div>
                    {question.explanation && (
                      <p className="text-slate-300 text-sm leading-7 mt-2 whitespace-pre-wrap">{question.explanation}</p>
                    )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'account' && (
          <div className={`anim-fade ${isGuest ? 'space-y-4' : 'md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-start md:gap-4'}`}>
            <div className="space-y-4">
              <div className="card">
                <h3 className="text-slate-300 font-bold mb-1">アカウント設定</h3>
                <p className="text-slate-500 text-xs">
                  {isGuest ? 'テーマ変更だけ使えます。ゲストの成績は毎日リセットされます。' : 'ニックネーム・パスワード・表示テーマを変更できます。'}
                </p>
                <div className="mt-3 text-slate-400 text-sm">ログインID: <span className="text-white font-bold">{studentId}</span></div>
              </div>

              <div className="card">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-slate-300 font-bold">表示テーマ</h3>
                    <p className="text-slate-500 text-xs mt-1">
                      ダークは最初から利用できます。ライトは Lv.10、かわいいは Lv.20 で解放されます。
                    </p>
                  </div>
                  <div className="text-xs text-slate-400">現在レベル: Lv.{levelInfo.level}</div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {THEME_OPTIONS.map(option => {
                  const unlocked = isThemeUnlockedAtLevel(option.id, levelInfo.level)
                  const active = themeReady && theme === option.id
                  const statusLabel = active ? '使用中' : unlocked ? '解放済み' : `Lv.${option.unlockLevel}で解放`

                  return (
                    <button
                      key={option.id}
                      onClick={() => {
                        if (!unlocked || !themeReady) return
                        setTheme(option.id)
                      }}
                      disabled={!unlocked || !themeReady}
                      className="rounded-[24px] border p-3 text-left transition-all"
                      style={{
                        borderColor: active
                          ? option.id === 'cute'
                            ? 'rgba(236, 72, 153, 0.4)'
                            : option.id === 'light'
                              ? 'rgba(59, 130, 246, 0.28)'
                              : 'rgba(56, 189, 248, 0.32)'
                          : 'var(--border)',
                        background: active
                          ? option.id === 'cute'
                            ? 'linear-gradient(180deg, rgba(244, 114, 182, 0.16), rgba(255, 255, 255, 0.06))'
                            : option.id === 'light'
                              ? 'linear-gradient(180deg, rgba(148, 163, 184, 0.12), rgba(255, 255, 255, 0.06))'
                              : 'linear-gradient(180deg, var(--color-info-soft-bg), var(--inset-bg))'
                          : 'var(--surface-elevated)',
                        boxShadow: active ? 'var(--shadow-md)' : 'none',
                        opacity: unlocked ? 1 : 0.66,
                      }}
                    >
                      <div
                        className="rounded-[18px] border p-3"
                        style={{
                          borderColor: unlocked ? 'var(--border)' : 'var(--border-strong)',
                          background: option.id === 'dark'
                            ? 'rgba(2, 6, 23, 0.42)'
                            : option.id === 'light'
                              ? 'rgba(255, 255, 255, 0.76)'
                              : 'rgba(255, 244, 249, 0.84)',
                        }}
                      >
                        <div
                          className="h-16 rounded-[16px]"
                          style={{
                            background: getThemePreview(option.id),
                            border: option.id === 'dark'
                              ? '1px solid rgba(255,255,255,0.08)'
                              : option.id === 'light'
                                ? '1px solid rgba(148,163,184,0.2)'
                                : '1px solid rgba(244,114,182,0.18)',
                          }}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-white">{option.label}</div>
                          <div className="mt-1 text-xs text-slate-400">{option.description}</div>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            background: active
                              ? option.id === 'cute'
                                ? 'rgba(236, 72, 153, 0.14)'
                                : 'var(--color-info-soft-bg)'
                              : unlocked
                                ? 'var(--color-success-soft-bg)'
                                : 'var(--color-neutral-soft-bg)',
                            color: active
                              ? option.id === 'cute'
                                ? '#ec4899'
                                : 'var(--color-info)'
                              : unlocked
                                ? 'var(--color-success)'
                                : 'var(--text-muted)',
                          }}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </button>
                  )
                  })}
                </div>
              </div>
            </div>

            {!isGuest && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div className="card">
                  <h3 className="text-slate-300 font-bold mb-4">ニックネーム変更</h3>
                  <input
                    type="text"
                    value={nicknameInput}
                    onChange={e => setNicknameInput(e.target.value)}
                    placeholder="ニックネーム"
                    className="input-surface"
                  />
                  <button
                    onClick={handleSaveNickname}
                    className="btn-primary w-full mt-3"
                    disabled={saving === 'nickname'}
                    style={{ opacity: saving === 'nickname' ? 0.7 : 1 }}
                  >
                    {saving === 'nickname' ? '保存中...' : 'ニックネームを保存'}
                  </button>
                </div>

                <div className="card">
                  <h3 className="text-slate-300 font-bold mb-4">パスワード変更</h3>
                  <div className="space-y-3">
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      placeholder="新しいパスワード"
                      className="input-surface"
                    />
                    <input
                      type="password"
                      value={passwordConfirm}
                      onChange={e => setPasswordConfirm(e.target.value)}
                      placeholder="新しいパスワード（確認）"
                      className="input-surface"
                    />
                  </div>
                  <button
                    onClick={handleSavePassword}
                    className="btn-primary w-full mt-3"
                    disabled={saving === 'password'}
                    style={{ opacity: saving === 'password' ? 0.7 : 1 }}
                  >
                    {saving === 'password' ? '保存中...' : 'パスワードを変更'}
                  </button>
                </div>
              </div>
            )}

            {accountMsg && (
              <div
                className={`rounded-2xl px-4 py-3 text-sm ${!isGuest ? 'lg:col-span-2' : ''}`}
                style={{
                  background: accountMsg.type === 'success' ? 'var(--color-success-soft-bg)' : 'var(--color-danger-soft-bg)',
                  border: `1px solid ${accountMsg.type === 'success' ? 'var(--color-success-soft-border)' : 'var(--color-danger-soft-border)'}`,
                  color: accountMsg.type === 'success' ? 'var(--color-success-muted)' : 'var(--color-danger-muted)',
                }}
              >
                {accountMsg.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
