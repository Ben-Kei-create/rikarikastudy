'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import BadgeEarnedToastStack from '@/components/BadgeEarnedToastStack'
import LevelUnlockNotice from '@/components/LevelUnlockNotice'
import { PeriodicCardRewardPanel } from '@/components/PeriodicCard'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import {
  ACTIVE_RECALL_QUESTION_COUNT,
  ACTIVE_RECALL_UNLOCK_LEVEL,
  ActiveRecallAttemptResult,
  ActiveRecallCard,
  ActiveRecallEvaluation,
  calculateActiveRecallXpBreakdown,
  getActiveRecallLogsSchemaMessage,
  getActiveRecallPromptTypeLabel,
  getActiveRecallRatingAccent,
  getActiveRecallRatingLabel,
  saveActiveRecallLogs,
  summarizeActiveRecall,
} from '@/lib/activeRecall'
import { getBadgeRarityLabel } from '@/lib/badges'
import { FIELD_COLORS, FIELD_EMOJI, ScienceField } from '@/lib/constants'
import { getLevelInfo, getXpFloorForLevel } from '@/lib/engagement'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { getCachedColumnSupport, isMissingColumnError, markColumnMissing, markColumnSupported } from '@/lib/schemaCompat'
import { recordStudySession, StudyRewardSummary } from '@/lib/studyRewards'
import { supabase } from '@/lib/supabase'

interface UnitOption {
  unit: string
  questionCount: number
}

interface StartResponse {
  provider: 'mock' | 'gemini'
  model: string
  cards: ActiveRecallCard[]
  warning?: string
}

interface EvaluateResponse {
  provider: 'mock' | 'gemini'
  model: string
  evaluation: ActiveRecallEvaluation
  error?: string
  warning?: string
}

type Phase = 'setup' | 'answering' | 'feedback' | 'finished'

function getSessionUnitLabel(unit: string) {
  return unit === 'all' ? '全単元' : unit
}

export default function ActiveRecallPage({
  field,
  onBack,
}: {
  field: ScienceField
  onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const isGuest = isGuestStudentId(studentId)
  const color = FIELD_COLORS[field]
  const emoji = FIELD_EMOJI[field]

  const [units, setUnits] = useState<UnitOption[]>([])
  const [unitsLoading, setUnitsLoading] = useState(true)
  const [selectedUnit, setSelectedUnit] = useState('all')
  const [phase, setPhase] = useState<Phase>('setup')
  const [cards, setCards] = useState<ActiveRecallCard[]>([])
  const [current, setCurrent] = useState(0)
  const [answer, setAnswer] = useState('')
  const [evaluation, setEvaluation] = useState<ActiveRecallEvaluation | null>(null)
  const [attempts, setAttempts] = useState<ActiveRecallAttemptResult[]>([])
  const [currentAttemptCount, setCurrentAttemptCount] = useState(0)
  const [showHints, setShowHints] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [schemaMessage, setSchemaMessage] = useState('')
  const [provider, setProvider] = useState<'mock' | 'gemini'>('mock')
  const [model, setModel] = useState('')
  const [rewardSummary, setRewardSummary] = useState<StudyRewardSummary | null>(null)
  const [currentXp, setCurrentXp] = useState(0)
  const startedAtRef = useRef<number | null>(null)

  const levelInfo = useMemo(() => getLevelInfo(currentXp), [currentXp])
  const unlocked = !isGuest && levelInfo.level >= ACTIVE_RECALL_UNLOCK_LEVEL
  const unlockXpLeft = Math.max(0, getXpFloorForLevel(ACTIVE_RECALL_UNLOCK_LEVEL) - levelInfo.totalXp)
  const summary = phase === 'finished' ? summarizeActiveRecall(attempts) : null
  const progress = cards.length > 0 ? (current / cards.length) * 100 : 0
  const currentCard = cards[current] ?? null

  useEffect(() => {
    let active = true

    const loadCurrentXp = async () => {
      if (studentId === null) return

      if (isGuest) {
        const store = loadGuestStudyStore()
        if (active) setCurrentXp(store.xp)
        return
      }

      const { data, error } = await supabase
        .from('students')
        .select('student_xp')
        .eq('id', studentId)
        .single()

      if (!active) return
      if (error) {
        console.error('[active-recall] failed to load student xp', error)
        setCurrentXp(0)
        return
      }

      setCurrentXp(data?.student_xp ?? 0)
    }

    void loadCurrentXp()

    return () => {
      active = false
    }
  }, [isGuest, studentId])

  useEffect(() => {
    let active = true

    const loadUnits = async () => {
      setUnitsLoading(true)
      let query = supabase
        .from('questions')
        .select('unit')
        .eq('field', field)

      const supportsStudentQuestionFilter = getCachedColumnSupport('created_by_student_id') !== false

      if (supportsStudentQuestionFilter) {
        query = query.or(
          studentId
            ? `created_by_student_id.is.null,created_by_student_id.eq.${studentId}`
            : 'created_by_student_id.is.null'
        )
      }

      let { data, error } = await query

      if (error && isMissingColumnError(error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        const fallback = await supabase
          .from('questions')
          .select('unit')
          .eq('field', field)
        data = fallback.data
        error = fallback.error
      } else if (!error && supportsStudentQuestionFilter) {
        markColumnSupported('created_by_student_id')
      }

      if (!active) return

      if (error) {
        console.error('[active-recall] failed to load units', error)
        setUnits([])
        setUnitsLoading(false)
        return
      }

      const counts = new Map<string, number>()
      for (const row of data || []) {
        counts.set(row.unit, (counts.get(row.unit) ?? 0) + 1)
      }

      const nextUnits = Array.from(counts.entries())
        .map(([unit, questionCount]) => ({ unit, questionCount }))
        .sort((left, right) => left.unit.localeCompare(right.unit, 'ja'))

      setUnits(nextUnits)
      setUnitsLoading(false)
    }

    void loadUnits()

    return () => {
      active = false
    }
  }, [field, studentId])

  const resetQuestionState = () => {
    setAnswer('')
    setEvaluation(null)
    setCurrentAttemptCount(0)
    setShowHints(false)
    setError('')
  }

  const handleStartSession = async () => {
    if (!unlocked || loadingSession) return

    setLoadingSession(true)
    setSchemaMessage('')
    setError('')
    setWarning('')

    try {
      const response = await fetch('/api/active-recall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'start',
          field,
          unit: selectedUnit,
          studentId,
          count: ACTIVE_RECALL_QUESTION_COUNT,
        }),
      })

      const payload = await response.json() as StartResponse | { error?: string }
      if (!response.ok || !('cards' in payload)) {
        throw new Error(payload && 'error' in payload && payload.error ? payload.error : '問題の準備に失敗しました。')
      }

      if (!payload.cards.length) {
        throw new Error('この条件ではアクティブリコールを開始できません。')
      }

      setCards(payload.cards)
      setProvider(payload.provider)
      setModel(payload.model)
      setWarning(typeof payload.warning === 'string' ? payload.warning : '')
      setAttempts([])
      setCurrent(0)
      setRewardSummary(null)
      resetQuestionState()
      startedAtRef.current = Date.now()
      setPhase('answering')
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : '問題の準備に失敗しました。')
    } finally {
      setLoadingSession(false)
    }
  }

  const handleSubmitAnswer = async () => {
    if (!currentCard || !answer.trim() || submitting) return

    setSubmitting(true)
    setError('')
    setWarning('')

    try {
      const response = await fetch('/api/active-recall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'evaluate',
          field,
          card: currentCard,
          answer: answer.trim(),
        }),
      })

      const payload = await response.json() as EvaluateResponse | { error?: string }
      if (!response.ok || !('evaluation' in payload)) {
        throw new Error(payload && 'error' in payload && payload.error ? payload.error : '評価に失敗しました。')
      }

      setProvider(payload.provider)
      setModel(payload.model)
      setWarning(typeof payload.warning === 'string' ? payload.warning : '')
      setEvaluation(payload.evaluation)
      setCurrentAttemptCount(count => count + 1)
      setPhase('feedback')
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : '評価に失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  const finalizeCurrentAttempt = async () => {
    if (!currentCard || !evaluation) return

    const nextAttempt: ActiveRecallAttemptResult = {
      card: currentCard,
      answer: answer.trim(),
      evaluation,
      attemptCount: Math.max(1, currentAttemptCount),
      createdAt: new Date().toISOString(),
    }

    const nextAttempts = [...attempts, nextAttempt]
    setAttempts(nextAttempts)

    if (current + 1 >= cards.length) {
      const durationSeconds = startedAtRef.current
        ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
        : 0
      const xpBreakdown = calculateActiveRecallXpBreakdown({ attempts: nextAttempts, durationSeconds })
      const nextSummary = summarizeActiveRecall(nextAttempts)
      const reward = await recordStudySession({
        studentId,
        field,
        unit: getSessionUnitLabel(selectedUnit),
        totalQuestions: nextAttempts.length,
        correctCount: nextSummary.strongCount,
        durationSeconds,
        sessionMode: 'active_recall',
        xpOverride: xpBreakdown.total,
        xpBreakdown,
      })

      setRewardSummary(reward)
      setCurrentXp(reward.totalXp)

      const saveResult = await saveActiveRecallLogs({
        sessionId: reward.sessionId,
        studentId,
        field,
        unit: getSessionUnitLabel(selectedUnit),
        attempts: nextAttempts,
      })

      if (!saveResult.ok && saveResult.message) {
        setSchemaMessage(
          saveResult.message.includes('active_recall_logs')
            ? saveResult.message
            : getActiveRecallLogsSchemaMessage(saveResult.message)
        )
      }

      setPhase('finished')
      return
    }

    setCurrent(index => index + 1)
    setPhase('answering')
    setAnswer('')
    setEvaluation(null)
    setCurrentAttemptCount(0)
    setShowHints(false)
  }

  const handleRetry = () => {
    setPhase('answering')
    setShowHints(true)
    setError('')
  }

  const handleRestart = async () => {
    setPhase('setup')
    setCards([])
    setAttempts([])
    setCurrent(0)
    setRewardSummary(null)
    resetQuestionState()
    setWarning('')
    startedAtRef.current = null
    if (unlocked) {
      await handleStartSession()
    }
  }

  if (isGuest) {
    return (
      <div className="page-shell page-shell-dashboard">
        <div className="hero-card science-surface p-5 sm:p-6 lg:p-7 mb-5">
          <ScienceBackdrop />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-[22px] text-3xl"
                style={{ background: `${color}18`, border: `1px solid ${color}26` }}
              >
                {emoji}
              </div>
              <div>
                <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2">
                  Active Recall
                </div>
                <div className="font-display text-3xl text-white">{field} リコール</div>
                <p className="text-slate-300 text-sm mt-1 leading-6">
                  ゲストモードでは AI 学習モードは使えません。
                </p>
              </div>
            </div>
            <button onClick={onBack} className="btn-secondary w-full lg:w-auto">
              もどる
            </button>
          </div>
        </div>

        <div className="card text-center py-10">
          <div className="text-5xl mb-4">🔒</div>
          <div className="font-display text-2xl text-white">ゲストでは利用できません</div>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Active Recall は通常ログインした生徒だけが使えます。
          </p>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="page-shell page-shell-dashboard">
        <div className="hero-card science-surface p-5 sm:p-6 lg:p-7 mb-5">
          <ScienceBackdrop />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-[22px] text-3xl"
                style={{ background: `${color}18`, border: `1px solid ${color}26` }}
              >
                {emoji}
              </div>
              <div>
                <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2">
                  Active Recall
                </div>
                <div className="font-display text-3xl text-white">{field} リコール</div>
                <p className="text-slate-300 text-sm mt-1 leading-6">
                  思い出して説明する、Lv.20 解放の AI 学習モードです。
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
              <div className="subcard p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">現在</div>
                <div className="mt-2 font-display text-2xl text-white">Lv.{levelInfo.level}</div>
                <div className="mt-1 text-xs text-slate-500">{levelInfo.title}</div>
              </div>
              <div className="subcard p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">開放まで</div>
                <div className="mt-2 font-display text-2xl" style={{ color }}>{unlockXpLeft}</div>
                <div className="mt-1 text-xs text-slate-500">XP</div>
              </div>
              <button onClick={onBack} className="btn-secondary w-full">もどる</button>
              <button onClick={() => logout()} className="btn-ghost w-full">ログアウト</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="rounded-[24px] border px-5 py-6 text-center" style={{
            borderColor: 'rgba(148, 163, 184, 0.16)',
            background: 'var(--inset-bg)',
          }}>
            <div className="text-5xl">🧠</div>
            <div className="mt-3 font-semibold text-white">Lv.20 でアクティブリコール解放</div>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              4択ではなく、自分の言葉で短く説明し、Gemini が「よく思い出せた / おしい / 要復習」で返します。
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'finished' && summary) {
    const rate = Math.round((summary.strongCount / Math.max(1, summary.totalQuestions)) * 100)
    const levelAfter = rewardSummary ? getLevelInfo(rewardSummary.totalXp) : null
    const message = summary.strongCount >= 4
      ? 'かなり自力で思い出せています。次は理由や比較も一言足せるとさらに強いです。'
      : summary.strongCount >= 2
        ? '方向はかなり見えています。要復習になった項目をもう一度説明し直すと定着しやすいです。'
        : 'まだあいまいな所があります。ヒントや模範の要点を見直してから、もう一度まわすのがおすすめです。'

    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <BadgeEarnedToastStack badges={rewardSummary?.newBadges ?? []} />
        <div className={`hero-card reward-card w-full max-w-4xl px-6 py-7 text-center sm:px-8 ${rewardSummary?.leveledUp ? 'is-level-up' : ''}`}>
          <div className="text-5xl">🧠</div>
          <div className="mt-4 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color }}>
            Active Recall
          </div>
          <div className="mt-3 font-display text-4xl text-white">
            {summary.strongCount} / {summary.totalQuestions}
          </div>
          <div className="mt-2 text-2xl font-bold" style={{ color }}>
            {rate}%
          </div>
          <p className="mt-3 text-slate-300">{message}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3 text-left">
            {[
              { label: 'よく思い出せた', value: `${summary.strongCount}問`, accent: '#22c55e' },
              { label: 'おしい', value: `${summary.closeCount}問`, accent: '#f59e0b' },
              { label: '要復習', value: `${summary.reviewCount}問`, accent: '#ef4444' },
            ].map(item => (
              <div key={item.label} className="subcard p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">{item.label}</div>
                <div className="mt-2 font-display text-3xl" style={{ color: item.accent }}>{item.value}</div>
              </div>
            ))}
          </div>

          {rewardSummary && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="subcard p-4 text-left">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">獲得XP</div>
                <div className="mt-2 font-display text-3xl text-sky-300">+{rewardSummary.xpEarned}</div>
                <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center justify-between gap-3">
                    <span>説明できた分</span>
                    <span>{rewardSummary.xpBreakdown.base} XP</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>テンポ</span>
                    <span>{rewardSummary.xpBreakdown.speed} XP</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>全問 strong</span>
                    <span>{rewardSummary.xpBreakdown.perfect} XP</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  要復習として保存: {summary.needsReviewCount}件
                </div>
              </div>
              {levelAfter && (
                <div className="subcard p-4 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">現在レベル</div>
                      <div className={`mt-2 inline-flex items-center rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1.5 font-display text-2xl text-white ${rewardSummary.leveledUp ? 'level-badge--up' : ''}`}>
                        Lv.{levelAfter.level}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-sky-200">{levelAfter.title}</div>
                      <div className="text-xs text-slate-500">{levelAfter.totalXp} XP</div>
                    </div>
                  </div>
                  <div className="mt-4 soft-track" style={{ height: 8 }}>
                    <div
                      style={{
                        width: `${levelAfter.progressRate}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #60a5fa, #38bdf8)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <LevelUnlockNotice rewardSummary={rewardSummary} />
          {rewardSummary?.periodicCardReward && (
            <PeriodicCardRewardPanel reward={rewardSummary.periodicCardReward} />
          )}

          {schemaMessage && (
            <div className="mt-5 rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-left text-sm leading-7 text-amber-100">
              {schemaMessage}
            </div>
          )}

          {rewardSummary?.newBadges.length ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 text-left">
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

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button onClick={() => void handleRestart()} className="btn-secondary w-full">
              もう一度
            </button>
            <button onClick={onBack} className="btn-primary w-full">
              {field}へ戻る
            </button>
            <button onClick={() => logout()} className="btn-ghost w-full">
              ログアウト
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell page-shell-dashboard">
      <div className="hero-card science-surface p-5 sm:p-6 lg:p-7 mb-5">
        <ScienceBackdrop />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-[22px] text-3xl"
              style={{ background: `${color}18`, border: `1px solid ${color}26` }}
            >
              {emoji}
            </div>
            <div>
              <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2">
                Active Recall
              </div>
              <div className="font-display text-3xl text-white">{field} リコール</div>
              <p className="text-slate-300 text-sm mt-1 leading-6">
                見ずに思い出して説明する AI 学習モード。短文で答えると、Gemini が不足点だけ短く返します。
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">進行</div>
              <div className="mt-2 font-display text-2xl text-white">
                {phase === 'setup' ? 0 : current + 1}
                <span className="text-base text-slate-400"> / {cards.length || ACTIVE_RECALL_QUESTION_COUNT}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">question</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">判定</div>
              <div className="mt-2 font-display text-2xl" style={{ color: evaluation ? getActiveRecallRatingAccent(evaluation.rating) : color }}>
                {evaluation ? getActiveRecallRatingLabel(evaluation.rating) : '準備中'}
              </div>
              <div className="mt-1 text-xs text-slate-500">{provider === 'gemini' ? 'Gemini' : 'mock'}</div>
            </div>
            <button onClick={onBack} className="btn-secondary w-full">もどる</button>
            <button onClick={() => logout()} className="btn-ghost w-full">ログアウト</button>
          </div>
        </div>

        <div className="mt-5 soft-track" style={{ height: 8 }}>
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${color}, ${color}88)`,
              borderRadius: 999,
              transition: 'width 0.35s ease',
            }}
          />
        </div>
      </div>

      {warning && phase !== 'finished' && (
        <div className="mb-4 rounded-2xl border border-amber-700/70 bg-amber-950/50 px-4 py-3 text-sm text-amber-100">
          {warning}
        </div>
      )}

      {phase === 'setup' ? (
        <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="card">
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">Session Setup</div>
            <h2 className="mt-3 font-display text-3xl text-white">5問だけ、思い出して説明する</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              用語説明、しくみ、手順、比較、理由のような問いを出します。正誤ではなく、
              「よく思い出せた / おしい / 要復習」の3段階で返します。
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { label: '問題数', value: `${ACTIVE_RECALL_QUESTION_COUNT}問` },
                { label: '回答形式', value: '短文' },
                { label: '再回答', value: '1回まで' },
              ].map(item => (
                <div key={item.label} className="subcard p-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">{item.label}</div>
                  <div className="mt-2 font-display text-2xl text-white">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-[24px] border border-white/8 bg-slate-950/24 p-4">
              <label className="text-slate-400 text-xs mb-2 block">対象単元</label>
              <select
                value={selectedUnit}
                onChange={event => setSelectedUnit(event.target.value)}
                className="input-surface"
                disabled={unitsLoading || loadingSession}
              >
                <option value="all">全単元</option>
                {units.map(unit => (
                  <option key={unit.unit} value={unit.unit}>
                    {unit.unit} ({unit.questionCount}問)
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                単元を絞ると、同じテーマで深く思い出せます。
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-800/70 bg-red-950/50 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => void handleStartSession()}
                disabled={loadingSession || unitsLoading}
                className="btn-primary"
              >
                {loadingSession ? '準備中...' : 'この条件で開始'}
              </button>
              <button onClick={onBack} className="btn-secondary">
                分野へ戻る
              </button>
            </div>
          </div>

          <div className="card">
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">What You Get</div>
            <div className="mt-3 space-y-3">
              {[
                '答えを選ぶのではなく、自分の言葉で説明する',
                'キーワード補助を見ながら、短文で整理できる',
                'Gemini が不足点だけを2-3文で返す',
                '要復習になった内容は保存される',
              ].map(item => (
                <div key={item} className="rounded-[20px] border border-white/8 bg-slate-950/20 px-4 py-3 text-sm leading-7 text-slate-200">
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-[24px] border px-4 py-4" style={{
              borderColor: `${color}30`,
              background: `linear-gradient(180deg, ${color}12, var(--inset-bg))`,
            }}>
              <div className="text-xs font-semibold tracking-[0.18em]" style={{ color }}>
                Current Level
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <div className="font-display text-3xl text-white">Lv.{levelInfo.level}</div>
                  <div className="mt-1 text-sm text-slate-300">{levelInfo.title}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">XP</div>
                  <div className="font-display text-2xl text-sky-300">{levelInfo.totalXp}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="card">
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: `${color}18`, color }}
              >
                {field}
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">
                {currentCard ? currentCard.unit : getSessionUnitLabel(selectedUnit)}
              </span>
              {currentCard && (
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">
                  {getActiveRecallPromptTypeLabel(currentCard.promptType)}
                </span>
              )}
            </div>

            {currentCard && (
              <>
                <div className="mt-5">
                  <div className="text-sm text-slate-400">{currentCard.cue}</div>
                  <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl leading-[1.35]">
                    {currentCard.prompt}
                  </h2>
                </div>

                {phase === 'answering' && (
                  <>
                    <div className="mt-6 rounded-[28px] border p-5 sm:p-6" style={{
                      borderColor: `${color}30`,
                      background: `linear-gradient(180deg, ${color}12, var(--card-gradient-base-soft))`,
                    }}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-sm font-semibold text-slate-200">
                          自分の言葉で2〜4文くらいで説明してみよう
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowHints(currentValue => !currentValue)}
                          className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                          style={{
                            borderColor: `${color}55`,
                            background: showHints ? `${color}18` : 'var(--card-gradient-base-soft)',
                            color,
                          }}
                        >
                          {showHints ? 'キーワードを隠す' : 'キーワード補助'}
                        </button>
                      </div>

                      {showHints && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {currentCard.hintKeywords.map(keyword => (
                            <span
                              key={keyword}
                              className="rounded-full px-3 py-1.5 text-xs font-semibold"
                              style={{ background: `${color}18`, color }}
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}

                      <textarea
                        value={answer}
                        onChange={event => {
                          setAnswer(event.target.value)
                          setError('')
                        }}
                        placeholder="短くて大丈夫。思い出せるところから書いてみよう。"
                        rows={6}
                        className="input-surface mt-4 resize-y"
                        disabled={submitting}
                      />

                      {error && (
                        <div className="mt-4 rounded-2xl border border-red-800/70 bg-red-950/50 px-4 py-3 text-sm text-red-200">
                          {error}
                        </div>
                      )}

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs leading-6 text-slate-500">
                          完全一致ではなく内容で評価します。軽い言い換えやタイポでは落としません。
                        </div>
                        <button
                          onClick={() => void handleSubmitAnswer()}
                          disabled={!answer.trim() || submitting}
                          className="btn-primary whitespace-nowrap disabled:opacity-60"
                        >
                          {submitting ? '評価中...' : '評価してもらう'}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {phase === 'feedback' && evaluation && (
                  <div className="mt-6 rounded-[28px] border p-5 sm:p-6" style={{
                    borderColor: `${getActiveRecallRatingAccent(evaluation.rating)}55`,
                    background: evaluation.rating === 'strong'
                      ? 'rgba(34, 197, 94, 0.1)'
                      : evaluation.rating === 'close'
                        ? 'rgba(245, 158, 11, 0.12)'
                        : 'rgba(239, 68, 68, 0.1)',
                  }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">EVALUATION</div>
                        <div
                          className="mt-2 font-display text-3xl"
                          style={{ color: getActiveRecallRatingAccent(evaluation.rating) }}
                        >
                          {getActiveRecallRatingLabel(evaluation.rating)}
                        </div>
                      </div>
                      <div className="rounded-full bg-black/20 px-3 py-1.5 text-xs text-slate-200">
                        回答 {Math.max(1, currentAttemptCount)} 回目
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[22px] border border-white/10 bg-slate-950/25 p-4">
                        <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">良かった点</div>
                        <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                          {evaluation.strengths.length > 0 ? (
                            evaluation.strengths.map(point => (
                              <div key={point}>・{point}</div>
                            ))
                          ) : (
                            <div>・思い出そうとした方向は見えています。</div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-white/10 bg-slate-950/25 p-4">
                        <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">足りない点</div>
                        <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                          {evaluation.missingPoints.length > 0 ? (
                            evaluation.missingPoints.map(point => (
                              <div key={point}>・{point}</div>
                            ))
                          ) : (
                            <div>・今回は不足点はほぼありません。</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-white/10 bg-slate-950/25 p-4 text-sm leading-7 text-slate-200">
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">コーチコメント</div>
                      <div className="mt-3 whitespace-pre-wrap">{evaluation.coachReply}</div>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-white/10 bg-slate-950/25 p-4 text-sm leading-7 text-slate-200">
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">模範の要点</div>
                      <div className="mt-3 whitespace-pre-wrap">{evaluation.modelAnswer}</div>
                    </div>

                    {(evaluation.followUpPrompt || currentCard.followUpPrompt) && (
                      <div className="mt-4 rounded-[22px] border border-white/10 bg-slate-950/25 p-4 text-sm leading-7 text-slate-200">
                        <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">追撃メモ</div>
                        <div className="mt-3 whitespace-pre-wrap">{evaluation.followUpPrompt ?? currentCard.followUpPrompt}</div>
                      </div>
                    )}

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      {evaluation.rating !== 'strong' && currentAttemptCount < 2 && (
                        <button onClick={handleRetry} className="btn-secondary">
                          ヒントを見てもう一度
                        </button>
                      )}
                      <button onClick={() => void finalizeCurrentAttempt()} className="btn-primary">
                        {current + 1 >= cards.length ? '結果を見る' : '次へ'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">Session Notes</div>
            <div className="mt-3 grid gap-3">
              <div className="subcard p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">対象</div>
                <div className="mt-2 font-display text-2xl text-white">{getSessionUnitLabel(selectedUnit)}</div>
                <div className="mt-1 text-xs text-slate-500">{field} の内容から出題</div>
              </div>

              <div className="subcard p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">判定</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(['strong', 'close', 'review'] as const).map(rating => (
                    <span
                      key={rating}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold"
                      style={{
                        background: `${getActiveRecallRatingAccent(rating)}18`,
                        color: getActiveRecallRatingAccent(rating),
                      }}
                    >
                      {getActiveRecallRatingLabel(rating)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="subcard p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">進み方</div>
                <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                  <div>1. 問いを読んで、短文で説明する</div>
                  <div>2. 足りない点だけ短く受け取る</div>
                  <div>3. 必要なら1回だけ言い直す</div>
                  <div>4. 5問終わったら要復習だけ保存</div>
                </div>
              </div>

              {model && (
                <div className="rounded-[22px] border border-white/8 bg-slate-950/20 px-4 py-3 text-xs leading-6 text-slate-500">
                  使用モデル: {model}
                </div>
              )}

              {schemaMessage && (
                <div className="rounded-[22px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm leading-7 text-amber-100">
                  {schemaMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
