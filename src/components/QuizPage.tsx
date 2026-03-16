'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { isCorrectTextAnswerResult, TextAnswerResult } from '@/lib/answerUtils'
import { getBadgeRarityLabel } from '@/lib/badges'
import { FIELD_COLORS } from '@/lib/constants'
import { getFieldColor, getRateColor } from '@/lib/uiUtils'
import { CustomQuizOptions, getCustomQuizSessionLabel, getCustomQuizSummaryParts } from '@/lib/customQuiz'
import { getLevelInfo } from '@/lib/engagement'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { getQuestionImageDisplaySize } from '@/lib/questionImages'
import { hasValidChoiceAnswer, normalizeQuestionChoices } from '@/lib/questionChoices'
import { evaluateQuestionAnswer, getQuestionBlankPrompt, QuestionSubmission } from '@/lib/questionEval'
import { pickCustomQuizQuestions, pickDailyChallengeQuestions, pickStandardQuizQuestions, QuizQuestionCount } from '@/lib/questionPicker'
import { getQuestionCorrectAnswerText, getQuestionTypeShortLabel, QuestionShape, normalizeQuestionRecord } from '@/lib/questionTypes'
import { getSuccessCelebration, SuccessCelebrationContent } from '@/lib/successCelebration'
import { calculateQuizXp as calculateQuizXpBreakdown } from '@/lib/xp'
import {
  getQuestionInquirySchemaErrorMessage,
  QUESTION_INQUIRY_CATEGORY_OPTIONS,
  QuestionInquiryCategory,
  QuestionInquiryRow,
  QUESTION_INQUIRY_STATUS_META,
} from '@/lib/questionInquiry'
import { hasCompletedDailyChallenge, recordStudySession, StudyRewardSummary } from '@/lib/studyRewards'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'
import BadgeEarnedToastStack from '@/components/BadgeEarnedToastStack'
import LevelUnlockNotice from '@/components/LevelUnlockNotice'
import { PeriodicCardRewardPanel } from '@/components/PeriodicCard'
import SuccessBurst from '@/components/SuccessBurst'
import Choice4Question from '@/components/quiz/Choice4Question'
import FillChoiceQuestion from '@/components/quiz/FillChoiceQuestion'
import MatchQuestion from '@/components/quiz/MatchQuestion'
import MultiSelectQuestion from '@/components/quiz/MultiSelectQuestion'
import SortQuestion from '@/components/quiz/SortQuestion'
import TrueFalseQuestion from '@/components/quiz/TrueFalseQuestion'
import WordBankQuestion from '@/components/quiz/WordBankQuestion'

const FAVORITE_STORAGE_KEY = 'rika_favorite_questions_v1'

function readFavoriteQuestionIds(studentId: number | null) {
  if (typeof window === 'undefined' || !studentId) return new Set<string>()

  try {
    const raw = window.localStorage.getItem(FAVORITE_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as Record<string, string[]> : {}
    const ids = Array.isArray(parsed[String(studentId)]) ? parsed[String(studentId)] : []
    return new Set(ids.filter(id => typeof id === 'string' && id))
  } catch {
    return new Set<string>()
  }
}

function writeFavoriteQuestionIds(studentId: number | null, ids: Set<string>) {
  if (typeof window === 'undefined' || !studentId) return

  try {
    const raw = window.localStorage.getItem(FAVORITE_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as Record<string, string[]> : {}
    parsed[String(studentId)] = Array.from(ids)
    window.localStorage.setItem(FAVORITE_STORAGE_KEY, JSON.stringify(parsed))
  } catch {}
}

type Question = QuestionShape

type TextJudgeSource = 'local' | 'gemini' | 'fallback'

interface TextJudgeApiResponse {
  result: TextAnswerResult
  judgeSource: TextJudgeSource
  model: string
  warning?: string
  reason?: string
}

type Phase = 'answering' | 'result' | 'finished'

function getSessionFieldLabel(field: string, quickStartAll: boolean, dailyChallenge: boolean) {
  if (dailyChallenge || quickStartAll) return '4分野総合'
  return field
}

function getSessionUnitLabel(unit: string, quickStartAll: boolean, dailyChallenge: boolean) {
  if (dailyChallenge) return '今日のチャレンジ'
  if (quickStartAll) return 'クイックスタート'
  return unit === 'all' ? '全単元' : unit
}

function buildSessionMode({
  isDrill,
  quickStartAll,
  dailyChallenge,
  isCustom,
}: {
  isDrill: boolean
  quickStartAll: boolean
  dailyChallenge: boolean
  isCustom: boolean
}) {
  if (dailyChallenge) return 'daily_challenge'
  if (quickStartAll) return 'mixed_quick_start'
  if (isCustom) return 'custom'
  if (isDrill) return 'drill'
  return 'standard'
}

function buildFinishMessage(rate: number, dailyChallenge: boolean) {
  if (dailyChallenge) {
    if (rate === 100) return '今日のチャレンジクリア！'
    if (rate >= 80) return 'かなりいい'
    if (rate >= 60) return 'あと少し'
    return 'またやろう'
  }

  if (rate === 100) return '完璧！'
  if (rate >= 90) return 'すごい！'
  if (rate >= 70) return 'いい感じ'
  if (rate >= 50) return 'あと少し'
  return 'もう一回'
}

export default function QuizPage({
  field,
  unit,
  isDrill = false,
  quickStartAll = false,
  quickStartDaily = false,
  dailyChallenge = false,
  customOptions,
  questionCount = 10,
  onBack,
}: {
  field: string
  unit: string
  isDrill?: boolean
  quickStartAll?: boolean
  quickStartDaily?: boolean
  dailyChallenge?: boolean
  customOptions?: CustomQuizOptions
  questionCount?: QuizQuestionCount
  onBack: () => void
}) {
  const { studentId, nickname, logout } = useAuth()
  const color = getFieldColor(field)
  const isGuest = isGuestStudentId(studentId)
  const isCustom = Boolean(customOptions)

  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<Phase>('answering')
  const [selected, setSelected] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [answerResult, setAnswerResult] = useState<TextAnswerResult | null>(null)
  const [textJudgeLoading, setTextJudgeLoading] = useState(false)
  const textSubmittingRef = useRef(false)
  const [textJudgeSource, setTextJudgeSource] = useState<TextJudgeSource | null>(null)
  const [textJudgeReason, setTextJudgeReason] = useState('')
  const [textJudgeWarning, setTextJudgeWarning] = useState('')
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dailyLocked, setDailyLocked] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [answerLogs, setAnswerLogs] = useState<{ qId: string; correct: boolean; answer: string; answerLogValue: string; result: TextAnswerResult }[]>([])
  const [comboStreak, setComboStreak] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [celebration, setCelebration] = useState<SuccessCelebrationContent | null>(null)
  const [retryWrongOnly, setRetryWrongOnly] = useState(false)
  const [reviewExpanded, setReviewExpanded] = useState(false)
  const [selectedReviewQuestionId, setSelectedReviewQuestionId] = useState<string | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [rewardSummary, setRewardSummary] = useState<StudyRewardSummary | null>(null)
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [inquiryCategory, setInquiryCategory] = useState<QuestionInquiryCategory>('question_content')
  const [inquiryMessage, setInquiryMessage] = useState('')
  const [inquiryStatus, setInquiryStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [inquirySending, setInquirySending] = useState(false)
  const [recentInquiries, setRecentInquiries] = useState<QuestionInquiryRow[]>([])
  const [inquiryHistoryLoading, setInquiryHistoryLoading] = useState(false)
  const startedAtRef = useRef<number | null>(null)
  const finishingRef = useRef(false)
  const activeDailyChallenge = dailyChallenge && !retryWrongOnly

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setLoadError(null)
      finishingRef.current = false
      setQuestions([])
      setCurrent(0)
      setPhase('answering')
      setSelected(null)
      setTextInput('')
      setAnswerResult(null)
      setTextJudgeLoading(false)
      setTextJudgeSource(null)
      setTextJudgeReason('')
      setTextJudgeWarning('')
      setScore(0)
      setAnswerLogs([])
      setComboStreak(0)
      setBestCombo(0)
      setCelebration(null)
      setRetryWrongOnly(false)
      setReviewExpanded(false)
      setSelectedReviewQuestionId(null)
      setRewardSummary(null)
      setDailyLocked(false)
      startedAtRef.current = null

      if (dailyChallenge) {
        const completed = await hasCompletedDailyChallenge(studentId)
        if (!active) return
        if (completed) {
          setDailyLocked(true)
          setLoading(false)
          return
        }
      }

      let query = supabase.from('questions').select('*')
      if (!dailyChallenge && field !== 'all') query = query.eq('field', field)
      if (!dailyChallenge && (customOptions?.unit ?? unit) !== 'all') {
        query = query.eq('unit', customOptions?.unit ?? unit)
      }
      if (!dailyChallenge && customOptions?.grade && customOptions.grade !== 'all') {
        query = query.eq('grade', customOptions.grade)
      }
      const supportsStudentQuestionFilter = getCachedColumnSupport('created_by_student_id') !== false

      if (supportsStudentQuestionFilter) {
        query = query.or(
          studentId
            ? `created_by_student_id.is.null,created_by_student_id.eq.${studentId}`
            : 'created_by_student_id.is.null',
        )
      }

      let { data, error } = await query

      if (error && isMissingColumnError(error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        let fallbackQuery = supabase.from('questions').select('*')
        if (!dailyChallenge && field !== 'all') fallbackQuery = fallbackQuery.eq('field', field)
        if (!dailyChallenge && unit !== 'all') fallbackQuery = fallbackQuery.eq('unit', unit)
        if (!dailyChallenge && customOptions?.grade && customOptions.grade !== 'all') {
          fallbackQuery = fallbackQuery.eq('grade', customOptions.grade)
        }
        const fallbackResponse = await fallbackQuery
        data = fallbackResponse.data
        error = fallbackResponse.error
      } else if (!error && supportsStudentQuestionFilter) {
        markColumnSupported('created_by_student_id')
      }

      if (error) {
        console.error('[quiz] failed to load questions', error)
        if (active) {
          setLoadError('問題の読み込みに失敗しました。通信状況を確認してやり直してください。')
          setLoading(false)
        }
        return
      }

      const pool = ((data || []) as Question[])
        .map(question => normalizeQuestionChoices(normalizeQuestionRecord(question), {
          shuffleChoices: question.type === 'choice' || question.type === 'choice4' || question.type === 'fill_choice' || question.type === 'multi_select',
        }))
        .filter(question => hasValidChoiceAnswer(question))
      if (pool.length === 0) {
        if (active) setLoading(false)
        return
      }

      const history = dailyChallenge || isCustom
        ? isGuest
          ? loadGuestStudyStore().answerLogs.map(log => ({
              question_id: log.question_id,
              is_correct: log.is_correct,
            }))
          : await (async () => {
              if (!studentId) return []
              const { data: logs } = await supabase
                .from('answer_logs')
                .select('question_id, is_correct')
                .eq('student_id', studentId)
              return (logs || []).map(log => ({
                question_id: log.question_id,
                is_correct: log.is_correct,
              }))
            })()
        : []

      if (dailyChallenge) {
        if (!active) return
        setQuestions(pickDailyChallengeQuestions(pool, history, 5))
      } else if (customOptions) {
        if (!active) return
        setQuestions(pickCustomQuizQuestions(pool, history, customOptions, questionCount))
      } else {
        setQuestions(pickStandardQuizQuestions(pool, field, questionCount))
      }

      startedAtRef.current = Date.now()
      if (active) setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [customOptions, dailyChallenge, field, isCustom, isGuest, questionCount, studentId, unit])

  useEffect(() => {
    setFavoriteIds(readFavoriteQuestionIds(studentId))
  }, [studentId])

  const q = questions[current]

  useEffect(() => {
    setInquiryOpen(false)
    setInquiryCategory('question_content')
    setInquiryMessage('')
    setInquiryStatus(null)
    setInquirySending(false)
    setRecentInquiries([])
    setInquiryHistoryLoading(false)
  }, [current])

  useEffect(() => {
    if (!inquiryOpen || !q || !studentId) return

    let active = true

    const loadRecentInquiries = async () => {
      setInquiryHistoryLoading(true)

      const { data, error } = await supabase
        .from('question_inquiries')
        .select('*')
        .eq('student_id', studentId)
        .eq('question_id', q.id)
        .order('created_at', { ascending: false })
        .limit(3)

      if (!active) return

      if (error) {
        setRecentInquiries([])
        setInquiryStatus({
          type: 'error',
          text: getQuestionInquirySchemaErrorMessage(error.message),
        })
      } else {
        setRecentInquiries((data || []) as QuestionInquiryRow[])
      }

      setInquiryHistoryLoading(false)
    }

    void loadRecentInquiries()

    return () => {
      active = false
    }
  }, [inquiryOpen, q, studentId])
  const progress = questions.length > 0 ? (current / questions.length) * 100 : 0
  const isFavorite = !!q && favoriteIds.has(q.id)
  const questionImageDisplay = q ? getQuestionImageDisplaySize(q) : null
  const textBlankPrompt = q ? getQuestionBlankPrompt(q) : null
  const correctAnswerText = q
    ? (textBlankPrompt?.target ?? getQuestionCorrectAnswerText(q))
    : ''
  const wrongReviewItems = useMemo(() => {
    return questions
      .map((question, index) => {
        const log = answerLogs[index]
        if (!log || log.correct) return null
        const prompt = getQuestionBlankPrompt(question)
        return {
          id: question.id,
          index,
          question,
          studentAnswer: log.answer,
          correctAnswer: prompt?.target ?? getQuestionCorrectAnswerText(question),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }, [answerLogs, questions])
  const selectedReviewItem = useMemo(
    () => wrongReviewItems.find(item => item.id === selectedReviewQuestionId) ?? wrongReviewItems[0] ?? null,
    [selectedReviewQuestionId, wrongReviewItems],
  )

  useEffect(() => {
    if (!reviewExpanded) return
    if (wrongReviewItems.length === 0) {
      if (selectedReviewQuestionId !== null) setSelectedReviewQuestionId(null)
      return
    }
    if (!selectedReviewQuestionId || !wrongReviewItems.some(item => item.id === selectedReviewQuestionId)) {
      setSelectedReviewQuestionId(wrongReviewItems[0].id)
    }
  }, [reviewExpanded, selectedReviewQuestionId, wrongReviewItems])

  const applyEvaluatedAnswer = (result: { result: TextAnswerResult; studentAnswerText: string; answerLogValue: string }) => {
    if (!q) return

    const isCorrect = isCorrectTextAnswerResult(result.result)

    if (isCorrect) {
      const nextCombo = comboStreak + 1
      const isPerfectRun = current + 1 >= questions.length && score + 1 === questions.length
      setComboStreak(nextCombo)
      setBestCombo(currentBest => Math.max(currentBest, nextCombo))
      setCelebration(getSuccessCelebration(nextCombo, { perfect: isPerfectRun }))
    } else {
      setComboStreak(0)
      setCelebration(null)
    }
    setAnswerResult(result.result)
    if (isCorrect) setScore(currentScore => currentScore + 1)
    setAnswerLogs(logs => [...logs, {
      qId: q.id,
      correct: isCorrect,
      answer: result.studentAnswerText,
      answerLogValue: result.answerLogValue,
      result: result.result,
    }])
    setPhase('result')
  }

  const handleChoice = (choice: string) => {
    if (phase !== 'answering' || !q) return
    setSelected(choice)
    applyEvaluatedAnswer(evaluateQuestionAnswer(q, { kind: 'single', value: choice }))
  }

  const handleStructuredSubmit = (submission: QuestionSubmission) => {
    if (phase !== 'answering' || !q) return
    setTextJudgeLoading(false)
    setTextJudgeSource(null)
    setTextJudgeReason('')
    setTextJudgeWarning('')
    applyEvaluatedAnswer(evaluateQuestionAnswer(q, submission))
  }

  const handleTextSubmit = async () => {
    if (!q || phase !== 'answering' || q.type !== 'text' || textJudgeLoading || textSubmittingRef.current) return
    const answer = textInput.trim()
    if (!answer) return

    textSubmittingRef.current = true
    const localEvaluated = evaluateQuestionAnswer(q, { kind: 'text', value: answer })
    setTextJudgeLoading(true)
    setTextJudgeSource(null)
    setTextJudgeReason('')
    setTextJudgeWarning('')

    try {
      const response = await fetch('/api/question-judge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          field: q.field,
          unit: q.unit,
          question: q.question,
          correctAnswer: q.answer,
          acceptAnswers: q.accept_answers,
          keywords: q.keywords,
          explanation: q.explanation,
          studentAnswer: answer,
        }),
      })

      const payload = await response.json() as TextJudgeApiResponse | { error?: string }
      if (!response.ok || !('result' in payload)) {
        throw new Error(payload && 'error' in payload && payload.error ? payload.error : '記述判定に失敗しました。')
      }

      setTextJudgeSource(payload.judgeSource)
      setTextJudgeReason(typeof payload.reason === 'string' ? payload.reason : '')
      setTextJudgeWarning(typeof payload.warning === 'string' ? payload.warning : '')
      applyEvaluatedAnswer({
        ...localEvaluated,
        result: payload.result,
      })
    } catch (error) {
      setTextJudgeSource('fallback')
      setTextJudgeReason('')
      setTextJudgeWarning('通信の都合で通常の記述判定に切り替えました。')
      applyEvaluatedAnswer(localEvaluated)
    } finally {
      setTextJudgeLoading(false)
      textSubmittingRef.current = false
    }
  }

  const handleDontKnow = () => {
    if (phase !== 'answering' || !q || q.type !== 'text') return
    setComboStreak(0)
    setCelebration(null)
    setTextJudgeLoading(false)
    setTextJudgeSource(null)
    setTextJudgeReason('')
    setTextJudgeWarning('')
    setTextInput('わからない')
    setAnswerResult('incorrect')
    setAnswerLogs(logs => [...logs, {
      qId: q.id,
      correct: false,
      answer: 'わからない',
      answerLogValue: 'わからない',
      result: 'incorrect',
    }])
    setPhase('result')
  }

  const handleToggleFavorite = () => {
    if (!q || !studentId) return

    setFavoriteIds(currentIds => {
      const next = new Set(currentIds)
      if (next.has(q.id)) next.delete(q.id)
      else next.add(q.id)
      writeFavoriteQuestionIds(studentId, next)
      return next
    })
  }

  const handleOpenInquiry = () => {
    setInquiryOpen(true)
    setInquiryStatus(null)
  }

  const handleCloseInquiry = () => {
    if (inquirySending) return
    setInquiryOpen(false)
    setInquiryStatus(null)
  }

  const handleSubmitInquiry = async () => {
    if (!q || !studentId) return

    try {
      setInquirySending(true)
      setInquiryStatus(null)

      const { data, error } = await supabase
        .from('question_inquiries')
        .insert({
          student_id: studentId,
          student_nickname: nickname ?? `ID ${studentId}`,
          question_id: q.id,
          category: inquiryCategory,
          message: inquiryMessage.trim(),
          field: q.field as '生物' | '化学' | '物理' | '地学',
          unit: q.unit,
          question_text: q.question,
          question_type: q.type,
          choices: q.choices,
          match_pairs: q.match_pairs,
          sort_items: q.sort_items,
          correct_choices: q.correct_choices,
          word_tokens: q.word_tokens,
          distractor_tokens: q.distractor_tokens,
          answer_text: getQuestionCorrectAnswerText(q),
          explanation_text: q.explanation,
          image_url: q.image_url,
        })
        .select('*')
        .single()

      if (error) {
        throw new Error(getQuestionInquirySchemaErrorMessage(error.message))
      }

      setInquiryStatus({ type: 'success', text: '管理者に問い合わせを送信しました。' })
      setInquiryMessage('')
      if (data) {
        setRecentInquiries(current => [data as QuestionInquiryRow, ...current].slice(0, 3))
      }
    } catch (error) {
      setInquiryStatus({
        type: 'error',
        text: error instanceof Error ? error.message : '問い合わせの送信に失敗しました。',
      })
    } finally {
      setInquirySending(false)
    }
  }

  const handleNext = async () => {
    if (!q) return

    if (current + 1 >= questions.length) {
      if (finishingRef.current) return
      finishingRef.current = true
      const durationSeconds = startedAtRef.current
        ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
        : 0
      const xpBreakdown = calculateQuizXpBreakdown(score, questions.length, durationSeconds)

      const reward = await recordStudySession({
        studentId,
        field: retryWrongOnly ? field : getSessionFieldLabel(field, quickStartAll, activeDailyChallenge),
        unit: retryWrongOnly
          ? 'まちがえた問題の再挑戦'
          : customOptions
            ? getCustomQuizSessionLabel(customOptions)
            : getSessionUnitLabel(unit, quickStartAll, activeDailyChallenge),
        totalQuestions: questions.length,
        correctCount: score,
        durationSeconds,
        answerLogs,
        sessionMode: retryWrongOnly ? 'drill' : buildSessionMode({ isDrill, quickStartAll, dailyChallenge: activeDailyChallenge, isCustom }),
        xpMultiplier: activeDailyChallenge ? 2 : 1,
        xpBreakdown,
      })

      setRewardSummary(reward)
      setPhase('finished')
      return
    }

    setCurrent(currentIndex => currentIndex + 1)
    setPhase('answering')
    setSelected(null)
    setTextInput('')
    setAnswerResult(null)
    setTextJudgeLoading(false)
    setTextJudgeSource(null)
    setTextJudgeReason('')
    setTextJudgeWarning('')
    setCelebration(null)
  }

  const restart = () => {
    finishingRef.current = false
    startedAtRef.current = Date.now()
    setCurrent(0)
    setPhase('answering')
    setScore(0)
    setSelected(null)
    setTextInput('')
    setAnswerResult(null)
    setTextJudgeLoading(false)
    setTextJudgeSource(null)
    setTextJudgeReason('')
    setTextJudgeWarning('')
    setAnswerLogs([])
    setComboStreak(0)
    setBestCombo(0)
    setCelebration(null)
    setRetryWrongOnly(false)
    setReviewExpanded(false)
    setSelectedReviewQuestionId(null)
    setRewardSummary(null)
  }

  const retryWrongQuestions = () => {
    if (wrongReviewItems.length === 0) return
    finishingRef.current = false
    startedAtRef.current = Date.now()
    setQuestions(wrongReviewItems.map(item => item.question))
    setCurrent(0)
    setPhase('answering')
    setScore(0)
    setSelected(null)
    setTextInput('')
    setAnswerResult(null)
    setTextJudgeLoading(false)
    setTextJudgeSource(null)
    setTextJudgeReason('')
    setTextJudgeWarning('')
    setAnswerLogs([])
    setComboStreak(0)
    setBestCombo(0)
    setCelebration(null)
    setRetryWrongOnly(true)
    setReviewExpanded(false)
    setSelectedReviewQuestionId(null)
    setRewardSummary(null)
  }

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card text-slate-400">問題を読み込み中...</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="page-shell flex flex-col items-center justify-center">
        <div className="card w-full max-w-md text-center">
          <p className="text-red-400 mb-4">{loadError}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={onBack} className="btn-secondary">もどる</button>
          </div>
        </div>
      </div>
    )
  }

  if (dailyLocked) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card w-full max-w-xl text-center">
          <div className="text-5xl mb-4">✅</div>
          <div className="font-display text-3xl text-white">今日のチャレンジ完了済み</div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            今日はもうクリア済みです。明日になるとまた挑戦できます。
          </p>
          <div className="mt-6 flex justify-center">
            <button onClick={onBack} className="btn-primary">
              ホームへ
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="page-shell flex flex-col items-center justify-center">
        <div className="card w-full max-w-md text-center">
          <p className="text-slate-400 mb-4">
            {customOptions ? '条件に合う問題がありません。条件を変えてみてください。' : '問題がまだ登録されていません。'}
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={onBack} className="btn-secondary">もどる</button>
            <button onClick={() => logout()} className="btn-ghost">
              ログアウト
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'finished') {
    const rate = Math.round((score / questions.length) * 100)
    const backLabel = isDrill ? 'マイページへ' : quickStartAll || quickStartDaily || dailyChallenge ? 'ホームへ' : '分野選択へ'
    const message = buildFinishMessage(rate, activeDailyChallenge)
    const levelInfo = rewardSummary ? getLevelInfo(rewardSummary.totalXp) : null

    return (
      <div className="page-shell flex flex-col items-center justify-center anim-fade">
        <BadgeEarnedToastStack badges={rewardSummary?.newBadges ?? []} />
        <div className={`hero-card reward-card w-full max-w-3xl p-6 text-center sm:p-7 ${rewardSummary?.leveledUp ? 'is-level-up' : ''}`}>
          {rewardSummary?.leveledUp && (
            <div className="reward-confetti" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => (
                <span
                  key={`confetti-${index}`}
                  className="reward-confetti__piece"
                  style={{
                    left: `${6 + ((index * 11) % 88)}%`,
                    animationDelay: `${(index % 6) * 0.08}s`,
                    background: index % 3 === 0 ? '#38bdf8' : index % 3 === 1 ? '#f59e0b' : '#22c55e',
                  }}
                />
              ))}
            </div>
          )}

          <div className="text-5xl mb-4">{activeDailyChallenge ? '☀️' : retryWrongOnly ? '🔁' : rate >= 70 ? '🏆' : '📚'}</div>
          <div className="font-display text-4xl mb-2" style={{ color }}>
            {score} / {questions.length}
          </div>
          <div
            className="text-2xl font-bold mb-1"
            style={{ color: getRateColor(rate) }}
          >
            {rate}%
          </div>
          <p className="text-slate-300 mb-5">{message}</p>

          {rate === 100 && (
            <div className="mx-auto mb-5 max-w-md">
              <SuccessBurst celebration={getSuccessCelebration(Math.max(1, bestCombo), { perfect: true })} />
            </div>
          )}

          <div className="flex gap-2 justify-center mb-6">
            {questions.map((_, index) => (
              <div
                key={`result-${index}`}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background:
                    answerLogs[index] && isCorrectTextAnswerResult(answerLogs[index].result)
                      ? '#22c55e'
                      : answerLogs[index]?.result === 'keyword'
                        ? '#f59e0b'
                        : '#ef4444',
                }}
              />
            ))}
          </div>

          {rewardSummary && (
            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              <div className="subcard anim-pop p-4 text-left">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">獲得XP</div>
                <div className="mt-2 font-display text-3xl text-sky-300">+{rewardSummary.xpEarned}</div>
                <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center justify-between gap-3">
                    <span>正解XP</span>
                    <span>{rewardSummary.xpBreakdown.base} XP</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>スピード</span>
                    <span>{rewardSummary.xpBreakdown.speed} XP</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>パーフェクト</span>
                    <span>{rewardSummary.xpBreakdown.perfect} XP</span>
                  </div>
                  {rewardSummary.xpBreakdown.multiplier > 1 && (
                    <div className="flex items-center justify-between gap-3 text-amber-200">
                      <span>今日のチャレンジ</span>
                      <span>x{rewardSummary.xpBreakdown.multiplier}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {activeDailyChallenge ? '今日のチャレンジボーナス込み' : retryWrongOnly ? '再挑戦ぶんの結果' : '今回の学習で加算'}
                </div>
              </div>
              {levelInfo && (
                <div className="subcard p-4 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">現在レベル</div>
                      <div className={`mt-2 inline-flex items-center rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1.5 font-display text-2xl text-white ${rewardSummary.leveledUp ? 'level-badge--up' : ''}`}>
                        Lv.{levelInfo.level}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-sky-200">{levelInfo.title}</div>
                      <div className="text-xs text-slate-500">{levelInfo.totalXp} XP</div>
                    </div>
                  </div>
                  <div className="mt-4 soft-track" style={{ height: 8 }}>
                    <div
                      style={{
                        width: `${levelInfo.progressRate}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #60a5fa, #38bdf8)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    次のレベルまで {Math.max(0, levelInfo.nextLevelXp - levelInfo.totalXp)} XP
                  </div>
                </div>
              )}
              <div className="subcard p-4 text-left">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">最高コンボ</div>
                <div className="mt-2 font-display text-3xl text-emerald-300">{bestCombo}</div>
                <div className="mt-2 text-xs text-slate-500">連続正解の自己ベスト</div>
              </div>
            </div>
          )}

          {rewardSummary?.leveledUp && levelInfo && (
            <div className="reward-banner mb-5">
              <div className="text-xs font-semibold tracking-[0.22em] text-sky-200">LEVEL UP</div>
              <div className="mt-1 font-display text-3xl text-white">Lv.{levelInfo.level}</div>
              <div className="mt-1 text-sm text-sky-100">{levelInfo.title}</div>
            </div>
          )}

          <LevelUnlockNotice rewardSummary={rewardSummary} />
          {rewardSummary?.periodicCardReward && (
            <PeriodicCardRewardPanel reward={rewardSummary.periodicCardReward} />
          )}

          {rewardSummary && rewardSummary.newBadges.length > 0 && (
            <div className="mb-6 text-left">
              <div className="text-sm font-semibold text-white mb-3">新しいバッジ</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {rewardSummary.newBadges.map((badge, index) => (
                  <div
                    key={badge.key}
                    className={`badge-toast badge-toast--${badge.rarity}`}
                    style={{ animationDelay: `${index * 0.08}s` }}
                  >
                    <div className="text-2xl">{badge.iconEmoji}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-white">{badge.name}</div>
                        <span className="text-[10px] tracking-[0.18em] text-slate-400">
                          {getBadgeRarityLabel(badge.rarity)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1">{badge.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {wrongReviewItems.length > 0 && (
            <div className="mb-6 rounded-[26px] border border-white/10 bg-slate-950/28 p-4 text-left sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">間違えた問題を確認</div>
                  <div className="mt-1 text-xs text-slate-400">{wrongReviewItems.length}問</div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button onClick={() => setReviewExpanded(current => !current)} className="btn-secondary text-sm !py-2.5">
                    {reviewExpanded ? '閉じる' : '開く'}
                  </button>
                  <button onClick={retryWrongQuestions} className="btn-primary text-sm !py-2.5">
                    間違えた問題だけ再チャレンジ
                  </button>
                </div>
              </div>

              {reviewExpanded && (
                <div className="mt-4 grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-2">
                    {wrongReviewItems.map(item => (
                      <button
                        key={`review-${item.id}`}
                        onClick={() => setSelectedReviewQuestionId(item.id)}
                        className="w-full rounded-[18px] border px-3.5 py-3 text-left transition-all"
                        style={{
                          borderColor: selectedReviewItem?.id === item.id ? 'rgba(56, 189, 248, 0.3)' : 'rgba(148, 163, 184, 0.14)',
                          background: selectedReviewItem?.id === item.id ? 'rgba(56, 189, 248, 0.08)' : 'var(--card-gradient-base-soft)',
                        }}
                      >
                        <div className="text-xs text-slate-500">#{item.index + 1}</div>
                        <div className="mt-1 line-clamp-2 text-sm font-semibold text-white">{item.question.question}</div>
                        <div className="mt-2 text-xs text-slate-400">あなた: {item.studentAnswer || '未入力'}</div>
                      </button>
                    ))}
                  </div>

                  {selectedReviewItem && (
                    <div className="rounded-[20px] border border-white/10 bg-slate-950/36 p-4">
                      <div className="text-xs text-slate-500">問題 {selectedReviewItem.index + 1}</div>
                      <div className="mt-2 text-base font-semibold leading-7 text-white">
                        {selectedReviewItem.question.question}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[18px] border border-red-400/18 bg-red-500/8 px-3.5 py-3">
                          <div className="text-xs font-semibold tracking-[0.16em] text-red-200">あなたの答え</div>
                          <div className="mt-2 text-sm leading-6 text-slate-100">{selectedReviewItem.studentAnswer || '未入力'}</div>
                        </div>
                        <div className="rounded-[18px] border border-emerald-400/18 bg-emerald-500/8 px-3.5 py-3">
                          <div className="text-xs font-semibold tracking-[0.16em] text-emerald-200">正解</div>
                          <div className="mt-2 text-sm leading-6 text-slate-100">{selectedReviewItem.correctAnswer}</div>
                        </div>
                      </div>
                      {selectedReviewItem.question.explanation && (
                        <div className="mt-4 rounded-[18px] border border-white/8 bg-slate-950/45 px-3.5 py-3">
                          <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">解説</div>
                          <div className="mt-2 text-sm leading-7 text-slate-200">{selectedReviewItem.question.explanation}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className={`grid gap-3 ${activeDailyChallenge ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {!activeDailyChallenge && (
              <button onClick={restart} className="btn-secondary !px-0 !py-3">
                もう一度
              </button>
            )}
            <button onClick={onBack} className="btn-primary py-3">
              {backLabel}
            </button>
            <button onClick={() => logout()} className="btn-ghost !px-0 !py-3">
              ログアウト
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="card mb-4 anim-fade-up">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center justify-between gap-3 sm:w-auto">
            <button onClick={onBack} className="btn-secondary text-sm !px-4 !py-2.5">
              やめる
            </button>
            <button onClick={() => logout()} className="btn-ghost text-sm !px-4 !py-2.5 sm:hidden">
              ログアウト
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>
                {activeDailyChallenge
                  ? '今日のチャレンジ'
                  : retryWrongOnly
                    ? 'まちがえた問題の再挑戦'
                  : isDrill
                    ? `復習: ${field} / ${unit}`
                    : customOptions
                      ? `カスタム: ${getCustomQuizSummaryParts(customOptions).join(' / ')}`
                    : quickStartAll
                      ? '4分野総合クイックスタート'
                      : unit === 'all'
                        ? '全単元'
                        : unit}
              </span>
              <span>{current + 1} / {questions.length}</span>
            </div>
            <div className="soft-track" style={{ height: 8 }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: activeDailyChallenge
                    ? 'linear-gradient(90deg, #f59e0b, #f97316)'
                    : `linear-gradient(90deg, ${color}, ${color}80)`,
                  borderRadius: 999,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="text-sm font-semibold" style={{ color: activeDailyChallenge ? '#f59e0b' : retryWrongOnly ? '#38bdf8' : color }}>
              {score}正解
            </div>
            <button onClick={() => logout()} className="btn-ghost hidden text-sm !px-4 !py-2.5 sm:inline-flex">
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div key={current} className="card anim-fade-up mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            {activeDailyChallenge ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#f59e0b20', color: '#fbbf24' }}>
                今日のチャレンジ
              </span>
            ) : retryWrongOnly ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#38bdf820', color: '#7dd3fc' }}>
                再チャレンジ
              </span>
            ) : customOptions ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#38bdf820', color: '#7dd3fc' }}>
                カスタム
              </span>
            ) : isDrill ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#f59e0b20', color: '#fbbf24' }}>
                復習モード
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${color}20`, color }}>
                {q.field} · {q.unit}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(148, 163, 184, 0.14)', color: 'var(--text-muted)' }}>
              {getQuestionTypeShortLabel(q.type)}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={handleToggleFavorite}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all"
              style={{
                border: `1px solid ${isFavorite ? '#f59e0b55' : 'var(--surface-elevated-border)'}`,
                background: isFavorite ? 'rgba(245, 158, 11, 0.14)' : 'var(--surface-elevated)',
                color: isFavorite ? '#fbbf24' : 'var(--text-muted)',
              }}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'お気に入り解除' : 'お気に入り登録'}
            >
              <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
              <span>お気に入り</span>
            </button>
            <button
              onClick={handleOpenInquiry}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all"
              style={{
                border: '1px solid rgba(56, 189, 248, 0.24)',
                background: inquiryOpen ? 'rgba(56, 189, 248, 0.14)' : 'var(--surface-elevated)',
                color: inquiryOpen ? '#7dd3fc' : 'var(--text-muted)',
              }}
              aria-label="管理者へ問い合わせ"
            >
              <span aria-hidden="true">✉️</span>
              <span>問い合わせ</span>
            </button>
          </div>
        </div>
        <p className="text-lg font-bold leading-relaxed sm:text-[1.35rem]" style={{ color: 'var(--text)' }}>{q.question}</p>
        {q.image_url && questionImageDisplay && (
          <div className="mt-4 flex justify-center">
            <div
              className="overflow-hidden rounded-[24px] border bg-slate-950/50"
              style={{
                borderColor: 'rgba(148, 163, 184, 0.16)',
                width: `min(100%, ${questionImageDisplay.width}px)`,
                aspectRatio: questionImageDisplay.aspectRatio,
              }}
            >
              <img
                src={q.image_url}
                alt={`${q.question} の画像`}
                className="block h-full w-full object-fill"
                loading="lazy"
              />
            </div>
          </div>
        )}
        {inquiryOpen && (
          <div
            className="mt-4 rounded-[24px] border px-4 py-4"
            style={{
              borderColor: 'rgba(56, 189, 248, 0.2)',
              background: 'var(--card-gradient-base-soft)',
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.18em] text-sky-200">管理者へ問い合わせ</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  問題文・選択肢・正解・解説は自動で添付されます。必要なら気になった点もひとこと送れます。
                </p>
              </div>
              <button onClick={handleCloseInquiry} className="btn-ghost text-sm !px-3 !py-2" disabled={inquirySending}>
                閉じる
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {QUESTION_INQUIRY_CATEGORY_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setInquiryCategory(option.value)}
                  className="rounded-2xl border px-3 py-3 text-left transition-all"
                  style={{
                    borderColor: inquiryCategory === option.value ? 'rgba(56, 189, 248, 0.38)' : 'rgba(148, 163, 184, 0.16)',
                    background: inquiryCategory === option.value ? 'rgba(56, 189, 248, 0.12)' : 'var(--card-gradient-base-soft)',
                  }}
                >
                  <div className="text-sm font-semibold text-white">{option.label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">{option.description}</div>
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="text-xs text-slate-400">追加メッセージ（任意）</span>
              <textarea
                value={inquiryMessage}
                onChange={event => setInquiryMessage(event.target.value)}
                rows={3}
                className="input-surface mt-2 resize-y text-sm"
                placeholder="どこが気になったかを短く書けます。空でも送信できます。"
              />
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  void handleSubmitInquiry()
                }}
                className="btn-primary"
                disabled={inquirySending}
              >
                {inquirySending ? '送信中...' : '管理者へ送る'}
              </button>
              <span className="text-xs text-slate-500">
                送信者: {nickname ?? `ID ${studentId ?? '不明'}`}
              </span>
            </div>

            {inquiryStatus && (
              <div
                className="mt-3 rounded-2xl px-4 py-3 text-sm"
                style={{
                  background: inquiryStatus.type === 'success' ? '#052e16' : '#450a0a',
                  border: `1px solid ${inquiryStatus.type === 'success' ? '#166534' : '#991b1b'}`,
                  color: inquiryStatus.type === 'success' ? '#86efac' : '#fca5a5',
                }}
              >
                {inquiryStatus.text}
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-950/35 px-4 py-4">
              <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">この問題のやり取り</div>
              {inquiryHistoryLoading ? (
                <div className="mt-3 text-sm text-slate-400">読み込み中...</div>
              ) : recentInquiries.length === 0 ? (
                <div className="mt-3 text-sm text-slate-500">まだこの問題の問い合わせはありません。</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {recentInquiries.map(inquiry => {
                    const statusMeta = QUESTION_INQUIRY_STATUS_META[inquiry.status]
                    return (
                      <div key={inquiry.id} className="rounded-2xl border border-slate-800 bg-slate-950/55 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={{ background: statusMeta.background, color: statusMeta.color }}
                          >
                            {statusMeta.label}
                          </span>
                          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                            {QUESTION_INQUIRY_CATEGORY_OPTIONS.find(option => option.value === inquiry.category)?.label ?? 'その他'}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          送信: {new Date(inquiry.created_at).toLocaleString('ja-JP')}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-200">
                          {inquiry.message || '追加メッセージなし'}
                        </div>
                        {inquiry.admin_reply.trim() && (
                          <div className="mt-3 rounded-xl border border-sky-500/18 bg-sky-500/8 px-3 py-3">
                            <div className="text-xs font-semibold tracking-[0.16em] text-sky-200">管理者からの返信</div>
                            <div className="mt-2 text-sm leading-6 text-slate-100">{inquiry.admin_reply}</div>
                            {inquiry.replied_at && (
                              <div className="mt-2 text-[11px] text-slate-500">
                                返信: {new Date(inquiry.replied_at).toLocaleString('ja-JP')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {(() => {
        if (q.type === 'choice' || q.type === 'choice4') {
          return (
            <Choice4Question
              choices={q.choices ?? []}
              selectedChoice={selected}
              answer={q.answer}
              answerResult={answerResult}
              disabled={phase === 'result'}
              onSelect={handleChoice}
            />
          )
        }

        if (q.type === 'true_false') {
          return (
            <TrueFalseQuestion
              choices={q.choices ?? ['○', '×']}
              selectedChoice={selected}
              answer={q.answer}
              answerResult={answerResult}
              disabled={phase === 'result'}
              onSelect={handleChoice}
            />
          )
        }

        if (q.type === 'fill_choice') {
          return (
            <FillChoiceQuestion
              choices={q.choices ?? []}
              selectedChoice={selected}
              answer={q.answer}
              answerResult={answerResult}
              disabled={phase === 'result'}
              onSelect={handleChoice}
            />
          )
        }

        if (q.type === 'match') {
          return (
            <MatchQuestion
              questionId={q.id}
              pairs={q.match_pairs ?? []}
              disabled={phase === 'result'}
              onSubmit={pairs => handleStructuredSubmit({ kind: 'match', pairs })}
            />
          )
        }

        if (q.type === 'sort') {
          return (
            <SortQuestion
              questionId={q.id}
              items={q.sort_items ?? []}
              disabled={phase === 'result'}
              onSubmit={items => handleStructuredSubmit({ kind: 'sort', items })}
            />
          )
        }

        if (q.type === 'multi_select') {
          return (
            <MultiSelectQuestion
              questionId={q.id}
              choices={q.choices ?? []}
              disabled={phase === 'result'}
              onSubmit={selectedChoices => handleStructuredSubmit({ kind: 'multi_select', selected: selectedChoices })}
            />
          )
        }

        if (q.type === 'word_bank') {
          return (
            <WordBankQuestion
              questionId={q.id}
              wordTokens={q.word_tokens ?? []}
              distractorTokens={q.distractor_tokens ?? []}
              disabled={phase === 'result'}
              onSubmit={tokens => handleStructuredSubmit({ kind: 'word_bank', tokens })}
            />
          )
        }

        return (
          <div className="anim-fade-up">
            <div
              className="mb-3 rounded-[24px] border px-4 py-3"
              style={{
                borderColor: 'rgba(56, 189, 248, 0.18)',
                background: 'var(--card-gradient-base-soft)',
              }}
            >
              <div
                className="rounded-[20px] border px-4 py-3 text-base font-semibold leading-8 text-white"
                style={{
                  borderColor: 'rgba(56, 189, 248, 0.16)',
                  background: 'rgba(2, 8, 23, 0.32)',
                }}
              >
                {textBlankPrompt?.promptText ?? '＿＿＿＿'}
              </div>
            </div>
            <input
              value={textInput}
              onChange={event => setTextInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleTextSubmit()
                }
              }}
              disabled={phase === 'result' || textJudgeLoading}
              placeholder={textBlankPrompt?.placeholder ?? '答え'}
              enterKeyHint="done"
              autoCapitalize="none"
              autoCorrect="off"
              className="input-surface mb-3"
              style={{
                border:
                  phase === 'result'
                    ? `2px solid ${
                      answerResult === 'exact'
                        ? '#22c55e'
                        : answerResult === 'semantic'
                          ? '#10b981'
                          : answerResult === 'keyword'
                            ? '#f59e0b'
                            : '#ef4444'
                    }`
                    : undefined,
                fontSize: '1rem',
              }}
            />
            {phase === 'answering' && (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <button onClick={() => void handleTextSubmit()} disabled={!textInput.trim() || textJudgeLoading} className="btn-primary w-full">
                  {textJudgeLoading ? '判定中...' : '決定'}
                </button>
                <button onClick={handleDontKnow} disabled={textJudgeLoading} className="btn-secondary w-full sm:w-auto disabled:opacity-60">
                  わからない
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {phase === 'result' && (
        (() => {
          const currentResult = answerResult ?? 'incorrect'
          const isCorrect = isCorrectTextAnswerResult(currentResult)
          const accent = currentResult === 'exact'
            ? '#22c55e'
            : currentResult === 'semantic'
              ? '#10b981'
              : currentResult === 'keyword'
                ? '#f59e0b'
                : '#ef4444'
          const background = isCorrect
            ? 'rgba(34, 197, 94, 0.12)'
            : currentResult === 'keyword'
              ? 'rgba(245, 158, 11, 0.12)'
              : 'rgba(239, 68, 68, 0.12)'
          const title = currentResult === 'exact'
            ? '◯ 正解！'
            : currentResult === 'semantic'
              ? '◎ 正解（意味OK）'
            : currentResult === 'keyword'
              ? '▲ あと少し'
              : '❌ 不正解'

          return (
            <div className="card mt-4 anim-pop" style={{ borderColor: `${accent}50`, background }}>
              {isCorrect && celebration && (
                <SuccessBurst celebration={celebration} className="mb-4" />
              )}
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-lg" style={{ color: accent }}>
                  {title}
                </span>
              </div>
              {currentResult === 'semantic' && textJudgeSource === 'gemini' && (
                <p className="mb-2 text-xs text-emerald-200">
                  Gemini が意味として正しい回答と判断しました。
                  {textJudgeReason ? ` ${textJudgeReason}` : ''}
                </p>
              )}
              {textJudgeWarning && (
                <p className="mb-2 text-xs text-amber-200">{textJudgeWarning}</p>
              )}
              {!isCorrect && (
                <>
                  <p className="text-slate-200 text-sm mb-2">答え: {correctAnswerText}</p>
                  {correctAnswerText !== q.answer && q.answer && (
                    <p className="text-slate-300 text-xs mb-2">{q.answer}</p>
                  )}
                </>
              )}
              {!isCorrect && q.type === 'text' && q.keywords && q.keywords.length > 0 && (
                <p className="text-slate-300 text-xs mb-2">キーワード: {q.keywords.join(' / ')}</p>
              )}
              {currentResult === 'keyword' && (
                <p className="text-amber-200 text-xs mb-2">おしい</p>
              )}
              {q.explanation && (
                <p className="text-slate-300 text-sm leading-relaxed">{q.explanation}</p>
              )}
              <button onClick={handleNext} className="btn-primary w-full mt-4">
                {current + 1 >= questions.length ? '結果を見る' : '次の問題 →'}
              </button>
            </div>
          )
        })()
      )}
    </div>
  )
}
