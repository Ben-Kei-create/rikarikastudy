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

  const beginRoulette = (gamePlayers: TowerPlayer[], roundNum: number) => {
    // TODO: Step 3 で演出を実装
    const order = rollAnswerOrder(gamePlayers)
    setAnswerOrder(order)
    setPhase('roulette')
    setRouletteSpinning(true)
    setRouletteHighlight(-1)
    setRoundCorrectCount(0)

    // Placeholder: 即座に answering へ遷移（Step 3 でアニメーション追加）
    setTimeout(() => {
      setRouletteSpinning(false)
      setCurrentPlayerIdx(0)
      setTimeLeft(ROUND_TIME_SECONDS)
      setAnswerFeedback(null)
      setPhase('answering')
    }, 500)
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

  // ── Placeholder for other phases ──
  return (
    <div className="page-shell flex items-center justify-center">
      <div className="card w-full max-w-md text-center p-6">
        <div className="text-4xl mb-3">🏗️</div>
        <div className="font-display text-2xl text-white mb-2">
          {phase === 'roulette' && 'ルーレット中...'}
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
