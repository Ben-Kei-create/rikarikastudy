'use client'

// サイエンスタワー — 協力型タワーディフェンス
// 2〜5人で協力してクイズに正解し、研究タワーを建設する
// 制限時間は全員で共有（シンキングタイム制）

export interface TowerPlayer {
  id: number
  name: string
  color: string
  correctCount: number
  wrongCount: number
}

export interface TowerBlock {
  playerId: number
  color: string
  hp: number        // 1 block = 1 HP
  cracked: boolean  // damaged by enemy
}

export interface EnemyWave {
  name: string
  emoji: string
  power: number     // how many blocks it can destroy
  description: string
}

export const TOWER_MAX_LEVEL = 5
export const ROUND_TIME_SECONDS = 30  // shared time pool per round
export const BLOCKS_PER_CORRECT = 2
export const LEVEL_1_ROUNDS = 5
export const LEVEL_1_TARGET_HEIGHT = 15 // blocks needed to "complete" the tower

export const PLAYER_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ec4899', // pink
]

export const PLAYER_GRADIENTS = [
  'linear-gradient(135deg, #3b82f6, #6366f1)',
  'linear-gradient(135deg, #22c55e, #10b981)',
  'linear-gradient(135deg, #f59e0b, #f97316)',
  'linear-gradient(135deg, #a855f7, #7c3aed)',
  'linear-gradient(135deg, #ec4899, #f43f5e)',
]

const ENEMY_WAVES_LEVEL_1: EnemyWave[] = [
  { name: 'スライム', emoji: '🟢', power: 1, description: 'よわい敵が様子を見に来た' },
  { name: '突風', emoji: '🌪️', power: 2, description: '風がタワーを揺らす！' },
  { name: 'メテオ', emoji: '☄️', power: 3, description: '隕石が迫ってくる！' },
  { name: '地震', emoji: '🌋', power: 4, description: '大地が揺れる！' },
  { name: 'ドラゴン', emoji: '🐉', power: 5, description: '最終ボスが登場！' },
]

export function getEnemyWave(round: number): EnemyWave {
  return ENEMY_WAVES_LEVEL_1[Math.min(round, ENEMY_WAVES_LEVEL_1.length - 1)]
}

export function createPlayers(names: string[]): TowerPlayer[] {
  return names.map((name, i) => ({
    id: i,
    name,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    correctCount: 0,
    wrongCount: 0,
  }))
}

/** Pick a random answer order (roulette result) */
export function rollAnswerOrder(players: TowerPlayer[]): number[] {
  const ids = players.map(p => p.id)
  // Fisher-Yates shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids
}

/** Calculate damage after defense. Returns how many blocks survive. */
export function calculateDamage(
  towerBlocks: TowerBlock[],
  enemyPower: number,
  shieldPoints: number,
): { survivingBlocks: TowerBlock[]; blocksDestroyed: number; shielded: number } {
  const effectivePower = Math.max(0, enemyPower - shieldPoints)
  const shielded = Math.min(enemyPower, shieldPoints)

  if (effectivePower <= 0) {
    return { survivingBlocks: [...towerBlocks], blocksDestroyed: 0, shielded }
  }

  // Remove blocks from the top
  const surviving = [...towerBlocks]
  let destroyed = 0
  for (let i = 0; i < effectivePower && surviving.length > 0; i++) {
    surviving.pop()
    destroyed++
  }

  return { survivingBlocks: surviving, blocksDestroyed: destroyed, shielded }
}

/** Is the tower complete? (Level 1 win condition) */
export function isTowerComplete(blocks: TowerBlock[]): boolean {
  return blocks.length >= LEVEL_1_TARGET_HEIGHT
}

/** Is the tower destroyed? */
export function isTowerDestroyed(blocks: TowerBlock[]): boolean {
  return blocks.length <= 0
}
