'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { buildTextBlankPrompt, evaluateTextAnswer, TextAnswerResult } from '@/lib/answerUtils'
import { getBadgeRarityLabel } from '@/lib/badges'
import { CustomQuizOptions, getCustomQuizSessionLabel, getCustomQuizSummaryParts } from '@/lib/customQuiz'
import { getLevelInfo } from '@/lib/engagement'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { getQuestionImageDisplaySize } from '@/lib/questionImages'
import { hasValidChoiceAnswer, normalizeQuestionChoices } from '@/lib/questionChoices'
import { pickCustomQuizQuestions, pickDailyChallengeQuestions, pickStandardQuizQuestions } from '@/lib/questionPicker'
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
import LevelUnlockNotice from '@/components/LevelUnlockNotice'
import { PeriodicCardRewardPanel } from '@/components/PeriodicCard'
import SuccessBurst from '@/components/SuccessBurst'

const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e',
  '化学': '#f97316',
  '物理': '#3b82f6',
  '地学': '#a855f7',
  'all': '#38bdf8',
}
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

interface Question {
  id: string
  field: string
  unit: string
  question: string
  type: 'choice' | 'text'
  choices: string[] | null
  answer: string
  accept_answers: string[] | null
  keywords: string[] | null
  explanation: string | null
  image_url: string | null
  image_display_width: number | null
  image_display_height: number | null
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
  dailyChallenge = false,
  customOptions,
  onBack,
}: {
  field: string
  unit: string
  isDrill?: boolean
  quickStartAll?: boolean
  dailyChallenge?: boolean
  customOptions?: CustomQuizOptions
  onBack: () => void
}) {
  const { studentId, nickname, logout } = useAuth()
  const color = FIELD_COLORS[field] ?? '#38bdf8'
  const isGuest = isGuestStudentId(studentId)
  const isCustom = Boolean(customOptions)

  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<Phase>('answering')
  const [selected, setSelected] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [answerResult, setAnswerResult] = useState<TextAnswerResult | null>(null)
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dailyLocked, setDailyLocked] = useState(false)
  const [answerLogs, setAnswerLogs] = useState<{ qId: string; correct: boolean; answer: string; result: TextAnswerResult }[]>([])
  const [comboStreak, setComboStreak] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [celebration, setCelebration] = useState<SuccessCelebrationContent | null>(null)
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

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setQuestions([])
      setCurrent(0)
      setPhase('answering')
      setSelected(null)
      setTextInput('')
      setAnswerResult(null)
      setScore(0)
      setAnswerLogs([])
      setComboStreak(0)
      setBestCombo(0)
      setCelebration(null)
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
        const fallbackResponse = await fallbackQuery
        data = fallbackResponse.data
        error = fallbackResponse.error
      } else if (!error && supportsStudentQuestionFilter) {
        markColumnSupported('created_by_student_id')
      }

      if (error) {
        console.error('[quiz] failed to load questions', error)
        if (active) setLoading(false)
        return
      }

      const pool = ((data || []) as Question[])
        .map(question => normalizeQuestionChoices(question, { shuffleChoices: question.type === 'choice' }))
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
        setQuestions(pickCustomQuizQuestions(pool, history, customOptions, 10))
      } else {
        setQuestions(pickStandardQuizQuestions(pool, field))
      }

      startedAtRef.current = Date.now()
      if (active) setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [customOptions, dailyChallenge, field, isCustom, isGuest, studentId, unit])

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
  const textBlankPrompt = q?.type === 'text'
    ? buildTextBlankPrompt(q.answer, q.accept_answers, q.keywords)
    : null

  const handleChoice = (choice: string) => {
    if (phase !== 'answering' || !q) return
    const result: TextAnswerResult = choice === q.answer ? 'exact' : 'incorrect'
    if (result === 'exact') {
      const nextCombo = comboStreak + 1
      const isPerfectRun = current + 1 >= questions.length && score + 1 === questions.length
      setComboStreak(nextCombo)
      setBestCombo(currentBest => Math.max(currentBest, nextCombo))
      setCelebration(getSuccessCelebration(nextCombo, { perfect: isPerfectRun }))
    } else {
      setComboStreak(0)
      setCelebration(null)
    }
    setSelected(choice)
    setAnswerResult(result)
    if (result === 'exact') setScore(currentScore => currentScore + 1)
    setAnswerLogs(logs => [...logs, { qId: q.id, correct: result === 'exact', answer: choice, result }])
    setPhase('result')
  }

  const handleTextSubmit = () => {
    if (!q) return
    const answer = textInput.trim()
    if (!answer) return
    const result = evaluateTextAnswer(answer, q.answer, q.accept_answers, q.keywords)
    if (result === 'exact') {
      const nextCombo = comboStreak + 1
      const isPerfectRun = current + 1 >= questions.length && score + 1 === questions.length
      setComboStreak(nextCombo)
      setBestCombo(currentBest => Math.max(currentBest, nextCombo))
      setCelebration(getSuccessCelebration(nextCombo, { perfect: isPerfectRun }))
    } else {
      setComboStreak(0)
      setCelebration(null)
    }
    setAnswerResult(result)
    if (result === 'exact') setScore(currentScore => currentScore + 1)
    setAnswerLogs(logs => [...logs, { qId: q.id, correct: result === 'exact', answer, result }])
    setPhase('result')
  }

  const handleDontKnow = () => {
    if (phase !== 'answering' || !q || q.type !== 'text') return
    setComboStreak(0)
    setCelebration(null)
    setTextInput('わからない')
    setAnswerResult('incorrect')
    setAnswerLogs(logs => [...logs, { qId: q.id, correct: false, answer: 'わからない', result: 'incorrect' }])
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
          answer_text: q.answer,
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
      const durationSeconds = startedAtRef.current
        ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
        : 0
      const xpBreakdown = calculateQuizXpBreakdown(score, questions.length, durationSeconds)

      const reward = await recordStudySession({
        studentId,
        field: getSessionFieldLabel(field, quickStartAll, dailyChallenge),
        unit: customOptions
          ? getCustomQuizSessionLabel(customOptions)
          : getSessionUnitLabel(unit, quickStartAll, dailyChallenge),
        totalQuestions: questions.length,
        correctCount: score,
        durationSeconds,
        answerLogs,
        sessionMode: buildSessionMode({ isDrill, quickStartAll, dailyChallenge, isCustom }),
        xpMultiplier: dailyChallenge ? 2 : 1,
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
    setCelebration(null)
  }

  const restart = () => {
    startedAtRef.current = Date.now()
    setCurrent(0)
    setPhase('answering')
    setScore(0)
    setSelected(null)
    setTextInput('')
    setAnswerResult(null)
    setAnswerLogs([])
    setComboStreak(0)
    setBestCombo(0)
    setCelebration(null)
    setRewardSummary(null)
  }

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card text-slate-400">問題を読み込み中...</div>
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
    const backLabel = isDrill ? 'マイページへ' : quickStartAll || dailyChallenge ? 'ホームへ' : '分野選択へ'
    const message = buildFinishMessage(rate, dailyChallenge)
    const levelInfo = rewardSummary ? getLevelInfo(rewardSummary.totalXp) : null

    return (
      <div className="page-shell flex flex-col items-center justify-center anim-fade">
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

          <div className="text-5xl mb-4">{dailyChallenge ? '☀️' : rate >= 70 ? '🏆' : '📚'}</div>
          <div className="font-display text-4xl mb-2" style={{ color }}>
            {score} / {questions.length}
          </div>
          <div
            className="text-2xl font-bold mb-1"
            style={{ color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}
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
                    answerLogs[index]?.result === 'exact'
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
                  {dailyChallenge ? '今日のチャレンジボーナス込み' : '今回の学習で加算'}
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

          <div className={`grid gap-3 ${dailyChallenge ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {!dailyChallenge && (
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
                {dailyChallenge
                  ? '今日のチャレンジ'
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
                  background: dailyChallenge
                    ? 'linear-gradient(90deg, #f59e0b, #f97316)'
                    : `linear-gradient(90deg, ${color}, ${color}80)`,
                  borderRadius: 999,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="text-sm font-semibold" style={{ color: dailyChallenge ? '#f59e0b' : color }}>
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
            {dailyChallenge ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#f59e0b20', color: '#fbbf24' }}>
                今日のチャレンジ
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
              {q.type === 'choice' ? `${q.choices?.length ?? 0}択` : '記述'}
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
              background: 'rgba(15, 23, 42, 0.72)',
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
                    background: inquiryCategory === option.value ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 23, 42, 0.42)',
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

      {q.type === 'choice' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {q.choices?.map((choice, index) => {
            let bg = 'var(--surface-elevated)'
            let border = '1px solid var(--surface-elevated-border)'
            let textColor = 'var(--text)'

            if (phase === 'result') {
              if (choice === q.answer) {
                bg = '#14532d'
                border = '2px solid #22c55e'
                textColor = '#86efac'
              } else if (choice === selected && answerResult === 'incorrect') {
                bg = '#450a0a'
                border = '2px solid #ef4444'
                textColor = '#fca5a5'
              }
            }

            return (
              <button
                key={choice}
                onClick={() => handleChoice(choice)}
                disabled={phase === 'result'}
                className="min-h-[92px] rounded-xl p-4 text-left font-bold transition-all anim-fade-up"
                style={{ animationDelay: `${index * 0.06}s`, background: bg, border, color: textColor }}
              >
                <span className="mr-3 opacity-50">{'ABCD'[index] ?? `${index + 1}` }.</span>
                {choice}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="anim-fade-up">
          <div
            className="mb-3 rounded-[24px] border px-4 py-3"
            style={{
              borderColor: 'rgba(56, 189, 248, 0.18)',
              background: 'rgba(15, 23, 42, 0.62)',
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
                handleTextSubmit()
              }
            }}
            disabled={phase === 'result'}
            placeholder={textBlankPrompt?.placeholder ?? '答え'}
            enterKeyHint="done"
            autoCapitalize="none"
            autoCorrect="off"
            className="input-surface mb-3"
            style={{
              border:
                phase === 'result'
                  ? `2px solid ${answerResult === 'exact' ? '#22c55e' : answerResult === 'keyword' ? '#f59e0b' : '#ef4444'}`
                  : undefined,
              fontSize: '1rem',
            }}
          />
          {phase === 'answering' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <button onClick={handleTextSubmit} disabled={!textInput.trim()} className="btn-primary w-full">
                決定
              </button>
              <button onClick={handleDontKnow} className="btn-secondary w-full sm:w-auto">
                わからない
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'result' && (
        (() => {
          const currentResult = answerResult ?? 'incorrect'
          const accent = currentResult === 'exact' ? '#22c55e' : currentResult === 'keyword' ? '#f59e0b' : '#ef4444'
          const background = currentResult === 'exact'
            ? 'rgba(34, 197, 94, 0.12)'
            : currentResult === 'keyword'
              ? 'rgba(245, 158, 11, 0.12)'
              : 'rgba(239, 68, 68, 0.12)'
          const title = currentResult === 'exact'
            ? '◯ 正解！'
            : currentResult === 'keyword'
              ? '▲ あと少し'
              : '❌ 不正解'

          return (
            <div className="card mt-4 anim-pop" style={{ borderColor: `${accent}50`, background }}>
              {currentResult === 'exact' && celebration && (
                <SuccessBurst celebration={celebration} className="mb-4" />
              )}
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-lg" style={{ color: accent }}>
                  {title}
                </span>
              </div>
              {currentResult !== 'exact' && (
                <>
                  <p className="text-slate-200 text-sm mb-2">答え: {textBlankPrompt?.target ?? q.answer}</p>
                  {(textBlankPrompt?.target ?? q.answer) !== q.answer && (
                    <p className="text-slate-300 text-xs mb-2">{q.answer}</p>
                  )}
                </>
              )}
              {currentResult !== 'exact' && q.keywords && q.keywords.length > 0 && (
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
