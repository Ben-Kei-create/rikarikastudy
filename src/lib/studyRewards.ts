'use client'

import { BADGE_DEFINITIONS, BadgeDefinition, evaluateNewBadgeKeys } from '@/lib/badges'
import {
  calculateQuizXp,
  getJstDateKey,
  getLevelFromXp,
  SessionMode,
} from '@/lib/engagement'
import {
  getGuestEarnedBadges,
  getGuestTimeAttackBest,
  hasGuestDailyChallengeCompleted,
  isGuestStudentId,
  loadGuestStudyStore,
  markGuestDailyChallengeCompleted,
  saveGuestBadges,
  saveGuestQuizSession,
  saveGuestTimeAttackBest,
} from '@/lib/guestStudy'
import { supabase } from '@/lib/supabase'

interface AnswerLogInput {
  qId: string
  correct: boolean
  answer: string
}

interface RecordStudySessionInput {
  studentId: number | null
  field: string
  unit: string
  totalQuestions: number
  correctCount: number
  durationSeconds: number
  answerLogs?: AnswerLogInput[]
  sessionMode?: SessionMode
  xpMultiplier?: number
  xpOverride?: number
}

export interface StudyRewardSummary {
  sessionId: string | null
  xpEarned: number
  previousXp: number
  totalXp: number
  levelBefore: number
  levelAfter: number
  leveledUp: boolean
  newBadges: BadgeDefinition[]
}

type BadgeSessionRow = {
  field: string
  unit: string
  total_questions: number
  correct_count: number
  duration_seconds: number
  created_at: string
  session_mode: SessionMode | null
}

async function fetchStudentXp(studentId: number) {
  const { data } = await supabase
    .from('students')
    .select('student_xp')
    .eq('id', studentId)
    .single()

  return data?.student_xp ?? 0
}

async function updateStudentXp(studentId: number, totalXp: number) {
  const { error } = await supabase
    .from('students')
    .update({ student_xp: totalXp })
    .eq('id', studentId)

  if (error) {
    console.error('[engagement] failed to update student_xp', error)
  }
}

async function fetchStudentBadgeKeys(studentId: number) {
  const { data, error } = await supabase
    .from('student_badges')
    .select('badge_key')
    .eq('student_id', studentId)

  if (error) {
    console.error('[engagement] failed to load student_badges', error)
    return []
  }

  return (data || []).map(row => row.badge_key)
}

async function fetchStudentSessions(studentId: number) {
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('field, unit, total_questions, correct_count, duration_seconds, created_at, session_mode')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[engagement] failed to load quiz_sessions for badges', error)
    return []
  }

  return (data || []) as BadgeSessionRow[]
}

async function insertStudentBadges(studentId: number, badgeKeys: string[]) {
  if (badgeKeys.length === 0) return

  const { error } = await supabase
    .from('student_badges')
    .insert(
      badgeKeys.map(badgeKey => ({
        student_id: studentId,
        badge_key: badgeKey,
      })),
    )

  if (error) {
    console.error('[engagement] failed to insert student_badges', error)
  }
}

function resolveNewBadges(badgeKeys: string[]) {
  const map = new Map(BADGE_DEFINITIONS.map(badge => [badge.key, badge]))
  return badgeKeys
    .map(key => map.get(key) ?? null)
    .filter((badge): badge is BadgeDefinition => badge !== null)
}

export async function hasCompletedDailyChallenge(studentId: number | null) {
  if (studentId === null) return false
  if (isGuestStudentId(studentId)) return hasGuestDailyChallengeCompleted()

  const todayKey = getJstDateKey()
  const { data, error } = await supabase
    .from('daily_challenges')
    .select('date')
    .eq('student_id', studentId)
    .eq('date', todayKey)
    .maybeSingle()

  if (error) {
    console.error('[engagement] failed to load daily_challenges', error)
    return false
  }

  return Boolean(data)
}

async function markDailyChallengeCompleted(studentId: number, sessionId: string) {
  const todayKey = getJstDateKey()
  const { error } = await supabase
    .from('daily_challenges')
    .upsert(
      {
        student_id: studentId,
        date: todayKey,
        session_id: sessionId,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,date' },
    )

  if (error) {
    console.error('[engagement] failed to save daily_challenges', error)
  }
}

export async function recordStudySession({
  studentId,
  field,
  unit,
  totalQuestions,
  correctCount,
  durationSeconds,
  answerLogs = [],
  sessionMode = 'standard',
  xpMultiplier = 1,
  xpOverride,
}: RecordStudySessionInput): Promise<StudyRewardSummary> {
  if (studentId === null) {
    return {
      sessionId: null,
      xpEarned: 0,
      previousXp: 0,
      totalXp: 0,
      levelBefore: 1,
      levelAfter: 1,
      leveledUp: false,
      newBadges: [],
    }
  }

  const xpEarned = xpOverride ?? calculateQuizXp({
    correctCount,
    totalQuestions,
    durationSeconds,
    multiplier: xpMultiplier,
  })

  if (isGuestStudentId(studentId)) {
    const guestStoreBefore = loadGuestStudyStore()
    const previousXp = guestStoreBefore.xp
    const currentStore = saveGuestQuizSession({
      field,
      unit,
      totalQuestions,
      correctCount,
      durationSeconds,
      xpEarned,
      sessionMode,
      answerLogs,
    })

    if (sessionMode === 'daily_challenge') {
      markGuestDailyChallengeCompleted(currentStore.sessionId)
    }

    const totalXp = currentStore.store.xp
    const newBadgeKeys = evaluateNewBadgeKeys({
      sessions: currentStore.store.sessions,
      existingBadgeKeys: getGuestEarnedBadges().map(badge => badge.badge_key),
      totalXp,
    })
    saveGuestBadges(newBadgeKeys)

    const levelBefore = getLevelFromXp(Math.max(0, totalXp - xpEarned))
    const levelAfter = getLevelFromXp(totalXp)

    return {
      sessionId: currentStore.sessionId,
      xpEarned,
      previousXp,
      totalXp,
      levelBefore,
      levelAfter,
      leveledUp: levelAfter > levelBefore,
      newBadges: resolveNewBadges(newBadgeKeys),
    }
  }

  const previousXp = await fetchStudentXp(studentId)
  const totalXp = previousXp + xpEarned

  const { data: sessionData, error: sessionError } = await supabase
    .from('quiz_sessions')
    .insert({
      student_id: studentId,
      field,
      unit,
      total_questions: totalQuestions,
      correct_count: correctCount,
      duration_seconds: durationSeconds,
      xp_earned: xpEarned,
      session_mode: sessionMode,
    })
    .select()
    .single()

  if (sessionError) {
    console.error('[engagement] failed to save quiz_session', sessionError)
    return {
      sessionId: null,
      xpEarned: 0,
      previousXp,
      totalXp: previousXp,
      levelBefore: getLevelFromXp(previousXp),
      levelAfter: getLevelFromXp(previousXp),
      leveledUp: false,
      newBadges: [],
    }
  }

  if (answerLogs.length > 0) {
    const { error: logError } = await supabase
      .from('answer_logs')
      .insert(
        answerLogs.map(log => ({
          session_id: sessionData.id,
          student_id: studentId,
          question_id: log.qId,
          is_correct: log.correct,
          student_answer: log.answer,
        })),
      )

    if (logError) {
      console.error('[engagement] failed to save answer_logs', logError)
    }
  }

  await updateStudentXp(studentId, totalXp)

  if (sessionMode === 'daily_challenge') {
    await markDailyChallengeCompleted(studentId, sessionData.id)
  }

  const [sessions, existingBadgeKeys] = await Promise.all([
    fetchStudentSessions(studentId),
    fetchStudentBadgeKeys(studentId),
  ])

  const newBadgeKeys = evaluateNewBadgeKeys({
    sessions,
    existingBadgeKeys,
    totalXp,
  })

  await insertStudentBadges(studentId, newBadgeKeys)

  const levelBefore = getLevelFromXp(previousXp)
  const levelAfter = getLevelFromXp(totalXp)

  return {
    sessionId: sessionData.id,
    xpEarned,
    previousXp,
    totalXp,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
    newBadges: resolveNewBadges(newBadgeKeys),
  }
}

export async function loadEarnedBadgeRecords(studentId: number | null) {
  if (studentId === null) return []
  if (isGuestStudentId(studentId)) return getGuestEarnedBadges()

  const { data, error } = await supabase
    .from('student_badges')
    .select('badge_key, earned_at')
    .eq('student_id', studentId)
    .order('earned_at', { ascending: false })

  if (error) {
    console.error('[engagement] failed to load earned badges', error)
    return []
  }

  return data || []
}

export async function loadTimeAttackBest(studentId: number | null) {
  if (studentId === null) return { personalBest: 0, allTimeBest: 0 }
  if (isGuestStudentId(studentId)) {
    const guestBest = getGuestTimeAttackBest()
    const { data } = await supabase
      .from('time_attack_records')
      .select('best_score')
      .order('best_score', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      personalBest: guestBest,
      allTimeBest: data?.best_score ?? guestBest,
    }
  }

  const [personalResponse, allTimeResponse] = await Promise.all([
    supabase.from('time_attack_records').select('best_score').eq('student_id', studentId).maybeSingle(),
    supabase.from('time_attack_records').select('best_score').order('best_score', { ascending: false }).limit(1).maybeSingle(),
  ])

  return {
    personalBest: personalResponse.data?.best_score ?? 0,
    allTimeBest: allTimeResponse.data?.best_score ?? 0,
  }
}

export async function saveTimeAttackBest(studentId: number | null, score: number) {
  if (studentId === null) return score

  if (isGuestStudentId(studentId)) {
    const store = saveGuestTimeAttackBest(score)
    return store.timeAttackBest
  }

  const current = await loadTimeAttackBest(studentId)
  const nextBest = Math.max(current.personalBest, score)

  const { error } = await supabase
    .from('time_attack_records')
    .upsert(
      {
        student_id: studentId,
        best_score: nextBest,
        achieved_at: new Date().toISOString(),
      },
      { onConflict: 'student_id' },
    )

  if (error) {
    console.error('[engagement] failed to save time_attack_records', error)
  }

  return nextBest
}
