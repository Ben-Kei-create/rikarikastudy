'use client'
import { useState } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth'
import LoginPage from '@/components/LoginPage'
import HomePage from '@/components/HomePage'
import UnitSelectPage from '@/components/UnitSelectPage'
import QuizPage from '@/components/QuizPage'
import MyPage from '@/components/MyPage'
import AdminPage from '@/components/AdminPage'
import ChemistryPracticePage from '@/components/ChemistryPracticePage'
import { ChemistryPracticeMode } from '@/lib/chemistryPractice'

type Screen =
  | 'home'
  | 'mypage'
  | { type: 'unit'; field: string }
  | { type: 'quiz'; field: string; unit: string; isDrill?: boolean; quickStartAll?: boolean }
  | { type: 'chemistry-practice'; mode: ChemistryPracticeMode }

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
    content = <MyPage onBack={() => setScreen('home')} onStartDrill={(field, unit) => setScreen({ type: 'quiz', field, unit, isDrill: true })} />
  } else if (typeof screen === 'object' && screen.type === 'unit') {
    content = (
      <UnitSelectPage
        field={screen.field}
        onSelect={unit => setScreen({ type: 'quiz', field: screen.field, unit })}
        onSelectSpecialMode={mode => setScreen({ type: 'chemistry-practice', mode })}
        onBack={() => setScreen('home')}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'chemistry-practice') {
    content = (
      <ChemistryPracticePage
        mode={screen.mode}
        onBack={() => setScreen({ type: 'unit', field: '化学' })}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'quiz') {
    content = (
      <QuizPage
        field={screen.field}
        unit={screen.unit}
        isDrill={screen.isDrill}
        quickStartAll={screen.quickStartAll}
        onBack={() => setScreen(
          screen.isDrill
            ? 'mypage'
            : screen.quickStartAll
              ? 'home'
              : { type: 'unit', field: screen.field }
        )}
      />
    )
  } else {
    content = (
      <HomePage
        onSelectField={field => setScreen({ type: 'unit', field })}
        onQuickStartAll={() => setScreen({ type: 'quiz', field: 'all', unit: 'all', quickStartAll: true })}
        onMyPage={() => setScreen('mypage')}
      />
    )
  }

  return (
    <>
      {content}
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
