'use client'
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'rika_auth_v3'
const DEVICE_LOCK_KEY = 'rika_device_lock_v1'
const SESSION_TIMEOUT_MS = 10 * 60 * 1000

export interface StudentRecord {
  id: number
  nickname: string
  password: string
}

export const DEFAULT_STUDENTS: StudentRecord[] = [
  { id: 1, nickname: 'S', password: 'rikalove1' },
  { id: 2, nickname: 'M', password: 'rikalove2' },
  { id: 3, nickname: 'T', password: 'rikalove3' },
  { id: 4, nickname: 'K', password: 'rikalove4' },
  { id: 5, nickname: '先生', password: 'rikaadmin2026' },
]

function mergeWithDefaults(students: Array<Partial<StudentRecord> & { id: number }>) {
  return DEFAULT_STUDENTS.map(defaultStudent => {
    const current = students.find(student => student.id === defaultStudent.id)
    return {
      id: defaultStudent.id,
      nickname: current?.nickname?.trim() || defaultStudent.nickname,
      password: current?.password?.trim() || defaultStudent.password,
    }
  })
}

async function queryStudents(): Promise<StudentRecord[] | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, nickname, password')
    .order('id', { ascending: true })

  if (!error && data) return mergeWithDefaults(data)

  const { data: legacyData, error: legacyError } = await supabase
    .from('students')
    .select('id, nickname')
    .order('id', { ascending: true })

  if (!legacyError && legacyData) {
    return mergeWithDefaults(legacyData)
  }

  return null
}

export async function fetchStudents() {
  return (await queryStudents()) ?? DEFAULT_STUDENTS
}

async function fetchStudentById(studentId: number) {
  const students = (await queryStudents()) ?? DEFAULT_STUDENTS
  return students.find(student => student.id === studentId) ?? null
}

function getUpdateErrorMessage(message: string) {
  if (message.includes('password')) {
    return 'Supabase の students テーブルに password 列がありません。更新した supabase_schema.sql を SQL Editor で実行してください。'
  }
  return `保存に失敗しました: ${message}`
}

interface AuthState {
  studentId: number | null
  nickname: string | null
  ready: boolean
  lockedStudentId: number | null
  notice: string | null
}

interface UpdateProfileInput {
  nickname?: string
  password?: string
}

interface UpdateProfileResult {
  ok: boolean
  message: string
}

interface AuthContextType extends AuthState {
  login: (studentId: number, password: string) => Promise<UpdateProfileResult>
  logout: (reason?: 'manual' | 'expired') => void
  refreshProfile: () => Promise<void>
  updateProfile: (updates: UpdateProfileInput) => Promise<UpdateProfileResult>
  clearDeviceLock: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

function persistSession(studentId: number, lastActivityAt: number) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ studentId, lastActivityAt }))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const lastActivityAtRef = useRef<number | null>(null)
  const [state, setState] = useState<AuthState>({
    studentId: null,
    nickname: null,
    ready: false,
    lockedStudentId: null,
    notice: null,
  })

  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      let lockedStudentId: number | null = null

      try {
        const lockRaw = localStorage.getItem(DEVICE_LOCK_KEY)
        if (lockRaw) {
          const parsedLock = Number(lockRaw)
          if (Number.isInteger(parsedLock) && parsedLock >= 1 && parsedLock <= 5) {
            lockedStudentId = parsedLock
          } else {
            localStorage.removeItem(DEVICE_LOCK_KEY)
          }
        }

        const saved = sessionStorage.getItem(STORAGE_KEY)
        if (!saved) {
          if (!cancelled) {
            setState(prev => ({ ...prev, lockedStudentId }))
          }
          return
        }

        const parsed = JSON.parse(saved) as { studentId?: number; lastActivityAt?: number }
        if (!parsed.studentId) {
          if (!cancelled) {
            setState(prev => ({ ...prev, lockedStudentId }))
          }
          return
        }

        const lastActivityAt = parsed.lastActivityAt ?? 0
        if (!lastActivityAt || Date.now() - lastActivityAt > SESSION_TIMEOUT_MS) {
          sessionStorage.removeItem(STORAGE_KEY)
          if (!cancelled) {
            setState(prev => ({
              ...prev,
              studentId: null,
              nickname: null,
              lockedStudentId,
              notice: '10分操作がなかったため、ログアウトしました。',
            }))
          }
          return
        }

        const student = await fetchStudentById(parsed.studentId)
        if (!student || cancelled) return

        lastActivityAtRef.current = lastActivityAt

        setState({
          studentId: student.id,
          nickname: student.nickname,
          ready: true,
          lockedStudentId,
          notice: null,
        })
        return
      } catch {}

      sessionStorage.removeItem(STORAGE_KEY)
      if (!cancelled) {
        setState(prev => ({ ...prev, studentId: null, nickname: null }))
      }
    }

    // Safety timeout: force ready after 5s even if Supabase hangs
    let safetyTimer: ReturnType<typeof setTimeout> | undefined
    if (typeof window !== 'undefined') {
      safetyTimer = setTimeout(() => {
        if (!cancelled) {
          setState(prev => prev.ready ? prev : { ...prev, ready: true })
        }
      }, 5000)
    }

    restore().finally(() => {
      if (safetyTimer !== undefined) clearTimeout(safetyTimer)
      if (!cancelled) {
        setState(prev => ({ ...prev, ready: true }))
      }
    })

    return () => {
      cancelled = true
      if (safetyTimer !== undefined) clearTimeout(safetyTimer)
    }
  }, [])

  const login = async (studentId: number, password: string) => {
    if (state.lockedStudentId && state.lockedStudentId !== studentId) {
      return {
        ok: false,
        message: `この端末は ID ${state.lockedStudentId} 用に固定されています。切り替えはもぎ先生ログインから解除してください。`,
      }
    }

    const student = await fetchStudentById(studentId)
    if (!student || student.password !== password.trim()) {
      return {
        ok: false,
        message: 'ID またはパスワードが違います',
      }
    }

    const nextLockedStudentId = state.lockedStudentId ?? student.id
    if (!state.lockedStudentId) {
      localStorage.setItem(DEVICE_LOCK_KEY, String(student.id))
    }

    const lastActivityAt = Date.now()
    lastActivityAtRef.current = lastActivityAt

    const next = {
      studentId: student.id,
      nickname: student.nickname,
      ready: true,
      lockedStudentId: nextLockedStudentId,
      notice: null,
    }
    setState(next)
    persistSession(student.id, lastActivityAt)
    return { ok: true, message: '' }
  }

  const logout = (reason: 'manual' | 'expired' = 'manual') => {
    lastActivityAtRef.current = null
    setState(prev => ({
      ...prev,
      studentId: null,
      nickname: null,
      ready: true,
      notice: reason === 'expired' ? '10分操作がなかったため、ログアウトしました。' : null,
    }))
    sessionStorage.removeItem(STORAGE_KEY)
  }

  const refreshProfile = async () => {
    if (!state.studentId) return
    const student = await fetchStudentById(state.studentId)
    if (!student) return
    setState(prev => ({ ...prev, nickname: student.nickname }))
  }

  const clearDeviceLock = () => {
    localStorage.removeItem(DEVICE_LOCK_KEY)
    setState(prev => ({ ...prev, lockedStudentId: null }))
  }

  const updateProfile = async (updates: UpdateProfileInput): Promise<UpdateProfileResult> => {
    if (!state.studentId) {
      return { ok: false, message: 'ログインしてから変更してください。' }
    }

    const payload: UpdateProfileInput = {}

    if (updates.nickname !== undefined) {
      const nickname = updates.nickname.trim()
      if (!nickname) return { ok: false, message: 'ニックネームを入力してください。' }
      payload.nickname = nickname
    }

    if (updates.password !== undefined) {
      const password = updates.password.trim()
      if (!password) return { ok: false, message: '新しいパスワードを入力してください。' }
      payload.password = password
    }

    if (!payload.nickname && !payload.password) {
      return { ok: false, message: '変更内容がありません。' }
    }

    const { error } = await supabase
      .from('students')
      .update(payload)
      .eq('id', state.studentId)

    if (error) {
      return { ok: false, message: getUpdateErrorMessage(error.message) }
    }

    if (payload.nickname) {
      setState(prev => ({ ...prev, nickname: payload.nickname || prev.nickname }))
    }
    persistSession(state.studentId, lastActivityAtRef.current ?? Date.now())

    return {
      ok: true,
      message: payload.password ? 'パスワードを変更しました。' : 'ニックネームを変更しました。',
    }
  }

  useEffect(() => {
    const studentId = state.studentId
    if (!studentId) return

    const touchSession = () => {
      const now = Date.now()
      lastActivityAtRef.current = now
      persistSession(studentId, now)
    }

    const expireIfNeeded = () => {
      const lastActivityAt = lastActivityAtRef.current
      if (!lastActivityAt) return

      const inactiveMs = Date.now() - lastActivityAt
      if (inactiveMs >= SESSION_TIMEOUT_MS) {
        logout('expired')
      }
    }

    touchSession()
    const timeoutId = window.setInterval(expireIfNeeded, 15 * 1000)
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'focus']

    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, touchSession, { passive: true })
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') expireIfNeeded()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(timeoutId)
      activityEvents.forEach(eventName => {
        window.removeEventListener(eventName, touchSession)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [state.studentId])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshProfile, updateProfile, clearDeviceLock }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
