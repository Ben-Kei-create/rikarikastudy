'use client'

import { useMemo } from 'react'
import { BADGE_DEFINITIONS, getBadgeRarityLabel } from '@/lib/badges'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface Props {
  earnedBadges: Array<{ badge_key: string; earned_at: string }>
}

export default function MyPageBadgesTab({ earnedBadges }: Props) {
  const earnedBadgeMap = useMemo(
    () => new Map(earnedBadges.map(badge => [badge.badge_key, badge])),
    [earnedBadges],
  )
  const earnedBadgeCount = earnedBadgeMap.size

  return (
    <div className="anim-fade space-y-4">
      <div className="card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-slate-300 font-bold">バッジコレクション</h3>
            <div className="mt-1 text-xs text-slate-500">集めるほど色が増える</div>
          </div>
          <div className="rounded-full bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-200">
            {earnedBadgeCount} / {BADGE_DEFINITIONS.length}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {BADGE_DEFINITIONS.map(badge => {
            const earned = earnedBadgeMap.get(badge.key)
            const lockedLegendary = !earned && badge.rarity === 'legendary'
            const accent = badge.rarity === 'legendary'
              ? '#c084fc'
              : badge.rarity === 'rare'
                ? 'var(--color-warning-muted)'
                : 'var(--color-accent)'
            const rarityLabel = getBadgeRarityLabel(badge.rarity)
            const displayIcon = earned ? badge.iconEmoji : lockedLegendary ? '❔' : badge.iconEmoji
            const earnedDate = earned ? format(new Date(earned.earned_at), 'M月d日', { locale: ja }) : null

            return (
              <div
                key={badge.key}
                className="rounded-[24px] border p-4"
                style={{
                  borderColor: earned ? `${accent}55` : 'rgba(148, 163, 184, 0.18)',
                  background: earned
                    ? `linear-gradient(135deg, ${accent}22, var(--card-gradient-base))`
                    : 'var(--card-gradient-base-soft)',
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border text-3xl"
                    style={{
                      borderColor: earned ? `${accent}66` : 'rgba(148, 163, 184, 0.18)',
                      background: earned ? `${accent}18` : 'rgba(71, 85, 105, 0.18)',
                      color: earned ? accent : 'var(--text-muted)',
                      filter: earned ? 'none' : 'grayscale(1)',
                      opacity: earned ? 1 : 0.72,
                    }}
                  >
                    {displayIcon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white">{badge.name}</div>
                      <div
                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={{
                          background: earned ? `${accent}18` : 'var(--color-neutral-soft-bg)',
                          color: earned ? accent : 'var(--text-muted)',
                        }}
                      >
                        {rarityLabel}
                      </div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      {lockedLegendary ? '???' : badge.description}
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      {earnedDate ? `${earnedDate} に獲得` : '未獲得'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
