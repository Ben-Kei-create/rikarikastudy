'use client'

import { useEffect, useState } from 'react'

export default function MultiSelectQuestion({
  questionId,
  choices,
  disabled,
  onSubmit,
}: {
  questionId: string
  choices: string[]
  disabled: boolean
  onSubmit: (selected: string[]) => void
}) {
  const [selectedChoices, setSelectedChoices] = useState<string[]>([])

  useEffect(() => {
    setSelectedChoices([])
  }, [questionId])

  const toggleChoice = (choice: string) => {
    if (disabled) return
    setSelectedChoices(current => current.includes(choice)
      ? current.filter(item => item !== choice)
      : [...current, choice])
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {choices.map((choice, index) => {
          const active = selectedChoices.includes(choice)
          return (
            <button
              key={`${choice}-${index}`}
              onClick={() => toggleChoice(choice)}
              disabled={disabled}
              className="min-h-[56px] sm:min-h-[84px] rounded-[18px] sm:rounded-[22px] border px-3 py-2.5 sm:px-4 sm:py-3 text-left transition-all"
              style={{
                borderColor: active ? 'rgba(56, 189, 248, 0.45)' : 'rgba(148, 163, 184, 0.16)',
                background: active ? 'rgba(56, 189, 248, 0.12)' : 'var(--card-gradient-base-soft)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-xs">
                  {active ? '✓' : ''}
                </div>
                <span className="text-sm font-semibold text-white">{choice}</span>
              </div>
            </button>
          )
        })}
      </div>

      {!disabled && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <button onClick={() => onSubmit(selectedChoices)} disabled={selectedChoices.length === 0} className="btn-primary w-full">
            決定
          </button>
          <button onClick={() => setSelectedChoices([])} className="btn-secondary w-full sm:w-auto">
            クリア
          </button>
        </div>
      )}
    </div>
  )
}
