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
    fetchStudents().then(data => { if (active) setStudents(data) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (lockedStudentId) setStudentId(lockedStudentId)
  }, [lockedStudentId])

  const handleLogin = async () => {
    setSubmitting(true)
    const result = await login(studentId, pw)
    setSubmitting(false)
    if (result.ok) { setError(''); onDone(); return }
    setError(result.message)
    setShakeKey(k => k + 1)
    setPw('')
  }

  return (
    <div className="page-shell flex flex-col items-center justify-center">
      {/* Brand */}
      <div className="mb-8 text-center anim-fade-up">
        <div className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
          RikaQuiz
        </div>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          理科の一問一答で、効率よく復習しよう。
        </p>
      </div>

      {/* Login card */}
      <div className="card w-full max-w-sm anim-fade-up" style={{ animationDelay: '0.08s' }}>
        <h2 className="text-lg font-semibold text-center mb-1">ログイン</h2>
        <p className="text-center text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
          IDを選んでパスワードを入力
        </p>

        {notice && (
          <div className="info-banner mb-4" style={{ background: 'rgba(255,149,0,0.1)', color: 'var(--warning)' }}>
            {notice}
          </div>
        )}

        {lockedStudentId && (
          <div className="info-banner mb-4">
            この端末は ID {lockedStudentId} 専用です。切り替えはもぎ先生ログインから解除できます。
          </div>
        )}

        {/* ID grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {students.map(student => {
            const checked = studentId === student.id
            const disabled = !!lockedStudentId && lockedStudentId !== student.id
            return (
              <label
                key={student.id}
                className="rounded-xl p-3 text-center cursor-pointer transition-all"
                style={{
                  background: checked ? 'var(--tint-bg)' : 'var(--input-bg)',
                  border: checked ? '2px solid var(--tint)' : '2px solid transparent',
                  opacity: disabled ? 0.35 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
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
                <div className="text-2xl font-bold" style={{ color: checked ? 'var(--tint)' : 'var(--text)' }}>
                  {student.nickname}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>ID {student.id}</div>
              </label>
            )
          })}
        </div>

        {/* Password */}
        <div key={shakeKey} className={error ? 'anim-shake' : ''}>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="パスワード"
            className="input-surface text-center tracking-widest mb-3"
            style={{ borderColor: error ? 'var(--danger)' : undefined }}
            autoFocus
          />
          {error && <p className="text-sm text-center mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        <button onClick={handleLogin} className="btn-primary w-full" disabled={submitting} style={{ opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'ログイン中...' : 'ログイン'}
        </button>

        <div className="mt-3 text-center">
          <button onClick={onAdmin} className="btn-ghost text-sm">
            もぎ先生ログイン →
          </button>
        </div>
      </div>
    </div>
  )
}
