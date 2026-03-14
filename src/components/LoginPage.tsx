'use client'
import { useEffect, useState } from 'react'
import { format, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { fetchStudents, LOGIN_STUDENTS, useAuth } from '@/lib/auth'
import { LoginUpdateRow, isLoginUpdatesTableMissing } from '@/lib/loginUpdates'
import { supabase } from '@/lib/supabase'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { GUEST_STUDENT_ID } from '@/lib/guestStudy'
import { getStudentAvatarMeta } from '@/lib/studentAvatar'

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
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [onlineOpen, setOnlineOpen] = useState(false)
  const [onlineStudentId, setOnlineStudentId] = useState(1)
  const [onlinePw, setOnlinePw] = useState('')
  const [onlineError, setOnlineError] = useState('')
  const [onlineSubmitting, setOnlineSubmitting] = useState(false)
  const [loginUpdates, setLoginUpdates] = useState<LoginUpdateRow[]>([])
  const [loginUpdatesLoading, setLoginUpdatesLoading] = useState(true)
  const [showLoginUpdates, setShowLoginUpdates] = useState(true)

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

  const isGuest = studentId === GUEST_STUDENT_ID

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
    setShakeKey(k => k + 1)
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

  const onlineStudents = students.filter(student => student.id !== GUEST_STUDENT_ID)

  return (
    <div className="page-shell page-shell-dashboard flex min-h-screen items-center justify-center">
      <div className="w-full max-w-2xl">
        <div className="hero-card science-surface w-full anim-fade-up px-5 py-6 sm:px-7 lg:px-8">
          <ScienceBackdrop />
          <div className="mb-6">
            <div className="text-center">
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
            </div>
            <h2
              className="font-display mt-4 text-center text-[1.9rem] tracking-[0.18em] text-white sm:text-[2.1rem]"
              style={{ textShadow: '0 14px 28px rgba(56, 189, 248, 0.18)' }}
            >
              Login
            </h2>
          </div>

          {notice && (
            <div
              className="info-banner text-sm mb-4"
              style={{ background: 'rgba(245, 158, 11, 0.14)', borderColor: 'rgba(245, 158, 11, 0.28)', color: '#fcd34d' }}
            >
              {notice}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-3">
            {students.map(student => {
              const checked = studentId === student.id
              const avatar = getStudentAvatarMeta(student.id)
              return (
                <label
                  key={student.id}
                  className="rounded-[22px] p-4 transition-all"
                  style={{
                    border: checked ? '1px solid rgba(86, 168, 255, 0.5)' : '1px solid var(--surface-elevated-border)',
                    background: checked
                      ? 'linear-gradient(180deg, rgba(10, 132, 255, 0.22), rgba(10, 132, 255, 0.14))'
                      : 'var(--surface-elevated)',
                    boxShadow: checked ? '0 14px 28px rgba(10, 132, 255, 0.18)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="studentId"
                    value={student.id}
                    checked={checked}
                    onChange={() => setStudentId(student.id)}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full text-xl"
                      style={{
                        background: avatar.background,
                        border: `1px solid ${checked ? 'rgba(191, 219, 254, 0.48)' : avatar.borderColor}`,
                        boxShadow: checked ? '0 12px 26px rgba(59, 130, 246, 0.18)' : avatar.glow,
                      }}
                      aria-hidden="true"
                    >
                      {avatar.emoji}
                    </div>
                    <div className="text-xs text-slate-400">ID {student.id}</div>
                  </div>
                  <div className="font-display text-[1.8rem] text-white mt-2">{student.nickname}</div>
                  {student.id === GUEST_STUDENT_ID && (
                    <div className="mt-2 text-[11px] leading-5 text-sky-200">
                      PWなし / 当日分のみ
                    </div>
                  )}
                </label>
              )
            })}
          </div>

          {isGuest ? (
            <div
              className="info-banner text-sm mb-3"
              style={{ background: 'rgba(56, 189, 248, 0.12)', borderColor: 'rgba(56, 189, 248, 0.22)', color: '#bae6fd' }}
            >
              ゲストは PW なし / 記録は毎日リセット
            </div>
          ) : (
            <div key={shakeKey} className={error ? 'anim-shake' : ''}>
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Password"
                className="input-surface text-center text-xl tracking-[0.22em] mb-3"
                style={{
                  borderColor: error ? '#ef4444' : undefined,
                }}
                autoFocus
              />
              {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}
            </div>
          )}

          {isGuest && error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}

          <button
            onClick={handleLogin}
            className="btn-primary w-full"
            disabled={submitting}
            style={{ opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'ログイン中...' : isGuest ? 'ゲストで始める' : 'ログイン'}
          </button>

          <button
            onClick={onAdmin}
            className="btn-secondary w-full mt-3"
          >
            もぎ先生ログイン
          </button>

          <button
            onClick={() => {
              setOnlineStudentId(studentId === GUEST_STUDENT_ID ? 1 : studentId)
              setOnlinePw('')
              setOnlineError('')
              setOnlineOpen(true)
            }}
            className="btn-ghost w-full mt-3"
          >
            オンライン
          </button>

          {onlineOpen && (
            <div className="mt-4 rounded-[28px] border border-sky-300/16 bg-slate-950/45 p-4">
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
              <p className="mt-3 text-sm leading-7 text-slate-300">毎回 ID / PW で入室</p>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {onlineStudents.map(student => {
                  const checked = onlineStudentId === student.id
                  const avatar = getStudentAvatarMeta(student.id)
                  return (
                    <label
                      key={`online-${student.id}`}
                      className="rounded-[22px] p-3 transition-all"
                      style={{
                        border: checked ? '1px solid rgba(86, 168, 255, 0.5)' : '1px solid var(--surface-elevated-border)',
                        background: checked
                          ? 'linear-gradient(180deg, rgba(10, 132, 255, 0.22), rgba(10, 132, 255, 0.14))'
                          : 'var(--surface-elevated)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="onlineStudentId"
                        value={student.id}
                        checked={checked}
                        onChange={() => setOnlineStudentId(student.id)}
                        className="sr-only"
                      />
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                          style={{
                            background: avatar.background,
                            border: `1px solid ${checked ? 'rgba(191, 219, 254, 0.48)' : avatar.borderColor}`,
                            boxShadow: checked ? '0 12px 26px rgba(59, 130, 246, 0.18)' : avatar.glow,
                          }}
                          aria-hidden="true"
                        >
                          {avatar.emoji}
                        </div>
                        <div className="text-xs text-slate-400">ID {student.id}</div>
                      </div>
                      <div className="mt-2 font-display text-xl text-white">{student.nickname}</div>
                    </label>
                  )
                })}
              </div>

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
                className="input-surface text-center text-xl tracking-[0.22em] mt-4"
                autoFocus
              />
              {onlineError && <p className="mt-3 text-center text-sm text-red-400">{onlineError}</p>}

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

          {showLoginUpdates && (
            <div className="mt-4 rounded-[24px] border border-white/10 bg-slate-950/38 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">Update Board</div>
                  <div className="mt-1 text-sm font-semibold text-white">直近3日のアップデート</div>
                </div>
                <div className="text-[11px] text-slate-500">
                  {loginUpdates.length}件
                </div>
              </div>

              <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                {loginUpdatesLoading ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">
                    掲示板を読み込み中...
                  </div>
                ) : loginUpdates.length > 0 ? (
                  loginUpdates.map(update => (
                    <div key={update.id} className="rounded-[18px] border border-sky-400/12 bg-sky-400/5 px-3 py-2.5">
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
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">
                    直近のアップデートはまだありません。
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
