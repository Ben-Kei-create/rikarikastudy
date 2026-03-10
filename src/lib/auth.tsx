'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// 個人パスワード → studentId のマッピング
// ここを変更すれば生徒のPWを自由に変えられる
export const STUDENT_PASSWORDS: Record<string, number> = {
  'yuki2024': 1,
  'aoi2024':  2,
  'riku2024': 3,
  'hana2024': 4,
}

export const STUDENTS: Record<number, string> = {
  1: 'ゆうき',
  2: 'あおい',
  3: 'りく',
  4: 'はな',
}

interface AuthState {
  studentId: number | null
  nickname: string | null
}

interface AuthContextType extends AuthState {
  login: (password: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    studentId: null,
    nickname: null,
  })

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('rika_auth_v2')
      if (saved) {
        const parsed = JSON.parse(saved)
        setState(parsed)
      }
    } catch {}
  }, [])

  const login = (password: string) => {
    const id = STUDENT_PASSWORDS[password.trim()]
    if (id !== undefined) {
      const next = { studentId: id, nickname: STUDENTS[id] }
      setState(next)
      sessionStorage.setItem('rika_auth_v2', JSON.stringify(next))
      return true
    }
    return false
  }

  const logout = () => {
    setState({ studentId: null, nickname: null })
    sessionStorage.removeItem('rika_auth_v2')
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
