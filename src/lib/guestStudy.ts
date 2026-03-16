'use client'

import { getTotalXpFromSessions, SessionMode } from '@/lib/engagement'

export const GUEST_STUDENT_ID = 100
export const GUEST_STUDENT = {
  id: GUEST_STUDENT_ID,
  nickname: 'ゲスト',
  password: '',
}

const GUEST_STUDY_STORAGE_KEY = 'rika_guest_daily_study_v2'

export interface GuestStudySession {
  id: string
  student_id: number
  field: string
  unit: string
  total_questions: number
  correct_count: number
  duration_seconds: number
  xp_earned: number
  session_mode: SessionMode
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

export interface GuestBadgeRecord {
  badge_key: string
  earned_at: string
}

export interface GuestPeriodicCardRecord {
  card_key: string
  obtain_count: number
  first_obtained_at: string
  last_obtained_at: string
  last_source: 'login' | 'perfect_clear' | 'level_up'
}

interface GuestDailyChallengeState {
  date: string | null
  session_id: string | null
  completed_at: string | null
}

export interface GuestStudyStore {
  dayKey: string
  xp: number
  sessions: GuestStudySession[]
  answerLogs: GuestStudyAnswerLog[]
  badges: GuestBadgeRecord[]
  periodicCards: GuestPeriodicCardRecord[]
  lastPeriodicLoginRewardDate: string | null
  dailyChallenge: GuestDailyChallengeState
  timeAttackBest: number
}

interface SaveGuestQuizSessionInput {
  field: string
  unit: string
  totalQuestions: number
  correctCount: number
  durationSeconds: number
  xpEarned?: number
  sessionMode?: SessionMode
  answerLogs?: Array<{
    qId: string
    correct: boolean
    answer: string
    answerLogValue?: string
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
    xp: 0,
    sessions: [],
    answerLogs: [],
    badges: [],
    periodicCards: [],
    lastPeriodicLoginRewardDate: null,
    dailyChallenge: {
      date: null,
      session_id: null,
      completed_at: null,
    },
    timeAttackBest: 0,
  }
}

function sanitizeBadgeRecords(input: unknown) {
  if (!Array.isArray(input)) return []

  return input
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<GuestBadgeRecord>
      if (typeof row.badge_key !== 'string' || !row.badge_key) return null
      return {
        badge_key: row.badge_key,
        earned_at: typeof row.earned_at === 'string' ? row.earned_at : new Date().toISOString(),
      }
    })
    .filter((item): item is GuestBadgeRecord => item !== null)
}

function sanitizePeriodicCardRecords(input: unknown) {
  if (!Array.isArray(input)) return []

  return input
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<GuestPeriodicCardRecord>
      if (typeof row.card_key !== 'string' || !row.card_key) return null
      return {
        card_key: row.card_key,
        obtain_count: typeof row.obtain_count === 'number' ? Math.max(1, Math.floor(row.obtain_count)) : 1,
        first_obtained_at: typeof row.first_obtained_at === 'string' ? row.first_obtained_at : new Date().toISOString(),
        last_obtained_at: typeof row.last_obtained_at === 'string' ? row.last_obtained_at : new Date().toISOString(),
        last_source: row.last_source === 'login' || row.last_source === 'perfect_clear' || row.last_source === 'level_up'
          ? row.last_source
          : 'login',
      }
    })
    .filter((item): item is GuestPeriodicCardRecord => item !== null)
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

  const sanitizedSessions = Array.isArray(candidate.sessions)
    ? candidate.sessions.filter(session => session && typeof session === 'object') as GuestStudySession[]
    : []

  return {
    dayKey: todayKey,
    xp: getTotalXpFromSessions(sanitizedSessions),
    sessions: sanitizedSessions,
    answerLogs: Array.isArray(candidate.answerLogs)
      ? candidate.answerLogs.filter(log => log && typeof log === 'object') as GuestStudyAnswerLog[]
      : [],
    badges: sanitizeBadgeRecords(candidate.badges),
    periodicCards: sanitizePeriodicCardRecords(candidate.periodicCards),
    lastPeriodicLoginRewardDate: typeof candidate.lastPeriodicLoginRewardDate === 'string' ? candidate.lastPeriodicLoginRewardDate : null,
    dailyChallenge: candidate.dailyChallenge && typeof candidate.dailyChallenge === 'object'
      ? {
          date: typeof candidate.dailyChallenge.date === 'string' ? candidate.dailyChallenge.date : null,
          session_id: typeof candidate.dailyChallenge.session_id === 'string' ? candidate.dailyChallenge.session_id : null,
          completed_at: typeof candidate.dailyChallenge.completed_at === 'string' ? candidate.dailyChallenge.completed_at : null,
        }
      : {
          date: null,
          session_id: null,
          completed_at: null,
        },
    timeAttackBest: typeof candidate.timeAttackBest === 'number' ? Math.max(0, candidate.timeAttackBest) : 0,
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
  } catch {
    // localStorage write failed – ignore
  }
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

export function updateGuestStudyStore(updater: (store: GuestStudyStore) => GuestStudyStore) {
  const current = readStore()
  const next = sanitizeStore(updater(current))
  writeStore(next)
  return next
}

export function saveGuestQuizSession(input: SaveGuestQuizSessionInput) {
  const createdAt = new Date().toISOString()
  const sessionId = createId('guest-session')

  const nextStore = updateGuestStudyStore(store => {
    const nextSession: GuestStudySession = {
      id: sessionId,
      student_id: GUEST_STUDENT_ID,
      field: input.field,
      unit: input.unit,
      total_questions: input.totalQuestions,
      correct_count: input.correctCount,
      duration_seconds: input.durationSeconds,
      xp_earned: input.xpEarned ?? 0,
      session_mode: input.sessionMode ?? 'standard',
      created_at: createdAt,
    }

    const nextAnswerLogs = (input.answerLogs ?? []).map(answerLog => ({
      id: createId('guest-answer'),
      question_id: answerLog.qId,
      field: input.field,
      unit: input.unit,
      is_correct: answerLog.correct,
      student_answer: answerLog.answerLogValue ?? answerLog.answer,
      created_at: createdAt,
    }))

    return {
      ...store,
      xp: store.xp + (input.xpEarned ?? 0),
      sessions: [nextSession, ...store.sessions],
      answerLogs: [...nextAnswerLogs, ...store.answerLogs],
    }
  })

  return {
    store: nextStore,
    sessionId,
  }
}

export function saveGuestBadges(badgeKeys: string[]) {
  const createdAt = new Date().toISOString()

  return updateGuestStudyStore(store => {
    const currentKeys = new Set(store.badges.map(badge => badge.badge_key))
    const nextBadges = [...store.badges]

    for (const badgeKey of badgeKeys) {
      if (currentKeys.has(badgeKey)) continue
      nextBadges.push({
        badge_key: badgeKey,
        earned_at: createdAt,
      })
      currentKeys.add(badgeKey)
    }

    return {
      ...store,
      badges: nextBadges,
    }
  })
}

export function getGuestEarnedBadges() {
  return loadGuestStudyStore().badges
}

export function getGuestPeriodicCards() {
  return loadGuestStudyStore().periodicCards
}

export function hasGuestDailyChallengeCompleted() {
  const store = loadGuestStudyStore()
  return store.dailyChallenge.date === store.dayKey
}

export function markGuestDailyChallengeCompleted(sessionId: string) {
  return updateGuestStudyStore(store => ({
    ...store,
    dailyChallenge: {
      date: store.dayKey,
      session_id: sessionId,
      completed_at: new Date().toISOString(),
    },
  }))
}

export function getGuestTimeAttackBest() {
  return loadGuestStudyStore().timeAttackBest
}

export function saveGuestTimeAttackBest(score: number) {
  return updateGuestStudyStore(store => ({
    ...store,
    timeAttackBest: Math.max(store.timeAttackBest, Math.max(0, score)),
  }))
}
