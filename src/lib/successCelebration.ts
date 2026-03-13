export interface SuccessCelebrationContent {
  label: string
  subtitle: string
  emoji: string
  accent: string
}

const SUCCESS_TIERS = [
  { minCombo: 10, label: 'Perfect!', subtitle: '集中が切れていません', emoji: '👑', accent: '#f59e0b' },
  { minCombo: 6, label: 'Excellent!', subtitle: 'かなりいい流れです', emoji: '🌟', accent: '#38bdf8' },
  { minCombo: 3, label: 'Great!', subtitle: '連続正解が伸びています', emoji: '✨', accent: '#22c55e' },
  { minCombo: 2, label: 'Nice!', subtitle: 'テンポよく解けています', emoji: '👏', accent: '#34d399' },
  { minCombo: 1, label: 'Great!', subtitle: 'その調子で次もいこう', emoji: '💫', accent: '#22c55e' },
] as const

export function getSuccessCelebration(combo: number, options?: { perfect?: boolean }): SuccessCelebrationContent {
  if (options?.perfect) {
    return {
      label: 'Perfect!',
      subtitle: '全問正解ですごい',
      emoji: '🏆',
      accent: '#f59e0b',
    }
  }

  const tier = SUCCESS_TIERS.find(candidate => combo >= candidate.minCombo) ?? SUCCESS_TIERS[SUCCESS_TIERS.length - 1]
  const comboText = combo > 1 ? `${combo}コンボ` : '1問クリア'

  return {
    ...tier,
    subtitle: `${comboText} · ${tier.subtitle}`,
  }
}
