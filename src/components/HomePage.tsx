'use client'
import { useAuth } from '@/lib/auth'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { PeriodicCardRewardModal } from '@/components/PeriodicCard'
import { FALLBACK_SCIENCE_NEWS_RESPONSE, ScienceNewsResponse } from '@/lib/scienceNews'
import { countActiveStudents } from '@/lib/activeSessions'
import { getLevelInfo, getNextLevelUnlock, getTotalXpFromSessions, getUnlockedLevelRewards, getXpFloorForLevel, TIME_ATTACK_UNLOCK_LEVEL } from '@/lib/engagement'
import { hasCompletedDailyChallenge } from '@/lib/studyRewards'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'

const FIELDS = [
  { name: '生物', emoji: '🌿', color: '#22c55e', desc: '細胞・遺伝・消化' },
  { name: '化学', emoji: '⚗️', color: '#f97316', desc: '原子・イオン・化学変化' },
  { name: '物理', emoji: '⚡', color: '#4da2ff', desc: '力・電気・エネルギー' },
  { name: '地学', emoji: '🌏', color: '#8b7cff', desc: '地震・天気・宇宙' },
]

interface FieldStats {
  [field: string]: { total: number; correct: number }
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
  const [onlineCount, setOnlineCount] = useState<number | null>(null)
  const [totalXp, setTotalXp] = useState(0)
  const [dailyCompleted, setDailyCompleted] = useState(false)
  const [menuExpanded, setMenuExpanded] = useState(false)
  const totalQuestions = Object.values(stats).reduce((sum, field) => sum + field.total, 0)
  const totalCorrect = Object.values(stats).reduce((sum, field) => sum + field.correct, 0)
  const overallRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null
  const levelInfo = useMemo(() => getLevelInfo(totalXp), [totalXp])
  const timeAttackUnlocked = levelInfo.level >= TIME_ATTACK_UNLOCK_LEVEL
  const timeAttackUnlockXpLeft = Math.max(0, getXpFloorForLevel(TIME_ATTACK_UNLOCK_LEVEL) - levelInfo.totalXp)
  const nextUnlock = getNextLevelUnlock(levelInfo.level)
  const unlockedRewards = getUnlockedLevelRewards(levelInfo.level)

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
        setDailyCompleted(store.dailyChallenge.date === store.dayKey)
        return
      }

      const [sessionsResponse, studentXpResponse, dailyCompletedValue] = await Promise.all([
        supabase
          .from('quiz_sessions')
          .select('field, total_questions, correct_count')
          .eq('student_id', studentId),
        supabase
          .from('students')
          .select('student_xp')
          .eq('id', studentId)
          .single(),
        hasCompletedDailyChallenge(studentId),
      ])

      const nextStats: FieldStats = {}
      for (const row of sessionsResponse.data || []) {
        if (!nextStats[row.field]) nextStats[row.field] = { total: 0, correct: 0 }
        nextStats[row.field].total += row.total_questions
        nextStats[row.field].correct += row.correct_count
      }

      setStats(nextStats)
      setTotalXp(studentXpResponse.data?.student_xp ?? 0)
      setDailyCompleted(dailyCompletedValue)
    }

    void load()
  }, [isGuest, studentId])

  useEffect(() => {
    let active = true

    const loadNews = async () => {
      try {
        const response = await fetch('/api/science-news')
        if (!response.ok) return
        const payload = await response.json() as ScienceNewsResponse
        if (active && payload.item) setScienceNews(payload)
      } catch {}
    }

    void loadNews()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (studentId === null) return
    let active = true

    const loadOnlineCount = async () => {
      try {
        const count = await countActiveStudents()
        if (active) setOnlineCount(count)
      } catch {}
    }

    void loadOnlineCount()
    const intervalId = window.setInterval(loadOnlineCount, 60 * 1000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [studentId])

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
      <div className="hero-card science-surface mb-5 p-4 sm:mb-6 sm:p-6 lg:p-8 anim-fade-up">
        <ScienceBackdrop />
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-3">
              Home
            </div>
            <div className="font-display text-[1.9rem] leading-tight text-white sm:text-4xl">こんにちは、{nickname}さん</div>
            <div className="mt-4 rounded-[22px] border border-sky-300/15 bg-sky-300/5 p-3.5 sm:mt-5 sm:rounded-[24px] sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">レベル</div>
                  <div className="mt-2 flex items-end gap-3">
                    <div className="font-display text-3xl text-white">Lv.{levelInfo.level}</div>
                    <div className="pb-1 text-sm font-semibold text-sky-200">{levelInfo.title}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">TOTAL XP</div>
                  <div className="mt-2 font-display text-2xl text-sky-300">{levelInfo.totalXp}</div>
                </div>
              </div>
              <div className="mt-4 soft-track" style={{ height: 10 }}>
                <div
                  style={{
                    width: `${levelInfo.progressRate}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #60a5fa, #38bdf8)',
                    borderRadius: 999,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>{levelInfo.progressXp} / {levelInfo.progressMax} XP</span>
                <span>次まで {Math.max(0, levelInfo.nextLevelXp - levelInfo.totalXp)} XP</span>
              </div>
            </div>
            <div className="mt-3 rounded-[22px] border px-3.5 py-3.5 sm:mt-4 sm:rounded-[24px] sm:px-4 sm:py-4" style={{
              borderColor: 'rgba(255,255,255,0.08)',
              background: 'rgba(15, 23, 42, 0.28)',
            }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">次の解放</div>
                  {nextUnlock ? (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="text-2xl">{nextUnlock.emoji}</div>
                      <div>
                        <div className="font-semibold text-white">{nextUnlock.title}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-emerald-300">解放ずみ</div>
                  )}
                </div>
                {nextUnlock && (
                  <div className="text-right">
                    <div className="text-xs text-slate-500">UNLOCK</div>
                    <div className="mt-1 font-display text-2xl text-white">Lv.{nextUnlock.level}</div>
                    <div className="text-xs text-slate-500">
                      あと {Math.max(0, getXpFloorForLevel(nextUnlock.level) - levelInfo.totalXp)} XP
                    </div>
                  </div>
                )}
              </div>
              {unlockedRewards.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {unlockedRewards.map(reward => (
                    <span
                      key={reward.key}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold"
                      style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#86efac' }}
                    >
                      {reward.emoji} {reward.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {isGuest && (
              <p className="mt-4 text-sm leading-6 text-sky-200">
                ゲストは毎日リセット
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:max-w-sm lg:ml-auto">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="subcard mobile-mini-card p-3.5">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">正答率</div>
                <div className="mt-2 font-display text-xl text-white">{overallRate !== null ? `${overallRate}%` : 'START'}</div>
                <div className="mt-1 text-xs text-slate-500">{totalQuestions > 0 ? `${totalQuestions}問解答` : 'まだ未学習'}</div>
              </div>
              <div className="subcard mobile-mini-card p-3.5">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">レベル</div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="font-display text-xl text-white">Lv.{levelInfo.level}</div>
                  <div className="pb-0.5 text-xs font-semibold text-sky-200">{levelInfo.title}</div>
                </div>
                <div className="mt-1 text-xs text-slate-500">次 Lv.{Math.min(99, levelInfo.level + 1)}</div>
              </div>
            </div>
            <div className="subcard mobile-mini-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">XP Progress</div>
                <div className="text-sm font-semibold text-sky-200">{levelInfo.totalXp} XP</div>
              </div>
              <div className="mt-3 soft-track" style={{ height: 8 }}>
                <div
                  style={{
                    width: `${levelInfo.progressRate}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #7dd3fc, #38bdf8)',
                    borderRadius: 999,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>{levelInfo.progressXp} / {levelInfo.progressMax} XP</span>
                <span>{onlineCount !== null ? `ログイン中 ${onlineCount}人` : 'ログイン中 —'}</span>
              </div>
            </div>
            <div
              className="rounded-[22px] border p-3.5 sm:rounded-[24px] sm:p-4"
              style={{
                borderColor: 'rgba(255,255,255,0.08)',
                background: 'rgba(15, 23, 42, 0.38)',
              }}
            >
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">すぐはじめる</div>
              <div className="mt-3 grid gap-3">
                <button
                  onClick={onDailyChallenge}
                  disabled={dailyCompleted}
                  className="card mobile-action-card text-left transition-all disabled:opacity-70"
                  style={{
                    padding: '16px 18px',
                    borderColor: dailyCompleted ? 'rgba(34, 197, 94, 0.24)' : 'rgba(245, 158, 11, 0.24)',
                    background: dailyCompleted
                      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.14), rgba(15, 23, 42, 0.82))'
                      : 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(15, 23, 42, 0.82))',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold tracking-[0.18em] text-amber-200 uppercase sm:text-[11px]">
                        Daily Challenge
                      </div>
                      <div className="mt-1 font-display text-lg text-white sm:text-xl">今日のチャレンジ</div>
                      <div className="mt-1 text-[11px] text-slate-300 sm:text-xs">
                        5問 / XP×2
                      </div>
                    </div>
                    <div className={`text-xl sm:text-2xl ${dailyCompleted ? 'text-emerald-300' : 'text-amber-200'}`}>
                      {dailyCompleted ? '✅' : '☀️'}
                    </div>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    onClick={onQuickStartAll}
                    className="subcard mobile-action-card text-left transition-all"
                    style={{
                      padding: '16px',
                      borderColor: 'rgba(56, 189, 248, 0.22)',
                      background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(34, 197, 94, 0.08) 64%, rgba(15, 23, 42, 0.84))',
                    }}
                  >
                    <div className="text-[10px] font-semibold tracking-[0.18em] text-sky-200 uppercase sm:text-[11px]">Quick</div>
                    <div className="mt-1 font-display text-base text-white sm:text-lg">4分野10問</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-400 sm:text-xs">総合</div>
                  </button>
                  <button
                    onClick={onTimeAttack}
                    disabled={!timeAttackUnlocked}
                    className="subcard mobile-action-card text-left transition-all disabled:opacity-60"
                    style={{
                      padding: '16px',
                      cursor: timeAttackUnlocked ? 'pointer' : 'not-allowed',
                      borderColor: timeAttackUnlocked ? 'rgba(168, 85, 247, 0.22)' : 'rgba(148, 163, 184, 0.12)',
                      background: timeAttackUnlocked
                        ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.14), rgba(15, 23, 42, 0.84))'
                        : 'rgba(15, 23, 42, 0.58)',
                    }}
                  >
                    <div className="text-[10px] font-semibold tracking-[0.18em] uppercase sm:text-[11px]" style={{ color: timeAttackUnlocked ? 'var(--earth-dark)' : 'var(--text-muted)' }}>
                      Challenge
                    </div>
                    <div className="mt-1 font-display text-base text-white sm:text-lg">チャレンジ</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-400 sm:text-xs">
                      {timeAttackUnlocked
                        ? 'TA / テスト / 連続正解'
                        : `Lv.${TIME_ATTACK_UNLOCK_LEVEL}まであと ${timeAttackUnlockXpLeft} XP`}
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2 sm:gap-3">
              <button onClick={onMyPage} className="btn-secondary w-full">
                マイページ
              </button>
              <button
                onClick={() => setMenuExpanded(current => !current)}
                className="btn-ghost whitespace-nowrap"
                aria-expanded={menuExpanded}
              >
                {menuExpanded ? '閉じる' : 'その他'}
              </button>
            </div>

            {menuExpanded && (
              <div
                className="rounded-[22px] border px-3.5 py-3.5 anim-fade-up sm:px-4 sm:py-4"
                style={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  background: 'rgba(8, 13, 24, 0.62)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">その他メニュー</div>
                    <div className="mt-1 text-sm text-slate-300">ニュース / ログアウト</div>
                  </div>
                  <button onClick={() => logout()} className="btn-ghost whitespace-nowrap text-sm">
                    ログアウト
                  </button>
                </div>

                <a
                  href={scienceNews.item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block rounded-[18px] border px-3.5 py-3.5 transition-all sm:mt-4 sm:rounded-[20px] sm:px-4 sm:py-4"
                  style={{
                    borderColor: 'rgba(245, 158, 11, 0.18)',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(15, 23, 42, 0.82) 58%, rgba(56, 189, 248, 0.08))',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-amber-200 uppercase">
                      Science News
                    </div>
                    <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                      1日1記事
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-semibold leading-6 text-white line-clamp-2">
                    {scienceNews.item.title}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-slate-300 line-clamp-2">
                    {scienceNews.item.summary}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                    <span>{scienceNews.item.source}</span>
                    <span>{newsDateFormatter.format(new Date(scienceNews.item.publishedAt))}</span>
                  </div>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">分野を選ぶ</h2>
        <span className="text-xs text-slate-500">タップですぐ開始</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {FIELDS.map((field, index) => {
          const stat = stats[field.name]
          const rate = stat && stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : null

          return (
            <button
              key={field.name}
              onClick={() => onSelectField(field.name)}
              className="card mobile-mini-card anim-fade-up text-left"
              style={{
                animationDelay: `${index * 0.08}s`,
                cursor: 'pointer',
                transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
                borderColor: `${field.color}30`,
                padding: '18px 18px 16px',
              }}
              onMouseEnter={event => {
                const element = event.currentTarget
                element.style.borderColor = `${field.color}70`
                element.style.transform = 'translateY(-2px)'
                element.style.boxShadow = `0 20px 34px ${field.color}20`
              }}
              onMouseLeave={event => {
                const element = event.currentTarget
                element.style.borderColor = `${field.color}30`
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
                  background: `radial-gradient(circle, ${field.color}18, transparent 66%)`,
                  borderRadius: '50%',
                }}
              />
              <div className="relative z-[1] flex items-start gap-2.5 sm:items-center sm:gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-[14px] text-lg sm:h-12 sm:w-12 sm:rounded-[16px] sm:text-xl"
                  style={{ background: `${field.color}18`, border: `1px solid ${field.color}26` }}
                >
                  {field.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-display text-[1.15rem] sm:text-[1.35rem]" style={{ color: field.color }}>{field.name}</div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{
                        background: rate === null ? `${field.color}16` : 'rgba(148, 163, 184, 0.12)',
                        color: rate === null ? field.color : 'var(--text-muted)',
                      }}
                    >
                      {rate === null ? 'はじめる' : `${stat?.total}問`}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] leading-5 text-slate-400 sm:text-sm sm:leading-6">{field.desc}</div>
                </div>
                {rate !== null && (
                  <div className="text-right">
                    <div className="font-semibold text-base sm:text-lg" style={{ color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>
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
                      background: `linear-gradient(90deg, ${field.color}, ${field.color}80)`,
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
