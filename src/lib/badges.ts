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
  isSecret?: boolean
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
  { key: 'total_30', name: '30問スタート', description: '合計30問以上に挑戦した', iconEmoji: '🎒', rarity: 'common', conditionType: 'total_questions' },
  { key: 'bio_50', name: '生物ノート', description: '生物を50問以上解いた', iconEmoji: '🍃', rarity: 'common', conditionType: 'field_total' },
  { key: 'chem_50', name: '化学ノート', description: '化学を50問以上解いた', iconEmoji: '🧴', rarity: 'common', conditionType: 'field_total' },
  { key: 'phys_50', name: '物理ノート', description: '物理を50問以上解いた', iconEmoji: '🧲', rarity: 'common', conditionType: 'field_total' },
  { key: 'earth_50', name: '地学ノート', description: '地学を50問以上解いた', iconEmoji: '🪐', rarity: 'common', conditionType: 'field_total' },
  { key: 'perfect_score', name: '全問正解', description: '1回の学習で全問正解した', iconEmoji: '💯', rarity: 'rare', conditionType: 'perfect' },
  { key: 'streak_7', name: '7日連続', description: '7日連続で学習した', iconEmoji: '🏅', rarity: 'rare', conditionType: 'streak' },
  { key: 'total_100', name: '100問突破', description: '合計100問以上に挑戦した', iconEmoji: '📚', rarity: 'rare', conditionType: 'total_questions' },
  { key: 'speed_star', name: 'スピードスター', description: '60秒未満で1セットをクリアした', iconEmoji: '💨', rarity: 'rare', conditionType: 'speed', isSecret: true },
  { key: 'daily_perfect', name: 'デイリーパーフェクト', description: '今日のチャレンジを全問正解した', iconEmoji: '☀️', rarity: 'rare', conditionType: 'daily_challenge' },
  { key: 'level_10', name: '研究者見習い', description: 'レベル10に到達した', iconEmoji: '🧪', rarity: 'rare', conditionType: 'level' },
  { key: 'daily_3', name: '朝チャレ名人', description: 'デイリーチャレンジを3回全問正解した', iconEmoji: '🌅', rarity: 'rare', conditionType: 'daily_challenge', isSecret: true },
  { key: 'time_attack_10', name: '10カウント', description: 'タイムアタックで10点以上を取った', iconEmoji: '⏱️', rarity: 'rare', conditionType: 'time_attack', isSecret: true },
  { key: 'streak_mode_5', name: '5連の壁', description: '連続正解モードで5問連続正解した', iconEmoji: '🔥', rarity: 'rare', conditionType: 'streak_mode', isSecret: true },
  { key: 'test_80', name: '80点ライン', description: 'テストモードで80点以上を取った', iconEmoji: '📝', rarity: 'rare', conditionType: 'test_mode', isSecret: true },
  { key: 'lab_explorer', name: 'ラボ探検隊', description: '4種類以上のラボや特別モードを遊んだ', iconEmoji: '🧭', rarity: 'rare', conditionType: 'lab_modes', isSecret: true },
  { key: 'streak_14', name: '14日連続', description: '14日連続で学習した', iconEmoji: '📆', rarity: 'rare', conditionType: 'streak', isSecret: true },
  { key: 'total_300', name: '300問通過', description: '合計300問以上に挑戦した', iconEmoji: '📘', rarity: 'rare', conditionType: 'total_questions' },
  { key: 'level_20', name: '理科マスター', description: 'レベル20に到達した', iconEmoji: '🎓', rarity: 'rare', conditionType: 'level' },
  { key: 'streak_30', name: '30日連続', description: '30日連続で学習した', iconEmoji: '👑', rarity: 'legendary', conditionType: 'streak', isSecret: true },
  { key: 'all_fields_day', name: '全分野制覇', description: '1日のうちに4分野すべてを解いた', iconEmoji: '🛰️', rarity: 'legendary', conditionType: 'all_fields_day', isSecret: true },
  { key: 'total_1000', name: '1000問の壁', description: '合計1000問以上に挑戦した', iconEmoji: '🚀', rarity: 'legendary', conditionType: 'total_questions', isSecret: true },
  { key: 'level_50', name: '天才科学者', description: 'レベル50に到達した', iconEmoji: '🧠', rarity: 'legendary', conditionType: 'level', isSecret: true },
  { key: 'level_75', name: '銀河級リサーチャー', description: 'レベル75に到達した', iconEmoji: '🌌', rarity: 'legendary', conditionType: 'level', isSecret: true },
]

const BADGE_DEFINITION_MAP = new Map(BADGE_DEFINITIONS.map(badge => [badge.key, badge]))
const CORE_FIELDS = ['生物', '化学', '物理', '地学']
const LAB_SESSION_MODES = new Set([
  'chemistry_flash',
  'chemistry_reaction',
  'chemistry_density_lab',
  'chemistry_concentration_lab',
  'chemistry_battery_lab',
  'chemistry_humidity_lab',
  'biology_organ_pairs',
  'earth_rock_pairs',
  'earth_column_lab',
  'physics_motion_graph_lab',
])

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

function getFieldQuestionTotals(sessions: BadgeSessionRecord[]) {
  const totals: Record<string, number> = {
    '生物': 0,
    '化学': 0,
    '物理': 0,
    '地学': 0,
  }

  for (const session of sessions) {
    if (!CORE_FIELDS.includes(session.field)) continue
    totals[session.field] += session.total_questions
  }

  return totals
}

function getBestSessionScore(sessions: BadgeSessionRecord[], mode: SessionMode) {
  return sessions.reduce((best, session) => {
    if (session.session_mode !== mode) return best
    if (mode === 'test_mode') return Math.max(best, session.correct_count * 4)
    return Math.max(best, session.correct_count)
  }, 0)
}

function getPerfectDailyCount(sessions: BadgeSessionRecord[]) {
  return sessions.filter(
    session =>
      session.session_mode === 'daily_challenge'
      && session.total_questions > 0
      && session.correct_count === session.total_questions,
  ).length
}

function getPlayedLabModeCount(sessions: BadgeSessionRecord[]) {
  return new Set(
    sessions
      .map(session => session.session_mode)
      .filter((sessionMode): sessionMode is SessionMode => Boolean(sessionMode) && LAB_SESSION_MODES.has(sessionMode as SessionMode)),
  ).size
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
  const fieldTotals = getFieldQuestionTotals(sessions)
  const dailyPerfectCount = getPerfectDailyCount(sessions)
  const timeAttackBest = getBestSessionScore(sessions, 'time_attack')
  const streakModeBest = getBestSessionScore(sessions, 'streak_mode')
  const testBest = getBestSessionScore(sessions, 'test_mode')
  const playedLabModes = getPlayedLabModeCount(sessions)

  if (sessions.length > 0) next.add('first_quiz')
  if (maxStreak >= 3) next.add('streak_3')
  if (maxStreak >= 7) next.add('streak_7')
  if (maxStreak >= 14) next.add('streak_14')
  if (maxStreak >= 30) next.add('streak_30')
  if (totalQuestions >= 30) next.add('total_30')
  if (totalQuestions >= 100) next.add('total_100')
  if (totalQuestions >= 300) next.add('total_300')
  if (totalQuestions >= 1000) next.add('total_1000')
  if (sessions.some(session => session.total_questions > 0 && session.correct_count === session.total_questions)) {
    next.add('perfect_score')
  }
  if (sessions.some(session => session.session_mode !== 'time_attack' && session.duration_seconds > 0 && session.duration_seconds < 60)) {
    next.add('speed_star')
  }
  if (dailyPerfectCount >= 1) {
    next.add('daily_perfect')
  }
  if (dailyPerfectCount >= 3) next.add('daily_3')
  if (level >= 10) next.add('level_10')
  if (level >= 20) next.add('level_20')
  if (level >= 50) next.add('level_50')
  if (level >= 75) next.add('level_75')
  if (hasAllFieldsInOneDay(sessions)) next.add('all_fields_day')
  if (timeAttackBest >= 10) next.add('time_attack_10')
  if (streakModeBest >= 5) next.add('streak_mode_5')
  if (testBest >= 80) next.add('test_80')
  if (playedLabModes >= 4) next.add('lab_explorer')

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

  if (fieldTotals['生物'] >= 50) next.add('bio_50')
  if (fieldTotals['化学'] >= 50) next.add('chem_50')
  if (fieldTotals['物理'] >= 50) next.add('phys_50')
  if (fieldTotals['地学'] >= 50) next.add('earth_50')

  return Array.from(next).filter(key => !earned.has(key))
}
