'use client'

import { useEffect, useRef, useState } from 'react'
import { generateHourlyPassword } from '@/lib/onlineLab'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { useAuth } from '@/lib/auth'
import { isGuestStudentId } from '@/lib/guestStudy'

const PASSWORD_LENGTH = 5
const ADMIN_STUDENT_ID = 5

export default function OnlineGatePage({
  onBack,
  onEnter,
}: {
  onBack: () => void
  onEnter: () => void
}) {
  const { studentId } = useAuth()
  const [chars, setChars] = useState<string[]>(Array(PASSWORD_LENGTH).fill(''))
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const guestBlocked = studentId !== null && isGuestStudentId(studentId)
  const isAdmin = studentId === ADMIN_STUDENT_ID

  // Admin bypass: skip the password gate entirely
  useEffect(() => {
    if (isAdmin) {
      onEnter()
    }
  }, [isAdmin, onEnter])

  useEffect(() => {
    if (guestBlocked || isAdmin) return
    inputRefs.current[0]?.focus()
  }, [guestBlocked, isAdmin])

  const handleChange = (index: number, value: string) => {
    const char = value.slice(-1).toUpperCase()
    const next = [...chars]
    next[index] = char
    setChars(next)
    setError('')

    if (char && index < PASSWORD_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, event: React.KeyboardEvent) => {
    if (event.key === 'Backspace' && !chars[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (event.key === 'Enter') {
      void handleSubmit()
    }
  }

  const handleSubmit = async () => {
    const entered = chars.join('')
    if (entered.length < PASSWORD_LENGTH) {
      setError('5文字すべて入力してください')
      return
    }

    setChecking(true)
    try {
      const correctPassword = generateHourlyPassword()
      if (entered === correctPassword) {
        onEnter()
      } else {
        setError('パスワードが違います')
        setChars(Array(PASSWORD_LENGTH).fill(''))
        inputRefs.current[0]?.focus()
      }
    } catch {
      setError('通信エラーが発生しました')
    }
    setChecking(false)
  }

  return (
    <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="w-full max-w-md px-4">
        <div className="hero-card science-surface p-6 sm:p-8">
          <ScienceBackdrop />
          <div className="text-center">
            <div className="text-xs font-semibold tracking-[0.18em] uppercase text-sky-200">Online Plaza</div>
            <h1 className="mt-2 font-display text-2xl text-white sm:text-3xl">オンラインの広場</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {guestBlocked
                ? 'オンライン対戦は通常ユーザーでログインしたときに利用できます'
                : '管理者から伝えられた5文字の合言葉を入力してください'}
            </p>
          </div>

          {guestBlocked ? (
            <div className="mt-6 rounded-[24px] border border-amber-300/20 bg-amber-500/10 px-4 py-4 text-center text-sm leading-7 text-amber-100">
              ゲストは学習体験専用です。オンライン陣取りは、生徒IDを選んでログインしたあとに入室してください。
            </div>
          ) : (
            <div className="mt-6 flex justify-center gap-2 sm:gap-3">
              {chars.map((char, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  maxLength={2}
                  value={char}
                  onChange={event => handleChange(i, event.target.value)}
                  onKeyDown={event => handleKeyDown(i, event)}
                  className="input-surface text-center font-display text-2xl tracking-[0.1em] sm:text-3xl"
                  style={{
                    width: '3rem',
                    height: '3.5rem',
                    borderColor: char ? 'rgba(56, 189, 248, 0.4)' : undefined,
                  }}
                  disabled={checking}
                />
              ))}
            </div>
          )}

          {error && (
            <p className="mt-4 text-center text-sm text-red-400">{error}</p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {!guestBlocked && (
              <button
                onClick={() => void handleSubmit()}
                className="btn-primary w-full"
                disabled={checking || chars.some(c => !c)}
                style={{ opacity: checking || chars.some(c => !c) ? 0.7 : 1 }}
              >
                {checking ? '確認中...' : '入室する'}
              </button>
            )}
            <button onClick={onBack} className="btn-secondary w-full">
              {guestBlocked ? 'ホームへもどる' : 'もどる'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
