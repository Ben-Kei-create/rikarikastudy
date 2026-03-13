'use client'

import { TextAnswerResult } from '@/lib/answerUtils'

export default function Choice4Question({
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
  const columns = choices.length >= 4 ? 'md:grid-cols-2' : ''

  return (
    <div className={`grid gap-3 ${columns}`.trim()}>
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
            className="min-h-[92px] rounded-xl p-4 text-left font-bold transition-all anim-fade-up"
            style={{ animationDelay: `${index * 0.06}s`, background, border, color }}
          >
            <span className="mr-3 opacity-50">{'ABCD'[index] ?? `${index + 1}` }.</span>
            {choice}
          </button>
        )
      })}
    </div>
  )
}
