'use client'

import { TextAnswerResult } from '@/lib/answerUtils'

export default function FillChoiceQuestion({
  choices,
  selectedChoice,
  answer,
  answerResult,
  disabled,
  onSelect,
}: {
  choices: string[]
  selectedChoice: string | null
  answer: string
  answerResult: TextAnswerResult | null
  disabled: boolean
  onSelect: (choice: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {choices.map((choice, index) => {
        const isCorrect = choice === answer
        const isWrongSelected = choice === selectedChoice && answerResult === 'incorrect'

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

        return (
          <button
            key={`${choice}-${index}`}
            onClick={() => onSelect(choice)}
            disabled={disabled}
            className="rounded-full px-4 py-3 text-sm font-semibold transition-all sm:text-base"
            style={{ background, border, color }}
          >
            {choice}
          </button>
        )
      })}
    </div>
  )
}
