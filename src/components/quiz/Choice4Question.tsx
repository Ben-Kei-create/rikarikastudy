'use client'

import { TextAnswerResult } from '@/lib/answerUtils'
import { getAnswerButtonStyles } from '@/lib/uiUtils'

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
        const styles = getAnswerButtonStyles(
          choice === answer,
          choice === selectedChoice && answerResult === 'incorrect',
          disabled,
        )

        return (
          <button
            key={`${choice}-${index}`}
            onClick={() => onSelect(choice)}
            disabled={disabled}
            className="min-h-[92px] rounded-xl p-4 text-left font-bold transition-all anim-fade-up"
            style={{ animationDelay: `${index * 0.06}s`, ...styles }}
          >
            <span className="mr-3 opacity-50">{'ABCD'[index] ?? `${index + 1}` }.</span>
            {choice}
          </button>
        )
      })}
    </div>
  )
}
