'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getBadgeRarityLabel } from '@/lib/badges'
import { calculateTimeAttackXp, getLevelInfo } from '@/lib/engagement'
import { pickTimeAttackQuestions, shuffleArray } from '@/lib/questionPicker'
import { loadTimeAttackBest, recordStudySession, saveTimeAttackBest, StudyRewardSummary } from '@/lib/studyRewards'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'

interface Question {
  id: string
  field: string
  unit: string
  question: string
  type: 'choice' | 'text'
  choices: string[] | null
  answer: string
}

type Phase = 'intro' | 'playing' | 'finished'

function formatTimer(ms: number) {
  return (ms / 1000).toFixed(1)
}

export default function TimeAttackPage({ onBack }: { onBack: () => void }) {
  const { studentId, logout } = useAuth()
  const [questions, setQuestions] = useState<Question[]>([])
  const [phase, setPhase] = useState<Phase>('intro')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [remainingMs, setRemainingMs] = useState(30000)
  const [score, setScore] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [personalBest, setPersonalBest] = useState(0)
  const [allTimeBest, setAllTimeBest] = useState(0)
  const [rewardSummary, setRewardSummary] = useState<StudyRewardSummary | null>(null)
  const [answerLogs, setAnswerLogs] = useState<Array<{ qId: string; correct: boolean; answer: string }>>([])
  const startedAtRef = useRef<number | null>(null)
  const deadlineRef = useRef<number>(0)
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)

      let query = supabase.from('questions').select('*').eq('type', 'choice')
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
        const fallbackResponse = await supabase.from('questions').select('*').eq('type', 'choice')
        data = fallbackResponse.data
        error = fallbackResponse.error
      } else if (!error && supportsStudentQuestionFilter) {
        markColumnSupported('created_by_student_id')
      }

      if (error) {
        console.error('[time-attack] failed to load questions', error)
      }

      const best = await loadTimeAttackBest(studentId)
      if (!active) return

      setQuestions(pickTimeAttackQuestions((data || []) as Question[]))
      setPersonalBest(best.personalBest)
      setAllTimeBest(best.allTimeBest)
      setLoading(false)
    }

    void load()
    return () => {
      active = false
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    }
  }, [studentId])

  useEffect(() => {
    if (phase !== 'playing') return

    const intervalId = window.setInterval(() => {
      const nextRemaining = Math.max(0, deadlineRef.current - Date.now())
      setRemainingMs(nextRemaining)
      if (nextRemaining <= 0) {
        window.clearInterval(intervalId)
        void finishRun()
      }
    }, 50)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [phase])

  const currentQuestion = useMemo(() => {
    if (questions.length === 0) return null
    return questions[currentIndex] ?? null
  }, [currentIndex, questions])

  const startRun = () => {
    if (questions.length === 0) return
    const deck = shuffleArray(questions)
    setQuestions(deck)
    setCurrentIndex(0)
    setScore(0)
    setAnsweredCount(0)
    setAnswerLogs([])
    setRewardSummary(null)
    setFeedback(null)
    setRemainingMs(30000)
    startedAtRef.current = Date.now()
    deadlineRef.current = Date.now() + 30000
    setPhase('playing')
  }

  const advanceQuestion = () => {
    setCurrentIndex(current => {
      const nextIndex = current + 1
      if (nextIndex < questions.length) {
        return nextIndex
      }

      setQuestions(currentDeck => shuffleArray(currentDeck))
      return 0
    })
  }

  const finishRun = async () => {
    if (phase !== 'playing') return
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
    setPhase('finished')
    setFeedback(null)

    const durationSeconds = startedAtRef.current
      ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      : 30
    const xpEarned = calculateTimeAttackXp(score)

    const [nextBest, reward] = await Promise.all([
      saveTimeAttackBest(studentId, score),
      recordStudySession({
        studentId,
        field: '4分野総合',
        unit: 'タイムアタック',
        totalQuestions: answeredCount,
        correctCount: score,
        durationSeconds,
        answerLogs,
        sessionMode: 'time_attack',
        xpOverride: xpEarned,
      }),
    ])

    const bests = await loadTimeAttackBest(studentId)
    setPersonalBest(Math.max(nextBest, bests.personalBest))
    setAllTimeBest(Math.max(nextBest, bests.allTimeBest))
    setRewardSummary(reward)
  }

  const handleChoice = (choice: string) => {
    if (phase !== 'playing' || !currentQuestion) return

    const correct = choice === currentQuestion.answer
    setFeedback(correct ? 'correct' : 'wrong')
    setScore(current => current + (correct ? 1 : 0))
    setAnsweredCount(current => current + 1)
    setAnswerLogs(current => [...current, { qId: currentQuestion.id, correct, answer: choice }])

    if (correct) {
      deadlineRef.current += 500
      setRemainingMs(current => current + 500)
    }

    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null)
      advanceQuestion()
    }, 140)
  }

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card text-slate-400">タイムアタックを準備中...</div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card w-full max-w-xl text-center">
          <div className="font-display text-3xl text-white">タイムアタック準備中</div>
          <p className="mt-3 text-slate-300">2択問題がまだ足りません。問題を追加してから試してください。</p>
          <div className="mt-6">
            <button onClick={onBack} className="btn-primary">ホームへ</button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'intro') {
    return (
      <div className="page-shell page-shell-dashboard">
        <div className="hero-card science-surface p-6 sm:p-7">
          <div className="text-xs font-semibold tracking-[0.2em] text-sky-200 uppercase">Time Attack</div>
          <h1 className="font-display mt-3 text-4xl text-white">タイムアタック</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            30秒でどこまで伸ばせるか挑戦します。正解すると +0.5秒、XP は スコア × 5 です。
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">自己ベスト</div>
              <div className="mt-2 font-display text-3xl text-white">{personalBest}</div>
              <div className="mt-1 text-xs text-slate-500">best score</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">全体ベスト</div>
              <div className="mt-2 font-display text-3xl text-amber-200">{allTimeBest}</div>
              <div className="mt-1 text-xs text-slate-500">all time</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">出題</div>
              <div className="mt-2 font-display text-3xl text-sky-300">{questions.length}</div>
              <div className="mt-1 text-xs text-slate-500">choice only</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button onClick={startRun} className="btn-primary sm:col-span-2">
              スタート
            </button>
            <button onClick={onBack} className="btn-secondary">
              ホームへ
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'finished') {
    const levelInfo = rewardSummary ? getLevelInfo(rewardSummary.totalXp) : null

    return (
      <div className="page-shell flex flex-col items-center justify-center">
        <div className={`hero-card reward-card w-full max-w-3xl p-6 text-center sm:p-7 ${rewardSummary?.leveledUp ? 'is-level-up' : ''}`}>
          <div className="text-5xl mb-4">⏱️</div>
          <div className="font-display text-5xl text-white">{score}</div>
          <div className="mt-2 text-slate-300">今回のスコア</div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">獲得XP</div>
              <div className="mt-2 font-display text-3xl text-sky-300">+{calculateTimeAttackXp(score)}</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">自己ベスト</div>
              <div className="mt-2 font-display text-3xl text-white">{personalBest}</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">全体ベスト</div>
              <div className="mt-2 font-display text-3xl text-amber-200">{allTimeBest}</div>
            </div>
          </div>

          {levelInfo && (
            <div className="subcard mt-5 p-4 text-left">
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
            </div>
          )}

          {rewardSummary?.newBadges.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 text-left">
              {rewardSummary.newBadges.map((badge, index) => (
                <div
                  key={badge.key}
                  className={`badge-toast badge-toast--${badge.rarity}`}
                  style={{ animationDelay: `${index * 0.08}s` }}
                >
                  <div className="text-2xl">{badge.iconEmoji}</div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{badge.name}</span>
                      <span className="text-[10px] tracking-[0.18em] text-slate-400">{getBadgeRarityLabel(badge.rarity)}</span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1">{badge.description}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button onClick={startRun} className="btn-primary sm:col-span-2">
              もう一度
            </button>
            <button onClick={onBack} className="btn-secondary">
              ホームへ
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell page-shell-dashboard">
      <div className={`hero-card p-5 sm:p-6 ${feedback ? `time-attack-shell is-${feedback}` : 'time-attack-shell'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={onBack} className="btn-secondary text-sm !px-4 !py-2.5">
            やめる
          </button>
          <div className={`time-attack-timer ${remainingMs <= 5000 ? 'is-danger' : ''}`}>
            {formatTimer(remainingMs)}
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">スコア</div>
            <div className="font-display text-3xl text-white">{score}</div>
          </div>
        </div>

        {currentQuestion && (
          <div className="mt-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-full px-3 py-1 text-xs font-semibold text-sky-100" style={{ background: 'rgba(56, 189, 248, 0.16)' }}>
                {currentQuestion.field}
              </span>
              <span className="text-xs text-slate-500">{currentQuestion.unit}</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-white sm:text-3xl">{currentQuestion.question}</h2>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {currentQuestion.choices?.map((choice, index) => (
                <button
                  key={`${currentQuestion.id}-${choice}`}
                  onClick={() => handleChoice(choice)}
                  className="min-h-[90px] rounded-xl border border-white/10 bg-slate-900/70 p-4 text-left font-bold text-white transition-all"
                  disabled={phase !== 'playing'}
                >
                  <span className="mr-3 opacity-50">{'AB'[index] ?? `${index + 1}` }.</span>
                  {choice}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span>正解すると +0.5 秒</span>
          <span>自己ベスト {personalBest}</span>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button onClick={() => logout()} className="btn-ghost text-sm !px-4 !py-2.5">
          ログアウト
        </button>
      </div>
    </div>
  )
}
