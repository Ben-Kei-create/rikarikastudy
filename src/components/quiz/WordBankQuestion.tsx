'use client'

import { useEffect, useMemo, useState } from 'react'
import { shuffleArray } from '@/lib/questionPicker'

interface TokenItem {
  id: string
  label: string
}

export default function WordBankQuestion({
  questionId,
  wordTokens,
  distractorTokens,
  disabled,
  onSubmit,
}: {
  questionId: string
  wordTokens: string[]
  distractorTokens: string[]
  disabled: boolean
  onSubmit: (tokens: string[]) => void
}) {
  const [tokenPool, setTokenPool] = useState<TokenItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    const pool = shuffleArray(
      [...wordTokens, ...distractorTokens].map((label, index) => ({
        id: `${questionId}-${index}`,
        label,
      })),
    )
    setTokenPool(pool)
    setSelectedIds([])
  }, [distractorTokens, questionId, wordTokens])

  const selectedItems = useMemo(
    () => selectedIds.map(id => tokenPool.find(item => item.id === id)).filter((item): item is TokenItem => Boolean(item)),
    [selectedIds, tokenPool],
  )

  const availableItems = useMemo(
    () => tokenPool.filter(item => !selectedIds.includes(item.id)),
    [selectedIds, tokenPool],
  )

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-sky-500/18 bg-slate-950/30 px-4 py-4">
        <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">組み立てた答え</div>
        <div className="mt-3 flex min-h-[56px] flex-wrap gap-2 rounded-[18px] border border-white/10 bg-slate-950/35 px-3 py-3">
          {selectedItems.length === 0 ? (
            <span className="text-sm text-slate-500">下の語群を順番に押す</span>
          ) : (
            selectedItems.map(item => (
              <button
                key={item.id}
                onClick={() => !disabled && setSelectedIds(current => current.filter(id => id !== item.id))}
                disabled={disabled}
                className="rounded-full border border-sky-500/18 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-100"
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {availableItems.map(item => (
          <button
            key={item.id}
            onClick={() => !disabled && setSelectedIds(current => [...current, item.id])}
            disabled={disabled}
            className="rounded-full border border-white/12 bg-slate-950/45 px-3.5 py-2 text-sm font-semibold text-white transition-all"
          >
            {item.label}
          </button>
        ))}
      </div>

      {!disabled && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <button onClick={() => onSubmit(selectedItems.map(item => item.label))} disabled={selectedItems.length === 0} className="btn-primary w-full">
            決定
          </button>
          <button onClick={() => setSelectedIds([])} className="btn-secondary w-full sm:w-auto">
            クリア
          </button>
        </div>
      )}
    </div>
  )
}
