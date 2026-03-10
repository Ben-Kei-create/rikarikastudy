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
  const { studentId } = useAuth()
  const [screen, setScreen] = useState<Screen>('home')

  if (!studentId) {
    return <LoginPage onDone={() => setScreen('home')} />
  }
  if (screen === 'mypage') return <MyPage onBack={() => setScreen('home')} />
  if (typeof screen === 'object' && screen.type === 'unit') {
    return (
      <UnitSelectPage
        field={screen.field}
        onSelect={unit => setScreen({ type: 'quiz', field: screen.field, unit })}
        onBack={() => setScreen('home')}
      />
    )
  }
  if (typeof screen === 'object' && screen.type === 'quiz') {
    return (
      <QuizPage
        field={screen.field}
        unit={screen.unit}
        onBack={() => setScreen({ type: 'unit', field: screen.field })}
      />
    )
  }
  return (
    <HomePage
      onSelectField={field => setScreen({ type: 'unit', field })}
      onMyPage={() => setScreen('mypage')}
    />
  )
}

export default function Page() {
  return (
    <AuthProvider>
      <App />
      <AdminFloatButton />
    </AuthProvider>
  )
}

function AdminFloatButton() {
  const [open, setOpen] = useState(false)
  const { studentId } = useAuth()
  if (!studentId) return null
  if (open) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0f172a', overflowY: 'auto' }}>
      <AdminPage onBack={() => setOpen(false)} />
    </div>
  )
  return (
    <button onClick={() => setOpen(true)} style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 999,
      background: '#1e293b', border: '1px solid #334155',
      color: '#475569', borderRadius: 8, padding: '6px 12px',
      fontSize: 12, cursor: 'pointer', opacity: 0.4, transition: 'opacity 0.2s',
    }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}>
      管理者
    </button>
  )
}
