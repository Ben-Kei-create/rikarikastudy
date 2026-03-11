'use client'
import { useEffect, useState } from 'react'
import { fetchStudents, LOGIN_STUDENTS, useAuth } from '@/lib/auth'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { GUEST_STUDENT_ID } from '@/lib/guestStudy'

export default function LoginPage({
  onDone,
  onAdmin,
}: {
  onDone: () => void
  onAdmin: () => void
}) {
  const { login, lockedStudentId, notice } = useAuth()
  const [studentId, setStudentId] = useState(1)
  const [students, setStudents] = useState(LOGIN_STUDENTS)
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [partyGameNotice, setPartyGameNotice] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)

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
    if (lockedStudentId) setStudentId(lockedStudentId)
  }, [lockedStudentId])

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

  const handlePartyGameClick = () => {
    setPartyGameNotice('パーティゲームは準備中です。まだ入れません。')
  }

  return (
    <div className="page-shell page-shell-dashboard flex min-h-screen items-center justify-center">
      <div className="w-full max-w-2xl">
        <div className="hero-card science-surface w-full anim-fade-up px-5 py-6 sm:px-7 lg:px-8">
          <ScienceBackdrop />
          <div className="mb-6">
            <div
              className="mx-auto inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase"
              style={{ background: 'rgba(86, 168, 255, 0.12)', color: '#8cc7ff', border: '1px solid rgba(86, 168, 255, 0.16)' }}
            >
              RikaQuiz
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-center text-white">ログイン</h2>
          </div>

          {notice && (
            <div
              className="info-banner text-sm mb-4"
              style={{ background: 'rgba(245, 158, 11, 0.14)', borderColor: 'rgba(245, 158, 11, 0.28)', color: '#fcd34d' }}
            >
              {notice}
            </div>
          )}

          {lockedStudentId && (
            <div
              className="info-banner text-sm mb-4"
              style={{ background: 'rgba(10, 132, 255, 0.14)', borderColor: 'rgba(10, 132, 255, 0.22)', color: '#b9e1ff' }}
            >
              この端末は ID {lockedStudentId} 専用です。切り替えはもぎ先生ログインから解除できます。
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-3">
            {students.map(student => {
              const checked = studentId === student.id
              const disabled = !!lockedStudentId && lockedStudentId !== student.id
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
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.35 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name="studentId"
                    value={student.id}
                    checked={checked}
                    onChange={() => !disabled && setStudentId(student.id)}
                    disabled={disabled}
                    className="sr-only"
                  />
                  <div className="text-xs text-slate-400">ID {student.id}</div>
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
              ゲストはパスワード不要です。正答率などの成績は毎日リセットされます。
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
            onClick={handlePartyGameClick}
            className="btn-ghost w-full mt-3"
          >
            パーティゲーム
          </button>

          <div className="mt-3 rounded-[22px] border border-dashed border-slate-700 bg-slate-950/35 px-4 py-3 text-sm leading-6 text-slate-400">
            各ユーザがオンラインで遊べる学習ゲームをここに追加予定です。
          </div>

          {partyGameNotice && (
            <div
              className="info-banner text-sm mt-3"
              style={{ background: 'rgba(59, 130, 246, 0.12)', borderColor: 'rgba(59, 130, 246, 0.22)', color: '#bfdbfe' }}
            >
              {partyGameNotice}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
