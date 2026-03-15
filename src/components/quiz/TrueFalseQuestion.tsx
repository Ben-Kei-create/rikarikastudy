'use client'

import { TextAnswerResult } from '@/lib/answerUtils'
import { getAnswerButtonStyles } from '@/lib/uiUtils'

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
        const styles = getAnswerButtonStyles(
          choice === answer,
          choice === selectedChoice && answerResult === 'incorrect',
          disabled,
        )

        return (
          <button
            key={choice}
            onClick={() => onSelect(choice)}
            disabled={disabled}
            className="min-h-[112px] rounded-[26px] text-center font-display text-4xl transition-all sm:min-h-[132px] sm:text-5xl"
            style={styles}
          >
            {choice}
          </button>
        )
      })}
    </div>
  )
}
