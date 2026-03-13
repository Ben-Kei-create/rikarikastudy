'use client'

import { TextAnswerResult } from '@/lib/answerUtils'

export default function TrueFalseQuestion({
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
    <div className="grid grid-cols-2 gap-3">
      {choices.map(choice => {
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
            key={choice}
            onClick={() => onSelect(choice)}
            disabled={disabled}
            className="min-h-[112px] rounded-[26px] text-center font-display text-4xl transition-all sm:min-h-[132px] sm:text-5xl"
            style={{ background, border, color }}
          >
            {choice}
          </button>
        )
      })}
    </div>
  )
}
