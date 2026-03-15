'use client'

import { TextAnswerResult } from '@/lib/answerUtils'
import { getAnswerButtonStyles } from '@/lib/uiUtils'

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
            className="rounded-full px-4 py-3 text-sm font-semibold transition-all sm:text-base"
            style={styles}
          >
            {choice}
          </button>
        )
      })}
    </div>
  )
}
