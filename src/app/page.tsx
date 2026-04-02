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
import OnlineGatePage from '@/components/OnlineGatePage'
import OnlineTerritoryPage from '@/components/OnlineTerritoryPage'
import OnlinePlazaPage from '@/components/OnlinePlazaPage'
import { BiologyPracticeMode } from '@/lib/biologyPractice'
import { ChemistryPracticeMode } from '@/lib/chemistryPractice'
import { EarthSciencePracticeMode } from '@/lib/earthSciencePractice'
import { ScienceWorkbenchMode, SCIENCE_WORKBENCH_MODE_META } from '@/lib/scienceWorkbench'
import ScienceChatPage from '@/components/ScienceChatPage'
import TerritoryQuizPage from '@/components/TerritoryQuizPage'
import ScienceTowerPage from '@/components/ScienceTowerPage'
import { ScienceChatField } from '@/lib/scienceChat'
import { CustomQuizOptions } from '@/lib/customQuiz'
import { QuizQuestionCount } from '@/lib/questionPicker'

type Screen =
  | 'home'
  | 'mypage'
  | 'time-attack'
  | 'territory-quiz'
  | 'online-gate'
  | 'online-plaza'
  | 'online-territory'
  | 'online-lab'
  | 'science-tower'
  | { type: 'unit'; field: string }
  | { type: 'quiz'; field: string; unit: string; isDrill?: boolean; quickStartAll?: boolean; quickStartDaily?: boolean; dailyChallenge?: boolean; reviewMode?: boolean; customOptions?: CustomQuizOptions; questionCount?: QuizQuestionCount }
  | { type: 'biology-practice'; mode: BiologyPracticeMode }
  | { type: 'chemistry-practice'; mode: ChemistryPracticeMode }
  | { type: 'earth-practice'; mode: EarthSciencePracticeMode }
  | { type: 'science-workbench'; mode: ScienceWorkbenchMode }
  | { type: 'chat'; field: ScienceChatField }

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

  const ADMIN_STUDENT_ID = 5
  const screenType = typeof screen === 'object' ? screen.type : screen
  const goHome = () => setScreen('home')
  const goOnline = () => setScreen('online-gate')

  const renderScreen = (): JSX.Element => {
    if (!studentId) {
      return <LoginPage onDone={goHome} onAdmin={() => setAdminOpen(true)} />
    }

    switch (screenType) {
      case 'mypage':
        return <MyPage onBack={goHome} onStartDrill={(field, unit) => setScreen({ type: 'quiz', field, unit, isDrill: true })} onOnline={goOnline} />
      case 'time-attack':
        return <TimeAttackPage onBack={goHome} />
      case 'territory-quiz':
        return <TerritoryQuizPage onBack={goHome} />
      case 'science-tower':
        return <ScienceTowerPage onBack={goHome} />
      case 'online-gate':
        return <OnlineGatePage onBack={goHome} onEnter={() => setScreen('online-plaza')} />
      case 'online-plaza':
        return (
          <OnlinePlazaPage
            onBack={goHome}
            onOpenTerritory={() => setScreen('online-territory')}
            onOpenLab={() => setScreen('online-lab')}
          />
        )
      case 'online-territory':
        return <OnlineTerritoryPage onBack={() => setScreen('online-plaza')} onOpenLab={() => setScreen('online-lab')} />
      case 'online-lab':
        return <OnlineLabPage onBack={() => setScreen('online-plaza')} onOpenTerritory={() => setScreen('online-territory')} />
      case 'unit': {
        const s = screen as Extract<Screen, { type: 'unit' }>
        return (
          <UnitSelectPage
            field={s.field}
            onSelect={(unit, questionCount) => setScreen({ type: 'quiz', field: s.field, unit, questionCount })}
            onStartCustomQuiz={(options, questionCount) => setScreen({ type: 'quiz', field: s.field, unit: options.unit, customOptions: options, questionCount })}
            onSelectBiologyMode={mode => setScreen({ type: 'biology-practice', mode })}
            onSelectSpecialMode={mode => setScreen({ type: 'chemistry-practice', mode })}
            onSelectEarthMode={mode => setScreen({ type: 'earth-practice', mode })}
            onSelectWorkbenchMode={mode => setScreen({ type: 'science-workbench', mode })}
            onOpenChat={field => setScreen({ type: 'chat', field })}
            onBack={goHome}
          />
        )
      }
      case 'chat': {
        const s = screen as Extract<Screen, { type: 'chat' }>
        return <ScienceChatPage field={s.field} onBack={() => setScreen({ type: 'unit', field: s.field })} />
      }
      case 'chemistry-practice': {
        const s = screen as Extract<Screen, { type: 'chemistry-practice' }>
        return <ChemistryPracticePage mode={s.mode} onBack={() => setScreen({ type: 'unit', field: '化学' })} />
      }
      case 'biology-practice': {
        const s = screen as Extract<Screen, { type: 'biology-practice' }>
        return <BiologyPracticePage mode={s.mode} onBack={() => setScreen({ type: 'unit', field: '生物' })} />
      }
      case 'earth-practice': {
        const s = screen as Extract<Screen, { type: 'earth-practice' }>
        return <EarthSciencePracticePage mode={s.mode} onBack={() => setScreen({ type: 'unit', field: '地学' })} />
      }
      case 'science-workbench': {
        const s = screen as Extract<Screen, { type: 'science-workbench' }>
        return <ScienceWorkbenchPage mode={s.mode} onBack={() => setScreen({ type: 'unit', field: SCIENCE_WORKBENCH_MODE_META[s.mode].field })} />
      }
      case 'quiz': {
        const s = screen as Extract<Screen, { type: 'quiz' }>
        return (
          <QuizPage
            field={s.field}
            unit={s.unit}
            isDrill={s.isDrill}
            quickStartAll={s.quickStartAll}
            quickStartDaily={s.quickStartDaily}
            dailyChallenge={s.dailyChallenge}
            reviewMode={s.reviewMode}
            customOptions={s.customOptions}
            questionCount={s.questionCount}
            onBack={() => setScreen(
              s.isDrill ? 'mypage'
                : s.quickStartAll || s.quickStartDaily || s.dailyChallenge || s.reviewMode ? 'home'
                  : { type: 'unit', field: s.field }
            )}
          />
        )
      }
      default:
        return (
          <HomePage
            onSelectField={field => setScreen({ type: 'unit', field })}
            onQuickStartAll={() => setScreen({ type: 'quiz', field: 'all', unit: 'all', quickStartAll: true })}
            onDailyChallenge={() => setScreen({ type: 'quiz', field: 'all', unit: 'all', quickStartDaily: true, dailyChallenge: true })}
            onReview={() => setScreen({ type: 'quiz', field: 'all', unit: 'all', reviewMode: true })}
            onTimeAttack={() => setScreen('time-attack')}
            onTerritoryQuiz={() => setScreen('territory-quiz')}
            onMyPage={() => setScreen('mypage')}
            onOnline={goOnline}
          />
        )
    }
  }

  const content = renderScreen()

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
