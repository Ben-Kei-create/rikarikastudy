'use client'
import { useAuth, fetchStudents } from '@/lib/auth'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { FALLBACK_SCIENCE_NEWS, ScienceNewsItem } from '@/lib/scienceNews'
import { countActiveStudents } from '@/lib/activeSessions'
import { getJstWeekRange, getLevelInfo, getSessionXpFallback } from '@/lib/engagement'
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

interface RankingRow {
  studentId: number
  nickname: string
  weeklyXp: number
  totalXp: number
  level: number
}

interface FieldLeader {
  field: string
  nickname: string
  xp: number
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
  const { nickname, studentId, logout } = useAuth()
  const isGuest = isGuestStudentId(studentId)
  const [stats, setStats] = useState<FieldStats>({})
  const [scienceNews, setScienceNews] = useState<ScienceNewsItem>(FALLBACK_SCIENCE_NEWS)
  const [onlineCount, setOnlineCount] = useState<number | null>(null)
  const [totalXp, setTotalXp] = useState(0)
  const [dailyCompleted, setDailyCompleted] = useState(false)
  const [weeklyRanking, setWeeklyRanking] = useState<RankingRow[]>([])
  const [fieldLeaders, setFieldLeaders] = useState<FieldLeader[]>([])
  const totalQuestions = Object.values(stats).reduce((sum, field) => sum + field.total, 0)
  const totalCorrect = Object.values(stats).reduce((sum, field) => sum + field.correct, 0)
  const overallRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null
  const levelInfo = useMemo(() => getLevelInfo(totalXp), [totalXp])
  const weekRange = useMemo(() => getJstWeekRange(), [])

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
        setTotalXp(store.xp)
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
        const payload = await response.json() as ScienceNewsItem
        if (active) setScienceNews(payload)
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

  useEffect(() => {
    let active = true

    const loadRanking = async () => {
      const [students, sessionsResponse] = await Promise.all([
        fetchStudents(),
        supabase
          .from('quiz_sessions')
          .select('student_id, field, total_questions, correct_count, duration_seconds, xp_earned, session_mode, created_at')
          .gte('created_at', weekRange.startDate.toISOString())
          .lt('created_at', weekRange.endDate.toISOString())
          .order('created_at', { ascending: false }),
      ])

      if (!active) return

      const visibleStudents = students.filter(student => student.id !== 5)
      const rows = visibleStudents.map(student => ({
        studentId: student.id,
        nickname: student.nickname,
        totalXp: student.student_xp ?? 0,
        weeklyXp: 0,
        level: getLevelInfo(student.student_xp ?? 0).level,
      }))
      const rowMap = new Map(rows.map(row => [row.studentId, row]))
      const fieldStudentXpMap = new Map<string, number>()

      for (const session of sessionsResponse.data || []) {
        const row = rowMap.get(session.student_id)
        if (!row) continue
        const xp = getSessionXpFallback(session)
        row.weeklyXp += xp

        if (FIELDS.some(field => field.name === session.field)) {
          const key = `${session.field}:${session.student_id}`
          fieldStudentXpMap.set(key, (fieldStudentXpMap.get(key) ?? 0) + xp)
        }
      }

      rows.sort((a, b) => {
        if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp
        if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp
        return a.studentId - b.studentId
      })

      const nextFieldLeaders: FieldLeader[] = FIELDS.map(field => {
        let winner: FieldLeader | null = null
        for (const student of visibleStudents) {
          const xp = fieldStudentXpMap.get(`${field.name}:${student.id}`) ?? 0
          if (!winner || xp > winner.xp) {
            winner = {
              field: field.name,
              nickname: student.nickname,
              xp,
            }
          }
        }
        return winner || { field: field.name, nickname: '—', xp: 0 }
      })

      setWeeklyRanking(rows)
      setFieldLeaders(nextFieldLeaders)
    }

    void loadRanking()
    const intervalId = window.setInterval(loadRanking, 60 * 1000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [weekRange.endDate, weekRange.startDate])

  const scienceNewsDate = new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(scienceNews.publishedAt))

  return (
    <div className="page-shell page-shell-dashboard">
      <div className="hero-card science-surface p-5 sm:p-6 lg:p-8 mb-6 anim-fade-up">
        <ScienceBackdrop />
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-3">
              Home
            </div>
            <div className="font-display text-3xl text-white sm:text-4xl">こんにちは、{nickname}さん</div>
            <div className="mt-5 rounded-[24px] border border-sky-300/15 bg-sky-300/5 p-4">
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
            {isGuest && (
              <p className="mt-4 text-sm leading-6 text-sky-200">
                ゲストモードの成績と XP は当日分だけ保存され、日付が変わるとリセットされます。
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:max-w-sm lg:ml-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="subcard p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">正答率</div>
                <div className="mt-2 font-display text-2xl text-white">{overallRate !== null ? `${overallRate}%` : 'START'}</div>
                <div className="mt-1 text-xs text-slate-500">{totalQuestions > 0 ? `${totalQuestions}問解答` : 'まだ未学習'}</div>
              </div>
              <div className="subcard p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">ログイン中</div>
                <div className="mt-2 font-display text-2xl text-white">{onlineCount !== null ? `${onlineCount}人` : '—'}</div>
                <div className="mt-1 text-xs text-slate-500">だれがいるかは非表示</div>
              </div>
            </div>
            <button
              onClick={onDailyChallenge}
              disabled={dailyCompleted}
              className="card text-left transition-all disabled:opacity-70"
              style={{
                padding: '18px 20px',
                borderColor: dailyCompleted ? 'rgba(34, 197, 94, 0.24)' : 'rgba(245, 158, 11, 0.24)',
                background: dailyCompleted
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.14), rgba(15, 23, 42, 0.82))'
                  : 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(15, 23, 42, 0.82))',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-amber-200 uppercase">
                    Daily Challenge
                  </div>
                  <div className="mt-2 font-display text-2xl text-white">今日のチャレンジ</div>
                  <div className="mt-1 text-sm text-slate-300">
                    5問 / 2x XP / 今日1回
                  </div>
                </div>
                <div className={`text-3xl ${dailyCompleted ? 'text-emerald-300' : 'text-amber-200'}`}>
                  {dailyCompleted ? '✅' : '☀️'}
                </div>
              </div>
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={onTimeAttack} className="btn-secondary w-full">
                タイムアタック
              </button>
              <button onClick={onMyPage} className="btn-secondary w-full">
                マイページ
              </button>
            </div>
            <button onClick={() => logout()} className="btn-ghost w-full">
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="card anim-fade-up mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Weekly Ranking</div>
            <h2 className="mt-2 text-2xl font-bold text-white">今週のランキング</h2>
            <p className="mt-1 text-sm text-slate-400">
              集計期間: {weekRange.startKey.replace(/-/g, '/')} - {weekRange.endKey.replace(/-/g, '/')}
            </p>
          </div>
          <div className="rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-100">
            XP 基準
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {weeklyRanking.map((row, index) => (
            <div
              key={row.studentId}
              className="rounded-[22px] border px-4 py-4"
              style={{
                borderColor: row.studentId === studentId ? 'rgba(56, 189, 248, 0.34)' : 'var(--surface-elevated-border)',
                background: row.studentId === studentId ? 'rgba(56, 189, 248, 0.08)' : 'var(--surface-elevated)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 text-2xl text-center">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-bold text-white">{row.nickname}</div>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
                      Lv.{row.level}
                    </span>
                    {row.studentId === studentId && (
                      <span className="rounded-full bg-sky-300/15 px-2 py-0.5 text-[11px] font-semibold text-sky-200">
                        あなた
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">合計XP {row.totalXp}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl text-sky-300">{row.weeklyXp}</div>
                  <div className="text-xs text-slate-500">weekly XP</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {fieldLeaders.map(field => {
            const meta = FIELDS.find(item => item.name === field.field)
            return (
              <div
                key={field.field}
                className="rounded-[20px] border p-4"
                style={{ borderColor: `${meta?.color ?? '#38bdf8'}30`, background: 'rgba(15, 23, 42, 0.45)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{meta?.emoji}</span>
                  <span className="font-semibold" style={{ color: meta?.color }}>{field.field}</span>
                </div>
                <div className="mt-3 text-white font-bold">{field.nickname}</div>
                <div className="mt-1 text-sm text-slate-400">{field.xp} XP</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr] mb-4">
        <button
          onClick={onQuickStartAll}
          className="card anim-fade-up w-full text-left"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderColor: '#38bdf840',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.14), rgba(34, 197, 94, 0.08) 32%, rgba(249, 115, 22, 0.08) 66%, rgba(168, 85, 247, 0.12))',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at top right, rgba(255,255,255,0.12), transparent 34%)',
              pointerEvents: 'none',
            }}
          />
          <div className="relative z-[1]">
            <div className="text-[11px] font-semibold tracking-[0.2em] text-sky-200 uppercase">
              Quick Start
            </div>
            <div className="mt-2 font-display text-2xl text-white sm:text-[1.9rem]">
              4分野総合クイックスタート
            </div>
            <p className="mt-2 text-sm leading-7 text-slate-200">
              生物・化学・物理・地学をまとめて10問。短時間で全体感をつかめます。
            </p>
          </div>
        </button>

        <a
          href={scienceNews.link}
          target="_blank"
          rel="noreferrer"
          className="card anim-fade-up block text-left"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderColor: '#f59e0b40',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(15, 23, 42, 0.82) 48%, rgba(56, 189, 248, 0.12))',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at right top, rgba(255,255,255,0.1), transparent 34%)',
              pointerEvents: 'none',
            }}
          />
          <div className="relative z-[1] flex h-full flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold tracking-[0.2em] text-amber-200 uppercase">
                  Daily Science News
                </span>
                <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                  試験表示
                </span>
              </div>
              <div className="mt-3 font-display text-xl text-white sm:text-2xl">
                {scienceNews.title}
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-200">
                {scienceNews.summary}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-300">
              <div>{scienceNews.source}</div>
              <div>{scienceNewsDate}</div>
            </div>
          </div>
        </a>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">分野を選ぶ</h2>
        <span className="text-xs text-slate-500">4 categories</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {FIELDS.map((field, index) => {
          const stat = stats[field.name]
          const rate = stat && stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : null

          return (
            <button
              key={field.name}
              onClick={() => onSelectField(field.name)}
              className="card anim-fade-up text-left"
              style={{
                animationDelay: `${index * 0.08}s`,
                cursor: 'pointer',
                transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
                borderColor: `${field.color}30`,
                paddingBottom: rate === null ? 28 : 24,
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
              <div className="relative z-[1] flex min-h-[74px] items-start gap-4 sm:items-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-[18px] text-2xl"
                  style={{ background: `${field.color}18`, border: `1px solid ${field.color}26` }}
                >
                  {field.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="font-display text-[1.45rem]" style={{ color: field.color }}>{field.name}</div>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">start</span>
                  </div>
                  <div className="mt-1 text-sm leading-6 text-slate-400">{field.desc}</div>
                </div>
                {rate !== null && (
                  <div className="text-right">
                    <div className="font-semibold text-xl" style={{ color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>
                      {rate}%
                    </div>
                    <div className="text-slate-500 text-xs mt-1">{stat?.total}問</div>
                  </div>
                )}
              </div>
              {rate === null && (
                <div className="relative z-[1] mt-5 text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
                  First Challenge
                </div>
              )}
              {rate !== null && (
                <div className="mt-4 relative z-[1] soft-track" style={{ height: 7 }}>
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
