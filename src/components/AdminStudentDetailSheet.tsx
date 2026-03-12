'use client'

import { BADGE_DEFINITIONS, getBadgeRarityLabel } from '@/lib/badges'
import { getLevelInfo } from '@/lib/engagement'
import { Database } from '@/lib/supabase'
import { differenceInCalendarDays, eachDayOfInterval, format, startOfDay, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useMemo } from 'react'

const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e',
  '化学': '#f97316',
  '物理': '#3b82f6',
  '地学': '#a855f7',
  '4分野総合': '#38bdf8',
}

const FIELD_EMOJI: Record<string, string> = {
  '生物': '🌿',
  '化学': '⚗️',
  '物理': '⚡',
  '地学': '🌏',
  '4分野総合': '🔬',
}

type QuizSessionRow = Database['public']['Tables']['quiz_sessions']['Row']
type StudentBadgeRow = Database['public']['Tables']['student_badges']['Row']

interface AdminStudentRecord {
  id: number
  nickname: string
  password: string
  student_xp: number
}

interface AdminStudentDetailAnswerLogRow {
  question_id: string
  is_correct: boolean
  created_at: string
  questions: { unit: string; field: string } | null
}

interface AdminStudentDetailData {
  sessions: QuizSessionRow[]
  answerLogs: AdminStudentDetailAnswerLogRow[]
  studentBadges: StudentBadgeRow[]
}

function formatStudyTime(totalSeconds: number) {
  if (totalSeconds <= 0) return '0分'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}時間${minutes}分`
  if (minutes > 0) return `${minutes}分`
  return `${seconds}秒`
}

export default function AdminStudentDetailSheet({
  student,
  detail,
  loading,
  error,
  onClose,
}: {
  student: AdminStudentRecord | null
  detail: AdminStudentDetailData | null
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const sessions = detail?.sessions ?? []
  const answerLogs = detail?.answerLogs ?? []
  const studentBadges = detail?.studentBadges ?? []

  const levelInfo = useMemo(() => getLevelInfo(student?.student_xp ?? 0), [student?.student_xp])
  const totalQ = useMemo(() => sessions.reduce((sum, session) => sum + session.total_questions, 0), [sessions])
  const totalC = useMemo(() => sessions.reduce((sum, session) => sum + session.correct_count, 0), [sessions])
  const totalStudySeconds = useMemo(() => sessions.reduce((sum, session) => sum + (session.duration_seconds ?? 0), 0), [sessions])
  const overallRate = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0
  const lastActivity = sessions[0]?.created_at ?? null

  const byField = useMemo(() => {
    const statsMap: Record<string, { total: number; correct: number }> = {}
    sessions.forEach(session => {
      if (!statsMap[session.field]) statsMap[session.field] = { total: 0, correct: 0 }
      statsMap[session.field].total += session.total_questions
      statsMap[session.field].correct += session.correct_count
    })
    return statsMap
  }, [sessions])

  const weakUnits = useMemo(() => {
    const statsMap: Record<string, { field: string; total: number; correct: number }> = {}
    answerLogs.forEach(log => {
      const unit = log.questions?.unit
      const field = log.questions?.field
      if (!unit || !field) return

      const key = `${field}::${unit}`
      if (!statsMap[key]) statsMap[key] = { field, total: 0, correct: 0 }
      statsMap[key].total += 1
      if (log.is_correct) statsMap[key].correct += 1
    })

    return Object.entries(statsMap)
      .map(([key, value]) => ({
        field: value.field,
        unit: key.split('::')[1],
        total: value.total,
        correct: value.correct,
        rate: Math.round((value.correct / value.total) * 100),
      }))
      .filter(unit => unit.total >= 3)
      .sort((left, right) => left.rate - right.rate)
      .slice(0, 8)
  }, [answerLogs])

  const dailyData = useMemo(() => {
    const today = startOfDay(new Date())
    const days = eachDayOfInterval({ start: subDays(today, 29), end: today })
    const statsMap: Record<string, { count: number; correct: number }> = {}

    sessions.forEach(session => {
      const key = format(new Date(session.created_at), 'yyyy-MM-dd')
      if (!statsMap[key]) statsMap[key] = { count: 0, correct: 0 }
      statsMap[key].count += session.total_questions
      statsMap[key].correct += session.correct_count
    })

    return days.map(day => {
      const key = format(day, 'yyyy-MM-dd')
      return { date: day, key, ...(statsMap[key] || { count: 0, correct: 0 }) }
    })
  }, [sessions])

  const streak = useMemo(() => {
    const activeDays = new Set(sessions.map(session => format(new Date(session.created_at), 'yyyy-MM-dd')))
    let count = 0
    let cursor = new Date()
    while (true) {
      const key = format(cursor, 'yyyy-MM-dd')
      if (!activeDays.has(key)) break
      count += 1
      cursor = subDays(cursor, 1)
    }
    return count
  }, [sessions])

  const maxStreak = useMemo(() => {
    const activeDays = Array.from(new Set(sessions.map(session => format(new Date(session.created_at), 'yyyy-MM-dd')))).sort()
    let max = 0
    let current = 0
    let previous: string | null = null

    for (const day of activeDays) {
      if (previous && differenceInCalendarDays(new Date(day), new Date(previous)) === 1) current += 1
      else current = 1
      if (current > max) max = current
      previous = day
    }

    return max
  }, [sessions])

  const weekData = dailyData.slice(-7)
  const weekMax = Math.max(...weekData.map(day => day.count), 1)

  const badgeDetails = useMemo(() => {
    return studentBadges
      .map(record => {
        const badge = BADGE_DEFINITIONS.find(current => current.key === record.badge_key)
        if (!badge) return null
        return {
          ...badge,
          earnedAt: record.earned_at,
        }
      })
      .filter((badge): badge is NonNullable<typeof badge> => badge !== null)
  }, [studentBadges])

  const heatColor = (count: number) => {
    if (count === 0) return 'var(--surface-elevated)'
    if (count < 10) return '#1d4ed8'
    if (count < 30) return '#3b82f6'
    if (count < 60) return '#60a5fa'
    return '#93c5fd'
  }

  if (!student) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(2, 6, 23, 0.76)',
        backdropFilter: 'blur(10px)',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div className="page-shell-wide !max-w-6xl py-6 sm:py-8" onClick={event => event.stopPropagation()}>
        <div className="hero-card science-surface p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Student Detail</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="font-display text-4xl text-sky-300">{student.id}</div>
                <div>
                  <div className="text-2xl font-semibold text-white">{student.nickname}</div>
                  <div className="mt-1 text-xs text-slate-400">PW: <span className="font-mono text-slate-200">{student.password}</span></div>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="btn-secondary">閉じる</button>
          </div>

          {loading ? (
            <div className="mt-6 card text-center text-slate-400">詳細を読み込み中...</div>
          ) : error ? (
            <div className="mt-6 rounded-[24px] border border-rose-500/24 bg-rose-500/8 px-4 py-4 text-sm text-rose-200">
              {error}
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: '総問題数', value: `${totalQ}問`, color: '#3b82f6' },
                  { label: '総合正答率', value: `${overallRate}%`, color: overallRate >= 70 ? '#22c55e' : overallRate >= 50 ? '#f59e0b' : '#ef4444' },
                  { label: '総勉強時間', value: formatStudyTime(totalStudySeconds), color: '#38bdf8' },
                  { label: '現在連続', value: `${streak}日`, color: '#f97316' },
                  { label: '最長連続', value: `${maxStreak}日`, color: '#a855f7' },
                ].map(item => (
                  <div key={item.label} className="card text-center" style={{ padding: '16px 10px' }}>
                    <div className="font-display text-2xl" style={{ color: item.color }}>{item.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
                <div className="card">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Level Progress</div>
                      <div className="mt-2 font-display text-4xl text-white">Lv.{levelInfo.level}</div>
                      <div className="mt-1 text-sm font-semibold text-sky-200">{levelInfo.title}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">TOTAL XP</div>
                      <div className="mt-2 font-display text-3xl text-sky-300">{levelInfo.totalXp}</div>
                    </div>
                  </div>
                  <div className="mt-5 soft-track" style={{ height: 10 }}>
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
                  <div className="mt-4 text-xs text-slate-500">
                    最終学習: {lastActivity ? format(new Date(lastActivity), 'M月d日(E) HH:mm', { locale: ja }) : 'まだ記録がありません'}
                  </div>
                </div>

                <div className="card">
                  <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">分野別正答率</h3>
                  <div className="space-y-3">
                    {Object.entries(FIELD_EMOJI).map(([field, emoji]) => {
                      const current = byField[field]
                      const rate = current && current.total > 0 ? Math.round((current.correct / current.total) * 100) : null
                      const color = FIELD_COLORS[field] ?? '#38bdf8'
                      return (
                        <div key={field}>
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>{emoji}</span>
                              <span className="text-sm font-bold" style={{ color }}>{field}</span>
                              {current && <span className="text-xs text-slate-600">{current.total}問</span>}
                            </div>
                            <span className="text-sm font-bold" style={{ color: rate === null ? '#64748b' : rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>
                              {rate === null ? '—' : `${rate}%`}
                            </span>
                          </div>
                          <div className="soft-track" style={{ height: 8 }}>
                            <div
                              style={{
                                width: `${rate ?? 0}%`,
                                height: '100%',
                                background: `linear-gradient(90deg, ${color}, ${color}80)`,
                                borderRadius: 8,
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="card">
                  <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">今週の学習量</h3>
                  <div className="flex items-end justify-between gap-2" style={{ height: 96 }}>
                    {weekData.map((day, index) => {
                      const height = Math.max(6, Math.round((day.count / weekMax) * 80))
                      const isToday = index === weekData.length - 1
                      return (
                        <div key={day.key} className="flex flex-1 flex-col items-center gap-1">
                          <div className="text-xs text-slate-500" style={{ minHeight: 16 }}>
                            {day.count > 0 ? day.count : ''}
                          </div>
                          <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'flex-end' }}>
                            <div
                              style={{
                                width: '100%',
                                height,
                                background: isToday
                                  ? 'linear-gradient(180deg, #60a5fa, #3b82f6)'
                                  : day.count > 0
                                    ? 'linear-gradient(180deg, #475569, #334155)'
                                    : 'var(--surface-elevated)',
                                borderRadius: '6px 6px 2px 2px',
                              }}
                            />
                          </div>
                          <div className="text-xs" style={{ color: isToday ? '#60a5fa' : '#64748b' }}>
                            {format(day.date, 'E', { locale: ja })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="card">
                  <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">30日間の学習記録</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                    {dailyData.map(day => (
                      <div
                        key={day.key}
                        title={`${format(day.date, 'M/d')} : ${day.count}問`}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 5,
                          background: heatColor(day.count),
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-600">0問</span>
                    {['var(--surface-elevated)', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd'].map(color => (
                      <div key={color} style={{ width: 14, height: 14, borderRadius: 3, background: color }} />
                    ))}
                    <span className="text-xs text-slate-600">100問+</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
                <div className="card">
                  <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">最近の履歴</h3>
                  <div className="space-y-2">
                    {sessions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
                        まだ学習履歴がありません。
                      </div>
                    ) : sessions.slice(0, 20).map(session => {
                      const rate = Math.round((session.correct_count / session.total_questions) * 100)
                      const color = FIELD_COLORS[session.field] ?? '#38bdf8'
                      return (
                        <div key={session.id} className="subcard p-4">
                          <div className="flex items-start gap-3">
                            <span style={{ fontSize: 24, flexShrink: 0 }}>{FIELD_EMOJI[session.field] ?? '🔬'}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold" style={{ color }}>{session.field}</span>
                                <span className="text-xs text-slate-400">{session.unit}</span>
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">{format(new Date(session.created_at), 'M月d日(E) HH:mm', { locale: ja })}</div>
                              <div className="mt-2 flex overflow-hidden rounded-full" style={{ height: 5 }}>
                                <div style={{ width: `${rate}%`, background: '#22c55e' }} />
                                <div style={{ width: `${100 - rate}%`, background: '#ef444440' }} />
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-bold" style={{ color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>
                                {session.correct_count}<span className="text-sm text-slate-500">/{session.total_questions}</span>
                              </div>
                              <div className="text-xs" style={{ color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>{rate}%</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="card">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">弱点単元</h3>
                    <p className="mb-4 text-xs text-slate-500">3問以上解いた単元を正答率の低い順に表示</p>
                    <div className="space-y-3">
                      {weakUnits.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
                          まだ弱点分析に十分な記録がありません。
                        </div>
                      ) : weakUnits.map(unit => {
                        const color = FIELD_COLORS[unit.field] ?? '#38bdf8'
                        return (
                          <div key={`${unit.field}-${unit.unit}`} className="rounded-2xl border p-4" style={{ borderColor: `${color}26`, background: `${color}10` }}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${color}20`, color }}>{unit.field}</span>
                                  <span className="truncate text-sm font-semibold text-white">{unit.unit}</span>
                                </div>
                                <div className="mt-2 text-xs text-slate-400">{unit.correct} / {unit.total} 正解</div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold" style={{ color: unit.rate < 50 ? '#ef4444' : '#f59e0b' }}>{unit.rate}%</div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">獲得バッジ</h3>
                    <div className="space-y-3">
                      {badgeDetails.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
                          まだ獲得バッジはありません。
                        </div>
                      ) : badgeDetails.map(badge => (
                        <div key={`${badge.key}-${badge.earnedAt}`} className={`badge-toast badge-toast--${badge.rarity}`}>
                          <div className="text-2xl">{badge.iconEmoji}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-white">{badge.name}</span>
                              <span className="text-[10px] tracking-[0.18em] text-slate-400">{getBadgeRarityLabel(badge.rarity)}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-300">{badge.description}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {format(new Date(badge.earnedAt), 'M月d日(E) HH:mm', { locale: ja })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
