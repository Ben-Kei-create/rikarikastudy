'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { getLevelFromXp } from '@/lib/engagement'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { supabase } from '@/lib/supabase'

export type Theme = 'dark' | 'light' | 'cute'

const STORAGE_KEY = 'rikaquiz-theme'
const DEFAULT_THEME: Theme = 'dark'

export const THEME_OPTIONS = [
  { id: 'dark', label: 'ダーク', unlockLevel: 1, description: '最初から使える基本テーマ。' },
  { id: 'light', label: 'ライト', unlockLevel: 10, description: '明るく見やすいノート風テーマ。' },
  { id: 'cute', label: 'かわいい', unlockLevel: 20, description: 'やわらかい色合いのポップテーマ。' },
] as const satisfies readonly { id: Theme; label: string; unlockLevel: number; description: string }[]

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  ready: boolean
} | null>(null)

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'dark' || value === 'light' || value === 'cute'
}

export function getThemeUnlockLevel(theme: Theme) {
  return THEME_OPTIONS.find(option => option.id === theme)?.unlockLevel ?? 1
}

export function isThemeUnlockedAtLevel(theme: Theme, level: number) {
  return Math.max(1, level) >= getThemeUnlockLevel(theme)
}

function sanitizeTheme(theme: string | null | undefined, level: number): Theme {
  if (isTheme(theme) && isThemeUnlockedAtLevel(theme, level)) return theme
  return DEFAULT_THEME
}

function getColorScheme(theme: Theme) {
  return theme === 'dark' ? 'dark' : 'light'
}

async function loadCurrentLevel(studentId: number | null) {
  if (studentId === null) return 1

  if (isGuestStudentId(studentId)) {
    return getLevelFromXp(loadGuestStudyStore().xp)
  }

  const response = await supabase
    .from('students')
    .select('student_xp')
    .eq('id', studentId)
    .single()

  return getLevelFromXp(response.data?.student_xp ?? 0)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { studentId, ready: authReady } = useAuth()
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)
  const [ready, setReady] = useState(false)
  const [currentLevel, setCurrentLevel] = useState(1)

  useEffect(() => {
    let active = true

    const syncTheme = async () => {
      if (!authReady) return

      setReady(false)
      const nextLevel = await loadCurrentLevel(studentId)
      if (!active) return

      const storedTheme = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY)
      setCurrentLevel(nextLevel)
      setThemeState(sanitizeTheme(storedTheme, nextLevel))
      setReady(true)
    }

    void syncTheme()
    return () => {
      active = false
    }
  }, [authReady, studentId])

  useEffect(() => {
    if (!ready) return

    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = getColorScheme(theme)
  }, [ready, theme])

  const setTheme = (nextTheme: Theme) => {
    const resolvedTheme = sanitizeTheme(nextTheme, currentLevel)
    if (typeof window !== 'undefined' && resolvedTheme === nextTheme) {
      window.localStorage.setItem(STORAGE_KEY, nextTheme)
    }
    setThemeState(resolvedTheme)
  }

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => {
        const unlockedThemes = THEME_OPTIONS
          .filter(option => isThemeUnlockedAtLevel(option.id, currentLevel))
          .map(option => option.id)
        const currentIndex = unlockedThemes.indexOf(theme)
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % unlockedThemes.length : 0
        setTheme(unlockedThemes[nextIndex] ?? DEFAULT_THEME)
      },
      ready,
    }),
    [currentLevel, ready, theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
