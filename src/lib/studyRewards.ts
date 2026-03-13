'use client'

import { fetchStudents } from '@/lib/auth'
import { BADGE_DEFINITIONS, BadgeDefinition, evaluateNewBadgeKeys } from '@/lib/badges'
import {
  calculateQuizXp,
  getJstDateKey,
  getLevelFromXp,
  SessionMode,
} from '@/lib/engagement'
import { calculateQuizXp as calculateQuizXpBreakdown, QuizXpBreakdown } from '@/lib/xp'
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
import { claimStudyPeriodicCardReward, PeriodicCardReward } from '@/lib/periodicCardCollection'
import { supabase } from '@/lib/supabase'

const CURRENT_BADGE_KEYS = new Set(BADGE_DEFINITIONS.map(badge => badge.key))

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
  xpBreakdown?: QuizXpBreakdown
}

export interface StudyXpBreakdown extends QuizXpBreakdown {
  multiplier: number
}

export interface StudyRewardSummary {
  sessionId: string | null
  xpEarned: number
  xpBreakdown: StudyXpBreakdown
  previousXp: number
  totalXp: number
  levelBefore: number
  levelAfter: number
  leveledUp: boolean
  newBadges: BadgeDefinition[]
  periodicCardReward: PeriodicCardReward | null
}

export interface DailyChallengeStatus {
  completed: boolean
  completedAt: string | null
}

interface TimeAttackLeader {
  studentId: number
  nickname: string
  score: number
}

interface TimeAttackBestSummary {
  personalBest: number
  allTimeBest: number
  allTimeLeader: TimeAttackLeader | null
  otherLeader: TimeAttackLeader | null
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
  const { data, error } = await supabase
    .from('students')
    .select('student_xp, xp')
    .eq('id', studentId)
    .single()

  if (error) {
    const fallback = await supabase
      .from('students')
      .select('student_xp')
      .eq('id', studentId)
      .single()

    return fallback.data?.student_xp ?? 0
  }

  if (!data) return 0
  return typeof data.xp === 'number' && data.xp > 0
    ? data.xp
    : data.student_xp ?? 0
}

async function updateStudentXp(studentId: number, totalXp: number) {
  const { error } = await supabase
    .from('students')
    .update({ student_xp: totalXp, xp: totalXp })
    .eq('id', studentId)

  if (!error) return

  const fallback = await supabase
    .from('students')
    .update({ student_xp: totalXp })
    .eq('id', studentId)

  if (fallback.error) {
    console.error('[engagement] failed to update student xp', fallback.error)
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

  return (data || [])
    .map(row => row.badge_key)
    .filter(key => CURRENT_BADGE_KEYS.has(key))
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

async function ensureBadgeDefinitionsSeeded() {
  const { error } = await supabase
    .from('badges')
    .upsert(
      BADGE_DEFINITIONS.map(badge => ({
        key: badge.key,
        name: badge.name,
        description: badge.description,
        icon_emoji: badge.iconEmoji,
        rarity: badge.rarity,
        condition_type: badge.conditionType,
      })),
      { onConflict: 'key' },
    )

  if (error) {
    console.error('[engagement] failed to seed badges', error)
  }
}

async function fetchHasCustomQuestion(studentId: number) {
  const { count, error } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('created_by_student_id', studentId)

  if (error) {
    if (!String(error.message || '').includes('created_by_student_id')) {
      console.error('[engagement] failed to check custom question count', error)
    }
    return false
  }

  return (count ?? 0) > 0
}

async function insertStudentBadges(studentId: number, badgeKeys: string[]) {
  if (badgeKeys.length === 0) return

  await ensureBadgeDefinitionsSeeded()

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

export async function loadDailyChallengeStatus(studentId: number | null): Promise<DailyChallengeStatus> {
  if (studentId === null) return { completed: false, completedAt: null }
  if (isGuestStudentId(studentId)) {
    const store = loadGuestStudyStore()
    const completed = hasGuestDailyChallengeCompleted()
    return {
      completed,
      completedAt: completed ? store.dailyChallenge.completed_at : null,
    }
  }

  const todayKey = getJstDateKey()
  const { data, error } = await supabase
    .from('daily_challenges')
    .select('date, challenge_date, completed_at')
    .eq('student_id', studentId)
    .eq('date', todayKey)
    .maybeSingle()

  if (error) {
    console.error('[engagement] failed to load daily_challenges', error)
    return { completed: false, completedAt: null }
  }

  return {
    completed: Boolean(data),
    completedAt: data?.completed_at ?? null,
  }
}

export async function hasCompletedDailyChallenge(studentId: number | null) {
  const status = await loadDailyChallengeStatus(studentId)
  return status.completed
}

async function markDailyChallengeCompleted(studentId: number, sessionId: string) {
  const todayKey = getJstDateKey()
  const completedAt = new Date().toISOString()
  const { error } = await supabase
    .from('daily_challenges')
    .upsert(
      {
        student_id: studentId,
        date: todayKey,
        challenge_date: todayKey,
        session_id: sessionId,
        completed_at: completedAt,
      },
      { onConflict: 'student_id,date' },
    )

  if (!error) return

  const fallback = await supabase
    .from('daily_challenges')
    .upsert(
      {
        student_id: studentId,
        date: todayKey,
        session_id: sessionId,
        completed_at: completedAt,
      },
      { onConflict: 'student_id,date' },
    )

  if (fallback.error) {
    console.error('[engagement] failed to save daily_challenges', fallback.error)
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
  xpBreakdown,
}: RecordStudySessionInput): Promise<StudyRewardSummary> {
  const baseBreakdown = xpBreakdown ?? calculateQuizXpBreakdown(correctCount, totalQuestions, durationSeconds)
  if (studentId === null) {
    return {
      sessionId: null,
      xpEarned: 0,
      xpBreakdown: {
        ...baseBreakdown,
        multiplier: Math.max(1, xpMultiplier),
      },
      previousXp: 0,
      totalXp: 0,
      levelBefore: 1,
      levelAfter: 1,
      leveledUp: false,
      newBadges: [],
      periodicCardReward: null,
    }
  }

  const xpEarned = xpOverride ?? calculateQuizXp({
    correctCount,
    totalQuestions,
    durationSeconds,
    multiplier: xpMultiplier,
  })
  const rewardBreakdown: StudyXpBreakdown = {
    ...baseBreakdown,
    total: xpEarned,
    multiplier: Math.max(1, xpMultiplier),
  }

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
      hasCustomQuestion: false,
    })
    saveGuestBadges(newBadgeKeys)

    const levelBefore = getLevelFromXp(Math.max(0, totalXp - xpEarned))
    const levelAfter = getLevelFromXp(totalXp)

    return {
      sessionId: currentStore.sessionId,
      xpEarned,
      xpBreakdown: rewardBreakdown,
      previousXp,
      totalXp,
      levelBefore,
      levelAfter,
      leveledUp: levelAfter > levelBefore,
      newBadges: resolveNewBadges(newBadgeKeys),
      periodicCardReward: await claimStudyPeriodicCardReward(studentId, levelBefore, levelAfter, totalQuestions, correctCount),
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
      xpBreakdown: rewardBreakdown,
      previousXp,
      totalXp: previousXp,
      levelBefore: getLevelFromXp(previousXp),
      levelAfter: getLevelFromXp(previousXp),
      leveledUp: false,
      newBadges: [],
      periodicCardReward: null,
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

  const [sessions, existingBadgeKeys, hasCustomQuestion] = await Promise.all([
    fetchStudentSessions(studentId),
    fetchStudentBadgeKeys(studentId),
    fetchHasCustomQuestion(studentId),
  ])

  const newBadgeKeys = evaluateNewBadgeKeys({
    sessions,
    existingBadgeKeys,
    totalXp,
    hasCustomQuestion,
  })

  await insertStudentBadges(studentId, newBadgeKeys)

  const levelBefore = getLevelFromXp(previousXp)
  const levelAfter = getLevelFromXp(totalXp)
  const periodicCardReward = await claimStudyPeriodicCardReward(studentId, levelBefore, levelAfter, totalQuestions, correctCount)

  return {
    sessionId: sessionData.id,
    xpEarned,
    xpBreakdown: rewardBreakdown,
    previousXp,
    totalXp,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
    newBadges: resolveNewBadges(newBadgeKeys),
    periodicCardReward,
  }
}

export async function loadEarnedBadgeRecords(studentId: number | null) {
  if (studentId === null) return []
  if (isGuestStudentId(studentId)) {
    return getGuestEarnedBadges().filter(record => CURRENT_BADGE_KEYS.has(record.badge_key))
  }

  const { data, error } = await supabase
    .from('student_badges')
    .select('badge_key, earned_at')
    .eq('student_id', studentId)
    .order('earned_at', { ascending: false })

  if (error) {
    console.error('[engagement] failed to load earned badges', error)
    return []
  }

  return (data || []).filter(record => CURRENT_BADGE_KEYS.has(record.badge_key))
}

export async function loadTimeAttackBest(studentId: number | null): Promise<TimeAttackBestSummary> {
  const guestBest = studentId !== null && isGuestStudentId(studentId) ? getGuestTimeAttackBest() : 0
  const students = await fetchStudents()

  const scoreResponse = await supabase
    .from('time_attack_records')
    .select('student_id, score, achieved_at')
    .order('score', { ascending: false })

  const legacyResponse = scoreResponse.error
    ? await supabase
        .from('time_attack_records')
        .select('student_id, best_score, achieved_at')
        .order('best_score', { ascending: false })
    : null

  const normalizedRecords = (scoreResponse.error ? (legacyResponse?.data || []) : (scoreResponse.data || []))
    .map(record => {
      const scoreValue = 'score' in record && typeof record.score === 'number'
        ? record.score
        : 'best_score' in record && typeof record.best_score === 'number'
          ? record.best_score
          : 0

      return {
        student_id: record.student_id,
        score: scoreValue,
        achieved_at: record.achieved_at,
      }
    })
    .filter(record => record.student_id !== 5 && record.score > 0)

  const bestByStudent = new Map<number, { score: number; achievedAt: string }>()

  for (const record of normalizedRecords) {
    const current = bestByStudent.get(record.student_id)
    if (!current || record.score > current.score || (record.score === current.score && record.achieved_at > current.achievedAt)) {
      bestByStudent.set(record.student_id, {
        score: record.score,
        achievedAt: record.achieved_at,
      })
    }
  }

  const records = Array.from(bestByStudent.entries())
    .map(([currentStudentId, record]) => ({
      student_id: currentStudentId,
      score: record.score,
      achieved_at: record.achievedAt,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.achieved_at < right.achieved_at ? 1 : -1
    })

  const studentMap = new Map(students.map(student => [student.id, student.nickname]))
  const currentRecord = records.find(record => record.student_id === studentId) ?? null
  const allTimeLeaderRow = records[0] ?? null
  const otherLeaderRow = records.find(record => record.student_id !== studentId)

  return {
    personalBest: studentId === null
      ? 0
      : isGuestStudentId(studentId)
        ? guestBest
        : currentRecord?.score ?? 0,
    allTimeBest: allTimeLeaderRow?.score ?? 0,
    allTimeLeader: allTimeLeaderRow
      ? {
          studentId: allTimeLeaderRow.student_id,
          nickname: studentMap.get(allTimeLeaderRow.student_id) ?? `ID ${allTimeLeaderRow.student_id}`,
          score: allTimeLeaderRow.score,
        }
      : null,
    otherLeader: otherLeaderRow
      ? {
        studentId: otherLeaderRow.student_id,
        nickname: studentMap.get(otherLeaderRow.student_id) ?? `ID ${otherLeaderRow.student_id}`,
        score: otherLeaderRow.score,
      }
      : null,
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

  if (nextBest <= current.personalBest) {
    return current.personalBest
  }

  const { error } = await supabase
    .from('time_attack_records')
    .insert({
      student_id: studentId,
      score: nextBest,
      achieved_at: new Date().toISOString(),
    })

  if (!error) return nextBest

  const fallback = await supabase
    .from('time_attack_records')
    .upsert(
      {
        student_id: studentId,
        best_score: nextBest,
        achieved_at: new Date().toISOString(),
      },
      { onConflict: 'student_id' },
    )

  if (fallback.error) {
    console.error('[engagement] failed to save time_attack_records', fallback.error)
  }

  return nextBest
}
