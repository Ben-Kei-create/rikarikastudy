'use client'

import { BadgeDefinition, getBadgeRarityLabel } from '@/lib/badges'
import { useEffect, useMemo, useState } from 'react'

export default function BadgeEarnedToastStack({ badges }: { badges: BadgeDefinition[] }) {
  const badgeKey = useMemo(
    () => badges.map(badge => badge.key).join(','),
    [badges],
  )
  const [visibleBadges, setVisibleBadges] = useState<BadgeDefinition[]>([])

  useEffect(() => {
    if (badges.length === 0) {
      setVisibleBadges([])
      return
    }

    setVisibleBadges(badges)

    const timeoutIds = badges.map((badge, index) =>
      window.setTimeout(() => {
        setVisibleBadges(current => current.filter(item => item.key !== badge.key))
      }, 4000 + (index * 220)),
    )

    return () => {
      timeoutIds.forEach(timeoutId => window.clearTimeout(timeoutId))
    }
  }, [badgeKey, badges])

  if (visibleBadges.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center px-4">
      <div className="flex w-full max-w-xl flex-col gap-3">
        {visibleBadges.map((badge, index) => (
          <div
            key={badge.key}
            className={`badge-toast badge-toast--${badge.rarity}`}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="text-2xl">{badge.iconEmoji}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-semibold text-white">{badge.name}</div>
                <span className="text-[10px] tracking-[0.18em] text-slate-200">{getBadgeRarityLabel(badge.rarity)}</span>
              </div>
              <div className="mt-1 text-xs text-slate-100/95">{badge.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
