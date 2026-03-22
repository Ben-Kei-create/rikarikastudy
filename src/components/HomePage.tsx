'use client'
import { useAuth } from '@/lib/auth'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { PeriodicCardRewardModal } from '@/components/PeriodicCard'
import { FALLBACK_SCIENCE_NEWS_RESPONSE, ScienceNewsResponse } from '@/lib/scienceNews'
import { FIELD_COLORS, FIELD_EMOJI, FIELDS as CORE_FIELDS } from '@/lib/constants'
import { getRateColor } from '@/lib/uiUtils'
import { getLevelInfo, getNextLevelUnlock, getTotalXpFromSessions, getXpFloorForLevel, TIME_ATTACK_UNLOCK_LEVEL } from '@/lib/engagement'
import { DailyChallengeStatus, loadDailyChallengeStatus, loadTimeAttackBest } from '@/lib/studyRewards'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { getDueCount } from '@/lib/srs'

const FIELD_DESCRIPTIONS: Record<(typeof CORE_FIELDS)[number], string> = {
  '生物': '細胞・遺伝・消化',
  '化学': '原子・イオン・化学変化',
  '物理': '力・電気・エネルギー',
  '地学': '地震・天気・宇宙',
}

interface FieldStats {
  [field: string]: { total: number; correct: number }
}

interface HomeTimeAttackSummary {
  personalBest: number
  allTimeBest: number
  allTimeLeaderName: string | null
}

export default function HomePage({
  onSelectField,
  onQuickStartAll,
  onDailyChallenge,
  onReview,
  onTimeAttack,
  onTerritoryQuiz,
  onMyPage,
  onOnline,
}: {
  onSelectField: (field: string) => void
  onQuickStartAll: () => void
  onDailyChallenge: () => void
  onReview: () => void
  onTimeAttack: () => void
  onTerritoryQuiz: () => void
  onMyPage: () => void
  onOnline: () => void
}) {
  const { nickname, studentId, logout, pendingLoginCardReward, dismissLoginCardReward } = useAuth()
  const isGuest = isGuestStudentId(studentId)
  const [stats, setStats] = useState<FieldStats>({})
  const [scienceNews, setScienceNews] = useState<ScienceNewsResponse>(FALLBACK_SCIENCE_NEWS_RESPONSE)
  const [totalXp, setTotalXp] = useState(0)
  const [dueCount, setDueCount] = useState(0)
  const [showSrsReminder, setShowSrsReminder] = useState(false)
  const [showExtraActions, setShowExtraActions] = useState(false)
  const [dailyStatus, setDailyStatus] = useState<DailyChallengeStatus>({ completed: false, completedAt: null })
  const [timeAttackSummary, setTimeAttackSummary] = useState<HomeTimeAttackSummary>({
    personalBest: 0,
    allTimeBest: 0,
    allTimeLeaderName: null,
  })
  const levelInfo = useMemo(() => getLevelInfo(totalXp), [totalXp])
  const timeAttackUnlocked = levelInfo.level >= TIME_ATTACK_UNLOCK_LEVEL
  const timeAttackUnlockXpLeft = Math.max(0, getXpFloorForLevel(TIME_ATTACK_UNLOCK_LEVEL) - levelInfo.totalXp)
  const nextUnlock = getNextLevelUnlock(levelInfo.level)
  const dailyCompleted = dailyStatus.completed
  const activeFieldCount = useMemo(
    () => CORE_FIELDS.filter(field => (stats[field]?.total ?? 0) > 0).length,
    [stats],
  )
  const totalAnswered = useMemo(
    () => Object.values(stats).reduce((sum, fieldStat) => sum + fieldStat.total, 0),
    [stats],
  )
  const primaryMission = useMemo(() => {
    if (dueCount > 0) {
      return {
        kind: 'review' as const,
        eyebrow: 'Today First',
        title: `${dueCount}問の復習を先に進めよう`,
        description: '忘却リスクが高い問題から順に出題します。短く終わっても学習効率が高いパートです。',
        badge: `復習 ${dueCount}問`,
        actionLabel: '復習する',
        icon: '🧠',
        onClick: onReview,
      }
    }

    if (!dailyCompleted) {
      return {
        kind: 'daily' as const,
        eyebrow: 'Today Mission',
        title: '今日の5問で学習を開始',
        description: '苦手 → 未回答 → ランダムの順で出題します。毎日の入口を迷わず固定するためのミッションです。',
        badge: '5問 / XP×2',
        actionLabel: '今日の5問へ',
        icon: '☀️',
        onClick: onDailyChallenge,
      }
    }

    return {
      kind: 'quick' as const,
      eyebrow: 'Recommended',
      title: totalAnswered > 0 ? '4分野10問で次の学習へ' : '4分野10問でスタート',
      description: 'その日に何をやるか迷ったら、まずは全分野を短く回してから弱点に戻る流れがおすすめです。',
      badge: '4分野 / 10問',
      actionLabel: 'はじめる',
      icon: '🚀',
      onClick: onQuickStartAll,
    }
  }, [dailyCompleted, dueCount, onDailyChallenge, onQuickStartAll, onReview, totalAnswered])
  const secondaryMissionActions = [
    primaryMission.kind !== 'review' && dueCount > 0
      ? { key: 'review', label: `復習 ${dueCount}問`, onClick: onReview }
      : null,
    primaryMission.kind !== 'daily' && !dailyCompleted
      ? { key: 'daily', label: '今日の5問', onClick: onDailyChallenge }
      : null,
    primaryMission.kind !== 'quick'
      ? { key: 'quick', label: '4分野10問', onClick: onQuickStartAll }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onClick: () => void }>

  // SRSリマインダー: dueCount が読み込まれたら表示、8秒後に自動消去
  useEffect(() => {
    if (dueCount <= 0) return
    setShowSrsReminder(true)
    const timer = window.setTimeout(() => setShowSrsReminder(false), 8000)
    return () => clearTimeout(timer)
  }, [dueCount])

  useEffect(() => {
    if (studentId === null) return

    const load = async () => {
      if (isGuest) {
        const store = loadGuestStudyStore()
        const guestStats: FieldStats = {}

        for (const row of store.sessions) {
          if (!guestStats[row.field]) guestStats[row.field] = { total: 0, correct: 0 }
          guestStats[row.field].total += row.total_questions
          guestStats[row.field].correct += row.correct_count
        }

        setStats(guestStats)
        setTotalXp(getTotalXpFromSessions(store.sessions))
        setDailyStatus({
          completed: store.dailyChallenge.date === store.dayKey,
          completedAt: store.dailyChallenge.completed_at,
        })
        setDueCount(getDueCount(studentId))
        return
      }

      const [sessionsResponse, studentXpResponse, dailyChallengeStatus] = await Promise.all([
        supabase
          .from('quiz_sessions')
          .select('field, total_questions, correct_count')
          .eq('student_id', studentId),
        supabase
          .from('students')
          .select('student_xp')
          .eq('id', studentId)
          .single(),
        loadDailyChallengeStatus(studentId),
      ])

      const nextStats: FieldStats = {}
      for (const row of sessionsResponse.data || []) {
        if (!nextStats[row.field]) nextStats[row.field] = { total: 0, correct: 0 }
        nextStats[row.field].total += row.total_questions
        nextStats[row.field].correct += row.correct_count
      }

      setStats(nextStats)
      setTotalXp(studentXpResponse.data?.student_xp ?? 0)
      setDailyStatus(dailyChallengeStatus)
      setDueCount(getDueCount(studentId))
    }

    void load()
  }, [isGuest, studentId])

  useEffect(() => {
    if (studentId === null) return
    let active = true

    const loadBestSummary = async () => {
      if (isGuest) {
        const store = loadGuestStudyStore()
        if (!active) return
        setTimeAttackSummary({
          personalBest: store.timeAttackBest,
          allTimeBest: 0,
          allTimeLeaderName: null,
        })
        return
      }

      const summary = await loadTimeAttackBest(studentId)
      if (!active) return
      setTimeAttackSummary({
        personalBest: summary.personalBest,
        allTimeBest: summary.allTimeBest,
        allTimeLeaderName: summary.allTimeLeader?.nickname ?? null,
      })
    }

    void loadBestSummary()

    return () => {
      active = false
    }
  }, [isGuest, studentId])

  useEffect(() => {
    let active = true

    const loadNews = async () => {
      try {
        const response = await fetch('/api/science-news', { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json() as ScienceNewsResponse
        if (active && payload.item) setScienceNews(payload)
      } catch {
        // ignore – news is non-critical
      }
    }

    void loadNews()
    return () => {
      active = false
    }
  }, [])

  const newsDateFormatter = useMemo(
    () => new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
    }),
    [],
  )
  return (
    <div className="page-shell page-shell-dashboard">
      {pendingLoginCardReward && (
        <PeriodicCardRewardModal
          reward={pendingLoginCardReward}
          onClose={dismissLoginCardReward}
        />
      )}

      {/* SRS復習リマインダー */}
      {showSrsReminder && (
        <div
          className="fixed top-4 left-1/2 z-[110] w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
          style={{ animation: 'badgeToastIn 0.35s ease both' }}
        >
          <div
            className="flex items-center gap-3 rounded-2xl border px-4 py-3"
            style={{
              borderColor: 'rgba(139, 92, 246, 0.3)',
              background: 'linear-gradient(135deg, rgba(30, 20, 60, 0.97), rgba(20, 20, 40, 0.97))',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            <span className="text-2xl shrink-0">🧠</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">{dueCount}問の復習がたまっています</div>
              <div className="text-xs text-slate-400 mt-0.5">忘れる前にサクッと復習しよう</div>
            </div>
            <button
              onClick={() => { setShowSrsReminder(false); onReview() }}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
              style={{ background: 'rgba(139, 92, 246, 0.5)' }}
            >
              復習する
            </button>
            <button
              onClick={() => setShowSrsReminder(false)}
              className="shrink-0 text-xs text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="hero-card science-surface mb-3 p-3 sm:mb-6 sm:p-5 md:p-6 lg:p-8 anim-fade-up" style={{ animationDelay: '0.06s' }}>
        <ScienceBackdrop />
        <div className="grid gap-3 sm:gap-4 md:gap-5 md:grid-cols-[1.15fr_0.85fr] md:items-center">
          <div className="max-w-2xl">
            <div className="font-display text-[1.3rem] leading-tight text-white sm:text-3xl md:text-4xl">こんにちは、{nickname}さん</div>
            {nextUnlock && (
              <div className="mt-2 sm:mt-4 flex items-center gap-3 text-sm text-slate-400">
                <span>{nextUnlock.emoji}</span>
                <span className="text-white font-semibold">{nextUnlock.title}</span>
                <span>Lv.{nextUnlock.level}</span>
                <span className="text-xs">あと {Math.max(0, getXpFloorForLevel(nextUnlock.level) - levelInfo.totalXp)} XP</span>
              </div>
            )}
            {isGuest && (
              <p className="mt-3 text-sm leading-6 text-sky-200 sm:mt-4">
                ゲストは毎日リセット
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:max-w-sm md:ml-auto">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm md:justify-end">
              <button onClick={onMyPage} className="font-semibold text-slate-200 transition-colors hover:text-white">
                マイページ
              </button>
              <button onClick={onOnline} className="font-semibold text-sky-200 transition-colors hover:text-white">
                オンライン
              </button>
              <button onClick={() => logout()} className="text-slate-400 transition-colors hover:text-slate-200">
                ログアウト
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 md:justify-end">
              <span>学習 {totalAnswered}問</span>
              <span>{activeFieldCount} / 4 分野</span>
              <span>
                {timeAttackUnlocked
                  ? `TimeAttack ${timeAttackSummary.personalBest > 0 ? `${timeAttackSummary.personalBest}秒` : '未挑戦'}`
                  : `Lv.${TIME_ATTACK_UNLOCK_LEVEL}まであと ${timeAttackUnlockXpLeft} XP`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        className="card mb-4 w-full text-left transition-all sm:mb-5 anim-fade-up"
        style={{
          padding: '16px 18px',
          borderColor: primaryMission.kind === 'review'
            ? 'rgba(139, 92, 246, 0.28)'
            : primaryMission.kind === 'daily'
              ? 'var(--color-warning-soft-border)'
              : 'var(--color-info-soft-border)',
          background: primaryMission.kind === 'review'
            ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(59, 130, 246, 0.06), var(--card-gradient-base-mid))'
            : primaryMission.kind === 'daily'
              ? 'linear-gradient(135deg, var(--color-warning-soft-bg), rgba(245, 158, 11, 0.08), var(--card-gradient-base-mid))'
              : 'linear-gradient(135deg, var(--color-info-soft-bg), var(--color-success-soft-bg), var(--card-gradient-base-mid))',
          animationDelay: '0.12s',
        }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div
              className={`text-[11px] font-semibold tracking-[0.18em] uppercase ${
                primaryMission.kind === 'review'
                  ? 'text-violet-300'
                  : primaryMission.kind === 'daily'
                    ? 'text-amber-200'
                    : 'text-sky-200'
              }`}
            >
              {primaryMission.eyebrow}
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <div className="font-display text-[1.35rem] text-white sm:text-[1.8rem]">{primaryMission.title}</div>
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                style={{
                  background: primaryMission.kind === 'review'
                    ? 'rgba(139, 92, 246, 0.18)'
                    : primaryMission.kind === 'daily'
                      ? 'rgba(245, 158, 11, 0.18)'
                      : 'rgba(56, 189, 248, 0.16)',
                  color: primaryMission.kind === 'review'
                    ? '#ddd6fe'
                    : primaryMission.kind === 'daily'
                      ? '#fde68a'
                      : '#bae6fd',
                }}
              >
                {primaryMission.badge}
              </span>
            </div>
            <div className="mt-1.5 text-xs leading-6 text-slate-300 sm:text-sm">
              {primaryMission.description}
            </div>
            {secondaryMissionActions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>ほかの開始方法:</span>
                {secondaryMissionActions.map(action => (
                  <button
                    key={action.key}
                    onClick={action.onClick}
                    className="font-semibold text-slate-200 transition-colors hover:text-white"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 md:block md:text-right">
            <div className="text-[2rem] text-white/90 sm:text-[2.3rem]">{primaryMission.icon}</div>
            <button onClick={primaryMission.onClick} className="btn-primary mt-0 md:mt-3">
              {primaryMission.actionLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="card mb-4 sm:mb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">More</div>
            <div className="mt-1 text-sm text-slate-300">タイムアタック、陣取り、ニュースは必要なときだけ開けます。</div>
          </div>
          <button
            type="button"
            onClick={() => setShowExtraActions(current => !current)}
            className="text-sm font-semibold text-slate-200 transition-colors hover:text-white"
          >
            {showExtraActions ? '閉じる' : 'もっと見る'}
          </button>
        </div>

        {showExtraActions && (
          <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">4分野10問</div>
                <div className="text-xs text-slate-400">分野をまたいで短く回したいとき</div>
              </div>
              <button onClick={onQuickStartAll} className="text-sm font-semibold text-sky-200 transition-colors hover:text-white">
                はじめる
              </button>
            </div>

            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className={`text-sm font-semibold ${timeAttackUnlocked ? 'text-white' : 'text-slate-400'}`}>タイムアタック 30秒</div>
                <div className="text-xs text-slate-400">
                  {timeAttackUnlocked ? 'スピード勝負で自己ベスト更新' : `Lv.${TIME_ATTACK_UNLOCK_LEVEL}で解放`}
                </div>
              </div>
              {timeAttackUnlocked ? (
                <button onClick={onTimeAttack} className="text-sm font-semibold text-sky-200 transition-colors hover:text-white">
                  挑戦する
                </button>
              ) : (
                <span className="text-xs text-slate-500">あと {timeAttackUnlockXpLeft} XP</span>
              )}
            </div>

            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">陣取り</div>
                <div className="text-xs text-slate-400">CPU戦でテンポよく遊びながら復習</div>
              </div>
              <button onClick={onTerritoryQuiz} className="text-sm font-semibold text-amber-200 transition-colors hover:text-white">
                あそぶ
              </button>
            </div>

            <a
              href={scienceNews.item.link}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white line-clamp-2">{scienceNews.item.title}</div>
                <div className="text-xs text-slate-400">
                  {newsDateFormatter.format(new Date(scienceNews.item.publishedAt))}
                </div>
              </div>
              <span className="text-sm font-semibold text-amber-100 transition-colors hover:text-white">ニュースを開く</span>
            </a>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h2 className="text-lg font-semibold text-slate-100">分野を選ぶ</h2>
        <span className="text-xs text-slate-500">タップですぐ開始</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CORE_FIELDS.map((fieldName, index) => {
          const stat = stats[fieldName]
          const rate = stat && stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : null
          const color = FIELD_COLORS[fieldName]
          const emoji = FIELD_EMOJI[fieldName]

          return (
            <button
              key={fieldName}
              onClick={() => onSelectField(fieldName)}
              className="anim-fade-up rounded-[22px] border text-left"
              style={{
                animationDelay: `${index * 0.08}s`,
                cursor: 'pointer',
                transition: 'border-color 0.2s ease, background-color 0.2s ease',
                borderColor: `${color}30`,
                background: `linear-gradient(180deg, ${color}10, rgba(2, 6, 23, 0.24))`,
                padding: '12px 13px',
              }}
              onMouseEnter={event => {
                const element = event.currentTarget
                element.style.borderColor = `${color}55`
                element.style.background = `linear-gradient(180deg, ${color}16, rgba(2, 6, 23, 0.3))`
              }}
              onMouseLeave={event => {
                const element = event.currentTarget
                element.style.borderColor = `${color}30`
                element.style.background = `linear-gradient(180deg, ${color}10, rgba(2, 6, 23, 0.24))`
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] text-base sm:h-10 sm:w-10 sm:text-lg"
                    style={{ background: `${color}18`, border: `1px solid ${color}20` }}
                  >
                    {emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-[1rem] sm:text-[1.05rem]" style={{ color }}>{fieldName}</div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {rate === null ? '未着手' : `${stat?.total}問`}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] leading-5 text-slate-400">{FIELD_DESCRIPTIONS[fieldName]}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {rate === null ? 'まだ未着手です。ここから始められます。' : `${stat?.correct} / ${stat?.total}問正解`}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className="text-sm font-semibold sm:text-base"
                    style={{ color: rate === null ? color : getRateColor(rate) }}
                  >
                    {rate === null ? '開始' : `${rate}%`}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {rate === null ? 'はじめる' : '正答率'}
                  </div>
                </div>
              </div>
              {rate !== null && (
                <div className="mt-3 soft-track" style={{ height: 6 }}>
                  <div
                    style={{
                      width: `${rate}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${color}, ${color}80)`,
                      borderRadius: 999,
                      transition: 'width 1s ease',
                    }}
                  />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
