'use client'

export interface QuizXpBreakdown {
  base: number
  speed: number
  perfect: number
  total: number
}

const LEVEL_TITLE_MILESTONES = [
  { level: 1, title: '理科のたまご' },
  { level: 5, title: '実験好き' },
  { level: 10, title: '研究者見習い' },
  { level: 15, title: 'データ分析官' },
  { level: 20, title: '理科マスター' },
  { level: 30, title: '天才科学者' },
  { level: 50, title: 'ノーベル候補' },
  { level: 99, title: '宇宙の支配者' },
] as const

export function calculateQuizXp(correct: number, total: number, durationSeconds: number): QuizXpBreakdown {
  const safeCorrect = Math.max(0, Math.floor(correct))
  const safeTotal = Math.max(0, Math.floor(total))
  const safeDuration = Math.max(0, Math.floor(durationSeconds))
  const base = safeCorrect * 10
  const speed = Math.max(0, Math.floor((300 - safeDuration) / 3))
  const perfect = safeTotal > 0 && safeCorrect === safeTotal ? 50 : 0

  return {
    base,
    speed,
    perfect,
    total: base + speed + perfect,
  }
}

export function getLevel(xp: number) {
  const safeXp = Math.max(0, Math.floor(xp))
  return Math.min(99, Math.floor(Math.sqrt(safeXp / 25)) + 1)
}

export function getLevelTitle(level: number) {
  const safeLevel = Math.max(1, Math.min(99, Math.floor(level)))
  let title: string = LEVEL_TITLE_MILESTONES[0].title

  for (const item of LEVEL_TITLE_MILESTONES) {
    if (safeLevel >= item.level) {
      title = item.title
    }
  }

  return title
}

export function getXpForLevel(level: number) {
  const safeLevel = Math.max(1, Math.min(99, Math.floor(level)))
  return 25 * (safeLevel - 1) * (safeLevel - 1)
}

export function getXpProgress(xp: number) {
  const currentXp = Math.max(0, Math.floor(xp))
  const currentLevel = getLevel(currentXp)
  const nextLevel = currentLevel >= 99 ? 99 : currentLevel + 1
  const xpForCurrent = getXpForLevel(currentLevel)
  const xpForNext = currentLevel >= 99 ? xpForCurrent : getXpForLevel(nextLevel)
  const progressPercent = currentLevel >= 99
    ? 100
    : Math.max(0, Math.min(100, Math.round(((currentXp - xpForCurrent) / Math.max(1, xpForNext - xpForCurrent)) * 100)))

  return {
    currentLevel,
    nextLevel,
    currentXp,
    xpForCurrent,
    xpForNext,
    progressPercent,
  }
}
