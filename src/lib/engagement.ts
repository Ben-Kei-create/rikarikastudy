'use client'

export type SessionMode =
  | 'standard'
  | 'daily_challenge'
  | 'quick_start'
  | 'mixed_quick_start'
  | 'drill'
  | 'custom'
  | 'chemistry_flash'
  | 'chemistry_reaction'
  | 'chemistry_density_lab'
  | 'chemistry_concentration_lab'
  | 'chemistry_battery_lab'
  | 'biology_organ_pairs'
  | 'earth_rock_pairs'
  | 'earth_humidity_lab'
  | 'earth_column_lab'
  | 'physics_motion_graph_lab'
  | 'test_mode'
  | 'streak_mode'
  | 'time_attack'

const LEVEL_TITLES = [
  { level: 1, title: '理科のたまご' },
  { level: 5, title: '実験好き' },
  { level: 10, title: '研究者見習い' },
  { level: 20, title: '理科マスター' },
  { level: 35, title: '観測のエキスパート' },
  { level: 50, title: '天才科学者' },
  { level: 75, title: '銀河級リサーチャー' },
  { level: 99, title: '理科界のレジェンド' },
] as const

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000
export const TIME_ATTACK_UNLOCK_LEVEL = 5
export const TEST_MODE_QUESTION_COUNT = 25
export const TEST_MODE_POINT_PER_QUESTION = 4

export interface LevelUnlockReward {
  key: 'challenge_mode' | 'light_theme' | 'cute_theme'
  level: number
  title: string
  description: string
  emoji: string
}

export const LEVEL_UNLOCK_REWARDS: LevelUnlockReward[] = [
  {
    key: 'challenge_mode',
    level: TIME_ATTACK_UNLOCK_LEVEL,
    title: 'チャレンジモード',
    description: 'タイムアタック・テストモード・連続正解モードが遊べます。',
    emoji: '🏁',
  },
  {
    key: 'light_theme',
    level: 10,
    title: 'ライトテーマ',
    description: 'マイページでライトモードを選べるようになります。',
    emoji: '☀️',
  },
  {
    key: 'cute_theme',
    level: 20,
    title: 'かわいいテーマ',
    description: 'マイページでかわいいモードを選べるようになります。',
    emoji: '🎀',
  },
]

export interface LevelInfo {
  level: number
  title: string
  totalXp: number
  currentLevelXp: number
  nextLevelXp: number
  progressXp: number
  progressMax: number
  progressRate: number
}

export function calculateQuizXp({
  correctCount,
  totalQuestions,
  durationSeconds,
  multiplier = 1,
}: {
  correctCount: number
  totalQuestions: number
  durationSeconds: number
  multiplier?: number
}) {
  const baseXp = Math.max(0, correctCount) * 10
  const speedBonus = Math.round(Math.max(0, 300 - Math.max(0, durationSeconds)) / 3)
  const perfectBonus = totalQuestions > 0 && correctCount === totalQuestions ? 50 : 0
  return Math.max(0, Math.round((baseXp + speedBonus + perfectBonus) * multiplier))
}

export function calculateTimeAttackXp(score: number) {
  return Math.max(0, score) * 5
}

export function calculateTestModeXp(correctCount: number) {
  return Math.max(0, correctCount) * TEST_MODE_POINT_PER_QUESTION
}

export function calculateStreakModeXp(score: number) {
  return Math.max(0, score) * 6
}

export function getLevelFromXp(totalXp: number) {
  const safeXp = Math.max(0, totalXp)
  return Math.min(99, Math.floor(Math.sqrt(safeXp / 25)) + 1)
}

export function getXpFloorForLevel(level: number) {
  const safeLevel = Math.max(1, Math.min(99, level))
  return 25 * (safeLevel - 1) * (safeLevel - 1)
}

export function getLevelTitle(level: number) {
  let current: string = LEVEL_TITLES[0].title

  for (const item of LEVEL_TITLES) {
    if (level >= item.level) current = item.title
  }

  return current
}

export function getLevelInfo(totalXp: number): LevelInfo {
  const safeXp = Math.max(0, totalXp)
  const level = getLevelFromXp(safeXp)
  const currentLevelXp = getXpFloorForLevel(level)
  const nextLevelXp = level >= 99 ? currentLevelXp : getXpFloorForLevel(level + 1)
  const progressXp = safeXp - currentLevelXp
  const progressMax = Math.max(1, nextLevelXp - currentLevelXp)
  const progressRate = level >= 99 ? 100 : Math.max(0, Math.min(100, Math.round((progressXp / progressMax) * 100)))

  return {
    level,
    title: getLevelTitle(level),
    totalXp: safeXp,
    currentLevelXp,
    nextLevelXp,
    progressXp: level >= 99 ? progressMax : progressXp,
    progressMax,
    progressRate,
  }
}

export function getUnlockedLevelRewards(level: number) {
  return LEVEL_UNLOCK_REWARDS.filter(reward => level >= reward.level)
}

export function getNextLevelUnlock(level: number) {
  return LEVEL_UNLOCK_REWARDS.find(reward => level < reward.level) ?? null
}

export function getNewlyUnlockedLevelRewards(levelBefore: number, levelAfter: number) {
  return LEVEL_UNLOCK_REWARDS.filter(reward => levelBefore < reward.level && levelAfter >= reward.level)
}

function toShiftedDate(dateLike?: string | Date) {
  const raw = dateLike instanceof Date ? dateLike : new Date(dateLike ?? Date.now())
  return new Date(raw.getTime() + JST_OFFSET_MS)
}

function fromShiftedDate(date: Date) {
  return new Date(date.getTime() - JST_OFFSET_MS)
}

export function getJstDateKey(dateLike?: string | Date) {
  const shifted = toShiftedDate(dateLike)
  const year = shifted.getUTCFullYear()
  const month = `${shifted.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${shifted.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getJstWeekRange(dateLike?: string | Date) {
  const shifted = toShiftedDate(dateLike)
  const dayOfWeek = shifted.getUTCDay()
  const daysFromMonday = (dayOfWeek + 6) % 7

  const start = new Date(shifted)
  start.setUTCDate(start.getUTCDate() - daysFromMonday)
  start.setUTCHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)

  return {
    start,
    end,
    startDate: fromShiftedDate(start),
    endDate: fromShiftedDate(end),
    startKey: getJstDateKey(fromShiftedDate(start)),
    endKey: getJstDateKey(new Date(fromShiftedDate(end).getTime() - 1)),
  }
}

export function isDateInCurrentJstWeek(dateLike: string | Date, baseDate?: string | Date) {
  const shifted = toShiftedDate(dateLike).getTime()
  const { start, end } = getJstWeekRange(baseDate)
  return shifted >= start.getTime() && shifted < end.getTime()
}

export function getSessionXpFallback(session: {
  correct_count: number
  total_questions: number
  duration_seconds: number
  xp_earned?: number | null
  session_mode?: SessionMode | string | null
}) {
  if (typeof session.xp_earned === 'number' && session.xp_earned > 0) {
    return session.xp_earned
  }

  if (session.session_mode === 'time_attack') {
    return calculateTimeAttackXp(session.correct_count)
  }

  if (session.session_mode === 'test_mode') {
    return calculateTestModeXp(session.correct_count)
  }

  if (session.session_mode === 'streak_mode') {
    return calculateStreakModeXp(session.correct_count)
  }

  return calculateQuizXp({
    correctCount: session.correct_count,
    totalQuestions: session.total_questions,
    durationSeconds: session.duration_seconds,
    multiplier: session.session_mode === 'daily_challenge' ? 2 : 1,
  })
}
