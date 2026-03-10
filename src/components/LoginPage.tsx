'use client'
import { useEffect, useState } from 'react'
import { DEFAULT_STUDENTS, fetchStudents, useAuth } from '@/lib/auth'

export default function LoginPage({
  onDone,
  onAdmin,
}: {
  onDone: () => void
  onAdmin: () => void
}) {
  const { login, lockedStudentId, notice } = useAuth()
  const [studentId, setStudentId] = useState(1)
  const [students, setStudents] = useState(DEFAULT_STUDENTS)
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    fetchStudents().then(data => {
      if (active) setStudents(data)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (lockedStudentId) setStudentId(lockedStudentId)
  }, [lockedStudentId])

  const handleLogin = async () => {
    setSubmitting(true)
    const result = await login(studentId, pw)
    setSubmitting(false)

    if (result.ok) {
      setError('')
      onDone()
      return
    }

    setError(result.message)
    setShakeKey(k => k + 1)
    setPw('')
  }

  return (
    <div className="page-shell flex flex-col items-center justify-center">
      <div className="mb-8 text-center anim-fade-up">
        <div
          className="inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase"
          style={{ background: 'rgba(86, 168, 255, 0.12)', color: '#8cc7ff', border: '1px solid rgba(86, 168, 255, 0.16)' }}
        >
          Science Study App
        </div>
        <div className="font-display text-5xl mt-5 mb-2 text-white">
          RikaQuiz
        </div>
        <p className="text-slate-400 text-sm">理科一問一答を、迷わずすぐ始められる形に整理しました。</p>
      </div>

      <div className="hero-card w-full max-w-md anim-fade-up px-5 py-6 sm:px-7" style={{ animationDelay: '0.1s' }}>
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-center text-white">ログイン</h2>
          <p className="text-slate-400 text-sm text-center mt-2">ID を選んでパスワードを入力してください</p>
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
            この表示はログアウト忘れではなく端末固定です。この端末は ID {lockedStudentId} 専用で、切り替えはもぎ先生ログインから解除できます。
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-5">
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
              </label>
            )
          })}
        </div>

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

        <button
          onClick={handleLogin}
          className="btn-primary w-full"
          disabled={submitting}
          style={{ opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'ログイン中...' : 'ログイン'}
        </button>

        <button
          onClick={onAdmin}
          className="btn-secondary w-full mt-3"
        >
          もぎ先生ログイン
        </button>
      </div>
    </div>
  )
}
