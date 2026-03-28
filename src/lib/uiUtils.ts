'use client'

/**
 * Shared UI utility functions used across multiple components.
 */

import { FIELD_COLORS } from '@/lib/constants'

/** Return field colour with a fallback (canonical version). */
export function getFieldColor(field: string, fallback = '#38bdf8') {
  return FIELD_COLORS[field as keyof typeof FIELD_COLORS] ?? fallback
}

/** Return a colour based on a percentage rate (green/amber/red). */
export function getRateColor(rate: number | null, options?: { nullColor?: string }) {
  if (rate === null) return options?.nullColor ?? '#475569'
  if (rate >= 70) return '#22c55e'
  if (rate >= 50) return '#f59e0b'
  return '#ef4444'
}

/** Compute background/border/color for quiz answer buttons (correct/incorrect feedback). */
export function getAnswerButtonStyles(
  isCorrect: boolean,
  isWrongSelected: boolean,
  disabled: boolean,
) {
  let background = 'var(--surface-elevated)'
  let border = '1px solid var(--surface-elevated-border)'
  let color = 'var(--text)'

  if (disabled) {
    if (isCorrect) {
      background = '#14532d'
      border = '2px solid #22c55e'
      color = '#bbf7d0'
    } else if (isWrongSelected) {
      background = '#450a0a'
      border = '2px solid #ef4444'
      color = '#fecaca'
    }
  }

  return { background, border, color }
}

/** Standard hover handlers for cards with accent colour lift effect. */
export function createCardHoverHandlers(accentColor: string, restBorder = `${accentColor}30`) {
  return {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      const el = event.currentTarget
      el.style.transform = 'translateY(-2px)'
      el.style.borderColor = `${accentColor}70`
      el.style.boxShadow = `0 18px 34px ${accentColor}22`
    },
    onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
      const el = event.currentTarget
      el.style.transform = ''
      el.style.borderColor = restBorder
      el.style.boxShadow = ''
    },
  }
}
