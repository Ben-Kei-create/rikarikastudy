'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

export const DEFAULT_LOGIN_PASSWORD = 'rikarikalove'
const STORAGE_KEY = 'rika_auth_v3'

export interface StudentRecord {
  id: number
  nickname: string
  password: string
}

export const DEFAULT_STUDENTS: StudentRecord[] = [
  { id: 1, nickname: 'S', password: DEFAULT_LOGIN_PASSWORD },
  { id: 2, nickname: 'M', password: DEFAULT_LOGIN_PASSWORD },
  { id: 3, nickname: 'T', password: DEFAULT_LOGIN_PASSWORD },
  { id: 4, nickname: 'K', password: DEFAULT_LOGIN_PASSWORD },
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
    return mergeWithDefaults(
      legacyData.map(student => ({
        id: student.id,
        nickname: student.nickname,
        password: DEFAULT_LOGIN_PASSWORD,
      }))
    )
  }

  return null
}

export async function fetchStudents() {
  return (await queryStudents()) ?? DEFAULT_STUDENTS
}

async function fetchStudentById(studentId: number) {
  const students = await queryStudents()
  return students?.find(student => student.id === studentId) ?? null
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
  login: (studentId: number, password: string) => Promise<boolean>
  logout: () => void
  refreshProfile: () => Promise<void>
  updateProfile: (updates: UpdateProfileInput) => Promise<UpdateProfileResult>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    studentId: null,
    nickname: null,
    ready: false,
  })

  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY)
        if (!saved) return

        const parsed = JSON.parse(saved) as { studentId?: number }
        if (!parsed.studentId) return

        const student = await fetchStudentById(parsed.studentId)
        if (!student || cancelled) return

        setState({
          studentId: student.id,
          nickname: student.nickname,
          ready: true,
        })
        return
      } catch {}

      sessionStorage.removeItem(STORAGE_KEY)
      if (!cancelled) {
        setState(prev => ({ ...prev, studentId: null, nickname: null }))
      }
    }

    restore().finally(() => {
      if (!cancelled) {
        setState(prev => ({ ...prev, ready: true }))
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const login = async (studentId: number, password: string) => {
    const student = await fetchStudentById(studentId)
    if (!student) return false
    if (student.password !== password.trim()) return false

    const next = {
      studentId: student.id,
      nickname: student.nickname,
      ready: true,
    }
    setState(next)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ studentId: student.id }))
    return true
  }

  const logout = () => {
    setState({ studentId: null, nickname: null, ready: true })
    sessionStorage.removeItem(STORAGE_KEY)
  }

  const refreshProfile = async () => {
    if (!state.studentId) return
    const student = await fetchStudentById(state.studentId)
    if (!student) return
    setState(prev => ({ ...prev, nickname: student.nickname }))
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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ studentId: state.studentId }))

    return {
      ok: true,
      message: payload.password ? 'パスワードを変更しました。' : 'ニックネームを変更しました。',
    }
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
