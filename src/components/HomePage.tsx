'use client'
import { useAuth } from '@/lib/auth'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { PeriodicCardRewardModal } from '@/components/PeriodicCard'
import { FALLBACK_SCIENCE_NEWS_RESPONSE, ScienceNewsResponse } from '@/lib/scienceNews'
import { FIELD_COLORS, FIELD_EMOJI, FIELDS as CORE_FIELDS } from '@/lib/constants'
import { getRateColor } from '@/lib/uiUtils'
import { getLevelInfo, getNextLevelUnlock, getTotalXpFromSessions, getUnlockedLevelRewards, getXpFloorForLevel, TIME_ATTACK_UNLOCK_LEVEL } from '@/lib/engagement'
import { DailyChallengeStatus, loadDailyChallengeStatus, loadTimeAttackBest } from '@/lib/studyRewards'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'

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
  onTimeAttack,
  onMyPage,
}: {
  onSelectField: (field: string) => void
  onQuickStartAll: () => void
  onDailyChallenge: () => void
  onTimeAttack: () => void
  onMyPage: () => void
}) {
  const { nickname, studentId, logout, pendingLoginCardReward, dismissLoginCardReward } = useAuth()
  const isGuest = isGuestStudentId(studentId)
  const [stats, setStats] = useState<FieldStats>({})
  const [scienceNews, setScienceNews] = useState<ScienceNewsResponse>(FALLBACK_SCIENCE_NEWS_RESPONSE)
  const [totalXp, setTotalXp] = useState(0)
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
  const unlockedRewards = getUnlockedLevelRewards(levelInfo.level)
  const dailyCompleted = dailyStatus.completed

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
    }

    void load()
  }, [isGuest, studentId])

  useEffect(() => {
    if (studentId === null) return
    let active = true

    const loadBestSummary = async () => {
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
  }, [studentId])

  useEffect(() => {
    let active = true

    const loadNews = async () => {
      try {
        const response = await fetch('/api/science-news')
        if (!response.ok) return
        const payload = await response.json() as ScienceNewsResponse
        if (active && payload.item) setScienceNews(payload)
      } catch (error) {
        console.warn('[home] failed to load science news', error)
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

      {/* Quick Start + Challenge Mode CTAs */}
      <div className="grid grid-cols-2 gap-3 mb-4 sm:gap-3 sm:mb-5 anim-fade-up">
        <button
          onClick={onQuickStartAll}
          className="quick-start-cta card text-left"
          style={{
            padding: '16px 14px',
            borderColor: 'rgba(56, 189, 248, 0.36)',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(34, 197, 94, 0.10) 50%, var(--card-gradient-base))',
            cursor: 'pointer',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={event => {
            event.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={event => {
            event.currentTarget.style.transform = ''
          }}
        >
          <div className="text-[10px] font-semibold tracking-[0.18em] text-sky-200 uppercase">Quick</div>
          <div className="mt-1.5 font-display text-[1.1rem] text-white sm:text-[1.35rem]">4分野10問</div>
        </button>

        <button
          onClick={onTimeAttack}
          disabled={!timeAttackUnlocked}
          className="card text-left transition-all disabled:opacity-70"
          style={{
            padding: '16px 14px',
            cursor: timeAttackUnlocked ? 'pointer' : 'not-allowed',
            borderColor: timeAttackUnlocked ? 'rgba(77, 162, 255, 0.32)' : 'var(--border-strong)',
            background: timeAttackUnlocked
              ? 'linear-gradient(135deg, rgba(77, 162, 255, 0.18), rgba(14, 116, 144, 0.08), var(--card-gradient-base-mid))'
              : 'var(--card-gradient-base-soft)',
          }}
          onMouseEnter={event => {
            if (!timeAttackUnlocked) return
            event.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={event => {
            event.currentTarget.style.transform = ''
          }}
        >
          <div className={`text-[10px] font-semibold tracking-[0.18em] uppercase ${timeAttackUnlocked ? 'text-sky-200' : 'text-slate-500'}`}>Challenge</div>
          <div className={`mt-1.5 font-display text-[1.1rem] sm:text-[1.35rem] ${timeAttackUnlocked ? 'text-white' : 'text-slate-400'}`}>30秒</div>
        </button>
      </div>

      <div className="hero-card science-surface mb-4 p-3.5 sm:mb-6 sm:p-5 md:p-6 lg:p-8 anim-fade-up" style={{ animationDelay: '0.06s' }}>
        <ScienceBackdrop />
        <div className="grid gap-4 md:gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2 sm:mb-3">
              Home
            </div>
            <div className="font-display text-[1.5rem] leading-tight text-white sm:text-3xl md:text-4xl">こんにちは、{nickname}さん</div>
            {nextUnlock && (
              <div className="mt-3 rounded-[20px] border px-3 py-3 sm:mt-4 sm:rounded-[24px] sm:px-4 sm:py-4" style={{
                borderColor: 'var(--inset-border)',
                background: 'var(--inset-bg)',
              }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">次の解放</div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="text-xl sm:text-2xl">{nextUnlock.emoji}</div>
                      <div>
                        <div className="font-semibold text-white text-sm sm:text-base">{nextUnlock.title}</div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">UNLOCK</div>
                    <div className="mt-1 font-display text-xl text-white sm:text-2xl">Lv.{nextUnlock.level}</div>
                    <div className="text-xs text-slate-500">
                      あと {Math.max(0, getXpFloorForLevel(nextUnlock.level) - levelInfo.totalXp)} XP
                    </div>
                  </div>
                </div>
                {unlockedRewards.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {unlockedRewards.map(reward => (
                      <span
                        key={reward.key}
                        className="rounded-full px-3 py-1 text-[11px] font-semibold"
                        style={{ background: 'var(--badge-success-bg)', color: 'var(--badge-success-text)' }}
                      >
                        {reward.emoji} {reward.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isGuest && (
              <p className="mt-3 text-sm leading-6 text-sky-200 sm:mt-4">
                ゲストは毎日リセット
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:max-w-sm lg:ml-auto">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <button onClick={onMyPage} className="btn-secondary w-full !py-2.5 text-sm sm:!py-3">
                マイページ
              </button>
              <button onClick={() => logout()} className="btn-ghost whitespace-nowrap !py-2.5 text-sm sm:!py-3">
                ログアウト
              </button>
            </div>

            <a
              href={scienceNews.item.link}
              target="_blank"
              rel="noreferrer"
              className="block rounded-[18px] border px-3 py-2.5 transition-all sm:rounded-[22px] sm:px-4 sm:py-3"
              style={{
                borderColor: 'var(--inset-border)',
                background: 'var(--inset-bg)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold tracking-[0.18em] text-amber-200 uppercase">
                    Science News
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-5 text-white line-clamp-2">
                    {scienceNews.item.title}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-slate-500">{newsDateFormatter.format(new Date(scienceNews.item.publishedAt))}</div>
                  <div className="mt-1 text-[10px] font-semibold text-amber-100">開く →</div>
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>

      {!dailyCompleted && (
        <button
          onClick={onDailyChallenge}
          className="card mb-4 w-full text-left transition-all sm:mb-5 daily-challenge-cta anim-fade-up"
          style={{
            padding: '16px 18px',
            borderColor: 'rgba(245, 158, 11, 0.34)',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(251, 191, 36, 0.08), var(--card-gradient-base-mid))',
            animationDelay: '0.12s',
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-amber-200">
                本日の5問
              </div>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <div className="font-display text-[1.35rem] text-white sm:text-[1.8rem]">今日のチャレンジ</div>
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    background: 'var(--badge-amber-bg)',
                    color: 'var(--badge-amber-text)',
                  }}
                >
                  5問 / XP×2
                </span>
              </div>
              <div className="mt-1.5 text-xs leading-5 text-slate-300 sm:mt-2 sm:text-sm">
                苦手 → まだ解いていない問題 → ランダム の順で出題
              </div>
            </div>
            <div className="text-[1.8rem] text-amber-200 sm:text-4xl">
              ☀️
            </div>
          </div>
        </button>
      )}

      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h2 className="text-lg font-semibold text-slate-100">分野を選ぶ</h2>
        <span className="text-xs text-slate-500">タップですぐ開始</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CORE_FIELDS.map((fieldName, index) => {
          const stat = stats[fieldName]
          const rate = stat && stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : null
          const color = FIELD_COLORS[fieldName]
          const emoji = FIELD_EMOJI[fieldName]

          return (
            <button
              key={fieldName}
              onClick={() => onSelectField(fieldName)}
              className="card mobile-mini-card anim-fade-up text-left"
              style={{
                animationDelay: `${index * 0.08}s`,
                cursor: 'pointer',
                transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
                borderColor: `${color}30`,
                padding: '14px 14px 13px',
              }}
              onMouseEnter={event => {
                const element = event.currentTarget
                element.style.borderColor = `${color}70`
                element.style.transform = 'translateY(-2px)'
                element.style.boxShadow = `0 20px 34px ${color}20`
              }}
              onMouseLeave={event => {
                const element = event.currentTarget
                element.style.borderColor = `${color}30`
                element.style.transform = ''
                element.style.boxShadow = ''
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  right: -30,
                  top: -30,
                  width: 120,
                  height: 120,
                  background: `radial-gradient(circle, ${color}18, transparent 66%)`,
                  borderRadius: '50%',
                }}
              />
              <div className="relative z-[1] flex items-start gap-2.5 sm:items-center sm:gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-[13px] text-base sm:h-12 sm:w-12 sm:rounded-[16px] sm:text-xl"
                  style={{ background: `${color}18`, border: `1px solid ${color}26` }}
                >
                  {emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-display text-[1.05rem] sm:text-[1.35rem]" style={{ color }}>{fieldName}</div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{
                        background: rate === null ? `${color}16` : 'rgba(148, 163, 184, 0.12)',
                        color: rate === null ? color : 'var(--text-muted)',
                      }}
                    >
                      {rate === null ? 'はじめる' : `${stat?.total}問`}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-slate-400 sm:text-sm sm:leading-6">{FIELD_DESCRIPTIONS[fieldName]}</div>
                </div>
                {rate !== null && (
                  <div className="text-right">
                    <div className="font-semibold text-base sm:text-lg" style={{ color: getRateColor(rate) }}>
                      {rate}%
                    </div>
                    <div className="text-slate-500 text-xs mt-1">正答率</div>
                  </div>
                )}
              </div>
              {rate !== null && (
                <div className="mt-3 relative z-[1] soft-track" style={{ height: 7 }}>
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
