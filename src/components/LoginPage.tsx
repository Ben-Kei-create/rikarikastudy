'use client'
import { useEffect, useState } from 'react'
import { DEFAULT_STUDENTS, fetchStudents, useAuth } from '@/lib/auth'
import ScienceBackdrop from '@/components/ScienceBackdrop'

const FIELD_PREVIEW = [
  { name: '生物', color: '#22c55e', detail: '細胞・遺伝・消化' },
  { name: '化学', color: '#f97316', detail: '原子・イオン・反応' },
  { name: '物理', color: '#4da2ff', detail: '力・電気・エネルギー' },
  { name: '地学', color: '#8b7cff', detail: '地震・天気・宇宙' },
]

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
    <div className="page-shell page-shell-dashboard flex min-h-screen items-center">
      <div className="grid w-full gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
        <div className="hero-card science-surface order-2 anim-fade-up px-5 py-6 sm:px-7 sm:py-7 lg:order-1 lg:px-8 lg:py-8">
          <ScienceBackdrop />
          <div
            className="inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase"
            style={{ background: 'rgba(86, 168, 255, 0.12)', color: '#8cc7ff', border: '1px solid rgba(86, 168, 255, 0.16)' }}
          >
            Science Study App
          </div>
          <div className="mt-5">
            <div className="font-display text-4xl leading-none text-white sm:text-5xl lg:text-6xl">
              RikaQuiz
            </div>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
              理科一問一答を、迷わず始めやすい形に整理しました。スマホではすぐログインできて、
              iPad や PC では一覧性を保ったまま使えます。
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
            {FIELD_PREVIEW.map(field => (
              <span
                key={field.name}
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{ borderColor: `${field.color}55`, color: field.color, background: `${field.color}14` }}
              >
                {field.name}
              </span>
            ))}
          </div>

          <div className="science-intro-grid mt-6 hidden sm:grid">
            {FIELD_PREVIEW.map(field => (
              <div key={field.name} className="science-intro-card">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">FIELD</div>
                <div className="mt-2 font-display text-2xl" style={{ color: field.color }}>
                  {field.name}
                </div>
                <div className="mt-1 text-xs text-slate-400 sm:text-sm">{field.detail}</div>
              </div>
            ))}
          </div>

          <div className="subcard mt-5 hidden p-4 text-sm leading-7 text-slate-300 lg:block">
            背景は物理・化学・地学・生物を薄く重ねた演出だけに抑えて、操作の邪魔にならないようにしています。
          </div>
        </div>

        <div className="hero-card science-surface order-1 w-full anim-fade-up px-5 py-6 sm:px-7 lg:order-2 lg:px-8" style={{ animationDelay: '0.1s' }}>
          <ScienceBackdrop />
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
    </div>
  )
}
