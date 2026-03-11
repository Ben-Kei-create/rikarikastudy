'use client'

import { getJstDateKey, getLevelFromXp, SessionMode } from '@/lib/engagement'

export type BadgeRarity = 'common' | 'rare' | 'legendary'

export interface BadgeDefinition {
  key: string
  name: string
  description: string
  iconEmoji: string
  rarity: BadgeRarity
  conditionType: string
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

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { key: 'first_quiz', name: '初クイズ', description: 'はじめてクイズをクリアした', iconEmoji: '🌱', rarity: 'common', conditionType: 'first_quiz' },
  { key: 'streak_3', name: '3日連続', description: '3日連続で学習した', iconEmoji: '🔥', rarity: 'common', conditionType: 'streak' },
  { key: 'bio_debut', name: '生物デビュー', description: '生物の問題を初めて解いた', iconEmoji: '🌿', rarity: 'common', conditionType: 'field_debut' },
  { key: 'chem_debut', name: '化学デビュー', description: '化学の問題を初めて解いた', iconEmoji: '⚗️', rarity: 'common', conditionType: 'field_debut' },
  { key: 'phys_debut', name: '物理デビュー', description: '物理の問題を初めて解いた', iconEmoji: '⚡', rarity: 'common', conditionType: 'field_debut' },
  { key: 'earth_debut', name: '地学デビュー', description: '地学の問題を初めて解いた', iconEmoji: '🌏', rarity: 'common', conditionType: 'field_debut' },
  { key: 'perfect_score', name: '全問正解', description: '1回の学習で全問正解した', iconEmoji: '💯', rarity: 'rare', conditionType: 'perfect' },
  { key: 'streak_7', name: '7日連続', description: '7日連続で学習した', iconEmoji: '🏅', rarity: 'rare', conditionType: 'streak' },
  { key: 'total_100', name: '100問突破', description: '合計100問以上に挑戦した', iconEmoji: '📚', rarity: 'rare', conditionType: 'total_questions' },
  { key: 'speed_star', name: 'スピードスター', description: '60秒未満で1セットをクリアした', iconEmoji: '💨', rarity: 'rare', conditionType: 'speed' },
  { key: 'daily_perfect', name: 'デイリーパーフェクト', description: '今日のチャレンジを全問正解した', iconEmoji: '☀️', rarity: 'rare', conditionType: 'daily_challenge' },
  { key: 'level_10', name: '研究者見習い', description: 'レベル10に到達した', iconEmoji: '🧪', rarity: 'rare', conditionType: 'level' },
  { key: 'streak_30', name: '30日連続', description: '30日連続で学習した', iconEmoji: '👑', rarity: 'legendary', conditionType: 'streak' },
  { key: 'all_fields_day', name: '全分野制覇', description: '1日のうちに4分野すべてを解いた', iconEmoji: '🛰️', rarity: 'legendary', conditionType: 'all_fields_day' },
  { key: 'total_1000', name: '1000問の壁', description: '合計1000問以上に挑戦した', iconEmoji: '🚀', rarity: 'legendary', conditionType: 'total_questions' },
  { key: 'level_50', name: '天才科学者', description: 'レベル50に到達した', iconEmoji: '🧠', rarity: 'legendary', conditionType: 'level' },
]

const BADGE_DEFINITION_MAP = new Map(BADGE_DEFINITIONS.map(badge => [badge.key, badge]))
const CORE_FIELDS = ['生物', '化学', '物理', '地学']

export function getBadgeDefinition(badgeKey: string) {
  return BADGE_DEFINITION_MAP.get(badgeKey) ?? null
}

export function getBadgeRarityLabel(rarity: BadgeRarity) {
  if (rarity === 'legendary') return 'LEGENDARY'
  if (rarity === 'rare') return 'RARE'
  return 'COMMON'
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

function hasAllFieldsInOneDay(sessions: BadgeSessionRecord[]) {
  const fieldMap = new Map<string, Set<string>>()

  for (const session of sessions) {
    if (!CORE_FIELDS.includes(session.field)) continue
    const dayKey = getJstDateKey(session.created_at)
    if (!fieldMap.has(dayKey)) fieldMap.set(dayKey, new Set())
    fieldMap.get(dayKey)?.add(session.field)
  }

  return Array.from(fieldMap.values()).some(fields => CORE_FIELDS.every(field => fields.has(field)))
}

export function evaluateNewBadgeKeys({
  sessions,
  existingBadgeKeys,
  totalXp,
}: {
  sessions: BadgeSessionRecord[]
  existingBadgeKeys: string[]
  totalXp: number
}) {
  const earned = new Set(existingBadgeKeys)
  const next = new Set<string>()
  const totalQuestions = sessions.reduce((sum, session) => sum + session.total_questions, 0)
  const maxStreak = getMaxStudyStreak(sessions)
  const level = getLevelFromXp(totalXp)

  if (sessions.length > 0) next.add('first_quiz')
  if (maxStreak >= 3) next.add('streak_3')
  if (maxStreak >= 7) next.add('streak_7')
  if (maxStreak >= 30) next.add('streak_30')
  if (totalQuestions >= 100) next.add('total_100')
  if (totalQuestions >= 1000) next.add('total_1000')
  if (sessions.some(session => session.total_questions > 0 && session.correct_count === session.total_questions)) {
    next.add('perfect_score')
  }
  if (sessions.some(session => session.session_mode !== 'time_attack' && session.duration_seconds > 0 && session.duration_seconds < 60)) {
    next.add('speed_star')
  }
  if (sessions.some(session => session.session_mode === 'daily_challenge' && session.total_questions > 0 && session.correct_count === session.total_questions)) {
    next.add('daily_perfect')
  }
  if (level >= 10) next.add('level_10')
  if (level >= 50) next.add('level_50')
  if (hasAllFieldsInOneDay(sessions)) next.add('all_fields_day')

  const fieldBadgeMap: Record<string, string> = {
    '生物': 'bio_debut',
    '化学': 'chem_debut',
    '物理': 'phys_debut',
    '地学': 'earth_debut',
  }

  for (const session of sessions) {
    const badgeKey = fieldBadgeMap[session.field]
    if (badgeKey) next.add(badgeKey)
  }

  return Array.from(next).filter(key => !earned.has(key))
}
