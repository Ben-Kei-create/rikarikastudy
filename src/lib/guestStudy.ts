'use client'

export const GUEST_STUDENT_ID = 100
export const GUEST_STUDENT = {
  id: GUEST_STUDENT_ID,
  nickname: 'ゲスト',
  password: '',
}

const GUEST_STUDY_STORAGE_KEY = 'rika_guest_daily_study_v1'

export interface GuestStudySession {
  id: string
  student_id: number
  field: string
  unit: string
  total_questions: number
  correct_count: number
  duration_seconds: number
  created_at: string
}

export interface GuestStudyAnswerLog {
  id: string
  question_id: string
  field: string
  unit: string
  is_correct: boolean
  student_answer: string
  created_at: string
}

interface GuestStudyStore {
  dayKey: string
  sessions: GuestStudySession[]
  answerLogs: GuestStudyAnswerLog[]
}

interface SaveGuestQuizSessionInput {
  field: string
  unit: string
  totalQuestions: number
  correctCount: number
  durationSeconds: number
  answerLogs?: Array<{
    qId: string
    correct: boolean
    answer: string
  }>
}

function getTodayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createEmptyStore(): GuestStudyStore {
  return {
    dayKey: getTodayKey(),
    sessions: [],
    answerLogs: [],
  }
}

function sanitizeStore(input: unknown): GuestStudyStore {
  const todayKey = getTodayKey()

  if (!input || typeof input !== 'object') {
    return createEmptyStore()
  }

  const candidate = input as Partial<GuestStudyStore>
  if (candidate.dayKey !== todayKey) {
    return createEmptyStore()
  }

  return {
    dayKey: todayKey,
    sessions: Array.isArray(candidate.sessions)
      ? candidate.sessions.filter(session => session && typeof session === 'object') as GuestStudySession[]
      : [],
    answerLogs: Array.isArray(candidate.answerLogs)
      ? candidate.answerLogs.filter(log => log && typeof log === 'object') as GuestStudyAnswerLog[]
      : [],
  }
}

function readStore() {
  if (typeof window === 'undefined') return createEmptyStore()

  try {
    const raw = window.localStorage.getItem(GUEST_STUDY_STORAGE_KEY)
    return sanitizeStore(raw ? JSON.parse(raw) : null)
  } catch {
    return createEmptyStore()
  }
}

function writeStore(store: GuestStudyStore) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(GUEST_STUDY_STORAGE_KEY, JSON.stringify(store))
  } catch {}
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`
}

export function isGuestStudentId(studentId: number | null | undefined) {
  return studentId === GUEST_STUDENT_ID
}

export function loadGuestStudyStore() {
  const store = readStore()
  writeStore(store)
  return store
}

export function saveGuestQuizSession(input: SaveGuestQuizSessionInput) {
  const store = readStore()
  const createdAt = new Date().toISOString()

  const nextSession: GuestStudySession = {
    id: createId('guest-session'),
    student_id: GUEST_STUDENT_ID,
    field: input.field,
    unit: input.unit,
    total_questions: input.totalQuestions,
    correct_count: input.correctCount,
    duration_seconds: input.durationSeconds,
    created_at: createdAt,
  }

  const nextAnswerLogs = (input.answerLogs ?? []).map(answerLog => ({
    id: createId('guest-answer'),
    question_id: answerLog.qId,
    field: input.field,
    unit: input.unit,
    is_correct: answerLog.correct,
    student_answer: answerLog.answer,
    created_at: createdAt,
  }))

  const nextStore: GuestStudyStore = {
    ...store,
    sessions: [nextSession, ...store.sessions],
    answerLogs: [...nextAnswerLogs, ...store.answerLogs],
  }

  writeStore(nextStore)
  return nextStore
}
