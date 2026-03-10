'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'

export default function LoginPage({ onDone }: { onDone: () => void }) {
  const { login } = useAuth()
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)

  const handleLogin = () => {
    if (login(pw)) {
      setError('')
      onDone()
    } else {
      setError('パスワードが違います')
      setShakeKey(k => k + 1)
      setPw('')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>

      {/* ロゴ */}
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
        <p className="text-slate-500 text-sm text-center mb-6">自分のパスワードを入力してね</p>

        <div key={shakeKey} className={error ? 'anim-shake' : ''}>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="パスワード"
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

        <button onClick={handleLogin} className="btn-primary w-full">
          ログイン
        </button>
      </div>
    </div>
  )
}
