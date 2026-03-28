'use client'

import { getJstDateKey, SessionMode } from '@/lib/engagement'

export type BadgeRarity = 'common' | 'rare' | 'legendary'
type CoreField = '生物' | '化学' | '物理' | '地学'

export interface BadgeDefinition {
  key: string
  name: string
  description: string
  iconEmoji: string
  rarity: BadgeRarity
  conditionType: string
  isSecret?: boolean
  check: (context: BadgeCheckContext) => boolean
}

export interface BadgeEarnedRecord {
  badge_key: string
  earned_at: string
}

export interface BadgeSessionRecord {
  field: string
  unit: string
  total_questions: number
  correct_count: number
  duration_seconds: number
  created_at: string
  session_mode?: SessionMode | string | null
}

export interface BadgeCheckContext {
  totalSessions: number
  totalQuestions: number
  totalCorrect: number
  streak: number
  maxStreak: number
  fieldSessions: Record<CoreField, number>
  perfectCount: number
  dailyChallengeCount: number
  hasChemFlash: boolean
  hasChemEquation: boolean
  hasCustomQuestion: boolean
  earnedBadgeKeys: Set<string>
  allFieldsDay: boolean
  hasSpeedClear: boolean
  accuracyRate: number
}

const CORE_FIELDS: CoreField[] = ['生物', '化学', '物理', '地学']
const QUIZ_LIKE_MODES = new Set<SessionMode | 'standard'>([
  'standard',
  'daily_challenge',
  'quick_start',
  'mixed_quick_start',
  'drill',
  'custom',
])

function hasAllFieldsInOneDay(sessions: BadgeSessionRecord[]) {
  const fieldMap = new Map<string, Set<string>>()

  for (const session of sessions) {
    if (!CORE_FIELDS.includes(session.field as CoreField)) continue
    const dayKey = getJstDateKey(session.created_at)
    if (!fieldMap.has(dayKey)) fieldMap.set(dayKey, new Set())
    fieldMap.get(dayKey)?.add(session.field)
  }

  return Array.from(fieldMap.values()).some(fields => CORE_FIELDS.every(field => fields.has(field)))
}

function getCurrentStudyStreak(sessions: BadgeSessionRecord[]) {
  const activeDays = new Set(sessions.map(session => getJstDateKey(session.created_at)))
  let streak = 0
  let cursor = new Date()

  while (true) {
    const key = getJstDateKey(cursor)
    if (!activeDays.has(key)) break
    streak += 1
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }

  return streak
}

function getMaxStudyStreak(sessions: BadgeSessionRecord[]) {
  const uniqueDays = Array.from(new Set(sessions.map(session => getJstDateKey(session.created_at)))).sort()
  let max = 0
  let current = 0
  let previousDate: Date | null = null

  for (const dayKey of uniqueDays) {
    const date = new Date(`${dayKey}T00:00:00+09:00`)
    if (previousDate) {
      const diffDays = Math.round((date.getTime() - previousDate.getTime()) / (24 * 60 * 60 * 1000))
      current = diffDays === 1 ? current + 1 : 1
    } else {
      current = 1
    }

    if (current > max) max = current
    previousDate = date
  }

  return max
}

function buildFieldSessionCounts(sessions: BadgeSessionRecord[]) {
  const fieldSessions: Record<CoreField, number> = {
    '生物': 0,
    '化学': 0,
    '物理': 0,
    '地学': 0,
  }

  for (const session of sessions) {
    if (!CORE_FIELDS.includes(session.field as CoreField)) continue
    fieldSessions[session.field as CoreField] += 1
  }

  return fieldSessions
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    key: 'first_quiz',
    name: '初クイズ',
    description: 'はじめて問題を最後まで解いた。',
    iconEmoji: '🌱',
    rarity: 'common',
    conditionType: 'sessions',
    check: context => context.totalSessions >= 1,
  },
  {
    key: 'bio_debut',
    name: '生物デビュー',
    description: '生物の問題に初挑戦。',
    iconEmoji: '🌿',
    rarity: 'common',
    conditionType: 'field',
    check: context => context.fieldSessions['生物'] >= 1,
  },
  {
    key: 'chem_debut',
    name: '化学デビュー',
    description: '化学の問題に初挑戦。',
    iconEmoji: '⚗️',
    rarity: 'common',
    conditionType: 'field',
    check: context => context.fieldSessions['化学'] >= 1,
  },
  {
    key: 'phys_debut',
    name: '物理デビュー',
    description: '物理の問題に初挑戦。',
    iconEmoji: '⚡',
    rarity: 'common',
    conditionType: 'field',
    check: context => context.fieldSessions['物理'] >= 1,
  },
  {
    key: 'earth_debut',
    name: '地学デビュー',
    description: '地学の問題に初挑戦。',
    iconEmoji: '🌏',
    rarity: 'common',
    conditionType: 'field',
    check: context => context.fieldSessions['地学'] >= 1,
  },
  {
    key: 'streak_3',
    name: '3日連続',
    description: '3日連続で学習した。',
    iconEmoji: '🔥',
    rarity: 'common',
    conditionType: 'streak',
    check: context => context.maxStreak >= 3,
  },
  {
    key: 'ten_sessions',
    name: '10回突破',
    description: '学習セッションが10回をこえた。',
    iconEmoji: '🎯',
    rarity: 'common',
    conditionType: 'sessions',
    check: context => context.totalSessions >= 10,
  },
  {
    key: 'first_perfect',
    name: '初パーフェクト',
    description: 'はじめて全問正解した。',
    iconEmoji: '💯',
    rarity: 'common',
    conditionType: 'perfect',
    check: context => context.perfectCount >= 1,
  },
  {
    key: 'streak_7',
    name: '1週間連続',
    description: '7日連続で学習した。',
    iconEmoji: '📅',
    rarity: 'rare',
    conditionType: 'streak',
    check: context => context.maxStreak >= 7,
  },
  {
    key: 'hundred_questions',
    name: '100問突破',
    description: '合計100問を解いた。',
    iconEmoji: '📚',
    rarity: 'rare',
    conditionType: 'questions',
    check: context => context.totalQuestions >= 100,
  },
  {
    key: 'speed_star',
    name: 'スピードスター',
    description: '60秒未満で1セットをクリアした。',
    iconEmoji: '💨',
    rarity: 'rare',
    conditionType: 'speed',
    check: context => context.hasSpeedClear,
  },
  {
    key: 'all_fields_day',
    name: '全分野制覇',
    description: '1日のうちに4分野すべてを解いた。',
    iconEmoji: '🛰️',
    rarity: 'rare',
    conditionType: 'daily_mix',
    check: context => context.allFieldsDay,
  },
  {
    key: 'five_perfects',
    name: '完璧主義者',
    description: '全問正解を5回達成した。',
    iconEmoji: '🏆',
    rarity: 'rare',
    conditionType: 'perfect',
    check: context => context.perfectCount >= 5,
  },
  {
    key: 'chem_lab_clear',
    name: '化学ラボマスター',
    description: '化学の2つの特別モードをクリアした。',
    iconEmoji: '🧪',
    rarity: 'rare',
    conditionType: 'chemistry_modes',
    check: context => context.hasChemFlash && context.hasChemEquation,
  },
  {
    key: 'question_creator',
    name: '出題者',
    description: '自分で問題を1つ作った。',
    iconEmoji: '✍️',
    rarity: 'rare',
    conditionType: 'creation',
    check: context => context.hasCustomQuestion,
  },
  {
    key: 'streak_30',
    name: '30日連続',
    description: '30日連続で学習した。',
    iconEmoji: '👑',
    rarity: 'legendary',
    conditionType: 'streak',
    isSecret: true,
    check: context => context.maxStreak >= 30,
  },
  {
    key: 'thousand_questions',
    name: '1000問の壁',
    description: '合計1000問を解いた。',
    iconEmoji: '🚀',
    rarity: 'legendary',
    conditionType: 'questions',
    isSecret: true,
    check: context => context.totalQuestions >= 1000,
  },
  {
    key: 'accuracy_90',
    name: '正答率90%超',
    description: '100問以上で正答率90%以上を維持した。',
    iconEmoji: '🎓',
    rarity: 'legendary',
    conditionType: 'accuracy',
    isSecret: true,
    check: context => context.totalQuestions >= 100 && context.accuracyRate >= 0.9,
  },
  {
    key: 'daily_challenger',
    name: '毎日チャレンジャー',
    description: '今日のチャレンジを7回クリアした。',
    iconEmoji: '☀️',
    rarity: 'legendary',
    conditionType: 'daily_challenge',
    isSecret: true,
    check: context => context.dailyChallengeCount >= 7,
  },
  {
    key: 'all_badges_rare',
    name: 'コレクター',
    description: 'レアバッジをすべて集めた。',
    iconEmoji: '💎',
    rarity: 'legendary',
    conditionType: 'collection',
    isSecret: true,
    check: context => RARE_BADGE_KEYS.every(key => context.earnedBadgeKeys.has(key)),
  },
]

const BADGE_DEFINITION_MAP = new Map(BADGE_DEFINITIONS.map(badge => [badge.key, badge]))
const RARE_BADGE_KEYS = BADGE_DEFINITIONS.filter(badge => badge.rarity === 'rare').map(badge => badge.key)

export function getBadgeDefinition(badgeKey: string) {
  return BADGE_DEFINITION_MAP.get(badgeKey) ?? null
}

export function getBadgeRarityLabel(rarity: BadgeRarity) {
  if (rarity === 'legendary') return 'レジェンド'
  if (rarity === 'rare') return 'レア'
  return 'ノーマル'
}

function isQuizLikeMode(sessionMode?: SessionMode | string | null) {
  if (!sessionMode) return true
  return QUIZ_LIKE_MODES.has(sessionMode as SessionMode)
}

function buildBadgeCheckContext({
  sessions,
  totalXp: _totalXp,
  earnedBadgeKeys,
  hasCustomQuestion,
}: {
  sessions: BadgeSessionRecord[]
  totalXp: number
  earnedBadgeKeys: Set<string>
  hasCustomQuestion: boolean
}): BadgeCheckContext {
  const totalQuestions = sessions.reduce((sum, session) => sum + session.total_questions, 0)
  const totalCorrect = sessions.reduce((sum, session) => sum + session.correct_count, 0)
  const perfectCount = sessions.filter(
    session => session.total_questions > 0 && session.correct_count === session.total_questions,
  ).length

  return {
    totalSessions: sessions.length,
    totalQuestions,
    totalCorrect,
    streak: getCurrentStudyStreak(sessions),
    maxStreak: getMaxStudyStreak(sessions),
    fieldSessions: buildFieldSessionCounts(sessions),
    perfectCount,
    dailyChallengeCount: sessions.filter(session => session.session_mode === 'daily_challenge').length,
    hasChemFlash: sessions.some(session => session.session_mode === 'chemistry_flash'),
    hasChemEquation: sessions.some(session => session.session_mode === 'chemistry_reaction'),
    hasCustomQuestion,
    earnedBadgeKeys,
    allFieldsDay: hasAllFieldsInOneDay(sessions),
    hasSpeedClear: sessions.some(
      session =>
        isQuizLikeMode(session.session_mode)
        && session.total_questions > 0
        && session.duration_seconds > 0
        && session.duration_seconds < 60,
    ),
    accuracyRate: totalQuestions > 0 ? totalCorrect / totalQuestions : 0,
  }
}

export function evaluateNewBadgeKeys({
  sessions,
  existingBadgeKeys,
  totalXp,
  hasCustomQuestion = false,
}: {
  sessions: BadgeSessionRecord[]
  existingBadgeKeys: string[]
  totalXp: number
  hasCustomQuestion?: boolean
}) {
  const earned = new Set(existingBadgeKeys.filter(key => BADGE_DEFINITION_MAP.has(key)))
  const next = new Set<string>()

  while (true) {
    let added = false
    const context = buildBadgeCheckContext({
      sessions,
      totalXp,
      earnedBadgeKeys: new Set([...Array.from(earned), ...Array.from(next)]),
      hasCustomQuestion,
    })

    for (const badge of BADGE_DEFINITIONS) {
      if (earned.has(badge.key) || next.has(badge.key)) continue
      if (!badge.check(context)) continue
      next.add(badge.key)
      added = true
    }

    if (!added) break
  }

  return Array.from(next)
}
