'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { evaluateTextAnswer, TextAnswerResult } from '@/lib/answerUtils'
import { getBadgeRarityLabel } from '@/lib/badges'
import { CustomQuizOptions, getCustomQuizSessionLabel, getCustomQuizSummaryParts } from '@/lib/customQuiz'
import { getLevelInfo } from '@/lib/engagement'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { pickCustomQuizQuestions, pickDailyChallengeQuestions, pickStandardQuizQuestions } from '@/lib/questionPicker'
import { hasCompletedDailyChallenge, recordStudySession, StudyRewardSummary } from '@/lib/studyRewards'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'

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
    if (rate === 100) return '今日のチャレンジを完全制覇しました。'
    if (rate >= 80) return '今日のチャレンジをしっかりクリアできています。'
    if (rate >= 60) return 'あと少しで今日のチャレンジを攻略できます。'
    return '明日また再挑戦して、少しずつ積み上げていきましょう。'
  }

  if (rate >= 90) return '🎉 すごい！完璧に近い！'
  if (rate >= 70) return '👍 よくできました！'
  if (rate >= 50) return '😊 もう少しがんばろう！'
  return '💪 復習してみよう！'
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
  const { studentId, logout } = useAuth()
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
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [rewardSummary, setRewardSummary] = useState<StudyRewardSummary | null>(null)
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

      const pool = (data || []) as Question[]
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
  const progress = questions.length > 0 ? (current / questions.length) * 100 : 0
  const isFavorite = !!q && favoriteIds.has(q.id)

  const handleChoice = (choice: string) => {
    if (phase !== 'answering' || !q) return
    const result: TextAnswerResult = choice === q.answer ? 'exact' : 'incorrect'
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
    setAnswerResult(result)
    if (result === 'exact') setScore(currentScore => currentScore + 1)
    setAnswerLogs(logs => [...logs, { qId: q.id, correct: result === 'exact', answer, result }])
    setPhase('result')
  }

  const handleDontKnow = () => {
    if (phase !== 'answering' || !q || q.type !== 'text') return
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

  const handleNext = async () => {
    if (!q) return

    if (current + 1 >= questions.length) {
      const durationSeconds = startedAtRef.current
        ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
        : 0

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
            <div className="grid gap-4 sm:grid-cols-2 mb-6">
              <div className="subcard p-4 text-left">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">獲得XP</div>
                <div className="mt-2 font-display text-3xl text-sky-300">+{rewardSummary.xpEarned}</div>
                <div className="mt-2 text-xs text-slate-500">
                  {dailyChallenge ? '今日のチャレンジ 2x ボーナス適用' : '今回の学習で加算'}
                </div>
              </div>
              {levelInfo && (
                <div className="subcard p-4 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">現在レベル</div>
                      <div className="mt-2 font-display text-2xl text-white">Lv.{levelInfo.level}</div>
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
            </div>
          )}

          {rewardSummary?.leveledUp && levelInfo && (
            <div className="reward-banner mb-5">
              <div className="text-xs font-semibold tracking-[0.22em] text-sky-200">LEVEL UP</div>
              <div className="mt-1 font-display text-3xl text-white">Lv.{levelInfo.level}</div>
              <div className="mt-1 text-sm text-sky-100">{levelInfo.title}</div>
            </div>
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

          {answerLogs.some(log => log.result === 'keyword') && (
            <p className="text-xs text-slate-500 mb-6">▲ はキーワード一致で、スコアには加算していません。</p>
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
        </div>
        <p className="text-lg font-bold leading-relaxed sm:text-[1.35rem]" style={{ color: 'var(--text)' }}>{q.question}</p>
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
          <textarea
            value={textInput}
            onChange={event => setTextInput(event.target.value)}
            disabled={phase === 'result'}
            placeholder="ここに答えを書いてください"
            rows={3}
            className="input-surface resize-none mb-3"
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
                答えを提出
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
              ? '▲ キーワード一致'
              : '❌ 不正解'

          return (
            <div className="card mt-4 anim-pop" style={{ borderColor: `${accent}50`, background }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-lg" style={{ color: accent }}>
                  {title}
                </span>
              </div>
              {currentResult !== 'exact' && (
                <p className="text-slate-200 text-sm mb-2">模範解答: {q.answer}</p>
              )}
              {currentResult === 'keyword' && (
                <p className="text-amber-200 text-xs mb-2">キーワードを含むため部分一致です。スコアには加算しません。</p>
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
