'use client'

export const FIELDS = ['生物', '化学', '物理', '地学'] as const
export type ScienceField = typeof FIELDS[number]

export const FIELD_COLORS: Record<ScienceField | '4分野総合' | 'all', string> = {
  '生物': '#22c55e',
  '化学': '#f97316',
  '物理': '#4da2ff',
  '地学': '#8b7cff',
  '4分野総合': '#38bdf8',
  'all': '#38bdf8',
}

export const FIELD_EMOJI: Record<ScienceField | '4分野総合' | 'all', string> = {
  '生物': '🌿',
  '化学': '⚗️',
  '物理': '⚡',
  '地学': '🌏',
  '4分野総合': '🔬',
  'all': '🔬',
}
