'use client'
import { fetchStudents, useAuth } from '@/lib/auth'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { PeriodicCardRewardModal } from '@/components/PeriodicCard'
import { FALLBACK_SCIENCE_NEWS_RESPONSE, ScienceNewsResponse } from '@/lib/scienceNews'
import { countActiveStudents } from '@/lib/activeSessions'
import { FIELD_COLORS, FIELD_EMOJI, FIELDS as CORE_FIELDS } from '@/lib/constants'
import { calculateQuizXp, getJstWeekRange, getLevelInfo, getNextLevelUnlock, getTotalXpFromSessions, getUnlockedLevelRewards, getXpFloorForLevel, TIME_ATTACK_UNLOCK_LEVEL } from '@/lib/engagement'
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

interface WeeklyLeaderboardEntry {
  studentId: number
  nickname: string
  weeklyXp: number
  level: number
  title: string
  rank: number
  isCurrentUser: boolean
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
  const [onlineCount, setOnlineCount] = useState<number | null>(null)
  const [totalXp, setTotalXp] = useState(0)
  const [dailyStatus, setDailyStatus] = useState<DailyChallengeStatus>({ completed: false, completedAt: null })
  const [timeAttackSummary, setTimeAttackSummary] = useState<HomeTimeAttackSummary>({
    personalBest: 0,
    allTimeBest: 0,
    allTimeLeaderName: null,
  })
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<WeeklyLeaderboardEntry[]>([])
  const [weeklyLeaderboardLoading, setWeeklyLeaderboardLoading] = useState(true)
  const totalQuestions = Object.values(stats).reduce((sum, field) => sum + field.total, 0)
  const totalCorrect = Object.values(stats).reduce((sum, field) => sum + field.correct, 0)
  const overallRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null
  const levelInfo = useMemo(() => getLevelInfo(totalXp), [totalXp])
  const timeAttackUnlocked = levelInfo.level >= TIME_ATTACK_UNLOCK_LEVEL
  const timeAttackUnlockXpLeft = Math.max(0, getXpFloorForLevel(TIME_ATTACK_UNLOCK_LEVEL) - levelInfo.totalXp)
  const nextUnlock = getNextLevelUnlock(levelInfo.level)
  const unlockedRewards = getUnlockedLevelRewards(levelInfo.level)
  const currentWeekRange = useMemo(() => getJstWeekRange(), [])
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
    let active = true

    const loadWeeklyLeaderboard = async () => {
      setWeeklyLeaderboardLoading(true)
      const [students, sessionsResponse] = await Promise.all([
        fetchStudents(),
        supabase
          .from('quiz_sessions')
          .select('student_id, correct_count, total_questions, duration_seconds')
          .gte('created_at', currentWeekRange.startDate.toISOString()),
      ])

      if (!active) return

      if (sessionsResponse.error) {
        console.error('[home] failed to load weekly leaderboard', sessionsResponse.error)
        setWeeklyLeaderboard([])
        setWeeklyLeaderboardLoading(false)
        return
      }

      const studentMap = new Map(students.map(student => [student.id, student]))
      const aggregateMap = new Map<number, { correct: number; total: number; duration: number }>()

      for (const row of sessionsResponse.data || []) {
        if (!row.student_id || row.student_id === 5) continue
        const current = aggregateMap.get(row.student_id) ?? { correct: 0, total: 0, duration: 0 }
        current.correct += row.correct_count
        current.total += row.total_questions
        current.duration += row.duration_seconds
        aggregateMap.set(row.student_id, current)
      }

      const ranked = Array.from(aggregateMap.entries())
        .map(([currentStudentId, aggregate]) => {
          const weeklyXp = calculateQuizXp({
            correctCount: aggregate.correct,
            totalQuestions: aggregate.total,
            durationSeconds: aggregate.duration,
          })
          const student = studentMap.get(currentStudentId)
          const currentLevel = getLevelInfo(student?.student_xp ?? 0)

          return {
            studentId: currentStudentId,
            nickname: student?.nickname ?? `ID ${currentStudentId}`,
            weeklyXp,
            level: currentLevel.level,
            title: currentLevel.title,
            total: aggregate.total,
            isCurrentUser: currentStudentId === studentId,
          }
        })
        .sort((left, right) => {
          if (right.weeklyXp !== left.weeklyXp) return right.weeklyXp - left.weeklyXp
          return right.total - left.total
        })
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }))

      const topEntries = ranked.slice(0, 7)
      const currentUserEntry = ranked.find(entry => entry.studentId === studentId) ?? null
      const nextEntries = currentUserEntry && !topEntries.some(entry => entry.studentId === currentUserEntry.studentId)
        ? [...topEntries, currentUserEntry]
        : topEntries

      setWeeklyLeaderboard(nextEntries.map(({ total: _total, ...entry }) => entry))
      setWeeklyLeaderboardLoading(false)
    }

    void loadWeeklyLeaderboard()

    return () => {
      active = false
    }
  }, [currentWeekRange.startDate, studentId])

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

  useEffect(() => {
    if (studentId === null) return
    let active = true

    const loadOnlineCount = async () => {
      try {
        const count = await countActiveStudents()
        if (active) setOnlineCount(count)
      } catch (error) {
        console.warn('[home] failed to load online count', error)
      }
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
  const weekRangeLabel = useMemo(() => {
    const endDate = new Date(currentWeekRange.endDate.getTime() - 1)
    return `${newsDateFormatter.format(currentWeekRange.startDate)} 〜 ${newsDateFormatter.format(endDate)}`
  }, [currentWeekRange.endDate, currentWeekRange.startDate, newsDateFormatter])
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
            {nextUnlock && (
              <div className="mt-3 rounded-[22px] border px-3.5 py-3.5 sm:mt-4 sm:rounded-[24px] sm:px-4 sm:py-4" style={{
                borderColor: 'rgba(255,255,255,0.08)',
                background: 'rgba(15, 23, 42, 0.28)',
              }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">次の解放</div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="text-2xl">{nextUnlock.emoji}</div>
                      <div>
                        <div className="font-semibold text-white">{nextUnlock.title}</div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">UNLOCK</div>
                    <div className="mt-1 font-display text-2xl text-white">Lv.{nextUnlock.level}</div>
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
                        style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#86efac' }}
                      >
                        {reward.emoji} {reward.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
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
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <button onClick={onMyPage} className="btn-secondary w-full">
                マイページ
              </button>
              <button onClick={() => logout()} className="btn-ghost whitespace-nowrap">
                ログアウト
              </button>
            </div>

            <a
              href={scienceNews.item.link}
              target="_blank"
              rel="noreferrer"
              className="block rounded-[18px] border px-3 py-3 transition-all sm:rounded-[20px] sm:px-3.5 sm:py-3.5"
              style={{
                borderColor: 'rgba(245, 158, 11, 0.14)',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(15, 23, 42, 0.78) 64%)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold tracking-[0.18em] text-amber-200 uppercase">
                    Science News
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-white">
                    {scienceNews.item.title}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-slate-500">{newsDateFormatter.format(new Date(scienceNews.item.publishedAt))}</div>
                  <div className="mt-1 text-[10px] font-semibold text-amber-100">記事へ →</div>
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>

      <div className="card mb-4 sm:mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-white">今週のランキング</h2>
            <div className="mt-1 text-xs text-slate-500">{weekRangeLabel}</div>
          </div>
          <div className="rounded-full bg-sky-300/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
            Weekly XP
          </div>
        </div>

        {weeklyLeaderboardLoading ? (
          <div className="mt-4 rounded-[20px] border border-white/8 bg-slate-950/24 px-4 py-5 text-sm text-slate-400">
            ランキングを読み込み中...
          </div>
        ) : weeklyLeaderboard.length === 0 ? (
          <div className="mt-4 rounded-[20px] border border-white/8 bg-slate-950/24 px-4 py-5 text-sm text-slate-300">
            まだ今週の記録はありません。最初の1セットを解いてみよう。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {weeklyLeaderboard.map((entry, index) => {
              const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}`
              return (
                <div
                  key={`${entry.studentId}-${entry.rank}`}
                  className="anim-fade-up flex items-center justify-between gap-3 rounded-[20px] border px-4 py-3"
                  style={{
                    animationDelay: `${index * 0.06}s`,
                    borderColor: entry.isCurrentUser ? 'rgba(56, 189, 248, 0.28)' : 'rgba(255, 255, 255, 0.08)',
                    background: entry.isCurrentUser
                      ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(15, 23, 42, 0.82))'
                      : 'rgba(15, 23, 42, 0.3)',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/60 text-base font-semibold text-white">
                      {medal}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="truncate font-semibold text-white">{entry.nickname}</div>
                        <div className="rounded-full border border-sky-300/15 bg-sky-300/10 px-2.5 py-1 text-[10px] font-semibold text-sky-100">
                          Lv.{entry.level}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{entry.title}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl text-sky-300">{entry.weeklyXp}</div>
                    <div className="text-[11px] text-slate-500">XP</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!dailyCompleted && (
        <button
          onClick={onDailyChallenge}
          className="card mb-4 w-full text-left transition-all sm:mb-5 daily-challenge-cta"
          style={{
            padding: '18px 20px',
            borderColor: 'rgba(245, 158, 11, 0.34)',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(251, 191, 36, 0.08), rgba(15, 23, 42, 0.84))',
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-amber-200">
                本日の5問
              </div>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <div className="font-display text-2xl text-white sm:text-[1.8rem]">今日のチャレンジ</div>
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    background: 'rgba(251, 191, 36, 0.14)',
                    color: '#fde68a',
                  }}
                >
                  5問 / XP×2
                </span>
              </div>
              <div className="mt-2 text-sm text-slate-300">
                苦手 → まだ解いていない問題 → ランダム の順で出題
              </div>
            </div>
            <div className="text-3xl text-amber-200 sm:text-4xl">
              ☀️
            </div>
          </div>
        </button>
      )}

      <button
        onClick={onTimeAttack}
        disabled={!timeAttackUnlocked}
        className="card mb-4 w-full text-left transition-all sm:mb-5 disabled:opacity-70"
        style={{
          padding: '18px 20px',
          cursor: timeAttackUnlocked ? 'pointer' : 'not-allowed',
          borderColor: timeAttackUnlocked ? 'rgba(77, 162, 255, 0.32)' : 'rgba(148, 163, 184, 0.14)',
          background: timeAttackUnlocked
            ? 'linear-gradient(135deg, rgba(77, 162, 255, 0.18), rgba(14, 116, 144, 0.08), rgba(15, 23, 42, 0.84))'
            : 'rgba(15, 23, 42, 0.62)',
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-sky-200">
              30秒チャレンジ
            </div>
            <div className="mt-2 font-display text-2xl text-white sm:text-[1.8rem]">チャレンジモード</div>
            <div className="mt-2 text-sm text-slate-300">
              {timeAttackUnlocked ? '30秒 / 正解で +0.5秒' : `Lv.${TIME_ATTACK_UNLOCK_LEVEL}で解放`}
            </div>
          </div>
          <div className={`text-3xl sm:text-4xl ${timeAttackUnlocked ? 'text-sky-200' : 'text-slate-500'}`}>
            ⏱️
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="subcard p-3.5">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">自己ベスト</div>
            <div className="mt-2 font-display text-3xl text-white">
              {timeAttackUnlocked ? timeAttackSummary.personalBest : '—'}
            </div>
          </div>
          <div className="subcard p-3.5">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">全体ベスト</div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="font-display text-3xl text-sky-300">
                {timeAttackUnlocked ? timeAttackSummary.allTimeBest : '—'}
              </div>
              <div className="text-right text-[11px] text-slate-500">
                {timeAttackUnlocked && timeAttackSummary.allTimeLeaderName
                  ? timeAttackSummary.allTimeLeaderName
                  : timeAttackUnlocked
                    ? 'まだ記録なし'
                    : `あと ${timeAttackUnlockXpLeft} XP`}
              </div>
            </div>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">分野を選ぶ</h2>
        <span className="text-xs text-slate-500">タップですぐ開始</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                padding: '18px 18px 16px',
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
                  className="flex h-10 w-10 items-center justify-center rounded-[14px] text-lg sm:h-12 sm:w-12 sm:rounded-[16px] sm:text-xl"
                  style={{ background: `${color}18`, border: `1px solid ${color}26` }}
                >
                  {emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-display text-[1.15rem] sm:text-[1.35rem]" style={{ color }}>{fieldName}</div>
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
                  <div className="mt-1 text-[13px] leading-5 text-slate-400 sm:text-sm sm:leading-6">{FIELD_DESCRIPTIONS[fieldName]}</div>
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
