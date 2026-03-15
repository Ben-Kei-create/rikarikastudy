'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { getBadgeRarityLabel } from '@/lib/badges'
import { getLevelInfo } from '@/lib/engagement'
import BadgeEarnedToastStack from '@/components/BadgeEarnedToastStack'
import LevelUnlockNotice from '@/components/LevelUnlockNotice'
import { PeriodicCardRewardPanel } from '@/components/PeriodicCard'
import { recordStudySession, StudyRewardSummary } from '@/lib/studyRewards'
import {
  buildEarthScienceCards,
  EARTH_SCIENCE_MODE_META,
  EarthScienceCard,
  EarthSciencePair,
  EarthSciencePracticeMode,
  getEarthSciencePairs,
} from '@/lib/earthSciencePractice'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  CARD_COLUMNS,
  CARD_ROWS,
  CARD_WIDTH,
  CARD_HEIGHT,
  getCardRect,
  drawRoundedRect,
  drawCardShadow,
  createLinearGradient,
  shuffleArray,
} from '@/lib/canvasUtils'

declare global {
  interface Window {
    render_game_to_text?: () => string
    advanceTime?: (ms: number) => void | Promise<void>
  }
}

type Phase = 'playing' | 'finished'

interface FeedbackState {
  type: 'match' | 'miss'
  message: string
  detail: string
  pairId: string | null
  selectedCardIds: string[]
  delayMs: number
}

function createDeck(mode: EarthSciencePracticeMode) {
  return shuffleArray(buildEarthScienceCards(mode))
}

function splitTextIntoLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = []
  let current = ''

  for (const character of Array.from(text)) {
    const next = `${current}${character}`
    if (ctx.measureText(next).width <= maxWidth || current.length === 0) {
      current = next
      continue
    }

    lines.push(current)
    current = character

    if (lines.length === maxLines - 1) break
  }

  if (lines.length < maxLines && current) {
    lines.push(current)
  } else if (current) {
    const lastLine = lines[maxLines - 1] ?? ''
    let clipped = lastLine
    while (clipped.length > 0 && ctx.measureText(`${clipped}...`).width > maxWidth) {
      clipped = clipped.slice(0, -1)
    }
    lines[maxLines - 1] = `${clipped}...`
  }

  return lines.slice(0, maxLines)
}

function drawCenteredTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  maxWidth: number
) {
  const lines = splitTextIntoLines(ctx, text, maxWidth, 2)
  const lineHeight = 28
  const firstLineY = centerY - ((lines.length - 1) * lineHeight) / 2

  lines.forEach((line, index) => {
    const measuredWidth = ctx.measureText(line).width
    ctx.fillText(line, centerX - measuredWidth / 2, firstLineY + index * lineHeight)
  })
}

export default function EarthSciencePracticePage({
  mode,
  onBack,
}: {
  mode: EarthSciencePracticeMode
  onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const meta = EARTH_SCIENCE_MODE_META[mode]
  const pairDeck = useMemo(() => getEarthSciencePairs(mode), [mode])
  const pairMap = useMemo(() => new Map(pairDeck.map(pair => [pair.id, pair])), [pairDeck])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const feedbackAccumulatorRef = useRef(0)
  const cardsRef = useRef<EarthScienceCard[]>([])
  const selectedCardIdsRef = useRef<string[]>([])
  const matchedPairIdsRef = useRef<string[]>([])
  const attemptsRef = useRef(0)
  const feedbackRef = useRef<FeedbackState | null>(null)
  const phaseRef = useRef<Phase>('playing')

  const [cards, setCards] = useState<EarthScienceCard[]>([])
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([])
  const [attempts, setAttempts] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [phase, setPhase] = useState<Phase>('playing')
  const [rewardSummary, setRewardSummary] = useState<StudyRewardSummary | null>(null)
  const [lastResolvedPair, setLastResolvedPair] = useState<EarthSciencePair | null>(null)
  const [lastOutcome, setLastOutcome] = useState<{ message: string; detail: string } | null>(null)

  const matchedCount = matchedPairIds.length
  const mistakes = Math.max(0, attempts - matchedCount)
  const progress = pairDeck.length > 0 ? (matchedCount / pairDeck.length) * 100 : 0
  const locked = Boolean(feedback)

  const clearFeedbackTimer = () => {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
  }

  const saveSession = async (finalAttempts: number, finalMatches: number) => {
    if (studentId === null) return

    const durationSeconds = startedAtRef.current
      ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
      : 0

    const reward = await recordStudySession({
      studentId,
      field: '地学',
      unit: meta.sessionUnit,
      totalQuestions: finalAttempts,
      correctCount: finalMatches,
      durationSeconds,
      sessionMode: 'earth_rock_pairs',
    })

    setRewardSummary(reward)
  }

  const resolveFeedback = () => {
    const currentFeedback = feedbackRef.current
    if (!currentFeedback) return

    clearFeedbackTimer()
    feedbackAccumulatorRef.current = 0

    if (currentFeedback.type === 'match' && currentFeedback.pairId) {
      const resolvedPair = pairMap.get(currentFeedback.pairId) ?? null
      setMatchedPairIds(current => current.includes(currentFeedback.pairId as string)
        ? current
        : [...current, currentFeedback.pairId as string])
      setLastResolvedPair(resolvedPair)
    }

    feedbackRef.current = null
    setFeedback(null)
    selectedCardIdsRef.current = []
    setSelectedCardIds([])
  }

  useEffect(() => {
    const nextCards = createDeck(mode)
    clearFeedbackTimer()
    feedbackAccumulatorRef.current = 0
    selectedCardIdsRef.current = []
    feedbackRef.current = null
    phaseRef.current = 'playing'
    startedAtRef.current = Date.now()
    setCards(nextCards)
    setSelectedCardIds([])
    setMatchedPairIds([])
    setAttempts(0)
    setFeedback(null)
    setPhase('playing')
    setRewardSummary(null)
    setLastResolvedPair(null)
    setLastOutcome(null)

    return () => {
      clearFeedbackTimer()
    }
  }, [mode])

  useEffect(() => {
    cardsRef.current = cards
  }, [cards])

  useEffect(() => {
    selectedCardIdsRef.current = selectedCardIds
  }, [selectedCardIds])

  useEffect(() => {
    matchedPairIdsRef.current = matchedPairIds
  }, [matchedPairIds])

  useEffect(() => {
    attemptsRef.current = attempts
  }, [attempts])

  useEffect(() => {
    feedbackRef.current = feedback
    clearFeedbackTimer()
    feedbackAccumulatorRef.current = 0

    if (!feedback) return

    feedbackTimeoutRef.current = window.setTimeout(() => {
      resolveFeedback()
    }, feedback.delayMs)

    return () => {
      clearFeedbackTimer()
    }
  }, [feedback, pairMap])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing' || pairDeck.length === 0 || matchedPairIds.length !== pairDeck.length) return

    phaseRef.current = 'finished'
    setPhase('finished')
    void saveSession(attempts, matchedPairIds.length)
  }, [attempts, matchedPairIds, pairDeck.length, phase])

  useEffect(() => {
    const drawBoard = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      const bg = createLinearGradient(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, '#120f26', '#1f1a42')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.arc(130, 94, 82, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(784, 136, 54, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#efe8ff'
      ctx.font = '700 28px "Zen Kaku Gothic New", sans-serif'
      ctx.fillText('関連する2枚を見つけて消していこう', 42, 46)
      ctx.fillStyle = 'rgba(226, 232, 240, 0.8)'
      ctx.font = '500 15px "Zen Kaku Gothic New", sans-serif'
      ctx.fillText('カードは最初から見えています。つながる2枚なら ○、ちがうなら × です。', 42, 72)

      cards.forEach((card, index) => {
        const rect = getCardRect(index)
        const matched = matchedPairIds.includes(card.pairId)
        const selected = selectedCardIds.includes(card.id)

        if (matched) {
          ctx.save()
          ctx.globalAlpha = 0.24
          drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 24)
          ctx.strokeStyle = 'rgba(196, 181, 253, 0.35)'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.fillStyle = 'rgba(216, 180, 254, 0.18)'
          ctx.fill()
          ctx.fillStyle = 'rgba(244, 240, 255, 0.92)'
          ctx.font = '700 18px "Zen Kaku Gothic New", sans-serif'
          ctx.fillText('CLEAR', rect.x + 42, rect.y + rect.height / 2 + 6)
          ctx.restore()
          return
        }

        drawCardShadow(ctx, rect.x, rect.y, rect.width, rect.height)
        drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 24)
        ctx.fillStyle = createLinearGradient(
          ctx,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          card.kind === 'left' ? '#5b4aa5' : '#3968b7',
          card.kind === 'left' ? '#2f234f' : '#18355c',
        )
        ctx.fill()

        ctx.lineWidth = selected ? 4 : 1.5
        ctx.strokeStyle = selected ? '#f8fafc' : 'rgba(255,255,255,0.12)'
        ctx.stroke()

        ctx.fillStyle = card.kind === 'left' ? 'rgba(233, 213, 255, 0.18)' : 'rgba(191, 219, 254, 0.18)'
        drawRoundedRect(ctx, rect.x + 16, rect.y + 16, 86, 30, 14)
        ctx.fill()
        ctx.fillStyle = card.kind === 'left' ? '#f5d0fe' : '#bfdbfe'
        ctx.font = '700 13px "Zen Kaku Gothic New", sans-serif'
        ctx.fillText(card.kind === 'left' ? 'キーワード' : '関連', rect.x + 24, rect.y + 36)

        ctx.fillStyle = '#ffffff'
        ctx.font = '700 23px "Zen Kaku Gothic New", sans-serif'
        drawCenteredTextBlock(ctx, card.label, rect.x + rect.width / 2, rect.y + 96, rect.width - 42)

        ctx.fillStyle = 'rgba(226, 232, 240, 0.78)'
        ctx.font = '500 13px "Zen Kaku Gothic New", sans-serif'
        ctx.fillText(card.kind === 'left' ? 'キーワードカード' : '関連カード', rect.x + 24, rect.y + rect.height - 30)
      })

      if (feedback) {
        ctx.save()
        drawRoundedRect(ctx, 274, 486, 352, 52, 18)
        ctx.fillStyle = feedback.type === 'match' ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)'
        ctx.fill()
        ctx.strokeStyle = feedback.type === 'match' ? 'rgba(74, 222, 128, 0.36)' : 'rgba(248, 113, 113, 0.36)'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 20px "Zen Kaku Gothic New", sans-serif'
        const feedbackTextWidth = ctx.measureText(feedback.message).width
        ctx.fillText(feedback.message, 450 - feedbackTextWidth / 2, 518)
        ctx.restore()
      }
    }

    drawBoard()
  }, [cards, feedback, matchedPairIds, selectedCardIds])

  useEffect(() => {
    window.render_game_to_text = () => {
      const payload = {
        mode: phaseRef.current,
        board: {
          origin: 'top-left',
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          rows: CARD_ROWS,
          cols: CARD_COLUMNS,
        },
        attempts: attemptsRef.current,
        matchedCount: matchedPairIdsRef.current.length,
        totalPairs: pairDeck.length,
        selected: selectedCardIdsRef.current,
        feedback: feedbackRef.current ? { type: feedbackRef.current.type, message: feedbackRef.current.message } : null,
        cards: cardsRef.current.map((card, index) => {
          const rect = getCardRect(index)
          return {
            id: card.id,
            pairId: card.pairId,
            kind: card.kind,
            label: card.label,
            matched: matchedPairIdsRef.current.includes(card.pairId),
            selected: selectedCardIdsRef.current.includes(card.id),
            row: rect.row,
            col: rect.col,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        }),
      }
      return JSON.stringify(payload, null, 2)
    }

    window.advanceTime = (ms: number) => {
      const currentFeedback = feedbackRef.current
      if (!currentFeedback || phaseRef.current !== 'playing') return

      feedbackAccumulatorRef.current += ms
      if (feedbackAccumulatorRef.current >= currentFeedback.delayMs) {
        resolveFeedback()
      }
    }

    return () => {
      delete window.render_game_to_text
      delete window.advanceTime
    }
  }, [pairDeck.length])

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== 'playing' || locked) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_WIDTH / rect.width
    const scaleY = CANVAS_HEIGHT / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY

    const cardIndex = cards.findIndex((card, index) => {
      const layout = getCardRect(index)
      const matched = matchedPairIds.includes(card.pairId)
      if (matched) return false
      return x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height
    })

    if (cardIndex === -1) return

    const chosenCard = cards[cardIndex]
    if (selectedCardIdsRef.current.includes(chosenCard.id)) return

    const nextSelected = [...selectedCardIdsRef.current, chosenCard.id]
    selectedCardIdsRef.current = nextSelected
    setSelectedCardIds(nextSelected)

    if (nextSelected.length < 2) return

    const firstCard = cards.find(card => card.id === nextSelected[0])
    const secondCard = cards.find(card => card.id === nextSelected[1])
    if (!firstCard || !secondCard) return

    setAttempts(current => current + 1)

    const matched = firstCard.pairId === secondCard.pairId && firstCard.kind !== secondCard.kind
    const pair = pairMap.get(firstCard.pairId) ?? null

    setLastOutcome({
      message: matched ? '◯ ペア成功' : '× ちがう組み合わせ',
      detail: matched && pair ? pair.clue : '関連のある2枚になっているか、つながりを見直してみよう。',
    })
    setFeedback({
      type: matched ? 'match' : 'miss',
      message: matched ? '◯ ペア成功' : '× ちがう組み合わせ',
      detail: matched && pair ? pair.clue : '地学用語どうしのつながりが合う組み合わせを探そう。',
      pairId: matched ? firstCard.pairId : null,
      selectedCardIds: nextSelected,
      delayMs: matched ? 720 : 880,
    })
  }

  const restart = () => {
    clearFeedbackTimer()
    feedbackAccumulatorRef.current = 0
    selectedCardIdsRef.current = []
    feedbackRef.current = null
    phaseRef.current = 'playing'
    startedAtRef.current = Date.now()
    setCards(createDeck(mode))
    setSelectedCardIds([])
    setMatchedPairIds([])
    setAttempts(0)
    setFeedback(null)
    setPhase('playing')
    setRewardSummary(null)
    setLastResolvedPair(null)
    setLastOutcome(null)
  }

  if (cards.length === 0) {
    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <div className="card text-slate-400">地学ミニゲームを準備中...</div>
      </div>
    )
  }

  if (phase === 'finished') {
    const accuracy = attempts > 0 ? Math.round((matchedCount / attempts) * 100) : 100
    const levelInfo = rewardSummary ? getLevelInfo(rewardSummary.totalXp) : null
    const comment = accuracy >= 85
      ? '地学用語のつながりがかなり安定しています。'
      : accuracy >= 70
        ? '地学の関連づけがかなり見えてきました。'
        : 'もう一度まわして、地学用語のつながりを定着させよう。'

    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <BadgeEarnedToastStack badges={rewardSummary?.newBadges ?? []} />
        <div className={`hero-card reward-card w-full max-w-3xl px-6 py-7 text-center sm:px-8 ${rewardSummary?.leveledUp ? 'is-level-up' : ''}`}>
          <div className="text-5xl">{meta.icon}</div>
          <div className="mt-4 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: meta.accent }}>
            {meta.badge}
          </div>
          <div className="mt-3 font-display text-4xl text-white">{matchedCount} / {attempts}</div>
          <div className="mt-2 text-2xl font-bold" style={{ color: meta.accent }}>{accuracy}%</div>
          <p className="mt-3 text-slate-300">{comment}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="subcard p-4 text-left">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">成功ペア</div>
              <div className="mt-2 font-display text-3xl text-white">{matchedCount}</div>
            </div>
            <div className="subcard p-4 text-left">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">ミス</div>
              <div className="mt-2 font-display text-3xl text-rose-200">{mistakes}</div>
            </div>
            {rewardSummary && (
              <div className="subcard p-4 text-left">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">獲得XP</div>
                <div className="mt-2 font-display text-3xl text-sky-300">+{rewardSummary.xpEarned}</div>
              </div>
            )}
          </div>

          {levelInfo && (
            <div className="mt-6 subcard p-4 text-left">
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

          <LevelUnlockNotice rewardSummary={rewardSummary} />
          {rewardSummary?.periodicCardReward && (
            <PeriodicCardRewardPanel reward={rewardSummary.periodicCardReward} />
          )}

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
            <button onClick={restart} className="btn-secondary w-full">もう一度</button>
            <button onClick={onBack} className="btn-primary w-full">地学へ戻る</button>
            <button onClick={() => logout()} className="btn-ghost w-full">ログアウト</button>
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
                <p className="mt-1 text-sm text-slate-300 sm:text-base">{meta.description}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">成功ペア</div>
              <div className="mt-2 font-display text-2xl text-white">{matchedCount}<span className="text-base text-slate-400"> / {pairDeck.length}</span></div>
              <div className="mt-1 text-xs text-slate-500">matched</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">試行回数</div>
              <div className="mt-2 font-display text-2xl" style={{ color: meta.accent }}>{attempts}</div>
              <div className="mt-1 text-xs text-slate-500">turns</div>
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
              background: `linear-gradient(90deg, ${meta.accent}, #c4b5fd)`,
              borderRadius: 999,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.16fr_0.84fr]">
        <div className="card anim-fade-up">
          <canvas
            ref={canvasRef}
            id="earth-pair-canvas"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onClick={handleCanvasClick}
            className="mx-auto block w-full max-w-[900px] cursor-pointer rounded-[28px]"
            style={{ touchAction: 'manipulation' }}
          />
        </div>

        <div className="space-y-4">
          <div className="card anim-fade-up">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-200">現在の判定</div>
                <div className="mt-1 text-xs text-slate-500">2枚そろえた直後に ○ / × が出ます</div>
              </div>
              <button
                onClick={restart}
                className="btn-ghost text-sm !px-4 !py-2.5"
              >
                シャッフルし直す
              </button>
            </div>

            <div
              className="mt-4 rounded-[24px] border p-4"
              style={{
                borderColor: feedback?.type === 'miss' ? 'rgba(248, 113, 113, 0.3)' : 'rgba(196, 181, 253, 0.28)',
                background: feedback?.type === 'miss'
                  ? 'rgba(127, 29, 29, 0.12)'
                  : 'rgba(139, 92, 246, 0.1)',
              }}
            >
              <div className="text-lg font-bold text-white">
                {feedback?.message ?? lastOutcome?.message ?? (lastResolvedPair ? '◯ 直前の正解ペア' : 'まだ1組目を探しているところ')}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {feedback?.detail ?? lastOutcome?.detail ?? lastResolvedPair?.clue ?? '関連する地学カード2枚を順番にタップして、正しいペアを見つけよう。'}
              </p>
            </div>
          </div>

          <div className="card anim-fade-up">
            <div className="text-sm font-semibold text-slate-200">ねらい</div>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-400">
              <li>関連する地学用語どうしを、カードのつながりで覚えます。</li>
              <li>カードは最初から見えていて、正解の2枚を選ぶとそのペアが消えます。</li>
              <li>ミスを少なくすると、学習セッションの正答率と XP が上がります。</li>
            </ul>
          </div>

          <div className="card anim-fade-up">
            <div className="text-sm font-semibold text-slate-200">出てくる関連</div>
            <div className="mt-3 space-y-2">
              {pairDeck.map(pair => {
                const cleared = matchedPairIds.includes(pair.id)
                return (
                  <div
                    key={pair.id}
                    className="rounded-2xl border px-3 py-3"
                    style={{
                      borderColor: cleared ? 'rgba(74, 222, 128, 0.26)' : 'rgba(148, 163, 184, 0.16)',
                      background: cleared ? 'rgba(34, 197, 94, 0.08)' : 'var(--card-gradient-base-soft)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{pair.left} × {pair.right}</div>
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{
                          background: cleared ? 'rgba(34, 197, 94, 0.16)' : 'rgba(148, 163, 184, 0.14)',
                          color: cleared ? '#86efac' : '#cbd5e1',
                        }}
                      >
                        {cleared ? 'CLEAR' : '未発見'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
