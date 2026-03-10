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
  const { login } = useAuth()
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

  const handleLogin = async () => {
    setSubmitting(true)
    const ok = await login(studentId, pw)
    setSubmitting(false)

    if (ok) {
      setError('')
      onDone()
      return
    }

    setError('ID またはパスワードが違います')
    setShakeKey(k => k + 1)
    setPw('')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>

      <div className="mb-10 text-center anim-fade-up">
        <div className="font-display text-5xl mb-2" style={{
          background: 'linear-gradient(90deg, #22c55e, #3b82f6, #a855f7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          RikaQuiz
        </div>
        <p className="text-slate-400 text-sm">理科一問一答 学習サイト</p>
      </div>

      <div className="card w-full max-w-sm anim-fade-up" style={{ animationDelay: '0.1s' }}>
        <h2 className="text-xl font-bold mb-2 text-center">ログイン</h2>
        <p className="text-slate-500 text-sm text-center mb-6">ID を選んでパスワードを入力してね</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {students.map(student => {
            const checked = studentId === student.id
            return (
              <label
                key={student.id}
                className="rounded-2xl p-3 cursor-pointer transition-all"
                style={{
                  border: `2px solid ${checked ? '#3b82f6' : '#334155'}`,
                  background: checked ? '#1d4ed8' : '#0f172a',
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
                <div className="text-xs text-slate-400">ID {student.id}</div>
                <div className="font-display text-2xl text-white mt-1">{student.nickname}</div>
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
            className="w-full px-4 py-3 rounded-xl text-center text-xl tracking-widest mb-3 outline-none transition-all"
            style={{
              background: '#0f172a',
              border: `2px solid ${error ? '#ef4444' : '#334155'}`,
              color: '#f1f5f9',
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
          className="w-full mt-3 px-4 py-3 rounded-xl text-sm font-bold transition-all"
          style={{ background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155' }}
        >
          もぎ先生ログイン
        </button>
      </div>
    </div>
  )
}
