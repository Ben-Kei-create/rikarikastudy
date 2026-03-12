'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { getBadgeRarityLabel } from '@/lib/badges'
import { getLevelInfo } from '@/lib/engagement'
import LevelUnlockNotice from '@/components/LevelUnlockNotice'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import {
  CHEMISTRY_MODE_META,
  ChemistryPracticeMode,
  ChemistryPracticeQuestion,
  ChemistryTemplatePart,
  getChemistryPracticeDeck,
} from '@/lib/chemistryPractice'
import { recordStudySession, StudyRewardSummary } from '@/lib/studyRewards'

type Phase = 'answering' | 'result' | 'finished'

function shuffleArray<T>(items: T[]) {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

function shuffleQuestions(mode: ChemistryPracticeMode) {
  return shuffleArray(
    getChemistryPracticeDeck(mode).map(question => ({
      ...question,
      choices: shuffleArray(question.choices),
    })),
  )
}

function buildAnswerString(template: ChemistryTemplatePart[], answerTokens: string[]) {
  let answerIndex = 0
  return template
    .map(part => {
      if (part.kind === 'text') return part.value
      const token = answerTokens[answerIndex]
      answerIndex += 1
      return token ?? ''
    })
    .join('')
}

export default function ChemistryPracticePage({
  mode,
  onBack,
}: {
  mode: ChemistryPracticeMode
  onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const meta = CHEMISTRY_MODE_META[mode]

  const [questions, setQuestions] = useState<ChemistryPracticeQuestion[]>([])
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<Phase>('answering')
  const [selectedTokens, setSelectedTokens] = useState<string[]>([])
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [resultHistory, setResultHistory] = useState<boolean[]>([])
  const [rewardSummary, setRewardSummary] = useState<StudyRewardSummary | null>(null)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    setLoading(true)
    setQuestions(shuffleQuestions(mode))
    setCurrent(0)
    setPhase('answering')
    setSelectedTokens([])
    setIsCorrect(null)
    setScore(0)
    setResultHistory([])
    setRewardSummary(null)
    startedAtRef.current = Date.now()
    setLoading(false)
  }, [mode])

  const question = questions[current]
  const progress = questions.length > 0 ? (current / questions.length) * 100 : 0
  const canSubmit = !!question && selectedTokens.length === question.answerTokens.length

  const saveSession = async () => {
    if (studentId === null) return

    const durationSeconds = startedAtRef.current
      ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
      : 0

    const reward = await recordStudySession({
      studentId,
      field: '化学',
      unit: meta.sessionUnit,
      totalQuestions: questions.length,
      correctCount: score,
      durationSeconds,
      sessionMode: mode === 'flash' ? 'chemistry_flash' : 'chemistry_reaction',
    })

    setRewardSummary(reward)
  }

  const handlePickToken = (token: string) => {
    if (phase !== 'answering' || !question) return
    if (selectedTokens.length >= question.answerTokens.length) return
    if (selectedTokens.includes(token)) return
    setSelectedTokens(currentTokens => [...currentTokens, token])
  }

  const handleRemoveToken = (index: number) => {
    if (phase !== 'answering') return
    setSelectedTokens(currentTokens => currentTokens.filter((_, currentIndex) => currentIndex !== index))
  }

  const handleSubmit = () => {
    if (!question || !canSubmit) return
    const correct = question.answerTokens.every((token, index) => selectedTokens[index] === token)
    setIsCorrect(correct)
    setResultHistory(history => [...history, correct])
    if (correct) setScore(currentScore => currentScore + 1)
    setPhase('result')
  }

  const handleNext = async () => {
    if (current + 1 >= questions.length) {
      await saveSession()
      setPhase('finished')
      return
    }

    setCurrent(currentIndex => currentIndex + 1)
    setSelectedTokens([])
    setIsCorrect(null)
    setPhase('answering')
  }

  const restart = () => {
    setQuestions(shuffleQuestions(mode))
    setCurrent(0)
    setSelectedTokens([])
    setIsCorrect(null)
    setScore(0)
    setResultHistory([])
    setRewardSummary(null)
    setPhase('answering')
    startedAtRef.current = Date.now()
  }

  if (loading || !question) {
    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <div className="card text-slate-400">化学モードを準備中...</div>
      </div>
    )
  }

  if (phase === 'finished') {
    const rate = Math.round((score / questions.length) * 100)
    const levelInfo = rewardSummary ? getLevelInfo(rewardSummary.totalXp) : null
    const message = rate >= 90
      ? '語群の使い方までかなり安定しています。'
      : rate >= 70
        ? '反応式や化学式の形がかなり見えてきました。'
        : rate >= 50
          ? 'もう一度まわすと係数や記号が定着しやすくなります。'
          : '式の形を見ながら、語群を何度か組み直すと定着しやすいです。'

    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <div className={`hero-card reward-card w-full max-w-3xl px-6 py-7 text-center sm:px-8 ${rewardSummary?.leveledUp ? 'is-level-up' : ''}`}>
          <div className="text-5xl">{meta.icon}</div>
          <div className="mt-4 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: meta.accent }}>
            {meta.badge}
          </div>
          <div className="mt-3 font-display text-4xl text-white">
            {score} / {questions.length}
          </div>
          <div className="mt-2 text-2xl font-bold" style={{ color: meta.accent }}>
            {rate}%
          </div>
          <p className="mt-3 text-slate-300">{message}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {resultHistory.map((correct, index) => (
              <div
                key={`${mode}-${index}`}
                className="h-3 w-3 rounded-full"
                style={{ background: correct ? '#22c55e' : '#ef4444' }}
              />
            ))}
          </div>

          {rewardSummary && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="subcard p-4 text-left">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">獲得XP</div>
                <div className="mt-2 font-display text-3xl text-sky-300">+{rewardSummary.xpEarned}</div>
                <div className="mt-1 text-xs text-slate-500">化学モードの学習結果</div>
              </div>
              {levelInfo && (
                <div className="subcard p-4 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">現在レベル</div>
                      <div className="mt-2 font-display text-2xl text-white">Lv.{levelInfo.level}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-sky-200">{levelInfo.title}</div>
                      <div className="text-xs text-slate-500">{levelInfo.totalXp} XP</div>
                    </div>
                  </div>
                  <div className="mt-4 soft-track" style={{ height: 8 }}>
                    <div
                      style={{
                        width: `${levelInfo.progressRate}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #60a5fa, #38bdf8)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <LevelUnlockNotice rewardSummary={rewardSummary} />

          {rewardSummary?.newBadges.length ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 text-left">
              {rewardSummary.newBadges.map((badge, index) => (
                <div
                  key={badge.key}
                  className={`badge-toast badge-toast--${badge.rarity}`}
                  style={{ animationDelay: `${index * 0.08}s` }}
                >
                  <div className="text-2xl">{badge.iconEmoji}</div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{badge.name}</span>
                      <span className="text-[10px] tracking-[0.18em] text-slate-400">{getBadgeRarityLabel(badge.rarity)}</span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1">{badge.description}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button onClick={restart} className="btn-secondary w-full">
              もう一度
            </button>
            <button onClick={onBack} className="btn-primary w-full">
              化学へ戻る
            </button>
            <button onClick={() => logout()} className="btn-ghost w-full">
              ログアウト
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell page-shell-dashboard">
      <div className="hero-card science-surface p-5 sm:p-6 lg:p-7 mb-5 anim-fade-up">
        <ScienceBackdrop />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ background: `${meta.accent}18`, color: meta.accent, border: `1px solid ${meta.accent}33` }}
            >
              <span>{meta.badge}</span>
            </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="text-4xl">{meta.icon}</div>
                <div>
                  <h1 className="font-display text-3xl text-white sm:text-4xl">{meta.title}</h1>
                  {meta.description && (
                    <p className="mt-1 text-sm text-slate-300 sm:text-base">{meta.description}</p>
                  )}
                </div>
              </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">進行</div>
              <div className="mt-2 font-display text-2xl text-white">{current + 1}<span className="text-base text-slate-400"> / {questions.length}</span></div>
              <div className="mt-1 text-xs text-slate-500">question</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">正解</div>
              <div className="mt-2 font-display text-2xl" style={{ color: meta.accent }}>{score}</div>
              <div className="mt-1 text-xs text-slate-500">correct</div>
            </div>
            <button onClick={onBack} className="btn-secondary w-full">もどる</button>
            <button onClick={() => logout()} className="btn-ghost w-full">ログアウト</button>
          </div>
        </div>

        <div className="mt-5 soft-track" style={{ height: 8 }}>
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${meta.accent}, ${meta.accent}88)`,
              borderRadius: 999,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="card anim-fade-up">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: `${meta.accent}18`, color: meta.accent }}
            >
              化学
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">
              {question.unit}
            </span>
          </div>

          <div className="mt-4">
            <div className="text-slate-400 text-sm">{question.supportText}</div>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{question.prompt}</h2>
          </div>

          <div
            className="mt-6 rounded-[28px] border p-5 sm:p-6"
            style={{
              borderColor: `${meta.accent}30`,
              background: `linear-gradient(180deg, ${meta.accent}12, rgba(15, 23, 42, 0.5))`,
            }}
          >
            <div className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-100 sm:text-2xl">
              {(() => {
                let blankIndex = 0
                return question.template.map((part, index) => {
                  if (part.kind === 'text') {
                    return (
                      <span key={`${question.id}-text-${index}`} className="whitespace-pre-wrap text-slate-200">
                        {part.value}
                      </span>
                    )
                  }

                  const currentToken = selectedTokens[blankIndex]
                  const currentSlot = blankIndex
                  blankIndex += 1

                  return (
                    <button
                      key={`${question.id}-blank-${index}`}
                      type="button"
                      onClick={() => currentToken && handleRemoveToken(currentSlot)}
                      className="inline-flex min-h-[58px] min-w-[64px] items-center justify-center rounded-2xl border px-3 py-2 font-mono text-base font-bold sm:text-xl"
                      style={{
                        borderColor: currentToken ? `${meta.accent}66` : 'rgba(255,255,255,0.12)',
                        background: currentToken ? `${meta.accent}22` : 'rgba(2, 6, 23, 0.55)',
                        color: currentToken ? '#ffffff' : '#7f91aa',
                      }}
                    >
                      {currentToken || '___'}
                    </button>
                  )
                })
              })()}
            </div>
          </div>

          {phase === 'result' && (
            <div
              className="mt-5 rounded-[24px] border p-4"
              style={{
                borderColor: isCorrect ? '#22c55e55' : '#ef444455',
                background: isCorrect ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              }}
            >
              <div className="text-lg font-bold" style={{ color: isCorrect ? '#22c55e' : '#ef4444' }}>
                {isCorrect ? '正解' : '不正解'}
              </div>
              {!isCorrect && (
                <div className="mt-2 text-sm text-slate-300">
                  正しい式: <span className="font-mono text-white">{buildAnswerString(question.template, question.answerTokens)}</span>
                </div>
              )}
              <p className="mt-3 text-sm leading-7 text-slate-300">{question.explanation}</p>
              <button onClick={handleNext} className="btn-primary mt-4 w-full">
                {current + 1 >= questions.length ? '結果を見る' : '次へ'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card anim-fade-up">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-200">語群</div>
                <div className="mt-1 text-xs text-slate-500">タップして空欄を左から埋めます</div>
              </div>
              <button
                onClick={() => setSelectedTokens([])}
                disabled={phase !== 'answering' || selectedTokens.length === 0}
                className="btn-ghost text-sm !px-4 !py-2.5 disabled:opacity-40"
              >
                クリア
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {question.choices.map(token => {
                const selected = selectedTokens.includes(token)
                return (
                  <button
                    key={`${question.id}-${token}`}
                    onClick={() => handlePickToken(token)}
                    disabled={phase !== 'answering' || selected}
                    className="rounded-2xl border px-4 py-3 font-mono text-base font-semibold transition-all disabled:opacity-35"
                    style={{
                      borderColor: selected ? `${meta.accent}55` : 'rgba(255,255,255,0.1)',
                      background: selected ? `${meta.accent}18` : 'rgba(15, 23, 42, 0.72)',
                      color: selected ? meta.accent : '#e2e8f0',
                    }}
                  >
                    {token}
                  </button>
                )
              })}
            </div>

            {phase === 'answering' && (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="btn-primary mt-5 w-full disabled:opacity-40"
              >
                判定する
              </button>
            )}
          </div>

          <div className="card anim-fade-up">
            <div className="text-sm font-semibold text-slate-200">使い方</div>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-400">
              <li>空欄は左から順に埋まります。</li>
              <li>入れ直したいときは、埋めたマスをタップすると外せます。</li>
              <li>係数と化学式の両方を見て、順番まで合わせて完成させます。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
