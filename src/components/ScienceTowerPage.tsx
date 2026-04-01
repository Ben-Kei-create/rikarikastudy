'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { hasValidChoiceAnswer, normalizeQuestionChoices } from '@/lib/questionChoices'
import { normalizeQuestionRecord, QuestionShape, isChallengeSupportedQuestionType } from '@/lib/questionTypes'
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

  // Answer feedback
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

  // ─── Answering (placeholder) ───

  // TODO: Step 4 で共有タイマー + クイズ回答を実装

  // ─── Attack (placeholder) ───

  // TODO: Step 5 で敵襲来演出を実装

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

  // ── Placeholder for remaining phases ──
  return (
    <div className="page-shell flex items-center justify-center">
      <div className="card w-full max-w-md text-center p-6">
        <div className="text-4xl mb-3">🏗️</div>
        <div className="font-display text-2xl text-white mb-2">
          {phase === 'answering' && `ラウンド ${round + 1} — 回答中`}
          {phase === 'attack' && '敵が襲来！'}
          {phase === 'round_result' && 'ラウンド結果'}
          {phase === 'finished' && '結果'}
        </div>
        <p className="text-slate-400 text-sm mb-4">（実装中）</p>
        <button onClick={onBack} className="btn-primary">もどる</button>
      </div>
    </div>
  )
}
