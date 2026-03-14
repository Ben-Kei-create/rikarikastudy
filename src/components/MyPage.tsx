'use client'
import { useEffect, useState, useMemo } from 'react'
import { Database, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { isThemeUnlockedAtLevel, THEME_OPTIONS, Theme, useTheme } from '@/lib/theme'
import { BADGE_DEFINITIONS, getBadgeRarityLabel } from '@/lib/badges'
import { FIELD_COLORS, FIELD_EMOJI, FIELDS } from '@/lib/constants'
import { getLevelInfo, getTotalXpFromSessions } from '@/lib/engagement'
import { format, subDays, startOfDay, eachDayOfInterval, differenceInCalendarDays } from 'date-fns'
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
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { loadEarnedBadgeRecords } from '@/lib/studyRewards'
import {
  getPeriodicCardSchemaErrorMessage,
  loadPeriodicCardCollection,
  PeriodicCardCollectionEntry,
} from '@/lib/periodicCardCollection'
import {
  getPeriodicCardByKey,
  getPeriodicCardUnlockText,
  isPeriodicCardUnlockedAtLevel,
  PERIODIC_ELEMENT_CARDS,
} from '@/lib/periodicCards'
import {
  mergeGlossaryEntries,
  getGlossaryIndexKey,
  SCIENCE_GLOSSARY,
  SCIENCE_GLOSSARY_FIELDS,
  ScienceGlossaryEntry,
  ScienceGlossaryField,
} from '@/lib/scienceGlossary'
import {
  getQuestionCorrectAnswerText,
  getQuestionTypeLabel,
  normalizeQuestionRecord,
  QUESTION_TYPES,
  QuestionType,
} from '@/lib/questionTypes'
import { PeriodicCardSurface, PeriodicCardViewer } from '@/components/PeriodicCard'

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

function parseKeywordInput(input: string) {
  const keywords = input
    .split(/[,、\n]/)
    .map(keyword => keyword.trim())
    .filter(Boolean)

  return keywords.length > 0 ? keywords : null
}

function parseListInput(input: string) {
  return input
    .split(/\n|,|、/)
    .map(item => item.trim())
    .filter(Boolean)
}

function parseMatchPairsText(input: string) {
  const pairs = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [left, right] = line.split(/\s*\|\s*/)
      return {
        left: (left ?? '').trim(),
        right: (right ?? '').trim(),
      }
    })
    .filter(pair => pair.left && pair.right)

  return pairs.length > 0 ? pairs : null
}

function getThemePreview(theme: Theme) {
  if (theme === 'light') {
    return 'linear-gradient(135deg, #ffffff 0%, #f6f9ff 52%, #dbeafe 100%)'
  }

  if (theme === 'cute') {
    return 'linear-gradient(135deg, #fff8fb 0%, #ffe4f0 52%, #fff0c9 100%)'
  }

  return 'linear-gradient(135deg, #07111f 0%, #12233f 48%, #050816 100%)'
}

function formatStudyTime(totalSeconds: number) {
  if (totalSeconds <= 0) return '0分'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}時間${minutes}分`
  if (minutes > 0) return `${minutes}分`
  return `${seconds}秒`
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

function getFieldColor(field: string) {
  return FIELD_COLORS[field as keyof typeof FIELD_COLORS] ?? '#38bdf8'
}

function getFieldEmoji(field: string) {
  return FIELD_EMOJI[field as keyof typeof FIELD_EMOJI] ?? '🔬'
}

type Tab = 'overview' | 'history' | 'weak' | 'badges' | 'cards' | 'glossary' | 'questions' | 'account'

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
  const [glossaryQuery, setGlossaryQuery] = useState('')
  const [glossaryField, setGlossaryField] = useState<ScienceGlossaryField | 'all'>('all')
  const [glossaryIndex, setGlossaryIndex] = useState<string>('all')
  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(SCIENCE_GLOSSARY[0]?.id ?? null)
  const [periodicCards, setPeriodicCards] = useState<PeriodicCardCollectionEntry[]>([])
  const [periodicCardsLoading, setPeriodicCardsLoading] = useState(true)
  const [periodicCardsSchemaMessage, setPeriodicCardsSchemaMessage] = useState<string | null>(null)
  const [selectedPeriodicCardKey, setSelectedPeriodicCardKey] = useState<string | null>(null)

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
        if (!isMissingRelationError(response.error, 'science_glossary_entries')) {
          console.error(response.error)
        }
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
  const periodicUnlocked = isPeriodicCardUnlockedAtLevel(levelInfo.level)
  const periodicOwnedCount = periodicCards.length
  const periodicTotalCount = PERIODIC_ELEMENT_CARDS.length
  const periodicCollectionMap = useMemo(
    () => new Map(periodicCards.map(card => [card.cardKey, card])),
    [periodicCards],
  )
  const earnedBadgeMap = useMemo(
    () => new Map(earnedBadges.map(badge => [badge.badge_key, badge])),
    [earnedBadges],
  )
  const earnedBadgeCount = earnedBadgeMap.size

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
    if (count < 10) return '#1d4ed8'
    if (count < 30) return '#3b82f6'
    if (count < 60) return '#60a5fa'
    return '#93c5fd'
  }

  const weekData = dailyData.slice(-7)
  const weekMax = Math.max(...weekData.map(d => d.count), 1)
  const historySessions = useMemo(() => {
    const threshold = subDays(new Date(), 7)
    return sessions.filter(session => new Date(session.created_at) >= threshold)
  }, [sessions])
  const tabs = isGuest
    ? ([['overview', '📊 概要'], ['history', '📅 履歴'], ['weak', '🎯 弱点'], ['badges', '🏅 バッジ'], ['cards', '🧪 周期表'], ['glossary', '📘 辞典'], ['account', '⚙️ 設定']] as const)
    : ([['overview', '📊 概要'], ['history', '📅 履歴'], ['weak', '🎯 弱点'], ['badges', '🏅 バッジ'], ['cards', '🧪 周期表'], ['glossary', '📘 辞典'], ['questions', '✍️ 問題作成'], ['account', '⚙️ 設定']] as const)

  const allGlossaryEntries = useMemo(
    () => mergeGlossaryEntries(SCIENCE_GLOSSARY, customGlossaryEntries),
    [customGlossaryEntries],
  )
  const glossaryTermMap = useMemo(
    () => new Map(allGlossaryEntries.map(entry => [entry.term, entry])),
    [allGlossaryEntries],
  )

  const normalizedGlossaryQuery = glossaryQuery.trim().toLowerCase()
  const glossaryBaseEntries = useMemo(() => {
    return allGlossaryEntries.filter(entry => {
      if (glossaryField !== 'all' && entry.field !== glossaryField) return false
      if (!normalizedGlossaryQuery) return true

      const target = [
        entry.term,
        entry.reading,
        entry.shortDescription,
        entry.description,
        ...entry.related,
        ...entry.tags,
      ]
        .join(' ')
        .toLowerCase()

      return target.includes(normalizedGlossaryQuery)
    })
  }, [allGlossaryEntries, glossaryField, normalizedGlossaryQuery])

  const glossaryIndexes = useMemo(() => {
    const keys = Array.from(new Set(glossaryBaseEntries.map(entry => getGlossaryIndexKey(entry.reading)))).sort()
    return ['all', ...keys]
  }, [glossaryBaseEntries])

  const glossaryEntries = useMemo(() => {
    return glossaryBaseEntries.filter(entry => glossaryIndex === 'all' || getGlossaryIndexKey(entry.reading) === glossaryIndex)
  }, [glossaryBaseEntries, glossaryIndex])

  const selectedGlossaryEntry = useMemo(() => {
    if (glossaryEntries.length === 0) return null
    return glossaryEntries.find(entry => entry.id === selectedGlossaryId) ?? glossaryEntries[0]
  }, [glossaryEntries, selectedGlossaryId])

  useEffect(() => {
    if (glossaryIndexes.includes(glossaryIndex)) return
    setGlossaryIndex('all')
  }, [glossaryIndex, glossaryIndexes])

  useEffect(() => {
    if (glossaryEntries.length === 0) {
      if (selectedGlossaryId !== null) setSelectedGlossaryId(null)
      return
    }

    const exists = glossaryEntries.some(entry => entry.id === selectedGlossaryId)
    if (!exists) setSelectedGlossaryId(glossaryEntries[0].id)
  }, [glossaryEntries, selectedGlossaryId])

  useEffect(() => {
    if (!periodicUnlocked) {
      if (selectedPeriodicCardKey !== null) setSelectedPeriodicCardKey(null)
      return
    }

    if (periodicCards.length === 0) {
      if (selectedPeriodicCardKey !== null) setSelectedPeriodicCardKey(null)
      return
    }

    const exists = periodicCards.some(card => card.cardKey === selectedPeriodicCardKey)
    if (!exists) setSelectedPeriodicCardKey(periodicCards[0].cardKey)
  }, [periodicCards, periodicUnlocked, selectedPeriodicCardKey])

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

  const handleGlossaryJump = (term: string) => {
    const target = glossaryTermMap.get(term)
    if (!target) return

    setGlossaryQuery('')
    setGlossaryField(target.field)
    setGlossaryIndex('all')
    setSelectedGlossaryId(target.id)
  }

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
      <div className="px-1 pt-1 pb-3 floating-header md:sticky md:top-0 md:z-10 md:pt-2 md:pb-4">
        <div className="mb-2.5 flex items-center justify-between gap-3 sm:mb-3">
          <button onClick={onBack} className="btn-secondary text-sm !px-3.5 !py-2 sm:!px-4 sm:!py-2.5">
            もどる
          </button>
          <button
            onClick={() => logout()}
            className="btn-ghost text-sm !px-3.5 !py-2 sm:!px-4 sm:!py-2.5"
          >
            ログアウト
          </button>
        </div>
        <div className="hero-card science-surface px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
          <ScienceBackdrop />
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase sm:mb-2">My Page</div>
              <h1 className="font-display text-[1.7rem] leading-none text-white sm:text-3xl">マイページ</h1>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                {isGuest ? `${nickname}さんの当日成績` : `${nickname}さんの成績`}
              </p>
            </div>
            <div className="grid gap-2.5 md:min-w-[280px] lg:min-w-[320px]">
              <div className="rounded-[20px] border px-3.5 py-3.5 sm:rounded-[22px] sm:px-4 sm:py-4" style={{
                borderColor: 'rgba(56, 189, 248, 0.16)',
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
                      background: 'linear-gradient(90deg, #60a5fa, #38bdf8)',
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
              className="mt-3 rounded-[18px] px-3.5 py-2.5 text-xs leading-5 text-sky-100 sm:mt-4 sm:rounded-[20px] sm:px-4 sm:py-3 sm:text-sm sm:leading-6"
              style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.2)' }}
            >
              ゲストモードでは、成績は当日分だけ保存されます。ニックネーム変更や自分用問題の作成は使えません。
            </div>
          )}
          <div className="segment-bar mt-4 sm:mt-5">
            {tabs.map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`segment-button ${tab === t ? 'is-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-1">

        {/* ===== 概要タブ ===== */}
        {tab === 'overview' && (
          <div className="space-y-4 anim-fade">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: '総問題数', display: `${totalQ}問`, color: '#3b82f6' },
                { label: '総合正答率', display: `${overallRate}%`, color: overallRate >= 70 ? '#22c55e' : overallRate >= 50 ? '#f59e0b' : '#ef4444' },
                { label: '総勉強時間', display: formatStudyTime(totalStudySeconds), color: '#38bdf8', compact: true },
                { label: '最高連続', display: `${maxStreak}日`, color: '#f97316' },
              ].map(item => (
                <div key={item.label} className="card text-center" style={{ padding: '16px 8px' }}>
                  <div className={`font-display ${item.compact ? 'text-xl' : 'text-2xl'}`} style={{ color: item.color }}>
                    {item.display}
                  </div>
                  <div className="text-slate-500 text-xs mt-1">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">XP / Level</div>
                  <div className="mt-2 flex items-end gap-3 flex-wrap">
                    <div className="rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-100">
                      Lv.{levelInfo.level} {levelInfo.title}
                    </div>
                    <div className="font-display text-3xl text-white">{levelInfo.totalXp}<span className="ml-2 text-base text-slate-500">XP</span></div>
                  </div>
                </div>
                <div className="text-sm text-slate-400">
                  次まで {Math.max(0, levelInfo.nextLevelXp - levelInfo.totalXp)} XP
                </div>
              </div>
              <div className="mt-4 soft-track" style={{ height: 8 }}>
                <div
                  style={{
                    width: `${levelInfo.progressRate}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #7dd3fc, #38bdf8)',
                    borderRadius: 999,
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {levelInfo.progressXp} / {levelInfo.progressMax} XP
              </div>
            </div>

            <div className="card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Periodic Table Map</div>
                  <div className="mt-2 text-lg font-semibold text-white">周期表カードコレクション</div>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    元素カードを集めると、周期表マップが少しずつ埋まっていきます。カードには特徴や雑学も入っています。
                  </p>
                  {periodicUnlocked ? (
                    <div className="mt-4 rounded-[20px] border px-4 py-4" style={{
                      borderColor: 'rgba(56, 189, 248, 0.18)',
                      background: 'rgba(56, 189, 248, 0.06)',
                    }}>
                      <div className="text-xs font-semibold tracking-[0.18em] text-sky-200">COLLECTION</div>
                      <div className="mt-2 text-2xl font-display text-white">{periodicOwnedCount}<span className="text-base text-slate-500"> / {periodicTotalCount}</span></div>
                      <div className="mt-1 text-xs text-slate-400">
                        {periodicCardsLoading ? 'コレクションを読み込み中...' : 'マイページの「周期表」タブでカードを開いて動かせます。'}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[20px] border px-4 py-4" style={{
                      borderColor: 'rgba(148, 163, 184, 0.16)',
                      background: 'rgba(15, 23, 42, 0.28)',
                    }}>
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">LOCKED</div>
                      <div className="mt-2 font-semibold text-white">{getPeriodicCardUnlockText()}</div>
                      <div className="mt-1 text-xs leading-6 text-slate-400">
                        Lv.{20} になると、ログインボーナスやパーフェクト報酬で元素カードを集められます。
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-full lg:max-w-md">
                  {periodicUnlocked && periodicCards.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {periodicCards.slice(0, 2).map(entry => (
                        <PeriodicCardSurface key={entry.cardKey} cardKey={entry.cardKey} entry={entry} compact />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-6 gap-2 rounded-[24px] border border-white/8 bg-slate-950/28 p-3">
                      {PERIODIC_ELEMENT_CARDS.slice(0, 18).map(card => (
                        <div
                          key={card.key}
                          className="aspect-square rounded-[14px] border border-dashed border-white/10 bg-slate-950/40"
                          style={{ opacity: 0.65 }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {periodicCardsSchemaMessage && (
                <div className="mt-4 rounded-[18px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {periodicCardsSchemaMessage}
                </div>
              )}
            </div>

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
                          color: rate === null ? '#475569' : rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
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
                            ? 'linear-gradient(180deg, #60a5fa, #3b82f6)'
                            : d.count > 0 ? 'linear-gradient(180deg, #475569, #334155)' : 'var(--surface-elevated)',
                          borderRadius: '6px 6px 2px 2px',
                          transition: 'height 1s ease',
                        }} />
                      </div>
                      <div className="text-xs" style={{ color: isToday ? '#60a5fa' : '#475569' }}>
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
                {['var(--surface-elevated)', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd'].map(c => (
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
            {historySessions.length === 0 ? (
                <div className="card text-center text-slate-500 py-12">
                  1週間以内の履歴はありません。
                </div>
              ) : historySessions.slice(0, 50).map(s => {
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
                        <div style={{ width: `${rate}%`, background: '#22c55e' }} />
                        <div style={{ width: `${100 - rate}%`, background: '#ef444440' }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold" style={{
                        color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444',
                        fontSize: 20,
                      }}>{s.correct_count}<span className="text-slate-500 text-sm">/{s.total_questions}</span></div>
                      <div className="text-xs" style={{
                        color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
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
              <div className="grid gap-3 lg:grid-cols-2">
                {weakUnits.map((u, i) => {
                  const color = getFieldColor(u.field)
                  const medal = i === 0 ? '🚨' : i === 1 ? '⚠️' : i === 2 ? '📌' : '📍'
                  return (
                    <div key={`${u.field}-${u.unit}`} className="subcard p-4"
                      style={{ borderColor: u.rate < 50 ? '#ef444430' : 'var(--surface-elevated-border)' }}>
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
                              background: u.rate < 50 ? '#ef4444' : '#f59e0b',
                              borderRadius: 6,
                            }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-lg" style={{
                            color: u.rate < 50 ? '#ef4444' : '#f59e0b'
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
          <div className="anim-fade space-y-4">
            <div className="card">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-slate-300 font-bold">バッジコレクション</h3>
                  <div className="mt-1 text-xs text-slate-500">集めるほど色が増える</div>
                </div>
                <div className="rounded-full bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-200">
                  {earnedBadgeCount} / {BADGE_DEFINITIONS.length}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {BADGE_DEFINITIONS.map(badge => {
                  const earned = earnedBadgeMap.get(badge.key)
                  const lockedLegendary = !earned && badge.rarity === 'legendary'
                  const accent = badge.rarity === 'legendary'
                    ? '#c084fc'
                    : badge.rarity === 'rare'
                      ? '#fbbf24'
                      : '#60a5fa'
                  const rarityLabel = getBadgeRarityLabel(badge.rarity)
                  const displayIcon = earned ? badge.iconEmoji : lockedLegendary ? '❔' : badge.iconEmoji
                  const earnedDate = earned ? format(new Date(earned.earned_at), 'M月d日', { locale: ja }) : null

                  return (
                    <div
                      key={badge.key}
                      className="rounded-[24px] border p-4"
                      style={{
                        borderColor: earned ? `${accent}55` : 'rgba(148, 163, 184, 0.18)',
                        background: earned
                          ? `linear-gradient(135deg, ${accent}22, rgba(15, 23, 42, 0.88))`
                          : 'rgba(15, 23, 42, 0.62)',
                      }}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border text-3xl"
                          style={{
                            borderColor: earned ? `${accent}66` : 'rgba(148, 163, 184, 0.18)',
                            background: earned ? `${accent}18` : 'rgba(71, 85, 105, 0.18)',
                            color: earned ? accent : 'var(--text-muted)',
                            filter: earned ? 'none' : 'grayscale(1)',
                            opacity: earned ? 1 : 0.72,
                          }}
                        >
                          {displayIcon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-white">{badge.name}</div>
                            <div
                              className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                              style={{
                                background: earned ? `${accent}18` : 'rgba(148, 163, 184, 0.14)',
                                color: earned ? accent : 'var(--text-muted)',
                              }}
                            >
                              {rarityLabel}
                            </div>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-300">
                            {lockedLegendary ? '???' : badge.description}
                          </div>
                          <div className="mt-3 text-xs text-slate-500">
                            {earnedDate ? `${earnedDate} に獲得` : '未獲得'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'cards' && (
          <div className="anim-fade space-y-4">
            <div className="card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-slate-300 font-bold">周期表マップ</h3>
                  <p className="text-slate-500 text-xs mt-1 leading-6">
                    ログインボーナスやパーフェクト報酬で元素カードを集めて、周期表を埋めていきます。
                  </p>
                </div>
                <div className="rounded-full bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-200">
                  {periodicOwnedCount} / {periodicTotalCount}
                </div>
              </div>
            </div>

            {!periodicUnlocked ? (
              <div className="card">
                <div className="rounded-[24px] border px-5 py-6 text-center" style={{
                  borderColor: 'rgba(148, 163, 184, 0.16)',
                  background: 'rgba(15, 23, 42, 0.28)',
                }}>
                  <div className="text-4xl">🧪</div>
                  <div className="mt-3 font-semibold text-white">{getPeriodicCardUnlockText()}</div>
                  <p className="mt-2 text-sm leading-7 text-slate-400">
                    Lv.20 になると周期表マップが開放され、元素カードを集められるようになります。
                  </p>
                </div>
              </div>
            ) : periodicCardsSchemaMessage ? (
              <div className="card">
                <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-5 py-5 text-sm leading-7 text-amber-100">
                  {periodicCardsSchemaMessage}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="card overflow-x-auto">
                  <div className="min-w-[980px]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Collection Map</div>
                      <div className="text-xs text-slate-500">手に入れたカードをタップすると詳細を見られます。</div>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(18, minmax(0, 1fr))',
                        gap: 10,
                        alignItems: 'stretch',
                      }}
                    >
                      {PERIODIC_ELEMENT_CARDS.map(card => {
                        const ownedEntry = periodicCollectionMap.get(card.key) ?? null
                        const selected = selectedPeriodicCardKey === card.key
                        return (
                          <button
                            key={card.key}
                            onClick={() => ownedEntry && setSelectedPeriodicCardKey(card.key)}
                            disabled={!ownedEntry}
                            className="rounded-[18px] border text-left transition-all"
                            style={{
                              gridColumn: card.group,
                              gridRow: card.period,
                              minHeight: 90,
                              padding: 12,
                              borderColor: ownedEntry
                                ? selected
                                  ? 'rgba(125, 211, 252, 0.55)'
                                  : 'rgba(255,255,255,0.08)'
                                : 'rgba(148, 163, 184, 0.12)',
                              background: ownedEntry
                                ? 'linear-gradient(180deg, rgba(56, 189, 248, 0.12), rgba(15, 23, 42, 0.82))'
                                : 'rgba(15, 23, 42, 0.34)',
                              opacity: ownedEntry ? 1 : 0.42,
                              cursor: ownedEntry ? 'pointer' : 'default',
                              boxShadow: selected ? '0 18px 32px rgba(56, 189, 248, 0.18)' : 'none',
                            }}
                          >
                            <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-500">No.{card.atomicNumber}</div>
                            <div className="mt-2 font-display text-2xl text-white">{ownedEntry ? card.symbol : '—'}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-300">{ownedEntry ? card.nameJa : '未収集'}</div>
                            <div className="mt-2 text-[10px] text-slate-500">
                              {ownedEntry ? `${ownedEntry.obtainCount}枚` : `${card.period}周期 / ${card.group}族`}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="card">
                  {periodicCardsLoading ? (
                    <div className="rounded-[24px] border border-dashed border-slate-700 px-4 py-8 text-sm text-slate-400">
                      カードを読み込み中...
                    </div>
                  ) : selectedPeriodicCardKey ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Selected Card</div>
                        <div className="mt-2 text-sm leading-6 text-slate-400">
                          指でカードを動かすと、少し立体的に眺められます。
                        </div>
                      </div>
                      <PeriodicCardViewer
                        cardKey={selectedPeriodicCardKey}
                        entry={periodicCollectionMap.get(selectedPeriodicCardKey) ?? null}
                      />
                      {(() => {
                        const card = getPeriodicCardByKey(selectedPeriodicCardKey)
                        const entry = periodicCollectionMap.get(selectedPeriodicCardKey)
                        if (!card || !entry) return null
                        return (
                          <div className="rounded-[22px] border border-white/8 bg-slate-950/28 p-4">
                            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">コレクション情報</div>
                            <div className="mt-3 grid gap-2 text-sm text-slate-300">
                              <div>所持枚数: <span className="font-semibold text-white">{entry.obtainCount}枚</span></div>
                              <div>初回入手: <span className="font-semibold text-white">{format(new Date(entry.firstObtainedAt), 'M月d日', { locale: ja })}</span></div>
                              <div>最近の入手: <span className="font-semibold text-white">{format(new Date(entry.lastObtainedAt), 'M月d日 HH:mm', { locale: ja })}</span></div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-slate-700 px-4 py-8 text-sm text-slate-400">
                      まだカードがありません。ログインボーナスやパーフェクト報酬でカードを集めてみよう。
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'glossary' && (
          <div className="anim-fade space-y-4">
            <div className="card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-slate-300 font-bold">理科用語ミニ辞典</h3>
                  <p className="text-slate-500 text-xs mt-1 leading-6">
                    固定の理科用語集です。検索や索引から用語を選ぶと、分かりやすい説明を読めます。
                  </p>
                </div>
                <div className="rounded-full bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-200">
                  {glossaryEntries.length}語ヒット
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <label className="text-slate-400 text-xs mb-2 block">用語検索</label>
                  <input
                    value={glossaryQuery}
                    onChange={event => setGlossaryQuery(event.target.value)}
                    placeholder="例: 光合成 / 電流 / プレート"
                    className="input-surface"
                  />
                </div>
                <div>
                  <div className="text-slate-400 text-xs mb-2">分野フィルタ</div>
                  <div className="flex flex-wrap gap-2">
                    {SCIENCE_GLOSSARY_FIELDS.map(fieldOption => {
                      const active = glossaryField === fieldOption
                      const label = fieldOption === 'all' ? 'すべて' : fieldOption
                      const color = fieldOption === 'all' ? '#38bdf8' : getFieldColor(fieldOption)
                      return (
                        <button
                          key={fieldOption}
                          onClick={() => setGlossaryField(fieldOption)}
                          className="rounded-full border px-3 py-2 text-xs font-semibold transition-all"
                          style={{
                            borderColor: active ? `${color}70` : 'var(--surface-elevated-border)',
                            background: active ? `${color}18` : 'var(--surface-elevated)',
                            color: active ? color : 'var(--text-muted)',
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-slate-400 text-xs mb-2">索引</div>
                <div className="flex flex-wrap gap-2">
                  {glossaryIndexes.map(indexKey => {
                    const active = glossaryIndex === indexKey
                    return (
                      <button
                        key={indexKey}
                        onClick={() => setGlossaryIndex(indexKey)}
                        className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-all"
                        style={{
                          borderColor: active ? 'rgba(56, 189, 248, 0.45)' : 'var(--surface-elevated-border)',
                          background: active ? 'rgba(56, 189, 248, 0.12)' : 'var(--surface-elevated)',
                          color: active ? '#7dd3fc' : 'var(--text-muted)',
                        }}
                      >
                        {indexKey === 'all' ? '全部' : indexKey}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="card">
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">用語一覧</div>
                {glossaryEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400">
                    条件に合う用語が見つかりません。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {glossaryEntries.map(entry => {
                      const active = selectedGlossaryEntry?.id === entry.id
                      const color = getFieldColor(entry.field)
                      return (
                        <button
                          key={entry.id}
                          onClick={() => setSelectedGlossaryId(entry.id)}
                          className="w-full rounded-[22px] border px-4 py-3 text-left transition-all"
                          style={{
                            borderColor: active ? `${color}60` : 'var(--surface-elevated-border)',
                            background: active ? `${color}14` : 'var(--surface-elevated)',
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-white">{entry.term}</div>
                              <div className="text-xs text-slate-500 mt-1">{entry.reading}</div>
                            </div>
                            <span
                              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{ background: `${color}18`, color }}
                            >
                              {entry.field}
                            </span>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-400 line-clamp-2">
                            {entry.shortDescription}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="card">
                {selectedGlossaryEntry ? (
                  <>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2">
                          Science Word
                        </div>
                        <h3 className="font-display text-3xl text-white">{selectedGlossaryEntry.term}</h3>
                        <div className="mt-2 text-sm text-slate-500">{selectedGlossaryEntry.reading}</div>
                      </div>
                      <span
                        className="rounded-full px-3 py-1.5 text-sm font-semibold"
                        style={{
                          background: `${getFieldColor(selectedGlossaryEntry.field)}18`,
                          color: getFieldColor(selectedGlossaryEntry.field),
                        }}
                      >
                        {selectedGlossaryEntry.field}
                      </span>
                    </div>

                    <div className="mt-5 rounded-[22px] border border-white/8 bg-slate-950/24 p-4">
                      <div className="text-slate-300 font-semibold">ひとことで</div>
                      <p className="mt-2 text-sm leading-7 text-slate-200">
                        {selectedGlossaryEntry.shortDescription}
                      </p>
                    </div>

                    <div className="mt-4">
                      <div className="text-slate-300 font-semibold">説明</div>
                      <p className="mt-2 text-sm leading-8 text-slate-300">
                        {selectedGlossaryEntry.description}
                      </p>
                    </div>

                    <div className="mt-5">
                      <div className="text-slate-400 text-xs mb-2">関連語</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedGlossaryEntry.related.map(item => {
                          const linkedEntry = glossaryTermMap.get(item)

                          if (!linkedEntry) {
                            return (
                              <span
                                key={item}
                                className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300"
                              >
                                {item}
                              </span>
                            )
                          }

                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => handleGlossaryJump(item)}
                              className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-all hover:-translate-y-0.5"
                              style={{
                                borderColor: `${getFieldColor(linkedEntry.field)}55`,
                                background: `${getFieldColor(linkedEntry.field)}18`,
                                color: getFieldColor(linkedEntry.field),
                              }}
                            >
                              {item}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-sm text-slate-400">
                    用語を選ぶと、ここに説明が表示されます。
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'questions' && (
          <div className="space-y-4 anim-fade">
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
                    background: questionMsg.type === 'success' ? '#052e16' : '#450a0a',
                    border: `1px solid ${questionMsg.type === 'success' ? '#166534' : '#991b1b'}`,
                    color: questionMsg.type === 'success' ? '#86efac' : '#fca5a5',
                  }}
                >
                  {questionMsg.text}
                </div>
              )}
            </div>

            <div className="space-y-3">
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
                        style={{ background: '#f59e0b20', color: '#fbbf24' }}
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
        )}

        {tab === 'account' && (
          <div className="space-y-4 anim-fade">
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

              <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                              : 'linear-gradient(180deg, rgba(56, 189, 248, 0.12), rgba(15, 23, 42, 0.24))'
                          : 'var(--surface-elevated)',
                        boxShadow: active ? 'var(--shadow-md)' : 'none',
                        opacity: unlocked ? 1 : 0.66,
                      }}
                    >
                      <div
                        className="rounded-[18px] border p-3"
                        style={{
                          borderColor: unlocked ? 'rgba(255, 255, 255, 0.08)' : 'rgba(148, 163, 184, 0.12)',
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
                                : 'rgba(56, 189, 248, 0.14)'
                              : unlocked
                                ? 'rgba(34, 197, 94, 0.12)'
                                : 'rgba(148, 163, 184, 0.14)',
                            color: active
                              ? option.id === 'cute'
                                ? '#ec4899'
                                : '#38bdf8'
                              : unlocked
                                ? '#22c55e'
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

            {!isGuest && (
              <div className="grid gap-4 lg:grid-cols-2">
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
                className="rounded-2xl px-4 py-3 text-sm"
                style={{
                  background: accountMsg.type === 'success' ? '#052e16' : '#450a0a',
                  border: `1px solid ${accountMsg.type === 'success' ? '#166534' : '#991b1b'}`,
                  color: accountMsg.type === 'success' ? '#86efac' : '#fca5a5',
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
