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

type Phase =
  | 'setup'
  | 'roulette'
  | 'answering'
  | 'attack'
  | 'round_result'
  | 'finished'

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
  const [rouletteSpinning, setRouletteSpinning] = useState(false)
  const [rouletteHighlight, setRouletteHighlight] = useState(-1)

  // Quiz answering
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [answerFeedback, setAnswerFeedback] = useState<'correct' | 'wrong' | null>(null)

  // Attack phase
  const [currentEnemy, setCurrentEnemy] = useState<EnemyWave | null>(null)
  const [attackResult, setAttackResult] = useState<{ blocksDestroyed: number; shielded: number } | null>(null)

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
    beginRoulette(p, 0)
  }

  // ─── Roulette ───

  const [rouletteDecided, setRouletteDecided] = useState<number[]>([])

  const beginRoulette = (gamePlayers: TowerPlayer[], roundNum: number) => {
    const order = rollAnswerOrder(gamePlayers)
    setAnswerOrder(order)
    setPhase('roulette')
    setRouletteSpinning(true)
    setRouletteHighlight(-1)
    setRouletteDecided([])
    setRoundCorrectCount(0)
    setRound(roundNum)

    // Spinning animation: rapidly cycle through player highlights
    let tick = 0
    const totalTicks = 20 + gamePlayers.length * 6 // spin longer
    const interval = setInterval(() => {
      tick++
      // Slow down as we approach each decided slot
      const decidedSoFar = Math.floor((tick / totalTicks) * order.length)
      setRouletteHighlight(order[tick % gamePlayers.length])

      if (tick >= totalTicks) {
        clearInterval(interval)
        setRouletteSpinning(false)
        setRouletteDecided(order)
        setRouletteHighlight(order[0])

        // After showing final order, go to answering
        setTimeout(() => {
          setCurrentPlayerIdx(0)
          setTimeLeft(ROUND_TIME_SECONDS)
          setAnswerFeedback(null)
          setPhase('answering')
        }, 1500)
      } else {
        // Reveal decided slots progressively
        if (decidedSoFar > 0) {
          setRouletteDecided(order.slice(0, decidedSoFar))
        }
      }
    }, tick < totalTicks * 0.6 ? 80 : 150) // fast then slow
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
          // Time's up! Skip remaining players, go to attack
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
      // Add blocks to tower
      const newBlocks: TowerBlock[] = Array.from({ length: BLOCKS_PER_CORRECT }, () => ({
        playerId: currentPlayerId,
        color: currentPlayer?.color ?? PLAYER_COLORS[0],
        hp: 1,
        cracked: false,
      }))
      setTowerBlocks(prev => [...prev, ...newBlocks])
    } else {
      playWrong()
      setPlayers(prev => prev.map(p =>
        p.id === currentPlayerId ? { ...p, wrongCount: p.wrongCount + 1 } : p
      ))
    }

    // Move to next player or attack after delay
    setTimeout(() => {
      setAnswerFeedback(null)
      advanceQuestion()

      if (currentPlayerIdx + 1 >= answerOrder.length) {
        // All players answered -> attack phase
        startAttack()
      } else {
        setCurrentPlayerIdx(i => i + 1)
        setSelectedChoice(null)
        setTextInput('')
      }
    }, correct ? 800 : 1200)
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

    // Shield = number of correct answers this round
    const shield = roundCorrectCount
    const result = calculateDamage(towerBlocks, enemy.power, shield)
    setAttackResult({ blocksDestroyed: result.blocksDestroyed, shielded: result.shielded })
    setTowerBlocks(result.survivingBlocks)

    // After showing attack, go to round_result or finished
    setTimeout(() => {
      if (isTowerDestroyed(result.survivingBlocks)) {
        setGameResult('lose')
        setPhase('finished')
      } else if (round + 1 >= LEVEL_1_ROUNDS) {
        setGameResult(isTowerComplete(result.survivingBlocks) ? 'win' : 'lose')
        setPhase('finished')
        if (isTowerComplete(result.survivingBlocks)) playPerfect()
      } else {
        setPhase('round_result')
      }
    }, 3000)
  }

  // ─── Next round ───

  const nextRound = () => {
    beginRoulette(players, round + 1)
  }

  // ─── Tower render helper ───

  const renderTower = (maxDisplay: number = 20, compact: boolean = false) => {
    const displayBlocks = towerBlocks.slice(-maxDisplay)
    const size = compact ? 'w-5 h-3' : 'w-7 h-4'
    return (
      <div className="flex flex-col-reverse items-center gap-0.5">
        {displayBlocks.map((block, i) => (
          <div
            key={i}
            className={`${size} rounded-sm transition-all duration-300`}
            style={{
              background: PLAYER_GRADIENTS[block.playerId % PLAYER_GRADIENTS.length],
              opacity: block.cracked ? 0.4 : 1,
              boxShadow: i === displayBlocks.length - 1 ? `0 0 8px ${block.color}60` : 'none',
            }}
          />
        ))}
        {towerBlocks.length === 0 && (
          <div className={`${size} rounded-sm border border-dashed border-slate-600`} />
        )}
      </div>
    )
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
                <div className="mt-1 text-sm text-slate-300">{LEVEL_1_ROUNDS}ラウンド / 目標 {LEVEL_1_TARGET_HEIGHT}ブロック</div>
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
          <button onClick={() => logout()} className="btn-ghost w-full mt-3">
            ログアウト
          </button>
        </div>
      </div>
    )
  }

  // ── Roulette screen ──
  if (phase === 'roulette') {
    const enemy = getEnemyWave(round)
    return (
      <div className="page-shell flex flex-col items-center justify-center anim-fade">
        <div className="hero-card science-surface w-full max-w-lg p-6 sm:p-7 text-center">
          <div className="text-xs font-semibold tracking-[0.2em] text-amber-200 uppercase">Round {round + 1} / {LEVEL_1_ROUNDS}</div>
          <h2 className="font-display mt-2 text-3xl text-white">回答順ルーレット</h2>

          {/* Enemy preview */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="text-2xl">{enemy.emoji}</span>
            <div className="text-sm text-slate-300">
              次の敵: <span className="font-bold text-red-300">{enemy.name}</span>
              <span className="text-slate-500 ml-2">攻撃力 {enemy.power}</span>
            </div>
          </div>

          {/* Roulette slots */}
          <div className="mt-6 space-y-3">
            {players.map((_, slotIdx) => {
              const decided = rouletteDecided[slotIdx]
              const isDecided = decided !== undefined
              const decidedPlayer = isDecided ? players[decided] : null
              const isHighlighted = !isDecided && rouletteSpinning && rouletteHighlight === slotIdx

              return (
                <div
                  key={slotIdx}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 ${isDecided ? 'anim-pop' : ''}`}
                  style={{
                    borderColor: isDecided
                      ? `${decidedPlayer!.color}60`
                      : isHighlighted ? 'rgba(251, 191, 36, 0.5)' : 'rgba(148, 163, 184, 0.12)',
                    background: isDecided
                      ? `${decidedPlayer!.color}15`
                      : isHighlighted ? 'rgba(251, 191, 36, 0.08)' : 'rgba(148, 163, 184, 0.04)',
                    transform: isHighlighted ? 'scale(1.03)' : 'scale(1)',
                    boxShadow: isDecided ? `0 0 16px ${decidedPlayer!.color}30` : 'none',
                  }}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white"
                    style={{
                      background: isDecided
                        ? PLAYER_GRADIENTS[decided % PLAYER_GRADIENTS.length]
                        : 'rgba(148, 163, 184, 0.2)',
                    }}>
                    {slotIdx + 1}
                  </div>
                  <div className="flex-1 text-left">
                    {isDecided ? (
                      <span className="font-bold text-white">{decidedPlayer!.name}</span>
                    ) : (
                      <span className={`text-slate-500 ${rouletteSpinning ? 'animate-pulse' : ''}`}>
                        {rouletteSpinning
                          ? players[rouletteHighlight % players.length]?.name ?? '...'
                          : '???'}
                      </span>
                    )}
                  </div>
                  {isDecided && (
                    <div className="text-xs font-semibold" style={{ color: decidedPlayer!.color }}>
                      {slotIdx === 0 ? '先攻' : `${slotIdx + 1}番目`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!rouletteSpinning && rouletteDecided.length === players.length && (
            <div className="mt-5 text-sm text-emerald-300 font-semibold anim-pop">
              順番が決まった！
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Answering screen ──
  if (phase === 'answering' && currentQuestion && currentPlayer) {
    const timerPercent = (timeLeft / ROUND_TIME_SECONDS) * 100
    const timerColor = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#22c55e'
    const timerUrgent = timeLeft <= 5

    return (
      <div className="page-shell">
        {/* Header: timer + round + tower */}
        <div className="card mb-3 sm:mb-4 anim-fade-up">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-xs font-semibold tracking-[0.15em] text-slate-400">
              ROUND {round + 1} / {LEVEL_1_ROUNDS}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">タワー</span>
              <span className="font-display text-sm" style={{ color: '#22c55e' }}>{towerBlocks.length}</span>
              <span className="text-xs text-slate-600">/ {LEVEL_1_TARGET_HEIGHT}</span>
            </div>
          </div>

          {/* Shared timer bar */}
          <div className="relative mb-3">
            <div className="soft-track" style={{ height: 10 }}>
              <div
                style={{
                  width: `${timerPercent}%`,
                  height: '100%',
                  background: timerColor,
                  borderRadius: 999,
                  transition: 'width 1s linear, background 0.3s',
                }}
              />
            </div>
            <div className={`mt-1 text-center font-display text-lg ${timerUrgent ? 'text-red-400 animate-pulse' : 'text-white'}`}>
              {timeLeft}秒
            </div>
          </div>

          {/* Player order progress */}
          <div className="flex items-center justify-center gap-2">
            {answerOrder.map((pid, idx) => {
              const p = players.find(pl => pl.id === pid)!
              const isCurrent = idx === currentPlayerIdx
              const isDone = idx < currentPlayerIdx
              return (
                <div
                  key={pid}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all"
                  style={{
                    background: isDone ? `${p.color}30` : isCurrent ? `${p.color}25` : 'rgba(148,163,184,0.08)',
                    color: isDone || isCurrent ? p.color : 'var(--text-muted)',
                    opacity: isDone ? 0.5 : 1,
                    boxShadow: isCurrent ? `0 0 0 2px ${p.color}` : 'none',
                  }}
                >
                  <div className="w-3 h-3 rounded-full" style={{ background: isDone || isCurrent ? PLAYER_GRADIENTS[pid % PLAYER_GRADIENTS.length] : 'rgba(148,163,184,0.2)' }} />
                  {p.name}
                  {isDone && <span className="text-[10px]">✓</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Current player banner */}
        <div
          className="card mb-3 sm:mb-4 anim-pop text-center"
          style={{
            borderColor: `${currentPlayer.color}40`,
            background: `linear-gradient(135deg, ${currentPlayer.color}10, ${currentPlayer.color}05)`,
          }}
        >
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full shadow-md" style={{ background: PLAYER_GRADIENTS[currentPlayerId % PLAYER_GRADIENTS.length] }} />
            <span className="font-display text-xl text-white">{currentPlayer.name} のターン</span>
          </div>
        </div>

        {/* Question card */}
        <div className="card anim-fade-up mb-3 sm:mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgba(148,163,184,0.14)', color: 'var(--text-muted)' }}>
              {currentQuestion.field} · {currentQuestion.unit}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(148,163,184,0.08)', color: 'var(--text-muted)' }}>
              {getQuestionTypeShortLabel(currentQuestion.type)}
            </span>
          </div>
          <p className="text-base sm:text-lg font-bold leading-relaxed text-white">{currentQuestion.question}</p>
          {currentQuestion.image_url && currentQuestionImage && (
            <div className="mt-3 flex justify-center">
              <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/50"
                style={{ width: `min(100%, ${currentQuestionImage.width}px)`, aspectRatio: currentQuestionImage.aspectRatio }}>
                <img src={currentQuestion.image_url} alt="" className="block h-full w-full object-fill" loading="lazy" />
              </div>
            </div>
          )}
        </div>

        {/* Answer area */}
        {answerFeedback ? (
          <div
            className="card mb-3 anim-pop text-center"
            style={{
              background: answerFeedback === 'correct' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              borderColor: answerFeedback === 'correct' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
            }}
          >
            <div className="text-2xl mb-1">{answerFeedback === 'correct' ? '🎉' : '💥'}</div>
            <div className="font-bold text-lg" style={{ color: answerFeedback === 'correct' ? '#86efac' : '#fca5a5' }}>
              {answerFeedback === 'correct' ? `正解！ +${BLOCKS_PER_CORRECT}ブロック` : `不正解… 答え: ${getQuestionCorrectAnswerText(currentQuestion)}`}
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
              <div className="space-y-3">
                {getQuestionBlankPrompt(currentQuestion) && (
                  <div className="text-sm text-slate-400">{getQuestionBlankPrompt(currentQuestion)!.promptText}</div>
                )}
                <input
                  type="text" value={textInput}
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

        {/* Mini tower display */}
        <div className="fixed bottom-4 right-4 flex flex-col items-center gap-1 opacity-60">
          {renderTower(8, true)}
          <span className="text-[10px] text-slate-500">{towerBlocks.length}/{LEVEL_1_TARGET_HEIGHT}</span>
        </div>
      </div>
    )
  }

  // ── Placeholder for attack / round_result / finished ──
  return (
    <div className="page-shell flex items-center justify-center">
      <div className="card w-full max-w-md text-center p-6">
        <div className="text-4xl mb-3">{phase === 'attack' ? currentEnemy?.emoji ?? '💥' : '🏗️'}</div>
        <div className="font-display text-2xl text-white mb-2">
          {phase === 'attack' && `${currentEnemy?.name ?? '敵'} が襲来！`}
          {phase === 'round_result' && `ラウンド ${round + 1} 終了`}
          {phase === 'finished' && (gameResult === 'win' ? 'タワー完成！' : 'タワー崩壊…')}
        </div>
        {phase === 'attack' && attackResult && (
          <div className="text-sm text-slate-300 mb-2">
            シールド: {attackResult.shielded} / 被ダメージ: {attackResult.blocksDestroyed}ブロック
          </div>
        )}
        {phase === 'round_result' && (
          <button onClick={nextRound} className="btn-primary mt-4">次のラウンドへ</button>
        )}
        {phase === 'finished' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button onClick={() => { setPhase('setup') }} className="btn-primary">もう一度</button>
            <button onClick={onBack} className="btn-secondary">ホームへ</button>
          </div>
        )}
        {phase !== 'round_result' && phase !== 'finished' && (
          <p className="text-slate-500 text-sm mt-2">処理中...</p>
        )}
      </div>
    </div>
  )
}
