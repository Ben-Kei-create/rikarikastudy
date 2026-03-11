'use client'
import { useAuth } from '@/lib/auth'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { FALLBACK_SCIENCE_NEWS_RESPONSE, ScienceNewsResponse } from '@/lib/scienceNews'
import { countActiveStudents } from '@/lib/activeSessions'
import { getLevelInfo } from '@/lib/engagement'
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
  const { nickname, studentId, logout } = useAuth()
  const isGuest = isGuestStudentId(studentId)
  const [stats, setStats] = useState<FieldStats>({})
  const [scienceNews, setScienceNews] = useState<ScienceNewsResponse>(FALLBACK_SCIENCE_NEWS_RESPONSE)
  const [onlineCount, setOnlineCount] = useState<number | null>(null)
  const [totalXp, setTotalXp] = useState(0)
  const [dailyCompleted, setDailyCompleted] = useState(false)
  const totalQuestions = Object.values(stats).reduce((sum, field) => sum + field.total, 0)
  const totalCorrect = Object.values(stats).reduce((sum, field) => sum + field.correct, 0)
  const overallRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null
  const levelInfo = useMemo(() => getLevelInfo(totalXp), [totalXp])

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

      <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr] mb-4">
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

        <div
          className="card anim-fade-up"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderColor: '#f59e0b40',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(15, 23, 42, 0.82) 48%, rgba(56, 189, 248, 0.12))',
            padding: '18px 20px',
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
          <a
            href={scienceNews.item.link}
            target="_blank"
            rel="noreferrer"
            className="relative z-[1] block h-full"
          >
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold tracking-[0.2em] text-amber-200 uppercase">
                  Daily Science News
                </span>
                <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                  1日1記事
                </span>
              </div>
              <div className="mt-3 font-display text-lg text-white sm:text-xl">
                本日の科学ニュース
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-300">
                日本語の科学ニュースを1本だけ、コンパクトに表示します。
              </p>
            </div>
            <div className="mt-4 rounded-[20px] border border-amber-300/18 bg-slate-950/28 p-4">
              <div className="text-sm font-semibold leading-6 text-white line-clamp-2">
                {scienceNews.item.title}
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-300 line-clamp-3">
                {scienceNews.item.summary}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                <span>{scienceNews.item.source}</span>
                <span>{newsDateFormatter.format(new Date(scienceNews.item.publishedAt))}</span>
              </div>
            </div>
          </a>
        </div>
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
