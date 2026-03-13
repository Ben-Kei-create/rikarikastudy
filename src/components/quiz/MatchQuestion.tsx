'use client'

import { useEffect, useMemo, useState } from 'react'
import { MatchPair } from '@/lib/questionTypes'
import { shuffleArray } from '@/lib/questionPicker'

export default function MatchQuestion({
  questionId,
  pairs,
  disabled,
  onSubmit,
}: {
  questionId: string
  pairs: MatchPair[]
  disabled: boolean
  onSubmit: (pairs: MatchPair[]) => void
}) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null)
  const [currentPairs, setCurrentPairs] = useState<Record<string, string>>({})
  const [rightItems, setRightItems] = useState<string[]>([])

  useEffect(() => {
    setSelectedLeft(null)
    setCurrentPairs({})
    setRightItems(shuffleArray(pairs.map(pair => pair.right)))
  }, [pairs, questionId])

  const usedRights = useMemo(() => new Set(Object.values(currentPairs)), [currentPairs])
  const completedPairs = Object.entries(currentPairs).map(([left, right]) => ({ left, right }))

  const assignPair = (right: string) => {
    if (!selectedLeft || disabled) return

    setCurrentPairs(current => {
      const next: Record<string, string> = {}
      for (const [left, mappedRight] of Object.entries(current)) {
        if (left === selectedLeft) continue
        if (mappedRight === right) continue
        next[left] = mappedRight
      }
      next[selectedLeft] = right
      return next
    })
    setSelectedLeft(null)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-[24px] border border-white/10 bg-slate-950/30 p-3">
          <div className="mb-2 text-xs font-semibold tracking-[0.16em] text-slate-400">左</div>
          <div className="space-y-2">
            {pairs.map(pair => {
              const active = selectedLeft === pair.left
              const mappedRight = currentPairs[pair.left]
              return (
                <button
                  key={pair.left}
                  onClick={() => !disabled && setSelectedLeft(pair.left)}
                  disabled={disabled}
                  className="w-full rounded-[18px] border px-3 py-3 text-left transition-all"
                  style={{
                    borderColor: active ? 'rgba(56, 189, 248, 0.4)' : 'rgba(148, 163, 184, 0.16)',
                    background: active ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 23, 42, 0.48)',
                  }}
                >
                  <div className="text-sm font-semibold text-white">{pair.left}</div>
                  <div className="mt-1 text-xs text-slate-500">{mappedRight ? `→ ${mappedRight}` : '右を選ぶ'}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-slate-950/30 p-3">
          <div className="mb-2 text-xs font-semibold tracking-[0.16em] text-slate-400">右</div>
          <div className="space-y-2">
            {rightItems.map(right => {
              const locked = usedRights.has(right)
              return (
                <button
                  key={right}
                  onClick={() => assignPair(right)}
                  disabled={disabled || !selectedLeft}
                  className="w-full rounded-[18px] border px-3 py-3 text-left transition-all"
                  style={{
                    borderColor: locked ? 'rgba(34, 197, 94, 0.26)' : 'rgba(148, 163, 184, 0.16)',
                    background: locked ? 'rgba(34, 197, 94, 0.1)' : 'rgba(15, 23, 42, 0.48)',
                    color: locked ? '#bbf7d0' : 'var(--text)',
                    opacity: !selectedLeft && !disabled ? 0.68 : 1,
                  }}
                >
                  {right}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-white/10 bg-slate-950/30 px-4 py-4">
        <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">今の組み合わせ</div>
        {completedPairs.length === 0 ? (
          <div className="mt-2 text-sm text-slate-500">左を押してから右を押す</div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {completedPairs.map(pair => (
              <div key={`${pair.left}-${pair.right}`} className="rounded-full border border-sky-500/18 bg-sky-500/8 px-3 py-1.5 text-xs text-slate-100">
                {pair.left} → {pair.right}
              </div>
            ))}
          </div>
        )}
      </div>

      {!disabled && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <button
            onClick={() => onSubmit(completedPairs)}
            disabled={completedPairs.length !== pairs.length}
            className="btn-primary w-full"
          >
            決定
          </button>
          <button
            onClick={() => {
              setSelectedLeft(null)
              setCurrentPairs({})
            }}
            className="btn-secondary w-full sm:w-auto"
          >
            リセット
          </button>
        </div>
      )}
    </div>
  )
}
