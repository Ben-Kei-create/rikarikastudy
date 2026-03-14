'use client'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import LoginPage from '@/components/LoginPage'
import HomePage from '@/components/HomePage'
import UnitSelectPage from '@/components/UnitSelectPage'
import QuizPage from '@/components/QuizPage'
import MyPage from '@/components/MyPage'
import AdminPage from '@/components/AdminPage'
import BiologyPracticePage from '@/components/BiologyPracticePage'
import ChemistryPracticePage from '@/components/ChemistryPracticePage'
import EarthSciencePracticePage from '@/components/EarthSciencePracticePage'
import ScienceWorkbenchPage from '@/components/ScienceWorkbenchPage'
import TimeAttackPage from '@/components/TimeAttackPage'
import OnlineLabPage from '@/components/OnlineLabPage'
import ActiveRecallPage from '@/components/ActiveRecallPage'
import { BiologyPracticeMode } from '@/lib/biologyPractice'
import { ChemistryPracticeMode } from '@/lib/chemistryPractice'
import { EarthSciencePracticeMode } from '@/lib/earthSciencePractice'
import { ScienceWorkbenchMode, SCIENCE_WORKBENCH_MODE_META } from '@/lib/scienceWorkbench'
import ScienceChatPage from '@/components/ScienceChatPage'
import { ScienceChatField } from '@/lib/scienceChat'
import { CustomQuizOptions } from '@/lib/customQuiz'
import { QuizQuestionCount } from '@/lib/questionPicker'
import { ScienceField } from '@/lib/constants'

type Screen =
  | 'home'
  | 'mypage'
  | 'time-attack'
  | 'online-lab'
  | { type: 'unit'; field: string }
  | { type: 'quiz'; field: string; unit: string; isDrill?: boolean; quickStartAll?: boolean; quickStartDaily?: boolean; dailyChallenge?: boolean; customOptions?: CustomQuizOptions; questionCount?: QuizQuestionCount }
  | { type: 'biology-practice'; mode: BiologyPracticeMode }
  | { type: 'chemistry-practice'; mode: ChemistryPracticeMode }
  | { type: 'earth-practice'; mode: EarthSciencePracticeMode }
  | { type: 'science-workbench'; mode: ScienceWorkbenchMode }
  | { type: 'chat'; field: ScienceChatField }
  | { type: 'active-recall'; field: ScienceField }

const BG_THEMES = ['bg-bio', 'bg-chem', 'bg-phys', 'bg-earth'] as const

function useRandomBg() {
  useEffect(() => {
    const theme = BG_THEMES[Math.floor(Math.random() * BG_THEMES.length)]
    document.body.classList.add(theme)
    return () => { document.body.classList.remove(theme) }
  }, [])
}

function App() {
  useRandomBg()
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
    content = <LoginPage onDone={() => setScreen('home')} onOnline={() => setScreen('online-lab')} onAdmin={() => setAdminOpen(true)} />
  } else if (screen === 'mypage') {
    content = <MyPage onBack={() => setScreen('home')} onStartDrill={(field, unit) => setScreen({ type: 'quiz', field, unit, isDrill: true })} />
  } else if (screen === 'time-attack') {
    content = <TimeAttackPage onBack={() => setScreen('home')} />
  } else if (screen === 'online-lab') {
    content = <OnlineLabPage onBack={() => setScreen('home')} />
  } else if (typeof screen === 'object' && screen.type === 'unit') {
    content = (
      <UnitSelectPage
        field={screen.field}
        onSelect={(unit, questionCount) => setScreen({ type: 'quiz', field: screen.field, unit, questionCount })}
        onStartCustomQuiz={(options, questionCount) => setScreen({ type: 'quiz', field: screen.field, unit: options.unit, customOptions: options, questionCount })}
        onSelectBiologyMode={mode => setScreen({ type: 'biology-practice', mode })}
        onSelectSpecialMode={mode => setScreen({ type: 'chemistry-practice', mode })}
        onSelectEarthMode={mode => setScreen({ type: 'earth-practice', mode })}
        onSelectWorkbenchMode={mode => setScreen({ type: 'science-workbench', mode })}
        onOpenChat={field => setScreen({ type: 'chat', field })}
        onStartActiveRecall={field => setScreen({ type: 'active-recall', field })}
        onBack={() => setScreen('home')}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'chat') {
    content = (
      <ScienceChatPage
        field={screen.field}
        onBack={() => setScreen({ type: 'unit', field: screen.field })}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'active-recall') {
    content = (
      <ActiveRecallPage
        field={screen.field}
        onBack={() => setScreen({ type: 'unit', field: screen.field })}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'chemistry-practice') {
    content = (
      <ChemistryPracticePage
        mode={screen.mode}
        onBack={() => setScreen({ type: 'unit', field: '化学' })}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'biology-practice') {
    content = (
      <BiologyPracticePage
        mode={screen.mode}
        onBack={() => setScreen({ type: 'unit', field: '生物' })}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'earth-practice') {
    content = (
      <EarthSciencePracticePage
        mode={screen.mode}
        onBack={() => setScreen({ type: 'unit', field: '地学' })}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'science-workbench') {
    content = (
      <ScienceWorkbenchPage
        mode={screen.mode}
        onBack={() => setScreen({ type: 'unit', field: SCIENCE_WORKBENCH_MODE_META[screen.mode].field })}
      />
    )
  } else if (typeof screen === 'object' && screen.type === 'quiz') {
    content = (
      <QuizPage
        field={screen.field}
        unit={screen.unit}
        isDrill={screen.isDrill}
        quickStartAll={screen.quickStartAll}
        quickStartDaily={screen.quickStartDaily}
        dailyChallenge={screen.dailyChallenge}
        customOptions={screen.customOptions}
        questionCount={screen.questionCount}
        onBack={() => setScreen(
          screen.isDrill
            ? 'mypage'
            : screen.quickStartAll || screen.quickStartDaily || screen.dailyChallenge
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
        onDailyChallenge={() => setScreen({ type: 'quiz', field: 'all', unit: 'all', quickStartDaily: true, dailyChallenge: true })}
        onTimeAttack={() => setScreen('time-attack')}
        onMyPage={() => setScreen('mypage')}
      />
    )
  }

  return (
    <>
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
    <AuthProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AuthProvider>
  )
}
