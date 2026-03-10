'use client'
import { useState } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth'
import LoginPage from '@/components/LoginPage'
import HomePage from '@/components/HomePage'
import UnitSelectPage from '@/components/UnitSelectPage'
import QuizPage from '@/components/QuizPage'
import MyPage from '@/components/MyPage'
import AdminPage from '@/components/AdminPage'

type Screen =
  | 'home'
  | 'mypage'
  | { type: 'unit'; field: string }
  | { type: 'quiz'; field: string; unit: string }

function App() {
  const { studentId, ready } = useAuth()
  const [screen, setScreen] = useState<Screen>('home')
  const [adminOpen, setAdminOpen] = useState(false)

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">読み込み中...</div>
      </div>
    )
  }

  let content

  if (!studentId) {
    content = <LoginPage onDone={() => setScreen('home')} onAdmin={() => setAdminOpen(true)} />
  } else if (screen === 'mypage') {
    content = <MyPage onBack={() => setScreen('home')} />
  } else if (typeof screen === 'object' && screen.type === 'unit') {
    content = (
      <UnitSelectPage
        field={screen.field}
        onSelect={unit => setScreen({ type: 'quiz', field: screen.field, unit })}
        onBack={() => setScreen('home')}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'quiz') {
    content = (
      <QuizPage
        field={screen.field}
        unit={screen.unit}
        onBack={() => setScreen({ type: 'unit', field: screen.field })}
      />
    )
  } else {
    content = (
      <HomePage
        onSelectField={field => setScreen({ type: 'unit', field })}
        onMyPage={() => setScreen('mypage')}
      />
    )
  }

  return (
    <>
      {content}
      {studentId && !adminOpen && <AdminFloatButton onOpen={() => setAdminOpen(true)} />}
      {adminOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0f172a', overflowY: 'auto' }}>
          <AdminPage onBack={() => setAdminOpen(false)} />
        </div>
      )}
    </>
  )
}

export default function Page() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}

function AdminFloatButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 999,
        background: '#1e293b',
        border: '1px solid #334155',
        color: '#cbd5e1',
        borderRadius: 10,
        padding: '8px 14px',
        fontSize: 12,
        cursor: 'pointer',
        opacity: 0.65,
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.65')}
    >
      もぎ先生ログイン
    </button>
  )
}
