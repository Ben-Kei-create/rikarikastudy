'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { fetchStudents, LOGIN_STUDENTS, type StudentRecord, useAuth } from '@/lib/auth'
import { LoginUpdateRow, isLoginUpdatesTableMissing } from '@/lib/loginUpdates'
import { supabase } from '@/lib/supabase'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { GUEST_STUDENT_ID } from '@/lib/guestStudy'
import { getStudentAvatarMeta } from '@/lib/studentAvatar'
import { calculateQuizXp, getJstWeekRange, getLevelInfo } from '@/lib/engagement'

function filterStudents(students: StudentRecord[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return students

  return students.filter(student => {
    const haystack = `${student.id} ${student.nickname}`.toLowerCase()
    return haystack.includes(normalized)
  })
}

function getStudentModeMeta(studentId: number) {
  if (studentId === GUEST_STUDENT_ID) {
    return {
      badge: 'ゲスト',
      detail: 'PWなし / 記録は当日分のみ',
    }
  }

  return {
    badge: '通常ログイン',
    detail: 'パスワードを入力してログイン',
  }
}

interface WeeklyLeaderboardEntry {
  studentId: number
  nickname: string
  weeklyXp: number
  level: number
  title: string
  rank: number
}

function StudentPicker({
  title,
  subtitle,
  students,
  selectedId,
  onSelect,
  searchValue,
  onSearchChange,
  compact = false,
}: {
  title: string
  subtitle: string
  students: StudentRecord[]
  selectedId: number
  onSelect: (studentId: number) => void
  searchValue: string
  onSearchChange: (value: string) => void
  compact?: boolean
}) {
  const filteredStudents = useMemo(
    () => filterStudents(students, searchValue),
    [students, searchValue],
  )
  const selectedStudent = students.find(student => student.id === selectedId) ?? students[0] ?? null
  const selectedAvatar = selectedStudent ? getStudentAvatarMeta(selectedStudent.id) : null
  const selectedMeta = selectedStudent ? getStudentModeMeta(selectedStudent.id) : null

  return (
    <div className="rounded-[28px] border border-white/10 bg-slate-950/34 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200">{title}</div>
          <div className="mt-1 text-base font-semibold text-white sm:text-lg">{subtitle}</div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-400">
          {students.length}人
        </div>
      </div>

      {selectedStudent && selectedAvatar && selectedMeta && (
        <div
          className="mt-4 rounded-[24px] border p-3.5 sm:p-4"
          style={{
            borderColor: 'rgba(125, 211, 252, 0.2)',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1), var(--card-gradient-base-soft))',
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">選択中</div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
              style={{
                background: selectedAvatar.background,
                border: `1px solid ${selectedAvatar.borderColor}`,
                boxShadow: selectedAvatar.glow,
              }}
              aria-hidden="true"
            >
              {selectedAvatar.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate font-display text-2xl text-white">{selectedStudent.nickname}</div>
                <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold text-sky-100">
                  ID {selectedStudent.id}
                </span>
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-300">{selectedMeta.detail}</div>
            </div>
            <div className="hidden rounded-full border border-emerald-300/22 bg-emerald-300/10 px-3 py-1 text-[11px] font-semibold text-emerald-200 sm:block">
              {selectedMeta.badge}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4">
        <input
          type="text"
          value={searchValue}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="ID / 名前で絞り込み"
          className="input-surface !rounded-[18px] !px-4 !py-3 text-sm"
        />
      </div>

      <div className={`mt-3 overflow-y-auto pr-1 ${compact ? 'max-h-56' : 'max-h-72'}`}>
        {filteredStudents.length > 0 ? (
          <div className="grid gap-2.5">
            {filteredStudents.map(student => {
              const checked = selectedId === student.id
              const avatar = getStudentAvatarMeta(student.id)
              const meta = getStudentModeMeta(student.id)

              return (
                <label
                  key={student.id}
                  className="flex cursor-pointer items-center gap-3 rounded-[22px] border px-3 py-3 transition-all sm:px-4"
                  style={{
                    borderColor: checked ? 'rgba(86, 168, 255, 0.5)' : 'var(--surface-elevated-border)',
                    background: checked
                      ? 'linear-gradient(180deg, rgba(10, 132, 255, 0.22), rgba(10, 132, 255, 0.12))'
                      : 'var(--surface-elevated)',
                    boxShadow: checked ? '0 14px 28px rgba(10, 132, 255, 0.16)' : 'none',
                  }}
                >
                  <input
                    type="radio"
                    name={compact ? 'onlineStudentId' : 'studentId'}
                    value={student.id}
                    checked={checked}
                    onChange={() => onSelect(student.id)}
                    className="sr-only"
                  />
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
                    style={{
                      background: avatar.background,
                      border: `1px solid ${checked ? 'rgba(191, 219, 254, 0.48)' : avatar.borderColor}`,
                      boxShadow: checked ? '0 12px 26px rgba(59, 130, 246, 0.18)' : avatar.glow,
                    }}
                    aria-hidden="true"
                  >
                    {avatar.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-semibold text-white">{student.nickname}</div>
                      {student.id === GUEST_STUDENT_ID && (
                        <span className="rounded-full border border-sky-300/18 bg-sky-300/10 px-2 py-0.5 text-[10px] font-semibold text-sky-100">
                          ゲスト
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      ID {student.id} ・ {meta.detail}
                    </div>
                  </div>
                  <div
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                    style={{
                      background: checked ? 'rgba(125, 211, 252, 0.16)' : 'rgba(255, 255, 255, 0.06)',
                      color: checked ? '#e0f2fe' : '#94a3b8',
                    }}
                  >
                    {checked ? '選択中' : '選ぶ'}
                  </div>
                </label>
              )
            })}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-slate-700 px-3 py-5 text-center text-sm text-slate-500">
            一致する生徒が見つかりません。
          </div>
        )}
      </div>

      <div className="mt-3 text-[11px] text-slate-500">
        表示 {filteredStudents.length} / {students.length}
      </div>
    </div>
  )
}

export default function LoginPage({
  onDone,
  onOnline,
  onAdmin,
}: {
  onDone: () => void
  onOnline: () => void
  onAdmin: () => void
}) {
  const { login, notice } = useAuth()
  const [studentId, setStudentId] = useState(1)
  const [students, setStudents] = useState(LOGIN_STUDENTS)
  const [studentSearch, setStudentSearch] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [onlineOpen, setOnlineOpen] = useState(false)
  const [onlineStudentId, setOnlineStudentId] = useState(1)
  const [onlineStudentSearch, setOnlineStudentSearch] = useState('')
  const [onlinePw, setOnlinePw] = useState('')
  const [onlineError, setOnlineError] = useState('')
  const [onlineSubmitting, setOnlineSubmitting] = useState(false)
  const [loginUpdates, setLoginUpdates] = useState<LoginUpdateRow[]>([])
  const [loginUpdatesLoading, setLoginUpdatesLoading] = useState(true)
  const [showLoginUpdates, setShowLoginUpdates] = useState(true)
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<WeeklyLeaderboardEntry[]>([])
  const [weeklyLeaderboardLoading, setWeeklyLeaderboardLoading] = useState(true)
  const currentWeekRange = useMemo(() => getJstWeekRange(), [])
  const weekRangeLabel = useMemo(() => {
    const endDate = new Date(currentWeekRange.endDate.getTime() - 1)
    return `${format(currentWeekRange.startDate, 'M/d', { locale: ja })} 〜 ${format(endDate, 'M/d', { locale: ja })}`
  }, [currentWeekRange.endDate, currentWeekRange.startDate])

  useEffect(() => {
    let active = true
    fetchStudents().then(data => {
      if (active) setStudents([LOGIN_STUDENTS[0], ...data])
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (students.length === 0) return

    if (!students.some(student => student.id === studentId)) {
      setStudentId(students[0]?.id ?? 1)
    }

    const firstOnlineStudentId = students.find(student => student.id !== GUEST_STUDENT_ID)?.id ?? 1
    if (!students.some(student => student.id === onlineStudentId && student.id !== GUEST_STUDENT_ID)) {
      setOnlineStudentId(firstOnlineStudentId)
    }
  }, [onlineStudentId, studentId, students])

  useEffect(() => {
    let active = true

    const loadLoginUpdates = async () => {
      const { data, error } = await supabase
        .from('login_updates')
        .select('*')
        .gte('created_at', subDays(new Date(), 3).toISOString())
        .order('created_at', { ascending: false })
        .limit(10)

      if (!active) return

      if (error) {
        if (!isLoginUpdatesTableMissing(error)) {
          console.error('[login] failed to load login updates', error)
          setShowLoginUpdates(true)
        } else {
          setShowLoginUpdates(false)
        }
        setLoginUpdates([])
        setLoginUpdatesLoading(false)
        return
      }

      setLoginUpdates((data || []) as LoginUpdateRow[])
      setLoginUpdatesLoading(false)
      setShowLoginUpdates(true)
    }

    void loadLoginUpdates()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadWeeklyLeaderboard = async () => {
      setWeeklyLeaderboardLoading(true)
      const [fetchedStudents, sessionsResponse] = await Promise.all([
        fetchStudents(),
        supabase
          .from('quiz_sessions')
          .select('student_id, correct_count, total_questions, duration_seconds')
          .gte('created_at', currentWeekRange.startDate.toISOString()),
      ])

      if (!active) return

      if (sessionsResponse.error) {
        console.error('[login] failed to load weekly leaderboard', sessionsResponse.error)
        setWeeklyLeaderboard([])
        setWeeklyLeaderboardLoading(false)
        return
      }

      const studentMap = new Map(fetchedStudents.map(student => [student.id, student]))
      const aggregateMap = new Map<number, { correct: number; total: number; duration: number }>()

      for (const row of sessionsResponse.data || []) {
        if (!row.student_id || row.student_id === GUEST_STUDENT_ID || row.student_id === 5) continue
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
          }
        })
        .sort((left, right) => {
          if (right.weeklyXp !== left.weeklyXp) return right.weeklyXp - left.weeklyXp
          return right.total - left.total
        })
        .slice(0, 7)
        .map(({ total: _total, ...entry }, index) => ({
          ...entry,
          rank: index + 1,
        }))

      setWeeklyLeaderboard(ranked)
      setWeeklyLeaderboardLoading(false)
    }

    void loadWeeklyLeaderboard()

    return () => {
      active = false
    }
  }, [currentWeekRange.startDate])

  const isGuest = studentId === GUEST_STUDENT_ID
  const onlineStudents = useMemo(
    () => students.filter(student => student.id !== GUEST_STUDENT_ID),
    [students],
  )

  const handleLogin = async () => {
    setSubmitting(true)
    const result = await login(studentId, isGuest ? '' : pw)
    setSubmitting(false)

    if (result.ok) {
      setError('')
      onDone()
      return
    }

    setError(result.message)
    setShakeKey(current => current + 1)
    if (!isGuest) {
      setPw('')
    }
  }

  const handleOnlineLogin = async () => {
    setOnlineSubmitting(true)
    const result = await login(onlineStudentId, onlinePw)
    setOnlineSubmitting(false)

    if (result.ok) {
      setOnlineError('')
      setOnlinePw('')
      setOnlineOpen(false)
      onOnline()
      return
    }

    setOnlineError(result.message)
  }

  return (
    <div className="page-shell page-shell-dashboard flex min-h-screen items-start justify-center py-4 sm:py-6 lg:items-center">
      <div className="w-full max-w-6xl">
        <div className="hero-card science-surface w-full anim-fade-up px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <ScienceBackdrop />

          <div className="grid gap-4 sm:gap-5 lg:gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div className="order-2 lg:order-1">
              <div className="text-center lg:text-left">
                <div
                  className="text-[11px] font-semibold tracking-[0.28em] uppercase"
                  style={{ color: '#8cc7ff' }}
                >
                  Science Study
                </div>
                <div
                  className="font-display mt-3 text-[3rem] leading-none sm:text-[4rem]"
                  style={{
                    background: 'linear-gradient(135deg, #f8fbff 0%, #93c5fd 42%, #38bdf8 100%)',
                    WebkitBackgroundClip: 'text',
                    color: 'transparent',
                    filter: 'drop-shadow(0 18px 34px rgba(56, 189, 248, 0.24))',
                  }}
                >
                  RikaQuiz
                </div>
                <h2
                  className="font-display mt-4 text-[1.9rem] tracking-[0.18em] text-white sm:text-[2.2rem]"
                  style={{ textShadow: '0 14px 28px rgba(56, 189, 248, 0.18)' }}
                >
                  Login
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-300 lg:mx-0">
                  生徒を選んで、そのままパスワード入力。ID が増えても検索とスクロールで迷わず使えるログイン画面にしています。
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="subcard px-4 py-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Smooth Select</div>
                  <div className="mt-2 text-sm font-semibold text-white">検索つきの生徒一覧</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">人数が増えても、スクロールで選びやすい構成です。</div>
                </div>
                <div className="subcard px-4 py-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Guest Ready</div>
                  <div className="mt-2 text-sm font-semibold text-white">ゲスト体験もすぐ開始</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">パスワード不要で、その日の学習だけさっと試せます。</div>
                </div>
                <div className="subcard px-4 py-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Online Lab</div>
                  <div className="mt-2 text-sm font-semibold text-white">オンライン導線も同じ操作感</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">通常ログインと同じ並びで、生徒を迷わず選べます。</div>
                </div>
              </div>

              {showLoginUpdates && (
                <div className="mt-5 rounded-[24px] border border-white/10 bg-slate-950/38 px-4 py-3 sm:px-5 sm:py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">Update Board</div>
                      <div className="mt-1 text-sm font-semibold text-white">直近3日のアップデート</div>
                    </div>
                    <div className="text-[11px] text-slate-500">{loginUpdates.length}件</div>
                  </div>

                  <div className="mt-3 max-h-40 overflow-y-auto pr-1 md:max-h-56">
                    {loginUpdatesLoading ? (
                      <div className="px-1 py-3 text-xs text-slate-500">
                        掲示板を読み込み中...
                      </div>
                    ) : loginUpdates.length > 0 ? (
                      <div className="space-y-3">
                        {loginUpdates.map(update => (
                          <div key={update.id} className="border-b border-white/8 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-white">{update.title}</div>
                                <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-300">{update.body}</div>
                              </div>
                              <div className="shrink-0 text-[10px] text-slate-500">
                                {format(new Date(update.created_at), 'M/d HH:mm', { locale: ja })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-1 py-3 text-xs text-slate-500">
                        直近のアップデートはまだありません。
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-5 rounded-[24px] border border-white/10 bg-slate-950/38 px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">Weekly Ranking</div>
                    <div className="mt-1 text-sm font-semibold text-white">今週のランキング</div>
                  </div>
                  <div className="text-[11px] text-slate-500">{weekRangeLabel}</div>
                </div>

                <div className="mt-3 max-h-48 overflow-y-auto pr-1 md:max-h-60">
                  {weeklyLeaderboardLoading ? (
                    <div className="px-1 py-3 text-xs text-slate-500">
                      ランキングを読み込み中...
                    </div>
                  ) : weeklyLeaderboard.length > 0 ? (
                    <div className="space-y-2">
                      {weeklyLeaderboard.map(entry => (
                        <div key={`${entry.studentId}-${entry.rank}`} className="flex items-center justify-between gap-3 border-b border-white/8 pb-2 last:border-b-0 last:pb-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-sky-100">
                                {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}.`}
                              </div>
                              <div className="truncate text-sm font-semibold text-white">{entry.nickname}</div>
                              <div className="text-[10px] text-slate-500">Lv.{entry.level}</div>
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">{entry.title}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-display text-xl text-sky-300">{entry.weeklyXp}</div>
                            <div className="text-[10px] text-slate-500">XP</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-1 py-3 text-xs text-slate-500">
                      まだ今週の記録はありません。
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2 rounded-[32px] border border-white/10 bg-slate-950/44 p-4 sm:p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200">Student Login</div>
                  <div className="mt-1 font-display text-2xl text-white sm:text-[2rem]">生徒を選んでログイン</div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-400">
                  {students.length} IDs
                </div>
              </div>

              {notice && (
                <div
                  className="info-banner mt-4 text-sm"
                  style={{ background: 'rgba(245, 158, 11, 0.14)', borderColor: 'rgba(245, 158, 11, 0.28)', color: '#fcd34d' }}
                >
                  {notice}
                </div>
              )}

              <div className="mt-4">
                <StudentPicker
                  title="Student ID"
                  subtitle="ログインする生徒を選択"
                  students={students}
                  selectedId={studentId}
                  onSelect={nextStudentId => {
                    setStudentId(nextStudentId)
                    setError('')
                    setPw('')
                  }}
                  searchValue={studentSearch}
                  onSearchChange={setStudentSearch}
                />
              </div>

              <div className="mt-4">
                {isGuest ? (
                  <div
                    className="info-banner text-sm"
                    style={{ background: 'rgba(56, 189, 248, 0.12)', borderColor: 'rgba(56, 189, 248, 0.22)', color: '#bae6fd' }}
                  >
                    ゲストは PW なしでそのまま開始できます。記録は毎日リセットされます。
                  </div>
                ) : (
                  <div key={shakeKey} className={error ? 'anim-shake' : ''}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password</div>
                    <input
                      type="password"
                      value={pw}
                      onChange={event => setPw(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          void handleLogin()
                        }
                      }}
                      placeholder="Password"
                      className="input-surface text-center text-xl tracking-[0.22em]"
                      style={{
                        borderColor: error ? '#ef4444' : undefined,
                      }}
                    />
                    {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
                  </div>
                )}
              </div>

              {isGuest && error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}

              <button
                onClick={() => void handleLogin()}
                className="btn-primary mt-4 w-full"
                disabled={submitting}
                style={{ opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'ログイン中...' : isGuest ? 'ゲストで始める' : 'ログイン'}
              </button>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => {
                    setOnlineStudentId(studentId === GUEST_STUDENT_ID ? onlineStudents[0]?.id ?? 1 : studentId)
                    setOnlinePw('')
                    setOnlineError('')
                    setOnlineStudentSearch('')
                    setOnlineOpen(true)
                  }}
                  className="btn-ghost w-full"
                >
                  オンライン
                </button>

                <button
                  onClick={onAdmin}
                  className="btn-secondary w-full"
                >
                  もぎ先生ログイン
                </button>
              </div>

              {onlineOpen && (
                <div className="mt-5 rounded-[28px] border border-sky-300/16 bg-slate-950/45 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.18em] uppercase text-sky-200">Online Lab</div>
                      <div className="mt-2 font-display text-2xl text-white">オンライン入室</div>
                    </div>
                    <button
                      onClick={() => setOnlineOpen(false)}
                      className="btn-ghost !px-4 !py-2"
                    >
                      閉じる
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">毎回 ID / PW で入室します。</p>

                  <div className="mt-4">
                    <StudentPicker
                      title="Online ID"
                      subtitle="オンライン参加する生徒を選択"
                      students={onlineStudents}
                      selectedId={onlineStudentId}
                      onSelect={nextStudentId => {
                        setOnlineStudentId(nextStudentId)
                        setOnlineError('')
                        setOnlinePw('')
                      }}
                      searchValue={onlineStudentSearch}
                      onSearchChange={setOnlineStudentSearch}
                      compact
                    />
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password</div>
                    <input
                      type="password"
                      value={onlinePw}
                      onChange={event => setOnlinePw(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          void handleOnlineLogin()
                        }
                      }}
                      placeholder="Password"
                      className="input-surface text-center text-xl tracking-[0.22em]"
                    />
                    {onlineError && <p className="mt-3 text-center text-sm text-red-400">{onlineError}</p>}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => void handleOnlineLogin()}
                      className="btn-primary w-full"
                      disabled={onlineSubmitting || !onlinePw.trim()}
                      style={{ opacity: onlineSubmitting || !onlinePw.trim() ? 0.7 : 1 }}
                    >
                      {onlineSubmitting ? '入室中...' : 'オンラインへ入る'}
                    </button>
                    <button onClick={() => setOnlineOpen(false)} className="btn-secondary w-full">
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
