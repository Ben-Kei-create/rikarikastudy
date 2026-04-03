'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { hasValidChoiceAnswer, normalizeQuestionChoices } from '@/lib/questionChoices'
import { evaluateQuestionAnswer, getQuestionBlankPrompt, QuestionSubmission } from '@/lib/questionEval'
import { getQuestionCorrectAnswerText, getQuestionTypeShortLabel, normalizeQuestionRecord, QuestionShape, isChallengeSupportedQuestionType } from '@/lib/questionTypes'
import { playCorrect, playWrong, playPerfect } from '@/lib/sounds'
import { getQuestionImageDisplaySize } from '@/lib/questionImages'
import Choice4Question from '@/components/quiz/Choice4Question'
import FillChoiceQuestion from '@/components/quiz/FillChoiceQuestion'
import TrueFalseQuestion from '@/components/quiz/TrueFalseQuestion'
import { getCachedColumnSupport, isMissingColumnError, markColumnMissing, markColumnSupported } from '@/lib/schemaCompat'
import { shuffleArray } from '@/lib/questionPicker'
import {
  TowerPlayer,
  TowerBlock,
  EnemyWave,
  PLAYER_COLORS,
  PLAYER_GRADIENTS,
  ROUND_TIME_SECONDS,
  BLOCKS_PER_CORRECT,
  LEVEL_1_ROUNDS,
  LEVEL_1_TARGET_HEIGHT,
  createPlayers,
  rollAnswerOrder,
  getEnemyWave,
  calculateDamage,
  isTowerComplete,
  isTowerDestroyed,
} from '@/lib/scienceTower'

type Phase = 'setup' | 'roulette' | 'answering' | 'attack' | 'inter_round' | 'finished'
type Question = QuestionShape

export default function ScienceTowerPage({ onBack }: { onBack: () => void }) {
  const { studentId, logout } = useAuth()

  // Question pool
  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  // Setup
  const [playerNames, setPlayerNames] = useState<string[]>(['', ''])
  const [setupError, setSetupError] = useState('')

  // Game state
  const [phase, setPhase] = useState<Phase>('setup')
  const [players, setPlayers] = useState<TowerPlayer[]>([])
  const [towerBlocks, setTowerBlocks] = useState<TowerBlock[]>([])
  const [round, setRound] = useState(0)
  const [answerOrder, setAnswerOrder] = useState<number[]>([])
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0)
  const [roundCorrectCount, setRoundCorrectCount] = useState(0)

  // Shared timer
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_SECONDS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Roulette
  const [rouletteDecided, setRouletteDecided] = useState<number[]>([])
  const [rouletteSpinning, setRouletteSpinning] = useState(false)
  const [rouletteHighlight, setRouletteHighlight] = useState(-1)

  // Quiz answering
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [answerFeedback, setAnswerFeedback] = useState<'correct' | 'wrong' | null>(null)

  // Attack phase
  const [currentEnemy, setCurrentEnemy] = useState<EnemyWave | null>(null)
  const [attackResult, setAttackResult] = useState<{ blocksDestroyed: number; shielded: number } | null>(null)
  const [attackAnimPhase, setAttackAnimPhase] = useState<'idle' | 'charging' | 'impact' | 'result'>('idle')

  // Tower animation
  const [newBlockIndices, setNewBlockIndices] = useState<number[]>([])
  const towerBlocksRef = useRef<TowerBlock[]>([])
  const roundCorrectCountRef = useRef(0)
  useEffect(() => { towerBlocksRef.current = towerBlocks }, [towerBlocks])
  useEffect(() => { roundCorrectCountRef.current = roundCorrectCount }, [roundCorrectCount])
  const [towerShaking, setTowerShaking] = useState(false)
  const [interRoundStats, setInterRoundStats] = useState<{ correct: number; destroyed: number } | null>(null)

  // Final result
  const [gameResult, setGameResult] = useState<'win' | 'lose' | null>(null)

  // Load questions on mount
  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      let query = supabase.from('questions').select('*')
      const supportsFilter = getCachedColumnSupport('created_by_student_id') !== false
      if (supportsFilter) {
        query = query.or(
          studentId
            ? `created_by_student_id.is.null,created_by_student_id.eq.${studentId}`
            : 'created_by_student_id.is.null',
        )
      }
      let { data, error } = await query
      if (error && isMissingColumnError(error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        const fallback = await supabase.from('questions').select('*')
        data = fallback.data
        error = fallback.error
      } else if (!error && supportsFilter) {
        markColumnSupported('created_by_student_id')
      }
      if (!active) return
      if (error || !data) { setLoading(false); return }
      const pool = data
        .map(q => normalizeQuestionChoices(normalizeQuestionRecord(q), {
          shuffleChoices: q.type === 'choice' || q.type === 'choice4' || q.type === 'fill_choice' || q.type === 'multi_select',
        }))
        .filter(q => hasValidChoiceAnswer(q))
        .filter(q => isChallengeSupportedQuestionType(q.type))
      setAllQuestions(pool)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [studentId])

  // ─── Setup helpers ───

  const addPlayer = () => {
    if (playerNames.length >= 5) return
    setPlayerNames([...playerNames, ''])
  }

  const removePlayer = (idx: number) => {
    if (playerNames.length <= 2) return
    setPlayerNames(playerNames.filter((_, i) => i !== idx))
  }

  const updatePlayerName = (idx: number, name: string) => {
    const next = [...playerNames]
    next[idx] = name
    setPlayerNames(next)
  }

  const startGame = () => {
    const trimmed = playerNames.map(n => n.trim())
    if (trimmed.some(n => n === '')) {
      setSetupError('全員の名前を入力してください')
      return
    }
    if (allQuestions.length < 5) {
      setSetupError('問題が足りません（最低5問必要）')
      return
    }
    setSetupError('')
    const p = createPlayers(trimmed)
    setPlayers(p)
    setTowerBlocks([])
    setRound(0)
    setQuestions(shuffleArray(allQuestions))
    setQuestionIndex(0)
    setGameResult(null)
    setNewBlockIndices([])
    setTowerShaking(false)
    beginRoulette(p, 0)
  }

  // ─── Roulette ───

  const beginRoulette = (gamePlayers: TowerPlayer[], roundNum: number) => {
    const order = rollAnswerOrder(gamePlayers)
    setAnswerOrder(order)
    setPhase('roulette')
    setRouletteSpinning(true)
    setRouletteHighlight(-1)
    setRouletteDecided([])
    setRoundCorrectCount(0)
    setRound(roundNum)
    setAttackAnimPhase('idle')

    let tick = 0
    const totalTicks = 24 + gamePlayers.length * 5
    const interval = setInterval(() => {
      tick++
      const decidedSoFar = Math.floor((tick / totalTicks) * order.length)
      setRouletteHighlight(order[tick % gamePlayers.length])

      if (tick >= totalTicks) {
        clearInterval(interval)
        setRouletteSpinning(false)
        setRouletteDecided(order)
        setRouletteHighlight(order[0])

        setTimeout(() => {
          setCurrentPlayerIdx(0)
          setTimeLeft(ROUND_TIME_SECONDS)
          setAnswerFeedback(null)
          setSelectedChoice(null)
          setTextInput('')
          setPhase('answering')
        }, 1200)
      } else if (decidedSoFar > 0) {
        setRouletteDecided(order.slice(0, decidedSoFar))
      }
    }, tick < totalTicks * 0.6 ? 70 : 140)
  }

  // ─── Shared timer ───

  useEffect(() => {
    if (phase !== 'answering') {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!)
          timerRef.current = null
          startAttack()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  }, [phase])

  // ─── Answering ───

  const advanceQuestion = () => {
    setQuestionIndex(prev => {
      const next = prev + 1
      if (next < questions.length) return next
      setQuestions(shuffleArray(questions))
      return 0
    })
  }

  const currentQuestion = questions[questionIndex] ?? null
  const currentQuestionImage = currentQuestion?.image_url
    ? getQuestionImageDisplaySize(currentQuestion)
    : null
  const currentPlayerId = answerOrder[currentPlayerIdx]
  const currentPlayer = players.find(p => p.id === currentPlayerId) ?? null

  const handleAnswer = (submission: QuestionSubmission) => {
    if (phase !== 'answering' || !currentQuestion || answerFeedback) return

    const evaluated = evaluateQuestionAnswer(currentQuestion, submission)
    const correct = evaluated.result === 'exact'

    setAnswerFeedback(correct ? 'correct' : 'wrong')

    if (correct) {
      playCorrect()
      setRoundCorrectCount(c => c + 1)
      setPlayers(prev => prev.map(p =>
        p.id === currentPlayerId ? { ...p, correctCount: p.correctCount + 1 } : p
      ))
      // Add blocks with animation indices
      setTowerBlocks(prev => {
        const newBlocks: TowerBlock[] = Array.from({ length: BLOCKS_PER_CORRECT }, () => ({
          playerId: currentPlayerId,
          color: currentPlayer?.color ?? PLAYER_COLORS[0],
          hp: 1,
          cracked: false,
        }))
        const nextBlocks = [...prev, ...newBlocks]
        const newIdxs = Array.from({ length: BLOCKS_PER_CORRECT }, (_, i) => prev.length + i)
        setNewBlockIndices(newIdxs)
        setTimeout(() => setNewBlockIndices([]), 600)
        return nextBlocks
      })
    } else {
      playWrong()
      setPlayers(prev => prev.map(p =>
        p.id === currentPlayerId ? { ...p, wrongCount: p.wrongCount + 1 } : p
      ))
    }

    setTimeout(() => {
      setAnswerFeedback(null)
      advanceQuestion()

      if (currentPlayerIdx + 1 >= answerOrder.length) {
        startAttack()
      } else {
        setCurrentPlayerIdx(i => i + 1)
        setSelectedChoice(null)
        setTextInput('')
      }
    }, correct ? 700 : 1100)
  }

  const handleChoice = (choice: string) => {
    if (answerFeedback) return
    setSelectedChoice(choice)
    handleAnswer({ kind: 'single', value: choice })
  }

  const handleTextSubmit = () => {
    if (!currentQuestion || currentQuestion.type !== 'text' || answerFeedback) return
    const answer = textInput.trim()
    if (!answer) return
    handleAnswer({ kind: 'text', value: answer })
  }

  // ─── Attack ───

  const startAttack = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const enemy = getEnemyWave(round)
    setCurrentEnemy(enemy)
    setPhase('attack')
    setAttackAnimPhase('charging')

    // Wait for enemy entrance animation, then compute damage
    setTimeout(() => {
      setAttackAnimPhase('impact')
      setTowerShaking(true)
      setTimeout(() => setTowerShaking(false), 700)

      // Use refs to get latest values (avoid stale closures from setTimeout chain)
      const shield = roundCorrectCountRef.current
      const currentBlocks = towerBlocksRef.current
      const result = calculateDamage(currentBlocks, enemy.power, shield)
      setAttackResult({ blocksDestroyed: result.blocksDestroyed, shielded: result.shielded })
      setInterRoundStats({ correct: shield, destroyed: result.blocksDestroyed })
      setTowerBlocks(result.survivingBlocks)

      setTimeout(() => {
        setAttackAnimPhase('result')
        const surviving = result.survivingBlocks

        // Auto-advance: inter_round → next roulette, or finished
        setTimeout(() => {
          if (isTowerDestroyed(surviving)) {
            setGameResult('lose')
            setPhase('finished')
          } else if (round + 1 >= LEVEL_1_ROUNDS) {
            const won = isTowerComplete(surviving)
            setGameResult(won ? 'win' : 'lose')
            setPhase('finished')
            if (won) playPerfect()
          } else {
            setPhase('inter_round')
            setTimeout(() => beginRoulette(players, round + 1), 2200)
          }
        }, 2500)
      }, 700)
    }, 900)
  }

  // ─── Tower Panel (always mounted during game) ───

  const renderTowerPanel = () => {
    const progress = Math.min(towerBlocks.length / LEVEL_1_TARGET_HEIGHT, 1)
    const progressPct = Math.round(progress * 100)
    const isComplete = towerBlocks.length >= LEVEL_1_TARGET_HEIGHT
    const enemy = phase === 'roulette' || phase === 'answering' || phase === 'attack' || phase === 'inter_round'
      ? getEnemyWave(round)
      : null
    const isAttacking = phase === 'attack' && attackAnimPhase !== 'idle'

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
      }}>
        {/* Round indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderRadius: 16,
          background: 'rgba(148,163,184,0.06)',
          border: '1px solid rgba(148,163,184,0.1)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Round {Math.min(round + 1, LEVEL_1_ROUNDS)} / {LEVEL_1_ROUNDS}
          </div>
          {enemy && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>{enemy.emoji}</span>
              <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>ATK {enemy.power}</span>
            </div>
          )}
        </div>

        {/* Tower visualization */}
        <div style={{
          flex: 1,
          borderRadius: 20,
          background: 'linear-gradient(180deg, rgba(2,6,23,0.6) 0%, rgba(15,23,42,0.4) 100%)',
          border: '1px solid rgba(148,163,184,0.1)',
          padding: '16px 12px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 240,
        }}>
          {/* Atmospheric glow at bottom */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            background: isComplete
              ? 'linear-gradient(to top, rgba(250,204,21,0.12), transparent)'
              : 'linear-gradient(to top, rgba(34,197,94,0.08), transparent)',
            pointerEvents: 'none',
          }} />

          {/* Sky background with subtle stars */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 20%, rgba(56,189,248,0.04) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Attack flash overlay */}
          {isAttacking && attackAnimPhase === 'impact' && (
            <div className="attack-flash" style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 20,
              pointerEvents: 'none',
              zIndex: 10,
            }} />
          )}

          {/* Enemy icon flying in during attack */}
          {phase === 'attack' && currentEnemy && attackAnimPhase !== 'idle' && (
            <div className="enemy-enter" style={{
              position: 'absolute',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 64,
              zIndex: 20,
              filter: 'drop-shadow(0 0 20px rgba(239,68,68,0.6))',
            }}>
              {currentEnemy.emoji}
            </div>
          )}

          {/* The tower blocks */}
          <div
            className={towerShaking ? 'tower-shaking' : ''}
            style={{
              display: 'flex',
              flexDirection: 'column-reverse',
              alignItems: 'center',
              gap: 2,
              width: '100%',
              paddingBottom: 8,
              position: 'relative',
              zIndex: 5,
            }}
          >
            {towerBlocks.length === 0 && (
              <div style={{
                width: 72,
                height: 18,
                borderRadius: 4,
                border: '2px dashed rgba(148,163,184,0.2)',
                marginBottom: 4,
              }} />
            )}
            {towerBlocks.map((block, i) => {
              const isNew = newBlockIndices.includes(i)
              const isTop = i === towerBlocks.length - 1
              return (
                <div
                  key={i}
                  className={isNew ? 'tower-block-enter' : ''}
                  style={{
                    width: 72,
                    height: 18,
                    borderRadius: 4,
                    background: PLAYER_GRADIENTS[block.playerId % PLAYER_GRADIENTS.length],
                    boxShadow: isTop
                      ? `0 0 12px ${block.color}60, inset 0 -2px 0 rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)`
                      : `inset 0 -2px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)`,
                    opacity: block.cracked ? 0.5 : 1,
                    position: 'relative',
                    flexShrink: 0,
                    // Subtle 3D depth: right face
                  }}
                >
                  {/* Top face highlight */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 4,
                    right: 4,
                    height: 3,
                    borderRadius: '4px 4px 0 0',
                    background: 'rgba(255,255,255,0.2)',
                  }} />
                  {/* Right depth face */}
                  <div style={{
                    position: 'absolute',
                    top: 3,
                    right: -3,
                    width: 3,
                    bottom: 0,
                    background: `rgba(0,0,0,0.3)`,
                    borderRadius: '0 2px 2px 0',
                    transform: 'skewY(-10deg)',
                    transformOrigin: 'top right',
                  }} />
                </div>
              )
            })}
          </div>

          {/* Tower base platform */}
          <div className="tower-base-pulse" style={{
            width: '85%',
            height: 10,
            borderRadius: 6,
            background: 'linear-gradient(180deg, rgba(148,163,184,0.3), rgba(148,163,184,0.1))',
            border: '1px solid rgba(148,163,184,0.2)',
            flexShrink: 0,
            position: 'relative',
            zIndex: 5,
          }} />
        </div>

        {/* Tower progress bar */}
        <div style={{ padding: '0 4px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
            fontSize: 11,
            color: isComplete ? '#fde68a' : 'var(--text-muted)',
            fontWeight: 600,
          }}>
            <span className={isComplete ? 'victory-glow' : ''}>{isComplete ? '🏆 タワー完成！' : 'タワー建設中'}</span>
            <span style={{ color: isComplete ? '#fde68a' : '#22c55e', fontFamily: 'var(--font-display)' }}>
              {towerBlocks.length} / {LEVEL_1_TARGET_HEIGHT}
            </span>
          </div>
          <div style={{
            height: 8,
            borderRadius: 999,
            background: 'rgba(148,163,184,0.1)',
            overflow: 'hidden',
            border: '1px solid rgba(148,163,184,0.1)',
          }}>
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              borderRadius: 999,
              background: isComplete
                ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                : 'linear-gradient(90deg, #22c55e, #10b981)',
              transition: 'width 0.5s ease, background 0.3s',
              boxShadow: isComplete ? '0 0 8px rgba(251,191,36,0.5)' : '0 0 8px rgba(34,197,94,0.4)',
            }} />
          </div>
        </div>

        {/* Player scores */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '8px 4px',
        }}>
          {players.map(p => (
            <div key={p.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
            }}>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: PLAYER_GRADIENTS[p.id % PLAYER_GRADIENTS.length],
                flexShrink: 0,
                boxShadow: `0 0 6px ${p.color}40`,
              }} />
              <span style={{
                flex: 1,
                color: 'rgba(255,255,255,0.85)',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{p.name}</span>
              <span style={{ color: '#86efac', fontWeight: 700 }}>{p.correctCount}</span>
              {p.wrongCount > 0 && <span style={{ color: '#f87171', fontSize: 10 }}>-{p.wrongCount}</span>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Game Panel Content ───

  const renderGameContent = () => {
    // ── Roulette ──
    if (phase === 'roulette') {
      return (
        <div className="round-enter" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: '16px 20px',
            borderRadius: 20,
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.18)',
            textAlign: 'center',
          }}>
            <div className="phase-banner" style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#fbbf24',
              marginBottom: 6,
            }}>
              Round {round + 1} — 回答順ルーレット
            </div>
            <div style={{ fontSize: 13, color: 'rgba(203,213,225,0.7)' }}>
              {rouletteSpinning ? 'シャッフル中...' : '順番が決まった！クイズへ突入！'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {players.map((_, slotIdx) => {
              const decided = rouletteDecided[slotIdx]
              const isDecided = decided !== undefined
              const decidedPlayer = isDecided ? players[decided] : null
              const spinning = rouletteSpinning && !isDecided
              const spinningPlayer = players[Math.abs(rouletteHighlight) % players.length]

              return (
                <div
                  key={slotIdx}
                  className={isDecided ? 'anim-pop' : ''}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderRadius: 16,
                    border: `1px solid ${isDecided ? `${decidedPlayer!.color}50` : 'rgba(148,163,184,0.1)'}`,
                    background: isDecided
                      ? `${decidedPlayer!.color}18`
                      : spinning ? 'rgba(251,191,36,0.06)' : 'rgba(148,163,184,0.04)',
                    boxShadow: isDecided ? `0 0 20px ${decidedPlayer!.color}25` : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Slot number */}
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: isDecided
                      ? PLAYER_GRADIENTS[decided % PLAYER_GRADIENTS.length]
                      : 'rgba(148,163,184,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 800,
                    color: 'white',
                    flexShrink: 0,
                    boxShadow: isDecided ? `0 0 12px ${decidedPlayer!.color}40` : 'none',
                  }}>
                    {slotIdx + 1}
                  </div>

                  {/* Name display */}
                  <div style={{
                    flex: 1,
                    height: 28,
                    overflow: 'hidden',
                    position: 'relative',
                  }}>
                    {isDecided ? (
                      <span style={{
                        fontWeight: 700,
                        fontSize: 16,
                        color: 'white',
                        display: 'block',
                        lineHeight: '28px',
                      }}>
                        {decidedPlayer!.name}
                      </span>
                    ) : (
                      <span style={{
                        fontWeight: 600,
                        fontSize: 15,
                        color: spinning ? '#fbbf24' : 'rgba(148,163,184,0.4)',
                        display: 'block',
                        lineHeight: '28px',
                        transition: 'color 0.1s',
                      }}>
                        {spinning ? (spinningPlayer?.name ?? '...') : '???'}
                      </span>
                    )}
                  </div>

                  {/* Badge */}
                  {isDecided && (
                    <div style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      color: decidedPlayer!.color,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: `${decidedPlayer!.color}18`,
                    }}>
                      {slotIdx === 0 ? '先攻' : `${slotIdx + 1}番`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Next enemy preview */}
          <div style={{
            padding: '10px 16px',
            borderRadius: 14,
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>{getEnemyWave(round).emoji}</span>
            <div>
              <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700, letterSpacing: '0.1em' }}>このラウンドの敵</div>
              <div style={{ fontSize: 13, color: 'rgba(203,213,225,0.8)', marginTop: 1 }}>
                {getEnemyWave(round).name} — 攻撃力 {getEnemyWave(round).power}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // ── Answering ──
    if (phase === 'answering' && currentQuestion && currentPlayer) {
      const timerPercent = (timeLeft / ROUND_TIME_SECONDS) * 100
      const timerColor = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#22c55e'
      const timerUrgent = timeLeft <= 5

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
          {/* Timer bar */}
          <div style={{
            padding: '10px 14px',
            borderRadius: 16,
            background: timerUrgent ? 'rgba(239,68,68,0.08)' : 'rgba(148,163,184,0.05)',
            border: `1px solid ${timerUrgent ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.1)'}`,
            transition: 'all 0.3s',
          }}>
            <div style={{ height: 8, borderRadius: 999, background: 'rgba(148,163,184,0.1)', overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                width: `${timerPercent}%`,
                height: '100%',
                borderRadius: 999,
                background: timerColor,
                transition: 'width 1s linear, background 0.3s',
                boxShadow: timerUrgent ? `0 0 8px ${timerColor}80` : 'none',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {answerOrder.map((pid, idx) => {
                  const p = players.find(pl => pl.id === pid)!
                  const isCurrent = idx === currentPlayerIdx
                  const isDone = idx < currentPlayerIdx
                  return (
                    <div key={pid} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: isDone ? `${p.color}20` : isCurrent ? `${p.color}18` : 'rgba(148,163,184,0.06)',
                      border: isCurrent ? `1.5px solid ${p.color}80` : '1px solid transparent',
                      fontSize: 11,
                      fontWeight: 600,
                      color: isDone ? `${p.color}80` : isCurrent ? p.color : 'var(--text-muted)',
                      transition: 'all 0.2s',
                    }}>
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: PLAYER_GRADIENTS[pid % PLAYER_GRADIENTS.length],
                        opacity: isDone ? 0.4 : 1,
                      }} />
                      {p.name}
                      {isDone && <span style={{ fontSize: 9 }}>✓</span>}
                    </div>
                  )
                })}
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 800,
                color: timerUrgent ? '#ef4444' : 'white',
                animation: timerUrgent ? 'timerDangerPulse 0.5s ease-in-out infinite' : 'none',
              }}>
                {timeLeft}
              </div>
            </div>
          </div>

          {/* Current player banner */}
          <div className="anim-pop" style={{
            padding: '10px 16px',
            borderRadius: 16,
            background: `linear-gradient(135deg, ${currentPlayer.color}18, ${currentPlayer.color}08)`,
            border: `1px solid ${currentPlayer.color}40`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: PLAYER_GRADIENTS[currentPlayerId % PLAYER_GRADIENTS.length],
              boxShadow: `0 0 12px ${currentPlayer.color}50`,
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              color: 'white',
              fontWeight: 700,
            }}>{currentPlayer.name} のターン</span>
          </div>

          {/* Question card */}
          <div style={{
            borderRadius: 18,
            padding: '14px 16px',
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(148,163,184,0.12)',
          }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <span style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: 'rgba(148,163,184,0.12)',
                color: 'var(--text-muted)',
              }}>{currentQuestion.field} · {currentQuestion.unit}</span>
              <span style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                background: 'rgba(148,163,184,0.07)',
                color: 'var(--text-muted)',
              }}>{getQuestionTypeShortLabel(currentQuestion.type)}</span>
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'white', lineHeight: 1.7, margin: 0 }}>
              {currentQuestion.question}
            </p>
            {currentQuestion.image_url && currentQuestionImage && (
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  overflow: 'hidden',
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.15)',
                  background: 'rgba(2,6,23,0.5)',
                  width: `min(100%, ${currentQuestionImage.width}px)`,
                  aspectRatio: currentQuestionImage.aspectRatio,
                }}>
                  <img src={currentQuestion.image_url} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'fill' }} loading="lazy" />
                </div>
              </div>
            )}
          </div>

          {/* Answer area */}
          {answerFeedback ? (
            <div className="anim-pop" style={{
              padding: '16px',
              borderRadius: 18,
              textAlign: 'center',
              background: answerFeedback === 'correct' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${answerFeedback === 'correct' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              <div style={{ fontSize: 32, marginBottom: 4 }}>{answerFeedback === 'correct' ? '🎉' : '💥'}</div>
              <div style={{
                fontWeight: 800,
                fontSize: 18,
                color: answerFeedback === 'correct' ? '#86efac' : '#fca5a5',
              }}>
                {answerFeedback === 'correct'
                  ? `正解！ +${BLOCKS_PER_CORRECT}ブロック`
                  : `不正解… 答え: ${getQuestionCorrectAnswerText(currentQuestion)}`}
              </div>
            </div>
          ) : (
            <div className="anim-fade-up">
              {(currentQuestion.type === 'choice' || currentQuestion.type === 'choice4') && (
                <Choice4Question
                  choices={currentQuestion.choices ?? []}
                  selectedChoice={selectedChoice}
                  answer={currentQuestion.answer}
                  answerResult={null}
                  disabled={false}
                  onSelect={handleChoice}
                />
              )}
              {currentQuestion.type === 'true_false' && (
                <TrueFalseQuestion
                  choices={currentQuestion.choices ?? ['○', '×']}
                  selectedChoice={selectedChoice}
                  answer={currentQuestion.answer}
                  answerResult={null}
                  disabled={false}
                  onSelect={handleChoice}
                />
              )}
              {currentQuestion.type === 'fill_choice' && (
                <FillChoiceQuestion
                  choices={currentQuestion.choices ?? []}
                  selectedChoice={selectedChoice}
                  answer={currentQuestion.answer}
                  answerResult={null}
                  disabled={false}
                  onSelect={handleChoice}
                />
              )}
              {currentQuestion.type === 'text' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {getQuestionBlankPrompt(currentQuestion) && (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {getQuestionBlankPrompt(currentQuestion)!.promptText}
                    </div>
                  )}
                  <input
                    type="text"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                    placeholder="答えを入力..."
                    className="w-full rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    autoFocus
                  />
                  <button onClick={handleTextSubmit} className="btn-primary w-full" disabled={!textInput.trim()}>回答</button>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    // ── Attack ──
    if (phase === 'attack' && currentEnemy) {
      const shielded = attackResult?.shielded ?? 0
      const destroyed = attackResult?.blocksDestroyed ?? 0
      const tookDamage = destroyed > 0
      const blocked = shielded > 0 && !tookDamage

      return (
        <div className="round-enter" style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
          <div style={{
            padding: '14px 18px',
            borderRadius: 20,
            background: 'rgba(239,68,68,0.07)',
            border: '1px solid rgba(239,68,68,0.22)',
            textAlign: 'center',
          }}>
            <div className="phase-banner" style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#f87171',
              marginBottom: 6,
            }}>Enemy Attack!</div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              color: 'white',
              fontWeight: 800,
            }}>{currentEnemy.name}</div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(203,213,225,0.7)' }}>
              {currentEnemy.description}
            </p>
          </div>

          {/* Attack stats */}
          {attackAnimPhase === 'result' && (
            <div className="anim-pop" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: '攻撃力', value: currentEnemy.power, color: '#f87171' },
                { label: 'シールド', value: shielded, color: '#7dd3fc' },
                { label: '被害', value: tookDamage ? `-${destroyed}` : '0', color: tookDamage ? '#f87171' : '#86efac' },
              ].map(stat => (
                <div key={stat.label} style={{
                  padding: '12px 8px',
                  borderRadius: 14,
                  background: 'rgba(148,163,184,0.06)',
                  border: '1px solid rgba(148,163,184,0.1)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 4 }}>
                    {stat.label}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 24,
                    fontWeight: 800,
                    color: stat.color,
                  }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Result message */}
          {attackAnimPhase === 'result' && (
            <div className="anim-pop" style={{
              padding: '14px',
              borderRadius: 16,
              textAlign: 'center',
              background: tookDamage ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              border: `1px solid ${tookDamage ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
              fontSize: 15,
              fontWeight: 700,
              color: tookDamage ? '#fca5a5' : '#86efac',
            }}>
              {blocked && !tookDamage && '🛡️ 完全防御！ダメージなし！'}
              {!tookDamage && !blocked && '✨ 攻撃をかわした！'}
              {tookDamage && `💥 タワーが ${destroyed} ブロック破壊された！`}
            </div>
          )}

          {attackAnimPhase === 'charging' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'rgba(203,213,225,0.5)', fontSize: 13 }}>
                <div style={{ fontSize: 48, marginBottom: 8, animation: 'timerDangerPulse 0.4s ease-in-out infinite' }}>
                  {currentEnemy.emoji}
                </div>
                攻撃中...
              </div>
            </div>
          )}

          <div style={{ marginTop: 'auto', fontSize: 11, color: 'rgba(148,163,184,0.4)', textAlign: 'center' }}>
            {attackAnimPhase === 'result' ? '次のラウンドへ...' : ''}
          </div>
        </div>
      )
    }

    // ── Inter-round (auto-advancing) ──
    if (phase === 'inter_round') {
      const nextEnemy = round + 1 < LEVEL_1_ROUNDS ? getEnemyWave(round + 1) : null
      const blocksNeeded = Math.max(0, LEVEL_1_TARGET_HEIGHT - towerBlocks.length)
      return (
        <div className="round-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{
            width: '100%',
            padding: '20px',
            borderRadius: 20,
            background: 'rgba(34,197,94,0.07)',
            border: '1px solid rgba(34,197,94,0.2)',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#86efac',
              marginBottom: 8,
            }}>Round {round + 1} Complete</div>
            {interRoundStats && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 8 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', color: '#86efac' }}>
                    {interRoundStats.correct}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(203,213,225,0.5)' }}>正解</div>
                </div>
                {interRoundStats.destroyed > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', color: '#f87171' }}>
                      -{interRoundStats.destroyed}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(203,213,225,0.5)' }}>ブロック</div>
                  </div>
                )}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', color: '#fbbf24' }}>
                    {towerBlocks.length}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(203,213,225,0.5)' }}>/ {LEVEL_1_TARGET_HEIGHT}</div>
                </div>
              </div>
            )}
            {blocksNeeded > 0 && (
              <div style={{ fontSize: 12, color: 'rgba(203,213,225,0.5)', marginBottom: 8 }}>
                あと <strong style={{ color: '#fbbf24' }}>{blocksNeeded}</strong> ブロックで完成
              </div>
            )}
          </div>
          {nextEnemy && (
            <div style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 14,
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 22 }}>{nextEnemy.emoji}</span>
              <div>
                <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>次の敵</div>
                <div style={{ fontSize: 13, color: 'rgba(203,213,225,0.7)' }}>
                  {nextEnemy.name} — 攻撃力 {nextEnemy.power}
                </div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', animation: 'fadeIn 0.5s ease both', animationDelay: '0.5s' }}>
            次のラウンドへ...
          </div>
        </div>
      )
    }

    return null
  }

  // ─── Render ───

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card text-slate-400">準備中...</div>
      </div>
    )
  }

  // ── Setup screen ──
  if (phase === 'setup') {
    return (
      <div className="page-shell page-shell-dashboard">
        <div className="hero-card science-surface p-6 sm:p-7">
          <div className="text-xs font-semibold tracking-[0.2em] text-emerald-200 uppercase">Cooperative Mode</div>
          <h1 className="font-display mt-3 text-4xl text-white">サイエンスタワー</h1>
          <p className="mt-2 text-slate-300">みんなで協力してクイズに正解し、研究タワーを完成させよう！</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="subcard p-5">
              <div className="text-sm font-semibold text-white mb-3">ルール</div>
              <div className="space-y-2 text-sm leading-7 text-slate-300">
                <div>毎ラウンド、<span className="font-bold text-amber-300">ルーレット</span>で回答順が決まります。</div>
                <div>制限時間 <span className="font-bold text-sky-300">{ROUND_TIME_SECONDS}秒</span> は全員の<span className="font-bold text-red-300">共有シンキングタイム</span>！</div>
                <div>正解するとタワーに<span className="font-bold text-emerald-300">ブロック +{BLOCKS_PER_CORRECT}</span>。</div>
                <div>各ラウンド後に<span className="font-bold text-red-300">敵が襲来</span>！正解数でシールド防御。</div>
                <div><span className="font-bold text-amber-300">{LEVEL_1_ROUNDS}ラウンド</span>でタワーを<span className="font-bold text-emerald-300">{LEVEL_1_TARGET_HEIGHT}ブロック</span>以上にすれば勝利！</div>
                <div>ゲームは<span className="font-bold text-fuchsia-300">ノンストップ</span>で進行します。</div>
              </div>
            </div>

            <div className="subcard p-5">
              <div className="text-sm font-semibold text-white mb-3">プレイヤー登録</div>
              <div className="space-y-2">
                {playerNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0 shadow-md"
                      style={{ background: PLAYER_GRADIENTS[i % PLAYER_GRADIENTS.length] }}
                    />
                    <input
                      value={name}
                      onChange={e => updatePlayerName(i, e.target.value)}
                      placeholder={`プレイヤー ${i + 1}`}
                      maxLength={8}
                      className="flex-1 rounded-xl border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    {playerNames.length > 2 && (
                      <button
                        onClick={() => removePlayer(i)}
                        className="text-slate-500 hover:text-red-400 text-sm px-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {playerNames.length < 5 && (
                  <button
                    onClick={addPlayer}
                    className="w-full rounded-xl border border-dashed border-slate-600 py-2 text-sm text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
                  >
                    + プレイヤーを追加
                  </button>
                )}
              </div>
              {setupError && (
                <div className="mt-3 text-sm text-red-400">{setupError}</div>
              )}
            </div>
          </div>

          <div className="mt-5 subcard p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">レベル 1</div>
                <div className="mt-1 text-sm text-slate-300">{LEVEL_1_ROUNDS}ラウンド / 目標 {LEVEL_1_TARGET_HEIGHT}ブロック / ノンストップ進行</div>
              </div>
              <div className="text-4xl">🏗️</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={startGame} className="btn-primary" disabled={allQuestions.length < 5}>
              ゲーム開始
            </button>
            <button onClick={onBack} className="btn-secondary">
              もどる
            </button>
          </div>
          <button onClick={() => logout()} className="btn-ghost w-full mt-3">ログアウト</button>
        </div>
      </div>
    )
  }

  // ── Finished screen ──
  if (phase === 'finished') {
    const isWin = gameResult === 'win'
    return (
      <div className="page-shell flex flex-col items-center justify-center anim-fade">
        <div className={`hero-card reward-card w-full max-w-lg p-6 sm:p-7 text-center ${isWin ? 'perfect-shimmer' : ''}`}>
          {isWin && (
            <div className="reward-confetti" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={`c-${i}`} className="reward-confetti__piece" style={{
                  left: `${4 + ((i * 7) % 92)}%`,
                  animationDelay: `${(i % 8) * 0.06}s`,
                  background: PLAYER_COLORS[i % PLAYER_COLORS.length],
                }} />
              ))}
            </div>
          )}
          <div style={{ fontSize: 64, marginBottom: 8 }} className="anim-pop">
            {isWin ? '🏆' : '💔'}
          </div>
          <div className="font-display text-4xl text-white">{isWin ? 'タワー完成！' : 'タワー崩壊…'}</div>
          <p className="mt-2 text-slate-300">{isWin ? 'みんなの力でタワーを守りきった！' : 'タワーが敵に破壊されてしまった…'}</p>

          <div className="mt-5 font-display text-2xl" style={{ color: isWin ? '#22c55e' : '#ef4444' }}>
            {towerBlocks.length} / {LEVEL_1_TARGET_HEIGHT} ブロック
          </div>

          {/* MVP */}
          {(() => {
            const mvp = [...players].sort((a, b) => b.correctCount - a.correctCount)[0]
            return mvp && mvp.correctCount > 0 ? (
              <div className="mt-4 subcard p-4">
                <div className="text-[10px] font-semibold tracking-[0.18em] text-amber-300">MVP</div>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <div className="w-9 h-9 rounded-full shadow-md" style={{ background: PLAYER_GRADIENTS[mvp.id % PLAYER_GRADIENTS.length] }} />
                  <span className="font-display text-xl text-white">{mvp.name}</span>
                  <span className="text-sm text-emerald-300">{mvp.correctCount}正解</span>
                </div>
              </div>
            ) : null
          })()}

          <div className="mt-4 space-y-2">
            {players.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: `${p.color}10` }}>
                <div className="w-5 h-5 rounded-full" style={{ background: PLAYER_GRADIENTS[p.id % PLAYER_GRADIENTS.length] }} />
                <span className="flex-1 text-sm font-semibold text-left text-white">{p.name}</span>
                <span className="text-xs" style={{ color: '#86efac' }}>{p.correctCount}正解</span>
                {p.wrongCount > 0 && <span className="text-xs text-red-400">{p.wrongCount}不正解</span>}
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={() => { setPhase('setup'); setPlayers([]); setTowerBlocks([]) }} className="btn-primary">
              もう一度
            </button>
            <button onClick={onBack} className="btn-secondary">ホームへ</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main game layout (roulette / answering / attack / inter_round) ──
  return (
    <div className="page-shell page-shell-dashboard" style={{ minHeight: '100vh' }}>
      <div className="tower-game-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'clamp(200px, 28%, 290px) 1fr',
        gridTemplateRows: '1fr',
        gap: 16,
        minHeight: 'calc(100vh - 32px)',
        alignItems: 'start',
      }}>
        {/* Left: Tower Panel */}
        <div className="tower-panel-sticky" style={{
          position: 'sticky',
          top: 16,
          padding: '16px 14px',
          borderRadius: 22,
          background: 'rgba(2,6,23,0.55)',
          border: '1px solid rgba(148,163,184,0.1)',
          backdropFilter: 'blur(12px)',
          minHeight: 400,
        }}>
          {renderTowerPanel()}
        </div>

        {/* Right: Game Panel */}
        <div style={{
          padding: '16px 14px',
          borderRadius: 22,
          background: 'rgba(2,6,23,0.4)',
          border: '1px solid rgba(148,163,184,0.08)',
          backdropFilter: 'blur(8px)',
          minHeight: 400,
        }}>
          {renderGameContent()}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .tower-game-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto auto !important;
          }
          .tower-panel-sticky {
            position: relative !important;
            top: 0 !important;
            min-height: 180px !important;
          }
        }
      `}</style>
    </div>
  )
}
