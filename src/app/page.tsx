'use client'
import { useState } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ThemeProvider, useTheme } from '@/lib/theme'
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
  | { type: 'quiz'; field: string; unit: string; isDrill?: boolean }

function ThemeToggle() {
  const { theme, setTheme, ready } = useTheme()
  if (!ready) return null

  return (
    <div className="theme-toggle anim-fade">
      <button
        onClick={() => setTheme('light')}
        className={`theme-toggle-button ${theme === 'light' ? 'is-active' : ''}`}
      >
        ライト
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`theme-toggle-button ${theme === 'dark' ? 'is-active' : ''}`}
      >
        ダーク
      </button>
    </div>
  )
}

function App() {
  const { studentId, ready } = useAuth()
  const [screen, setScreen] = useState<Screen>('home')
  const [adminOpen, setAdminOpen] = useState(false)

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div style={{ color: 'var(--text-secondary)' }}>読み込み中...</div>
      </div>
    )
  }

  let content

  if (!studentId) {
    content = <LoginPage onDone={() => setScreen('home')} onAdmin={() => setAdminOpen(true)} />
  } else if (screen === 'mypage') {
    content = <MyPage onBack={() => setScreen('home')} onStartDrill={(field, unit) => setScreen({ type: 'quiz', field, unit, isDrill: true })} />
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
        isDrill={screen.isDrill}
        onBack={() => setScreen(screen.isDrill ? 'mypage' : { type: 'unit', field: screen.field })}
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
      <ThemeToggle />
      {content}
      {adminOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg)', overflowY: 'auto' }}>
          <AdminPage onBack={() => setAdminOpen(false)} />
        </div>
      )}
    </>
  )
}

export default function Page() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  )
}
