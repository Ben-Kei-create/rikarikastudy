'use client'
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ACTIVE_SESSION_ONLINE_WINDOW_MS,
  createSessionToken,
  removeActiveSession,
  upsertActiveSession,
} from '@/lib/activeSessions'
import { GUEST_STUDENT, GUEST_STUDENT_ID, isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { getLevelFromXp, getTotalXpFromSessions } from '@/lib/engagement'
import { claimDailyLoginPeriodicCard, PeriodicCardReward } from '@/lib/periodicCardCollection'

const STORAGE_KEY = 'rika_auth_v3'
const LEGACY_DEVICE_LOCK_KEY = 'rika_device_lock_v1'
const SESSION_TIMEOUT_MS = 10 * 60 * 1000
const PRESENCE_HEARTBEAT_MS = Math.min(60 * 1000, ACTIVE_SESSION_ONLINE_WINDOW_MS - 30 * 1000)

export interface StudentRecord {
  id: number
  nickname: string
  password: string
  student_xp: number
  is_approved: boolean
  gemini_enabled: boolean
}

export const DEFAULT_STUDENTS: StudentRecord[] = [
  { id: 1, nickname: 'S', password: 'rikalove1', student_xp: 0, is_approved: true, gemini_enabled: true },
  { id: 2, nickname: 'M', password: 'rikalove2', student_xp: 0, is_approved: true, gemini_enabled: true },
  { id: 3, nickname: 'T', password: 'rikalove3', student_xp: 0, is_approved: true, gemini_enabled: true },
  { id: 4, nickname: 'K', password: 'rikalove4', student_xp: 0, is_approved: true, gemini_enabled: true },
  { id: 5, nickname: '先生', password: 'rikaadmin2026', student_xp: 0, is_approved: true, gemini_enabled: true },
]

export const LOGIN_STUDENTS: StudentRecord[] = [GUEST_STUDENTS_ENTRY(), ...DEFAULT_STUDENTS]

function GUEST_STUDENTS_ENTRY(): StudentRecord {
  return {
    id: GUEST_STUDENT.id,
    nickname: GUEST_STUDENT.nickname,
    password: GUEST_STUDENT.password,
    student_xp: 0,
    is_approved: false,
    gemini_enabled: false,
  }
}

function mergeWithDefaults(students: Array<Partial<StudentRecord> & { id: number }>) {
  const defaultIds = new Set(DEFAULT_STUDENTS.map(s => s.id))
  const merged: StudentRecord[] = DEFAULT_STUDENTS.map(defaultStudent => {
    const current = students.find(student => student.id === defaultStudent.id)
    return {
      id: defaultStudent.id,
      nickname: current?.nickname?.trim() || defaultStudent.nickname,
      password: current?.password?.trim() || defaultStudent.password,
      student_xp: typeof current?.student_xp === 'number' ? current.student_xp : defaultStudent.student_xp,
      is_approved: typeof current?.is_approved === 'boolean' ? current.is_approved : defaultStudent.is_approved,
      gemini_enabled: typeof current?.gemini_enabled === 'boolean' ? current.gemini_enabled : defaultStudent.gemini_enabled,
    }
  })

  // 登録済みユーザー（ID 6以降）も含める
  for (const student of students) {
    if (defaultIds.has(student.id)) continue
    merged.push({
      id: student.id,
      nickname: student.nickname?.trim() || `ID ${student.id}`,
      password: student.password?.trim() || '',
      student_xp: typeof student.student_xp === 'number' ? student.student_xp : 0,
      is_approved: typeof student.is_approved === 'boolean' ? student.is_approved : false,
      gemini_enabled: typeof student.gemini_enabled === 'boolean' ? student.gemini_enabled : false,
    })
  }

  return merged
}

async function queryStudents(): Promise<StudentRecord[] | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, nickname, password, student_xp, is_approved, gemini_enabled')
    .order('id', { ascending: true })

  if (!error && data) return mergeWithDefaults(data)

  // gemini_enabled or is_approved 列がない旧スキーマにフォールバック
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('students')
    .select('id, nickname, password, student_xp')
    .order('id', { ascending: true })

  if (!fallbackError && fallbackData) return mergeWithDefaults(fallbackData)

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
  if (studentId === GUEST_STUDENT_ID) return GUEST_STUDENTS_ENTRY()
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
  isApproved: boolean
  ready: boolean
  notice: string | null
  pendingLoginCardReward: PeriodicCardReward | null
}

interface UpdateProfileInput {
  nickname?: string
  password?: string
}

interface UpdateProfileResult {
  ok: boolean
  message: string
}

interface RegisterInput {
  nickname: string
  password: string
}

interface AuthContextType extends AuthState {
  login: (studentId: number, password: string) => Promise<UpdateProfileResult>
  logout: (reason?: 'manual' | 'expired') => void
  register: (input: RegisterInput) => Promise<UpdateProfileResult & { studentId?: number }>
  refreshProfile: () => Promise<void>
  updateProfile: (updates: UpdateProfileInput) => Promise<UpdateProfileResult>
  dismissLoginCardReward: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

function persistSession(studentId: number, lastActivityAt: number, sessionToken: string | null) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ studentId, lastActivityAt, sessionToken }))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const lastActivityAtRef = useRef<number | null>(null)
  const sessionTokenRef = useRef<string | null>(null)
  const lastPresenceSyncAtRef = useRef<number>(0)
  const [state, setState] = useState<AuthState>({
    studentId: null,
    nickname: null,
    isApproved: false,
    ready: false,
    notice: null,
    pendingLoginCardReward: null,
  })

  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      try {
        localStorage.removeItem(LEGACY_DEVICE_LOCK_KEY)

        const saved = sessionStorage.getItem(STORAGE_KEY)
        if (!saved) {
          return
        }

        const parsed = JSON.parse(saved) as { studentId?: number; lastActivityAt?: number; sessionToken?: string }
        if (parsed.studentId === undefined || parsed.studentId === null) {
          return
        }

        const lastActivityAt = parsed.lastActivityAt ?? 0
        if (!lastActivityAt || Date.now() - lastActivityAt > SESSION_TIMEOUT_MS) {
          void removeActiveSession((parsed as { sessionToken?: string }).sessionToken ?? null)
          sessionStorage.removeItem(STORAGE_KEY)
          if (!cancelled) {
            setState(prev => ({
              ...prev,
              studentId: null,
              nickname: null,
              isApproved: false,
              notice: '10分操作がなかったため、ログアウトしました。',
              pendingLoginCardReward: null,
            }))
          }
          return
        }

        const student = await fetchStudentById(parsed.studentId)
        if (!student || cancelled) return

        lastActivityAtRef.current = lastActivityAt
        sessionTokenRef.current = parsed.sessionToken || createSessionToken()
        persistSession(student.id, lastActivityAt, sessionTokenRef.current)

        setState({
          studentId: student.id,
          nickname: student.nickname,
          isApproved: student.is_approved,
          ready: true,
          notice: null,
          pendingLoginCardReward: null,
        })
        return
      } catch {
        // session restore failed – fall through to unauthenticated state
      }

      sessionStorage.removeItem(STORAGE_KEY)
      if (!cancelled) {
        setState(prev => ({ ...prev, studentId: null, nickname: null, isApproved: false, pendingLoginCardReward: null }))
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
    const isGuest = isGuestStudentId(studentId)
    const student = await fetchStudentById(studentId)

    if (!student || (!isGuest && student.password !== password.trim())) {
      return {
        ok: false,
        message: 'ID またはパスワードが違います',
      }
    }

    const lastActivityAt = Date.now()
    lastActivityAtRef.current = lastActivityAt
    sessionTokenRef.current = createSessionToken()

    const currentLevel = isGuest
      ? getLevelFromXp(getTotalXpFromSessions(loadGuestStudyStore().sessions))
      : getLevelFromXp(student.student_xp)
    const pendingLoginCardReward = await claimDailyLoginPeriodicCard(student.id, currentLevel)

    const next = {
      studentId: student.id,
      nickname: student.nickname,
      isApproved: student.is_approved,
      ready: true,
      notice: null,
      pendingLoginCardReward,
    }
    setState(next)
    persistSession(student.id, lastActivityAt, sessionTokenRef.current)
    if (sessionTokenRef.current && !isGuest) {
      void upsertActiveSession(student.id, sessionTokenRef.current)
    }
    return { ok: true, message: '' }
  }

  const register = async (input: RegisterInput): Promise<UpdateProfileResult & { studentId?: number }> => {
    const nickname = input.nickname.trim()
    const password = input.password.trim()
    if (!nickname) return { ok: false, message: 'ニックネームを入力してください。' }
    if (!password) return { ok: false, message: 'パスワードを入力してください。' }
    if (password.length < 4) return { ok: false, message: 'パスワードは4文字以上にしてください。' }

    // シーケンスから新しいIDを取得
    const { data: seqData, error: seqError } = await supabase.rpc('nextval', { seq_name: 'students_id_seq' })

    let newId: number | null = null
    if (!seqError && seqData != null) {
      newId = typeof seqData === 'number' ? seqData : Number(seqData)
    }

    // rpc が使えない場合のフォールバック: MAX(id) + 1
    if (newId === null || isNaN(newId)) {
      const { data: maxData } = await supabase
        .from('students')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .single()
      newId = (maxData?.id ?? 5) + 1
    }

    const { error: insertError } = await supabase
      .from('students')
      .insert({
        id: newId,
        nickname,
        password,
        is_approved: false,
        student_xp: 0,
      })

    if (insertError) {
      return { ok: false, message: `登録に失敗しました: ${insertError.message}` }
    }

    return {
      ok: true,
      message: `登録完了！ あなたのIDは ${newId} です。管理者の承認後にすべての機能が使えるようになります。`,
      studentId: newId ?? undefined,
    }
  }

  const logout = (reason: 'manual' | 'expired' = 'manual') => {
    void removeActiveSession(sessionTokenRef.current)
    lastActivityAtRef.current = null
    sessionTokenRef.current = null
    setState(prev => ({
      ...prev,
      studentId: null,
      nickname: null,
      isApproved: false,
      ready: true,
      notice: reason === 'expired' ? '10分操作がなかったため、ログアウトしました。' : null,
      pendingLoginCardReward: null,
    }))
    sessionStorage.removeItem(STORAGE_KEY)
  }

  const refreshProfile = async () => {
    if (state.studentId === null || isGuestStudentId(state.studentId)) return
    const student = await fetchStudentById(state.studentId)
    if (!student) return
    setState(prev => ({ ...prev, nickname: student.nickname }))
  }

  const updateProfile = async (updates: UpdateProfileInput): Promise<UpdateProfileResult> => {
    if (state.studentId === null) {
      return { ok: false, message: 'ログインしてから変更してください。' }
    }

    if (isGuestStudentId(state.studentId)) {
      return { ok: false, message: 'ゲストモードでは変更できません。' }
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
    persistSession(state.studentId, lastActivityAtRef.current ?? Date.now(), sessionTokenRef.current)

    return {
      ok: true,
      message: payload.password ? 'パスワードを変更しました。' : 'ニックネームを変更しました。',
    }
  }

  useEffect(() => {
    const studentId = state.studentId
    if (studentId === null || isGuestStudentId(studentId)) return

    const syncPresence = (force = false) => {
      const sessionToken = sessionTokenRef.current
      if (!sessionToken) return
      const now = Date.now()
      if (!force && now - lastPresenceSyncAtRef.current < PRESENCE_HEARTBEAT_MS - 1000) return
      lastPresenceSyncAtRef.current = now
      void upsertActiveSession(studentId, sessionToken)
    }

    const touchSession = () => {
      const now = Date.now()
      lastActivityAtRef.current = now
      persistSession(studentId, now, sessionTokenRef.current)
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
    syncPresence(true)
    const timeoutId = window.setInterval(expireIfNeeded, 15 * 1000)
    const heartbeatId = window.setInterval(() => syncPresence(true), PRESENCE_HEARTBEAT_MS)
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'focus']

    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, touchSession, { passive: true })
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        expireIfNeeded()
        syncPresence(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(timeoutId)
      window.clearInterval(heartbeatId)
      activityEvents.forEach(eventName => {
        window.removeEventListener(eventName, touchSession)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [state.studentId])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, register, refreshProfile, updateProfile, dismissLoginCardReward: () => setState(prev => ({ ...prev, pendingLoginCardReward: null })) }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
