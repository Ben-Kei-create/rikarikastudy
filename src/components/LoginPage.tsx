'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { fetchStudents, LOGIN_STUDENTS, type StudentRecord, useAuth } from '@/lib/auth'
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

function getStudentModeMeta(studentId: number, lockEnabled = true) {
  if (studentId === GUEST_STUDENT_ID) {
    return {
      badge: 'ゲスト',
      detail: 'PWなし / 記録は当日分のみ',
    }
  }

  if (!lockEnabled) {
    return {
      badge: 'ロック解除',
      detail: 'PW なしで直接ログイン',
    }
  }

  return {
    badge: '通常ログイン',
    detail: 'パスワードを入力してログイン',
  }
}

// ── Kana index ──────────────────────────────────────────────────────────────

const KANA_ROWS: { label: string; from: number; to: number }[] = [
  { label: 'あ', from: 0x3042, to: 0x304a },
  { label: 'か', from: 0x304b, to: 0x3054 },
  { label: 'さ', from: 0x3055, to: 0x305e },
  { label: 'た', from: 0x305f, to: 0x3069 },
  { label: 'な', from: 0x306a, to: 0x306e },
  { label: 'は', from: 0x306f, to: 0x307d },
  { label: 'ま', from: 0x307e, to: 0x3082 },
  { label: 'や', from: 0x3084, to: 0x3088 },
  { label: 'ら', from: 0x3089, to: 0x308d },
  { label: 'わ', from: 0x308f, to: 0x3093 },
]

const KANA_LABELS = new Set(KANA_ROWS.map(r => r.label))

const GROUP_ORDER = [
  'あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '他',
]

function getKanaGroup(nickname: string): string {
  const first = nickname[0]
  if (!first) return '他'
  let code = first.charCodeAt(0)
  // Katakana → Hiragana
  if (code >= 0x30a1 && code <= 0x30f6) code -= 0x60
  for (const row of KANA_ROWS) {
    if (code >= row.from && code <= row.to) return row.label
  }
  // Latin
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
    return first.toUpperCase()
  }
  return '他'
}

// ── Interfaces ───────────────────────────────────────────────────────────────

interface WeeklyLeaderboardEntry {
  studentId: number
  nickname: string
  weeklyXp: number
  level: number
  title: string
  rank: number
}

// ── StudentPicker ─────────────────────────────────────────────────────────────

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
  const isSearching = searchValue.trim().length > 0

  const filteredStudents = useMemo(
    () => filterStudents(students, searchValue),
    [students, searchValue],
  )

  const groupedStudents = useMemo(() => {
    if (isSearching) return null
    const map = new Map<string, StudentRecord[]>()
    for (const student of students) {
      const g = getKanaGroup(student.nickname)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(student)
    }
    return GROUP_ORDER.filter(g => map.has(g)).map(g => ({ group: g, students: map.get(g)! }))
  }, [students, isSearching])

  const groupHeaderRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const scrollToGroup = (group: string) => {
    groupHeaderRefs.current.get(group)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const selectedStudent = students.find(s => s.id === selectedId) ?? students[0] ?? null
  const selectedAvatar = selectedStudent ? getStudentAvatarMeta(selectedStudent.id) : null
  const selectedMeta = selectedStudent ? getStudentModeMeta(selectedStudent.id, selectedStudent.lock_enabled) : null

  const renderStudentItem = (student: StudentRecord) => {
    const checked = selectedId === student.id
    const avatar = getStudentAvatarMeta(student.id)
    const meta = getStudentModeMeta(student.id, student.lock_enabled)

    return (
      <label
        key={student.id}
        className="flex cursor-pointer items-center gap-2.5 rounded-[16px] border px-3 py-2 transition-colors sm:px-3.5"
        style={{
          borderColor: checked ? 'rgba(86, 168, 255, 0.28)' : 'var(--surface-elevated-border)',
          background: checked
            ? 'linear-gradient(180deg, rgba(10, 132, 255, 0.12), rgba(10, 132, 255, 0.06))'
            : 'var(--surface-elevated)',
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
          style={{
            background: avatar.background,
            border: `1px solid ${checked ? 'rgba(191, 219, 254, 0.4)' : avatar.borderColor}`,
            boxShadow: checked ? '0 8px 18px rgba(59, 130, 246, 0.12)' : avatar.glow,
          }}
          aria-hidden="true"
        >
          {avatar.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate font-semibold text-white">{student.nickname}</div>
            {student.id === GUEST_STUDENT_ID && (
              <span className="text-[10px] font-semibold text-sky-200/60">ゲスト</span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            ID {student.id} ・ {meta.detail}
          </div>
        </div>
        <div
          className="shrink-0 text-[10px] font-semibold"
          style={{ color: checked ? '#7dd3fc' : '#64748b' }}
        >
          {checked ? '選択中' : ''}
        </div>
      </label>
    )
  }

  const showIndex = !isSearching && groupedStudents !== null && groupedStudents.length > 1

  return (
    <div className="rounded-[26px] border border-white/8 bg-slate-950/28 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200">{title}</div>
          <div className="mt-1 text-base font-semibold text-white sm:text-lg">{subtitle}</div>
        </div>
        <div className="text-[11px] text-slate-500">{students.length}人</div>
      </div>

      {selectedStudent && selectedAvatar && selectedMeta && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[18px] bg-sky-300/5 px-3 py-2.5 sm:px-3.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
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
              <div className="truncate text-sm font-semibold text-white sm:text-base">{selectedStudent.nickname}</div>
              <span className="text-[10px] font-semibold text-sky-100/60">ID {selectedStudent.id}</span>
            </div>
            <div className="mt-0.5 text-xs leading-5 text-slate-300">{selectedMeta.detail}</div>
          </div>
          <div className="hidden text-[11px] font-semibold text-sky-200 sm:block">{selectedMeta.badge}</div>
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

      <div className={`mt-3 flex gap-1 overflow-hidden ${compact ? 'max-h-56' : 'max-h-72'}`}>
        <div className="flex-1 overflow-y-auto pr-1">
          {isSearching ? (
            filteredStudents.length > 0 ? (
              <div className="grid gap-2">{filteredStudents.map(renderStudentItem)}</div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-700 px-3 py-5 text-center text-sm text-slate-500">
                一致する生徒が見つかりません。
              </div>
            )
          ) : groupedStudents && groupedStudents.length > 0 ? (
            <div className="grid gap-3">
              {groupedStudents.map(({ group, students: groupStudents }) => (
                <div key={group}>
                  <div
                    ref={el => {
                      if (el) groupHeaderRefs.current.set(group, el)
                      else groupHeaderRefs.current.delete(group)
                    }}
                    className="mb-1.5 px-1 text-[10px] font-semibold tracking-[0.14em] text-slate-500"
                  >
                    {KANA_LABELS.has(group) ? `${group}行` : group}
                  </div>
                  <div className="grid gap-2">{groupStudents.map(renderStudentItem)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-slate-700 px-3 py-5 text-center text-sm text-slate-500">
              生徒が見つかりません。
            </div>
          )}
        </div>

        {showIndex && (
          <div className="flex flex-col items-center gap-px py-1">
            {groupedStudents!.map(({ group }) => (
              <button
                key={group}
                type="button"
                onClick={() => scrollToGroup(group)}
                className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold text-slate-500 transition-colors hover:text-sky-300"
              >
                {group}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 text-[11px] text-slate-500">
        {isSearching ? `表示 ${filteredStudents.length} / ${students.length}` : `${students.length}人`}
      </div>
    </div>
  )
}

// ── LoginPage ─────────────────────────────────────────────────────────────────

export default function LoginPage({
  onDone,
  onAdmin,
}: {
  onDone: () => void
  onAdmin: () => void
}) {
  const { login, register, notice } = useAuth()
  const [studentId, setStudentId] = useState(1)
  const [students, setStudents] = useState(LOGIN_STUDENTS)
  const [studentSearch, setStudentSearch] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [regNickname, setRegNickname] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState('')
  const [regSubmitting, setRegSubmitting] = useState(false)
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
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (students.length === 0) return
    if (!students.some(student => student.id === studentId)) {
      setStudentId(students[0]?.id ?? 1)
    }
  }, [studentId, students])

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
        .map(({ total: _total, ...entry }, index) => ({ ...entry, rank: index + 1 }))

      setWeeklyLeaderboard(ranked)
      setWeeklyLeaderboardLoading(false)
    }

    void loadWeeklyLeaderboard()

    return () => { active = false }
  }, [currentWeekRange.startDate])

  const isGuest = studentId === GUEST_STUDENT_ID
  const selectedStudentRecord = students.find(s => s.id === studentId) ?? null
  const isLocked = selectedStudentRecord?.lock_enabled !== false
  const needsPassword = !isGuest && isLocked

  const handleLogin = async () => {
    setSubmitting(true)
    const result = await login(studentId, needsPassword ? pw : '')
    setSubmitting(false)

    if (result.ok) {
      setError('')
      onDone()
      return
    }

    setError(result.message)
    setShakeKey(current => current + 1)
    if (!isGuest) setPw('')
  }

  const handleRegister = async () => {
    setRegSubmitting(true)
    setRegError('')
    setRegSuccess('')
    const result = await register({ nickname: regNickname, password: regPassword })
    setRegSubmitting(false)

    if (result.ok) {
      setRegSuccess(result.message)
      setRegNickname('')
      setRegPassword('')
      fetchStudents().then(data => {
        setStudents([LOGIN_STUDENTS[0], ...data])
      })
    } else {
      setRegError(result.message)
    }
  }

  return (
    <div className="page-shell page-shell-dashboard flex min-h-screen items-start justify-center py-4 sm:py-6 lg:items-center">
      <div className="w-full max-w-6xl">
        <div className="hero-card science-surface w-full anim-fade-up px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <ScienceBackdrop />

          <div className="grid gap-4 sm:gap-5 lg:gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            {/* ── Left column ── */}
            <div className="order-2 lg:order-1">
              <div className="text-center lg:text-left">
                <div
                  className="text-[11px] font-semibold tracking-[0.28em] uppercase"
                  style={{ color: 'var(--color-sky-label)' }}
                >
                  Science Study
                </div>
                <div
                  className="font-display mt-3 text-[3rem] leading-none sm:text-[4rem]"
                  style={{
                    background: 'var(--hero-text-gradient)',
                    WebkitBackgroundClip: 'text',
                    color: 'transparent',
                    filter: 'drop-shadow(0 18px 34px var(--hero-text-shadow))',
                  }}
                >
                  RikaQuiz
                </div>
                <h2
                  className="font-display mt-4 text-[1.9rem] tracking-[0.18em] text-white sm:text-[2.2rem]"
                  style={{ textShadow: '0 14px 28px var(--hero-text-shadow)' }}
                >
                  Login
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-300 lg:mx-0">
                  生徒を選んで、パスワードを入力するだけでログインできます。
                </p>
              </div>

              {/* Weekly Ranking */}
              {(weeklyLeaderboardLoading || weeklyLeaderboard.length > 0) && (
                <div className="mt-5 rounded-[24px] border border-white/8 bg-slate-950/28 px-4 py-3 sm:px-5 sm:py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">Weekly Ranking</div>
                      <div className="mt-1 text-sm font-semibold text-white">今週のランキング</div>
                    </div>
                    <div className="text-[11px] text-slate-500">{weekRangeLabel}</div>
                  </div>

                  <div className="mt-3 max-h-48 overflow-y-auto pr-1 md:max-h-60">
                    {weeklyLeaderboardLoading ? (
                      <div className="px-1 py-3 text-xs text-slate-500">読み込み中...</div>
                    ) : (
                      <div className="space-y-2">
                        {weeklyLeaderboard.map(entry => (
                          <div
                            key={`${entry.studentId}-${entry.rank}`}
                            className="flex items-center justify-between gap-3 border-b border-white/8 pb-2 last:border-b-0 last:pb-0"
                          >
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
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right column ── */}
            <div className="order-1 lg:order-2 rounded-[32px] border border-white/8 bg-slate-950/40 p-4 sm:p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200">Student Login</div>
                  <div className="mt-1 font-display text-2xl text-white sm:text-[2rem]">生徒を選んでログイン</div>
                </div>
                <div className="text-[11px] text-slate-500">{students.length} IDs</div>
              </div>

              {notice && (
                <div
                  className="info-banner mt-4 text-sm"
                  style={{ background: 'var(--color-warning-soft-bg)', borderColor: 'var(--color-warning-soft-border)', color: 'var(--color-warning-muted)' }}
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
                {!needsPassword ? (
                  <div
                    className="info-banner text-sm"
                    style={{ background: 'var(--color-accent-soft-bg)', borderColor: 'var(--color-accent-soft-border)', color: '#bae6fd' }}
                  >
                    {isGuest
                      ? 'ゲストは PW なしでそのまま開始できます。記録は毎日リセットされます。'
                      : 'ロック解除中です。PW なしでそのままログインできます。'}
                  </div>
                ) : (
                  <div key={shakeKey} className={error ? 'anim-shake' : ''}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password</div>
                    <input
                      type="password"
                      value={pw}
                      onChange={event => setPw(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') void handleLogin()
                      }}
                      placeholder="Password"
                      className="input-surface text-center text-xl tracking-[0.22em]"
                      style={{ borderColor: error ? 'var(--color-danger)' : undefined }}
                    />
                    {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
                  </div>
                )}
              </div>

              {!needsPassword && error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}

              <button
                onClick={() => void handleLogin()}
                className="btn-primary mt-4 w-full"
                disabled={submitting}
                style={{ opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'ログイン中...' : isGuest ? 'ゲストで始める' : 'ログイン'}
              </button>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
                <button
                  onClick={() => {
                    setRegisterOpen(prev => !prev)
                    setRegError('')
                    setRegSuccess('')
                  }}
                  className="font-semibold text-slate-200 transition-colors hover:text-white"
                >
                  {registerOpen ? '新規登録を閉じる' : '新規登録'}
                </button>

                <button
                  onClick={onAdmin}
                  className="text-slate-400 transition-colors hover:text-slate-200"
                >
                  もぎ先生ログイン
                </button>
              </div>

              {registerOpen && (
                <div className="mt-5 rounded-[24px] border border-emerald-300/12 bg-slate-950/34 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.18em] uppercase text-emerald-200">Registration</div>
                      <div className="mt-2 font-display text-2xl text-white">新規ユーザー登録</div>
                    </div>
                    <button
                      onClick={() => setRegisterOpen(false)}
                      className="text-sm text-slate-400 transition-colors hover:text-slate-200"
                    >
                      閉じる
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    ニックネームとパスワードを決めて登録してください。IDは自動で発行されます。管理者が承認するまで一部の機能は制限されます。
                  </p>

                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Nickname</div>
                      <input
                        type="text"
                        value={regNickname}
                        onChange={event => setRegNickname(event.target.value)}
                        placeholder="ニックネーム"
                        className="input-surface text-center text-lg"
                        maxLength={20}
                      />
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password</div>
                      <input
                        type="password"
                        value={regPassword}
                        onChange={event => setRegPassword(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void handleRegister()
                        }}
                        placeholder="パスワード（4文字以上）"
                        className="input-surface text-center text-lg tracking-[0.18em]"
                      />
                    </div>
                  </div>

                  {regError && <p className="mt-3 text-center text-sm text-red-400">{regError}</p>}
                  {regSuccess && (
                    <div
                      className="info-banner mt-3 text-sm"
                      style={{ background: 'rgba(52, 211, 153, 0.1)', borderColor: 'rgba(52, 211, 153, 0.25)', color: '#6ee7b7' }}
                    >
                      {regSuccess}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
                    <button
                      onClick={() => void handleRegister()}
                      className="font-semibold text-emerald-200 transition-colors hover:text-white disabled:text-slate-500"
                      disabled={regSubmitting || !regNickname.trim() || !regPassword.trim()}
                    >
                      {regSubmitting ? '登録中...' : '登録する'}
                    </button>
                    <button onClick={() => setRegisterOpen(false)} className="text-slate-400 transition-colors hover:text-slate-200">
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
