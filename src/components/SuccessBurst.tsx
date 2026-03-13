'use client'

import type { CSSProperties } from 'react'
import { SuccessCelebrationContent } from '@/lib/successCelebration'

function withAlpha(color: string, alphaHex: string) {
  return color.startsWith('#') && color.length === 7 ? `${color}${alphaHex}` : color
}

export default function SuccessBurst({
  celebration,
  compact = false,
  className = '',
}: {
  celebration: SuccessCelebrationContent
  compact?: boolean
  className?: string
}) {
  const sparkRotations = [-82, -46, -12, 18, 52, 88]
  const rootStyle = {
    '--success-burst-accent': celebration.accent,
    '--success-burst-accent-border': withAlpha(celebration.accent, '55'),
    '--success-burst-accent-soft': withAlpha(celebration.accent, '33'),
    '--success-burst-accent-shadow': withAlpha(celebration.accent, '44'),
    '--success-burst-accent-glow': withAlpha(celebration.accent, '66'),
  } as CSSProperties

  return (
    <div
      className={`success-burst ${compact ? 'is-compact' : ''} ${className}`.trim()}
      style={rootStyle}
    >
      <div className="success-burst__halo" aria-hidden="true" />
      {sparkRotations.map((rotation, index) => (
        <span
          key={`${celebration.label}-${rotation}`}
          className="success-burst__spark"
          aria-hidden="true"
          style={{
            ['--spark-rotation' as string]: `${rotation}deg`,
            animationDelay: `${index * 0.04}s`,
          }}
        />
      ))}
      <div className="success-burst__content">
        <div className="success-burst__badge">
          <span>{celebration.emoji}</span>
          <span>{celebration.label}</span>
        </div>
        <div className="success-burst__subtitle">{celebration.subtitle}</div>
      </div>
    </div>
  )
}
