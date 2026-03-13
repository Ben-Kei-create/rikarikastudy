'use client'

import { useEffect, useState } from 'react'
import { shuffleArray } from '@/lib/questionPicker'

export default function SortQuestion({
  questionId,
  items,
  disabled,
  onSubmit,
}: {
  questionId: string
  items: string[]
  disabled: boolean
  onSubmit: (items: string[]) => void
}) {
  const [currentItems, setCurrentItems] = useState<string[]>([])

  useEffect(() => {
    setCurrentItems(shuffleArray(items))
  }, [items, questionId])

  const moveItem = (index: number, delta: -1 | 1) => {
    if (disabled) return
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= currentItems.length) return

    setCurrentItems(current => {
      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
  }

  return (
    <div className="space-y-3">
      {currentItems.map((item, index) => (
        <div
          key={`${item}-${index}`}
          className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/30 px-4 py-3"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-xs font-semibold text-slate-300">
            {index + 1}
          </div>
          <div className="flex-1 text-sm font-semibold text-white">{item}</div>
          {!disabled && (
            <div className="flex gap-2">
              <button onClick={() => moveItem(index, -1)} className="btn-ghost !px-3 !py-2" disabled={index === 0}>↑</button>
              <button onClick={() => moveItem(index, 1)} className="btn-ghost !px-3 !py-2" disabled={index === currentItems.length - 1}>↓</button>
            </div>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <button onClick={() => onSubmit(currentItems)} className="btn-primary w-full">
            決定
          </button>
          <button onClick={() => setCurrentItems(shuffleArray(items))} className="btn-secondary w-full sm:w-auto">
            シャッフル
          </button>
        </div>
      )}
    </div>
  )
}
