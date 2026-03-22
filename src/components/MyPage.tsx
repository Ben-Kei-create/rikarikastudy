'use client'
import { useEffect, useState, useMemo, useRef, type ReactNode } from 'react'
import { Database, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { isThemeUnlockedAtLevel, THEME_OPTIONS, Theme, useTheme } from '@/lib/theme'
import { isSoundEnabled, setSoundEnabled } from '@/lib/sounds'
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
import MyPageColumnsTab from '@/components/MyPageColumnsTab'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { loadEarnedBadgeRecords } from '@/lib/studyRewards'
import {
  getPeriodicCardSchemaErrorMessage,
  loadPeriodicCardCollection,
  PeriodicCardCollectionEntry,
} from '@/lib/periodicCardCollection'
import {
  SCIENCE_GLOSSARY,
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

type QuestionComposerMode = 'simple' | 'advanced'

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

const SIMPLE_CREATOR_TYPES = [
  {
    type: 'choice' as const,
    label: '2択',
    description: 'A/B を入れて、正解を選ぶだけ。',
  },
  {
    type: 'true_false' as const,
    label: '○×',
    description: '正しいかどうかを選ぶだけ。',
  },
  {
    type: 'text' as const,
    label: '一問一答',
    description: '答えを1つ入れるだけ。',
  },
] as const

function buildQuestionDraft(overrides: Partial<CustomQuestionForm> = {}): CustomQuestionForm {
  return {
    ...INITIAL_CUSTOM_QUESTION_FORM,
    ...overrides,
    choices: overrides.choices ? [...overrides.choices] : [...INITIAL_CUSTOM_QUESTION_FORM.choices],
  }
}

function applyQuestionTypeToDraft(current: CustomQuestionForm, type: QuestionType): CustomQuestionForm {
  return buildQuestionDraft({
    field: current.field,
    unit: current.unit,
    question: current.question,
    explanation: current.explanation,
    grade: current.grade,
    type,
  })
}

function resetQuestionDraftKeepingContext(current: CustomQuestionForm): CustomQuestionForm {
  return buildQuestionDraft({
    field: current.field,
    unit: current.unit,
    grade: current.grade,
    type: current.type,
  })
}

function isSimpleQuestionType(type: QuestionType) {
  return SIMPLE_CREATOR_TYPES.some(option => option.type === type)
}

function buildQuestionFormFromRow(question: QuestionRow): CustomQuestionForm {
  const normalized = normalizeQuestionRecord(question)
  const nextChoices = [...(normalized.choices ?? [])]
  while (nextChoices.length < INITIAL_CUSTOM_QUESTION_FORM.choices.length) {
    nextChoices.push('')
  }

  return buildQuestionDraft({
    field: normalized.field,
    unit: normalized.unit,
    question: normalized.question,
    type: normalized.type,
    choices: nextChoices,
    answer: normalized.answer,
    keywords: normalized.keywords?.join(', ') ?? '',
    matchPairsText: normalized.match_pairs?.map(pair => `${pair.left} | ${pair.right}`).join('\n') ?? '',
    sortItemsText: normalized.sort_items?.join('\n') ?? '',
    correctChoicesText: normalized.correct_choices?.join('\n') ?? '',
    wordTokensText: normalized.word_tokens?.join('\n') ?? '',
    distractorTokensText: normalized.distractor_tokens?.join('\n') ?? '',
    explanation: normalized.explanation ?? '',
    grade: normalized.grade ?? '中3',
  })
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

type Tab = 'overview' | 'history' | 'weak' | 'library' | 'account' | 'questions'
type LibrarySection = 'badges' | 'cards' | 'glossary' | 'columns'
const HISTORY_SESSION_LIMIT = 10

function CollapsibleSection({
  title,
  description,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string
  description: string
  summary: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section
      className="rounded-[26px] border px-4 py-4 sm:px-5 sm:py-5"
      style={{
        borderColor: 'var(--surface-elevated-border)',
        background: 'linear-gradient(180deg, var(--surface-elevated), var(--card-gradient-base-mid))',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs leading-6 text-slate-400">{description}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="rounded-full bg-sky-300/10 px-3 py-1.5 text-[11px] font-semibold text-sky-200">
            {summary}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">{open ? '閉じる' : '開く'}</div>
        </div>
      </button>

      {open && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </section>
  )
}

export default function MyPage({
  onBack,
  onStartDrill,
  onOnline,
}: {
  onBack: () => void
  onStartDrill: (field: string, unit: string) => void
  onOnline: () => void
}) {
  const { studentId, nickname, updateProfile, logout } = useAuth()
  const { theme, setTheme, ready: themeReady } = useTheme()
  const [soundOn, setSoundOn] = useState(false)
  useEffect(() => { setSoundOn(isSoundEnabled()) }, [])
  const isGuest = isGuestStudentId(studentId)
  const [sessions, setSessions] = useState<Session[]>([])
  const [answerLogs, setAnswerLogs] = useState<AnswerLog[]>([])
  const [myQuestions, setMyQuestions] = useState<QuestionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [libraryOpenSections, setLibraryOpenSections] = useState<Record<LibrarySection, boolean>>({
    badges: true,
    cards: false,
    glossary: false,
    columns: false,
  })
  const [nicknameInput, setNicknameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState<'nickname' | 'password' | null>(null)
  const [questionForm, setQuestionForm] = useState<CustomQuestionForm>(INITIAL_CUSTOM_QUESTION_FORM)
  const [questionComposerMode, setQuestionComposerMode] = useState<QuestionComposerMode>('simple')
  const [showQuestionExtras, setShowQuestionExtras] = useState(false)
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null)
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
  const questionComposerRef = useRef<HTMLDivElement | null>(null)
  const activeSimpleCreatorOption = useMemo(
    () => SIMPLE_CREATOR_TYPES.find(option => option.type === questionForm.type) ?? SIMPLE_CREATOR_TYPES[0],
    [questionForm.type],
  )

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
  const weekQuestionTotal = weekData.reduce((sum, item) => sum + item.count, 0)
  const todayQuestionCount = weekData[weekData.length - 1]?.count ?? 0
  const uniqueBadgeCount = useMemo(
    () => new Set(earnedBadges.map(badge => badge.badge_key)).size,
    [earnedBadges],
  )
  const glossaryCount = SCIENCE_GLOSSARY.length + customGlossaryEntries.length
  const nextStudyGuide = useMemo(() => {
    if (weakUnits.length > 0) {
      const focus = weakUnits[0]
      return {
        eyebrow: 'Next Study',
        title: `${focus.field} / ${focus.unit} を復習`,
        description: `正答率 ${focus.rate}% の単元です。短く反復すると定着が早くなります。`,
      }
    }

    if (todayQuestionCount === 0) {
      return {
        eyebrow: 'Next Study',
        title: '今日はまだ未着手です',
        description: 'まずは5問だけ解いて、連続記録をつなげましょう。',
      }
    }

    return {
      eyebrow: 'Next Study',
      title: '今日の流れは順調です',
      description: '次は履歴か読みものより、苦手単元の復習を先に進めるのがおすすめです。',
    }
  }, [todayQuestionCount, weakUnits])
  const librarySummaryItems = isGuest
    ? ([
        { label: 'バッジ', value: `${uniqueBadgeCount}` },
        { label: 'カード', value: `${periodicCards.length}` },
        { label: '辞典', value: `${glossaryCount}語` },
      ] as const)
    : ([
        { label: 'バッジ', value: `${uniqueBadgeCount}` },
        { label: 'カード', value: `${periodicCards.length}` },
        { label: '辞典', value: `${glossaryCount}語` },
        { label: '自作問題', value: `${myQuestions.length}` },
      ] as const)
  const tabs = isGuest
    ? ([
        ['overview', '📊 学習'],
        ['weak', '🎯 復習'],
        ['history', '📅 履歴'],
        ['library', '🗂 まとめ'],
        ['account', '⚙️ 設定'],
      ] as const)
    : ([
        ['overview', '📊 学習'],
        ['weak', '🎯 復習'],
        ['history', '📅 履歴'],
        ['library', '🗂 まとめ'],
        ['questions', '✍️ 問題作成'],
        ['account', '⚙️ 設定'],
      ] as const)

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

  const handleQuestionComposerModeChange = (nextMode: QuestionComposerMode) => {
    setQuestionComposerMode(nextMode)
    if (
      nextMode === 'simple'
      && !SIMPLE_CREATOR_TYPES.some(option => option.type === questionForm.type)
    ) {
      setQuestionForm(current => applyQuestionTypeToDraft(current, 'choice'))
    }
  }

  const handleQuestionTypeChange = (nextType: QuestionType) => {
    setQuestionForm(current => applyQuestionTypeToDraft(current, nextType))
  }

  const handleQuestionChoiceChange = (index: number, value: string) => {
    setQuestionForm(current => {
      const nextChoices = [...current.choices]
      const previousChoice = nextChoices[index]
      nextChoices[index] = value
      return {
        ...current,
        choices: nextChoices,
        answer: current.answer === previousChoice ? value : current.answer,
      }
    })
  }

  const selectQuestionChoiceAnswer = (index: number) => {
    setQuestionForm(current => ({
      ...current,
      answer: current.choices[index] ?? '',
    }))
  }

  const handleEditQuestion = (question: QuestionRow) => {
    const nextForm = buildQuestionFormFromRow(question)
    setEditingQuestionId(question.id)
    setQuestionForm(nextForm)
    setQuestionComposerMode(isSimpleQuestionType(nextForm.type) ? 'simple' : 'advanced')
    setShowQuestionExtras(Boolean(nextForm.explanation) || nextForm.grade !== '中3')
    setQuestionMsg(null)

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        questionComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const cancelQuestionEditing = () => {
    setEditingQuestionId(null)
    setQuestionForm(current => resetQuestionDraftKeepingContext(current))
    setShowQuestionExtras(false)
    setQuestionMsg(null)
  }

  const handleTabChange = (nextTab: Tab) => {
    if (nextTab === tab) return
    if (typeof window !== 'undefined') {
      tabScrollPositionsRef.current[tab] = window.scrollY
    }
    setTab(nextTab)
  }

  const toggleLibrarySection = (section: LibrarySection) => {
    setLibraryOpenSections(current => ({
      ...current,
      [section]: !current[section],
    }))
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
      }], editingQuestionId ? { excludeIds: [editingQuestionId] } : undefined)

      const query = editingQuestionId
        ? supabase
            .from('questions')
            .update(payload)
            .eq('id', editingQuestionId)
            .eq('created_by_student_id', studentId)
        : supabase
            .from('questions')
            .insert(payload)

      const { data, error } = await query
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
        setMyQuestions(current => (
          editingQuestionId
            ? current.map(question => (question.id === editingQuestionId ? data as QuestionRow : question))
            : [data as QuestionRow, ...current]
        ))
      }
      setQuestionForm(current => resetQuestionDraftKeepingContext(current))
      setEditingQuestionId(null)
      setShowQuestionExtras(false)
      setQuestionMsg({
        type: 'success',
        text: editingQuestionId ? '自分用の問題を更新しました。' : '自分用の問題を追加しました。',
      })
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
          <button onClick={onBack} className="text-sm font-semibold text-slate-200 transition-colors hover:text-white">
            もどる
          </button>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <button
              onClick={onOnline}
              className="font-semibold text-sky-200 transition-colors hover:text-white"
            >
              オンライン
            </button>
            <button
              onClick={() => logout()}
              className="text-slate-400 transition-colors hover:text-slate-200"
            >
              ログアウト
            </button>
          </div>
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
            <div className="hidden gap-3 text-right sm:flex sm:flex-col md:min-w-[280px] lg:min-w-[320px]">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Level</div>
                <div className="mt-1.5 flex flex-wrap items-end justify-end gap-x-3 gap-y-1 sm:mt-2">
                  <div className="font-display text-3xl leading-none text-white sm:text-4xl">Lv.{levelInfo.level}</div>
                  <div className="pb-0.5 text-xs font-semibold text-sky-200 sm:pb-1 sm:text-sm">{levelInfo.title}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>XP <span className="font-display text-sky-300">{levelInfo.totalXp}</span></span>
                <span>{levelInfo.progressXp} / {levelInfo.progressMax} XP</span>
                <span>次まで {Math.max(0, levelInfo.nextLevelXp - levelInfo.totalXp)} XP</span>
                {streak > 0 && <span className="text-orange-200">🔥 {streak}日連続</span>}
              </div>
              <div className="soft-track" style={{ height: 8 }}>
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
        <div
          className="flex gap-4 overflow-x-auto border-b border-white/8 px-1 pb-2"
          role="tablist"
          aria-label="マイページ"
        >
          {tabs.map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={(e) => {
                handleTabChange(t)
                ;(e.currentTarget as HTMLButtonElement).scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
              }}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-2 text-sm font-semibold transition-colors ${
                tab === t
                  ? 'border-sky-300 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
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
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-2xl">
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">{nextStudyGuide.eyebrow}</div>
                  <div className="mt-2 font-display text-[1.45rem] text-white sm:text-[1.8rem]">{nextStudyGuide.title}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-300">
                    {nextStudyGuide.description}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:min-w-[280px]">
                  <div className="rounded-[18px] border border-sky-300/14 bg-sky-300/8 px-3 py-3">
                    <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase">今週</div>
                    <div className="mt-1 font-display text-xl text-white">{weekQuestionTotal}</div>
                    <div className="text-[11px] text-slate-500">問解いた</div>
                  </div>
                  <div className="rounded-[18px] border border-emerald-300/14 bg-emerald-400/8 px-3 py-3">
                    <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase">今日</div>
                    <div className="mt-1 font-display text-xl text-white">{todayQuestionCount}</div>
                    <div className="text-[11px] text-slate-500">問進行中</div>
                  </div>
                  <div className="rounded-[18px] border border-orange-300/14 bg-orange-400/8 px-3 py-3">
                    <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase">連続</div>
                    <div className="mt-1 font-display text-xl text-white">{streak}</div>
                    <div className="text-[11px] text-slate-500">日</div>
                  </div>
                  <div className="rounded-[18px] border border-rose-300/14 bg-rose-400/8 px-3 py-3">
                    <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase">弱点</div>
                    <div className="mt-1 font-display text-xl text-white">{weakUnits.length}</div>
                    <div className="text-[11px] text-slate-500">単元</div>
                  </div>
                </div>
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

            {/* ストリーク＆カレンダー */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">学習カレンダー（30日間）</h3>
                {streak > 0 && (
                  <div className="flex items-center gap-1.5 streak-fire">
                    <span className="text-lg">🔥</span>
                    <span className="font-display text-lg text-orange-300">{streak}</span>
                    <span className="text-[11px] text-slate-500">日連続</span>
                  </div>
                )}
              </div>

              {/* GitHub風カレンダー: 曜日ラベル + 週カラム */}
              {(() => {
                const weeks: typeof dailyData[number][][] = []
                let currentWeek: typeof dailyData[number][] = []
                // 最初の日の曜日分だけパディング
                const firstDow = dailyData[0]?.date.getDay() ?? 0
                for (let pad = 0; pad < firstDow; pad++) currentWeek.push(null as unknown as typeof dailyData[number])
                for (const d of dailyData) {
                  currentWeek.push(d)
                  if (currentWeek.length === 7) {
                    weeks.push(currentWeek)
                    currentWeek = []
                  }
                }
                if (currentWeek.length > 0) weeks.push(currentWeek)

                const dayLabels = ['日', '月', '火', '水', '木', '金', '土']

                return (
                  <div className="flex gap-1">
                    <div className="flex flex-col gap-1 pr-1 pt-0">
                      {dayLabels.map((label, i) => (
                        <div key={label} className="text-[9px] text-slate-600 flex items-center justify-end" style={{ height: 16, width: 16 }}>
                          {i % 2 === 1 ? label : ''}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1 flex-1">
                      {weeks.map((week, wi) => (
                        <div key={wi} className="flex flex-col gap-1 flex-1">
                          {Array.from({ length: 7 }).map((_, di) => {
                            const d = week[di]
                            if (!d) return <div key={di} style={{ height: 16, borderRadius: 3 }} />
                            const isToday = format(d.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                            return (
                              <div
                                key={di}
                                title={`${format(d.date, 'M/d(E)', { locale: ja })} : ${d.count}問`}
                                style={{
                                  height: 16,
                                  borderRadius: 3,
                                  background: heatColor(d.count),
                                  outline: isToday ? '2px solid var(--color-accent)' : 'none',
                                  outlineOffset: -1,
                                  transition: 'transform 0.15s',
                                  cursor: 'default',
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.3)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = '' }}
                              />
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              <div className="flex items-center gap-2 mt-3">
                <span className="text-slate-600 text-xs">0問</span>
                {['var(--surface-elevated)', 'var(--color-accent-deeper)', 'var(--color-accent-strong)', 'var(--color-accent)', 'var(--color-sky-heading)'].map(c => (
                  <div key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c }} />
                ))}
                <span className="text-slate-600 text-xs">100問+</span>
              </div>

              {/* ストリーク推移 */}
              {maxStreak >= 3 && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-500">連続記録</span>
                    <span className="text-orange-300 font-bold">最高 {maxStreak}日</span>
                  </div>
                  <div className="soft-track" style={{ height: 8 }}>
                    <div style={{
                      width: `${Math.min(100, (streak / Math.max(maxStreak, 1)) * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #f97316, #fbbf24)',
                      borderRadius: 8,
                      transition: 'width 1.2s ease',
                    }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600 mt-1.5">
                    <span>現在 {streak}日</span>
                    <span>目標 {maxStreak}日</span>
                  </div>
                </div>
              )}
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

            {/* 診断サマリー */}
            {weakUnits.length > 0 && (
              <div className="card mb-4" style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06), rgba(251, 191, 36, 0.06))',
                borderColor: 'rgba(239, 68, 68, 0.15)',
              }}>
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase mb-2">AI 診断</div>
                <div className="space-y-2">
                  {weakUnits.map(u => {
                    const advice = u.rate < 30
                      ? `${u.field}の「${u.unit}」が特に苦手です。基礎からじっくり復習しましょう！`
                      : u.rate < 50
                        ? `${u.field}の「${u.unit}」がまだ不安定。繰り返し解いて定着させよう！`
                        : `${u.field}の「${u.unit}」はもう少し。あと少しで得意になれるよ！`
                    return (
                      <div key={`advice-${u.field}-${u.unit}`} className="flex items-start gap-2">
                        <span className="text-sm mt-0.5">{u.rate < 30 ? '🚨' : u.rate < 50 ? '⚠️' : '💡'}</span>
                        <p className="text-sm text-slate-300 leading-6">{advice}</p>
                      </div>
                    )
                  })}
                </div>
                {/* 分野バランス診断 */}
                {(() => {
                  const weakFields = Array.from(new Set(weakUnits.map(u => u.field)))
                  if (weakFields.length >= 2) {
                    return (
                      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <p className="text-xs text-amber-200">
                          {weakFields.join('と')}に弱点が集中しています。まずは{weakFields[0]}から攻略しよう！
                        </p>
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            )}

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

        {tab === 'library' && (
          <div className="anim-fade space-y-4">
            <div className="card">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Study Library</div>
                  <div className="mt-2 font-display text-[1.45rem] text-white sm:text-[1.8rem]">集めたものと読みものをここに収納</div>
                  <div className="mt-2 text-sm leading-7 text-slate-300">
                    バッジ、元素カード、辞典、コラム、自分で作った問題を一か所にまとめました。学習の主導線から外して、必要なときだけ開ける構成にしています。
                  </div>
                </div>
                <div className={`grid gap-2 ${isGuest ? 'grid-cols-3' : 'grid-cols-4'} sm:min-w-[320px]`}>
                  {librarySummaryItems.map(item => (
                    <div key={item.label} className="rounded-[18px] border border-white/8 bg-slate-950/28 px-3 py-3 text-center">
                      <div className="font-display text-lg text-white sm:text-xl">{item.value}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <CollapsibleSection
              title="バッジ"
              description="達成報酬の一覧です。まずはここだけ開いた状態にしています。"
              summary={`${uniqueBadgeCount} / ${BADGE_DEFINITIONS.length}`}
              open={libraryOpenSections.badges}
              onToggle={() => toggleLibrarySection('badges')}
            >
              <MyPageBadgesTab earnedBadges={earnedBadges} />
            </CollapsibleSection>

            <CollapsibleSection
              title="元素カード"
              description="ログインボーナスやパーフェクト報酬で集めたカードを見返せます。"
              summary={`${periodicCards.length}枚`}
              open={libraryOpenSections.cards}
              onToggle={() => toggleLibrarySection('cards')}
            >
              <MyPageCardsTab
                periodicCards={periodicCards}
                periodicCardsLoading={periodicCardsLoading}
                periodicCardsSchemaMessage={periodicCardsSchemaMessage}
                level={levelInfo.level}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="理科ミニ辞典"
              description="検索や索引で用語を探せる読みものです。"
              summary={`${glossaryCount}語`}
              open={libraryOpenSections.glossary}
              onToggle={() => toggleLibrarySection('glossary')}
            >
              <MyPageGlossaryTab customGlossaryEntries={customGlossaryEntries} />
            </CollapsibleSection>

            <CollapsibleSection
              title="コラム"
              description="問題を解いて解放した雑学・読みものをまとめています。"
              summary="解放した分だけ追加"
              open={libraryOpenSections.columns}
              onToggle={() => toggleLibrarySection('columns')}
            >
              <MyPageColumnsTab studentId={studentId} />
            </CollapsibleSection>

          </div>
        )}

        {tab === 'questions' && (
          <div className="anim-fade md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-start md:gap-4">
		            <div className="space-y-4">
		              <div ref={questionComposerRef} className="card">
		                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		                  <div>
		                    <h3 className="text-slate-300 font-bold mb-1">
		                      {editingQuestionId ? '自分の問題を編集' : '自分の問題を追加'}
		                    </h3>
		                    <p className="text-slate-500 text-xs leading-6">
		                      {editingQuestionId
		                        ? '一覧から読み込んだ内容をここで直して、そのまま上書きできます。'
		                        : '生徒はまず `かんたん作成` から。追加後も分野・単元・形式を維持するので、続けて作りやすくしています。'}
		                    </p>
		                  </div>
		                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
	                    <button
	                      type="button"
	                      onClick={() => handleQuestionComposerModeChange('simple')}
	                      className={`font-semibold transition-colors ${questionComposerMode === 'simple' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
	                    >
	                      かんたん
	                    </button>
	                    <button
	                      type="button"
	                      onClick={() => handleQuestionComposerModeChange('advanced')}
	                      className={`font-semibold transition-colors ${questionComposerMode === 'advanced' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
	                    >
	                      くわしく
		                    </button>
		                  </div>
		                </div>

		                {editingQuestionId && (
		                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-6">
		                    <span className="font-semibold text-sky-100">編集中の問題があります。</span>
		                    <span className="text-slate-300">更新すると一覧の同じ問題を上書きします。</span>
		                    <button
		                      type="button"
		                      onClick={cancelQuestionEditing}
		                      className="font-semibold text-sky-200 transition-colors hover:text-white"
		                    >
		                      編集をやめる
		                    </button>
		                  </div>
		                )}

	                {questionComposerMode === 'simple' ? (
	                  <div className="mt-4 space-y-4">
	                    <div>
	                      <div className="text-[11px] font-semibold tracking-[0.18em] text-sky-200 uppercase">Quick Create</div>
	                      <div className="mt-1 text-sm text-slate-300">よく使う3形式だけ先に出しています。分野・単元・問題文・答えだけで追加できます。</div>
	                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
	                        {SIMPLE_CREATOR_TYPES.map(option => {
	                          const active = questionForm.type === option.type
	                          return (
	                            <button
	                              key={option.type}
	                              type="button"
	                              onClick={() => handleQuestionTypeChange(option.type)}
	                              className={`font-semibold transition-colors ${active ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
	                            >
	                              {option.label}
	                            </button>
	                          )
	                        })}
	                      </div>
	                      <div className="mt-2 text-xs leading-6 text-slate-400">{activeSimpleCreatorOption.description}</div>
	                    </div>

	                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
	                      <select
	                        value={questionForm.field}
	                        onChange={e => setQuestionForm(current => ({ ...current, field: e.target.value as typeof FIELDS[number] }))}
	                        className="input-surface"
	                      >
	                        {FIELDS.map(field => <option key={field}>{field}</option>)}
	                      </select>
	                      <input
	                        type="text"
	                        value={questionForm.unit}
	                        onChange={e => setQuestionForm(current => ({ ...current, unit: e.target.value }))}
	                        placeholder="単元 例: 光合成 / 電流 / 火山"
	                        className="input-surface"
	                      />
	                    </div>

	                    <textarea
	                      value={questionForm.question}
	                      onChange={e => setQuestionForm(current => ({ ...current, question: e.target.value }))}
	                      placeholder="問題文 例: 植物が光合成で取り入れる気体はどれ？"
	                      rows={3}
	                      className="input-surface resize-y"
	                    />

	                    {questionForm.type === 'choice' && (
	                      <div className="space-y-3">
	                        {[0, 1].map(index => {
	                          const choiceValue = questionForm.choices[index] ?? ''
	                          const isCorrect = choiceValue.trim().length > 0 && questionForm.answer.trim() === choiceValue.trim()
	                          return (
	                            <div key={`simple-choice-${index}`} className="flex items-center gap-3">
	                              <div className="w-5 shrink-0 text-sm font-bold text-slate-300">
	                                {'AB'[index]}
	                              </div>
	                              <input
	                                type="text"
	                                value={choiceValue}
	                                onChange={e => handleQuestionChoiceChange(index, e.target.value)}
	                                placeholder={`選択肢 ${'AB'[index]}`}
	                                className="input-surface"
	                              />
	                              {isCorrect ? (
	                                <span className="shrink-0 text-xs font-semibold text-emerald-300">正解</span>
	                              ) : (
	                                <button
	                                  type="button"
	                                  onClick={() => selectQuestionChoiceAnswer(index)}
	                                  disabled={!choiceValue.trim()}
	                                  className="shrink-0 text-xs font-semibold text-sky-200 transition-colors hover:text-white disabled:text-slate-500"
	                                >
	                                  正解にする
	                                </button>
	                              )}
	                            </div>
	                          )
	                        })}
	                      </div>
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
	                      <input
	                        type="text"
	                        value={questionForm.answer}
	                        onChange={e => setQuestionForm(current => ({ ...current, answer: e.target.value }))}
	                        placeholder="答え 例: 二酸化炭素"
	                        className="input-surface"
	                      />
	                    )}

	                    <div>
	                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-6">
	                        <span className="text-slate-400">学年や解説は必要なときだけ追加できます。</span>
	                        <button
	                          type="button"
	                          onClick={() => setShowQuestionExtras(current => !current)}
	                          className="font-semibold text-sky-200 transition-colors hover:text-white"
	                        >
	                          {showQuestionExtras ? '補足を閉じる' : '学年・解説を追加'}
	                        </button>
	                      </div>
	                      {showQuestionExtras && (
	                        <div className="mt-3 grid gap-3">
	                          <select
	                            value={questionForm.grade}
	                            onChange={e => setQuestionForm(current => ({ ...current, grade: e.target.value }))}
	                            className="input-surface"
	                          >
	                            {['中1', '中2', '中3', '高校'].map(grade => <option key={grade}>{grade}</option>)}
	                          </select>
	                          <textarea
	                            value={questionForm.explanation}
	                            onChange={e => setQuestionForm(current => ({ ...current, explanation: e.target.value }))}
	                            placeholder="解説（任意）"
	                            rows={3}
	                            className="input-surface resize-y"
	                          />
	                        </div>
	                      )}
	                    </div>
	                  </div>
	                ) : (
	                  <div className="mt-4 space-y-3">
	                    <div className="text-xs leading-6 text-slate-400">
	                      4択、穴埋め、マッチ、並べ替えなど細かい形式を作りたいときだけこちらを使います。
	                    </div>
	                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
	                      <select
	                        value={questionForm.field}
	                        onChange={e => setQuestionForm(current => ({ ...current, field: e.target.value as typeof FIELDS[number] }))}
	                        className="input-surface"
	                      >
	                        {FIELDS.map(field => <option key={field}>{field}</option>)}
	                      </select>
	                      <select
	                        value={questionForm.type}
	                        onChange={e => handleQuestionTypeChange(e.target.value as QuestionType)}
	                        className="input-surface"
	                      >
	                        {QUESTION_TYPES.map(type => (
	                          <option key={type} value={type}>{getQuestionTypeLabel(type)}</option>
	                        ))}
	                      </select>
	                    </div>
	                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
	                    <div className="space-y-3">
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
	                                onChange={e => handleQuestionChoiceChange(index, e.target.value)}
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
	                  </div>
	                )}
		                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
		                  <button
		                    onClick={handleAddQuestion}
		                    className="btn-primary w-full"
	                    disabled={savingQuestion}
	                    style={{ opacity: savingQuestion ? 0.7 : 1 }}
	                  >
	                    {savingQuestion ? (editingQuestionId ? '更新中...' : '追加中...') : (editingQuestionId ? 'この内容で更新' : 'この問題を追加')}
	                  </button>
		                  {editingQuestionId && (
		                    <button
		                      type="button"
		                      onClick={cancelQuestionEditing}
		                      className="text-sm text-slate-400 transition-colors hover:text-slate-200"
		                    >
		                      キャンセル
		                    </button>
		                  )}
		                </div>
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
	                      <div className="flex items-center gap-2 self-start">
	                        {editingQuestionId === question.id && (
	                          <span
	                            className="px-2 py-1 rounded-full text-xs font-bold"
	                            style={{ background: 'rgba(56, 189, 248, 0.16)', color: '#bae6fd' }}
	                          >
	                            編集中
	                          </span>
	                        )}
	                        <span
	                          className="px-2 py-1 rounded-full text-xs font-bold"
	                          style={{ background: 'var(--color-warning-soft-bg)', color: 'var(--color-warning-muted)' }}
	                        >
	                          自分専用
	                        </span>
	                      </div>
	                    </div>
	                    <p className="text-white text-sm leading-7 mt-3 whitespace-pre-wrap">{question.question}</p>
	                    <div className="text-slate-400 text-sm mt-3">答え: {getQuestionCorrectAnswerText(normalizeQuestionRecord(question))}</div>
	                    {question.explanation && (
	                      <p className="text-slate-300 text-sm leading-7 mt-2 whitespace-pre-wrap">{question.explanation}</p>
	                    )}
	                    <div className="mt-4 flex justify-end">
	                      <button
	                        type="button"
	                        onClick={() => handleEditQuestion(question)}
	                        className="text-xs font-semibold text-sky-200 transition-colors hover:text-white"
	                      >
	                        編集する
	                      </button>
	                    </div>
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

              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-slate-300 font-bold">効果音</h3>
                    <p className="text-slate-500 text-xs mt-1">正解・不正解・コンボ時にサウンドを鳴らします</p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !soundOn
                      setSoundOn(next)
                      setSoundEnabled(next)
                    }}
                    className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors"
                    style={{ background: soundOn ? 'var(--color-info)' : 'var(--border-strong)' }}
                    role="switch"
                    aria-checked={soundOn}
                    aria-label="効果音の切り替え"
                  >
                    <span
                      className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: soundOn ? 'translateX(22px)' : 'translateX(4px)' }}
                    />
                  </button>
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
