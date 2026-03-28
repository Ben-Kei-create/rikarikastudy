'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { hasValidChoiceAnswer, normalizeQuestionChoices } from '@/lib/questionChoices'
import { evaluateQuestionAnswer, getQuestionBlankPrompt, QuestionSubmission } from '@/lib/questionEval'
import { pickTimeAttackQuestions, shuffleArray } from '@/lib/questionPicker'
import { getQuestionCorrectAnswerText, getQuestionTypeShortLabel, normalizeQuestionRecord, QuestionShape, isChallengeSupportedQuestionType } from '@/lib/questionTypes'
import { playCorrect, playWrong, playPerfect } from '@/lib/sounds'
import { getQuestionImageDisplaySize } from '@/lib/questionImages'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'
import {
  BOARD_SIZE,
  CellOwner,
  TerritoryBoard,
  countCells,
  createEmptyBoard,
  getEmptyCells,
  getFlippableCells,
  getWinner,
  isGameOver,
  pickCpuMove,
  placeAndFlip,
} from '@/lib/territoryQuiz'
import Choice4Question from '@/components/quiz/Choice4Question'
import FillChoiceQuestion from '@/components/quiz/FillChoiceQuestion'
import MatchQuestion from '@/components/quiz/MatchQuestion'
import MultiSelectQuestion from '@/components/quiz/MultiSelectQuestion'
import SortQuestion from '@/components/quiz/SortQuestion'
import TrueFalseQuestion from '@/components/quiz/TrueFalseQuestion'
import WordBankQuestion from '@/components/quiz/WordBankQuestion'
import { TextAnswerResult } from '@/lib/answerUtils'

type Phase = 'intro' | 'player_turn' | 'placing' | 'cpu_turn' | 'finished'
type Question = QuestionShape

const PLAYER_COLOR = '#3b82f6' // blue
const CPU_COLOR = '#ef4444'    // red
const PLAYER_GRADIENT = 'linear-gradient(135deg, #3b82f6, #6366f1)'
const CPU_GRADIENT = 'linear-gradient(135deg, #ef4444, #f97316)'
const FLIP_COLOR = '#fbbf24' // amber flash

export default function TerritoryQuizPage({ onBack }: { onBack: () => void }) {
  const { studentId, logout } = useAuth()

  // Question pool
  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  // Game state
  const [board, setBoard] = useState<TerritoryBoard>(createEmptyBoard)
  const [phase, setPhase] = useState<Phase>('intro')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [playerCorrect, setPlayerCorrect] = useState(0)
  const [cpuCorrect, setCpuCorrect] = useState(0)
  const [turnCount, setTurnCount] = useState(0)

  // Quiz answering state
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [answerResult, setAnswerResult] = useState<TextAnswerResult | null>(null)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)

  // Board placement state
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set())
  const [lastFlipped, setLastFlipped] = useState<Set<string>>(new Set())
  const [lastPlaced, setLastPlaced] = useState<string | null>(null)

  // CPU thinking animation
  const [cpuThinking, setCpuThinking] = useState(false)

  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentQuestion = questions[questionIndex] ?? null
  const currentQuestionImageDisplay = currentQuestion?.image_url
    ? getQuestionImageDisplaySize(currentQuestion)
    : null
  const counts = useMemo(() => countCells(board), [board])
  const emptyCells = useMemo(() => getEmptyCells(board), [board])

  // Load questions
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
      if (error || !data) {
        setLoading(false)
        return
      }

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

  const resetQuestionUi = () => {
    setSelectedChoice(null)
    setTextInput('')
    setAnswerResult(null)
    setFeedback(null)
  }

  const startGame = () => {
    if (allQuestions.length < 4) return

    const shuffled = shuffleArray(allQuestions)
    setQuestions(shuffled)
    setBoard(createEmptyBoard())
    setQuestionIndex(0)
    setPlayerCorrect(0)
    setCpuCorrect(0)
    setTurnCount(0)
    setHighlightedCells(new Set())
    setLastFlipped(new Set())
    setLastPlaced(null)
    resetQuestionUi()
    setPhase('player_turn')
  }

  const advanceQuestion = () => {
    setQuestionIndex(prev => {
      const next = prev + 1
      if (next < questions.length) return next
      setQuestions(shuffleArray(questions))
      return 0
    })
  }

  // Player answered a question
  const handlePlayerAnswer = (submission: QuestionSubmission) => {
    if (phase !== 'player_turn' || !currentQuestion) return

    const evaluated = evaluateQuestionAnswer(currentQuestion, submission)
    const correct = evaluated.result === 'exact'

    setAnswerResult(evaluated.result)
    setFeedback(correct ? 'correct' : 'wrong')

    if (correct) {
      playCorrect()
      setPlayerCorrect(c => c + 1)
    } else {
      playWrong()
    }

    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = setTimeout(() => {
      if (correct && emptyCells.length > 0) {
        // Player gets to place
        setPhase('placing')
        // Highlight empty cells
        const cells = new Set(getEmptyCells(board).map(([r, c]) => `${r}-${c}`))
        setHighlightedCells(cells)
      } else {
        // Wrong answer → skip to CPU turn
        resetQuestionUi()
        advanceQuestion()
        doCpuTurn()
      }
    }, correct ? 600 : 1200)
  }

  // Player places a cell
  const handlePlaceCell = (row: number, col: number) => {
    if (phase !== 'placing' || board[row][col] !== null) return

    const flippable = getFlippableCells(board, row, col, 'player')
    const { newBoard, flippedCount } = placeAndFlip(board, row, col, 'player')
    setBoard(newBoard)
    setLastPlaced(`${row}-${col}`)
    setLastFlipped(new Set(flippable.map(([r, c]) => `${r}-${c}`)))
    setHighlightedCells(new Set())

    // After placement, CPU turn
    setTimeout(() => {
      setLastFlipped(new Set())
      setLastPlaced(null)
      resetQuestionUi()
      advanceQuestion()
      setTurnCount(t => t + 1)

      // Check if game is over
      if (getEmptyCells(newBoard).length === 0) {
        setPhase('finished')
        playPerfect()
        return
      }

      doCpuTurn(newBoard)
    }, flippedCount > 0 ? 1000 : 500)
  }

  // CPU turn
  const doCpuTurn = useCallback((currentBoard?: TerritoryBoard) => {
    const b = currentBoard ?? board
    setCpuThinking(true)
    setPhase('cpu_turn')

    setTimeout(() => {
      // CPU always "answers correctly" ~60% of the time
      const cpuCorrectChance = Math.random() < 0.6

      if (cpuCorrectChance && getEmptyCells(b).length > 0) {
        const move = pickCpuMove(b)
        if (move) {
          const [r, c] = move
          setCpuCorrect(cc => cc + 1)
          const flippable = getFlippableCells(b, r, c, 'cpu')
          const { newBoard } = placeAndFlip(b, r, c, 'cpu')
          setBoard(newBoard)
          setLastPlaced(`${r}-${c}`)
          setLastFlipped(new Set(flippable.map(([fr, fc]) => `${fr}-${fc}`)))

          setTimeout(() => {
            setCpuThinking(false)
            setLastFlipped(new Set())
            setLastPlaced(null)
            setTurnCount(t => t + 1)

            if (getEmptyCells(newBoard).length === 0) {
              setPhase('finished')
              playPerfect()
            } else {
              resetQuestionUi()
              advanceQuestion()
              setPhase('player_turn')
            }
          }, 800)
        } else {
          // No moves, skip
          setCpuThinking(false)
          resetQuestionUi()
          advanceQuestion()
          setTurnCount(t => t + 1)
          setPhase('player_turn')
        }
      } else {
        // CPU "got it wrong"
        setCpuThinking(false)
        resetQuestionUi()
        advanceQuestion()
        setTurnCount(t => t + 1)

        if (getEmptyCells(b).length === 0) {
          setPhase('finished')
          playPerfect()
        } else {
          setPhase('player_turn')
        }
      }
    }, 1200)
  }, [board, questions])

  const handleChoice = (choice: string) => {
    if (phase !== 'player_turn' || !currentQuestion) return
    setSelectedChoice(choice)
    handlePlayerAnswer({ kind: 'single', value: choice })
  }

  const handleStructuredSubmit = (submission: QuestionSubmission) => {
    if (phase !== 'player_turn' || !currentQuestion) return
    handlePlayerAnswer(submission)
  }

  const handleTextSubmit = () => {
    if (!currentQuestion || currentQuestion.type !== 'text') return
    const answer = textInput.trim()
    if (!answer) return
    handlePlayerAnswer({ kind: 'text', value: answer })
  }

  // ─── Render helpers ──────────────────────────

  const renderCell = (row: number, col: number) => {
    const owner = board[row][col]
    const key = `${row}-${col}`
    const isHighlighted = highlightedCells.has(key)
    const isFlipped = lastFlipped.has(key)
    const isJustPlaced = lastPlaced === key
    const canPlace = phase === 'placing' && owner === null
    const isCorner = (row === 0 || row === BOARD_SIZE - 1) && (col === 0 || col === BOARD_SIZE - 1)

    // Preview flip count
    const previewFlips = canPlace
      ? getFlippableCells(board, row, col, 'player').length
      : 0

    let bgColor = 'rgba(148, 163, 184, 0.06)'
    let borderColor = 'rgba(148, 163, 184, 0.12)'
    let shadow = 'none'
    let gradient = ''

    if (owner === 'player') {
      gradient = isFlipped ? `linear-gradient(135deg, ${FLIP_COLOR}, #f59e0b)` : PLAYER_GRADIENT
      borderColor = 'rgba(59, 130, 246, 0.6)'
      shadow = isJustPlaced ? '0 0 20px rgba(59, 130, 246, 0.5), inset 0 1px 2px rgba(255,255,255,0.2)' : '0 2px 8px rgba(59, 130, 246, 0.2)'
    } else if (owner === 'cpu') {
      gradient = isFlipped ? `linear-gradient(135deg, ${FLIP_COLOR}, #f59e0b)` : CPU_GRADIENT
      borderColor = 'rgba(239, 68, 68, 0.6)'
      shadow = isJustPlaced ? '0 0 20px rgba(239, 68, 68, 0.5), inset 0 1px 2px rgba(255,255,255,0.2)' : '0 2px 8px rgba(239, 68, 68, 0.2)'
    } else if (isHighlighted) {
      bgColor = previewFlips > 0 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.06)'
      borderColor = previewFlips > 0 ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.3)'
      shadow = previewFlips > 0 ? '0 0 14px rgba(59, 130, 246, 0.25)' : '0 0 8px rgba(59, 130, 246, 0.15)'
    } else if (isCorner && owner === null) {
      borderColor = 'rgba(251, 191, 36, 0.15)'
    }

    return (
      <button
        key={key}
        onClick={() => canPlace && handlePlaceCell(row, col)}
        disabled={!canPlace}
        className={`relative rounded-xl transition-all duration-300 ${isFlipped ? 'animate-[flip_0.4s_ease-in-out]' : ''} ${isJustPlaced ? 'animate-[pop_0.3s_ease-out]' : ''}`}
        style={{
          aspectRatio: '1',
          background: gradient || bgColor,
          border: `2px solid ${borderColor}`,
          boxShadow: shadow,
          cursor: canPlace ? 'pointer' : 'default',
          transform: isJustPlaced ? 'scale(1.1)' : isFlipped ? 'scale(1.06)' : 'scale(1)',
        }}
        title={canPlace && previewFlips > 0 ? `${previewFlips} マス ひっくり返せる！` : undefined}
      >
        {owner === 'player' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/90 font-bold text-base drop-shadow-sm">
            ●
          </div>
        )}
        {owner === 'cpu' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/90 font-bold text-base drop-shadow-sm">
            ●
          </div>
        )}
        {canPlace && previewFlips > 0 && (
          <div className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full text-[10px] font-bold text-black flex items-center justify-center shadow-md"
            style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}>
            {previewFlips}
          </div>
        )}
        {canPlace && previewFlips === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500/60 text-xs">
            +
          </div>
        )}
      </button>
    )
  }

  const renderBoard = () => (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}>
      {Array.from({ length: BOARD_SIZE }, (_, r) =>
        Array.from({ length: BOARD_SIZE }, (_, c) => renderCell(r, c)),
      )}
    </div>
  )

  const renderScoreBar = () => {
    const total = BOARD_SIZE * BOARD_SIZE
    const playerPercent = Math.round((counts.player / total) * 100)
    const cpuPercent = Math.round((counts.cpu / total) * 100)
    const playerLeading = counts.player > counts.cpu
    const cpuLeading = counts.cpu > counts.player

    return (
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full shadow-md" style={{ background: PLAYER_GRADIENT }} />
            <div>
              <span className="text-sm font-bold" style={{ color: playerLeading ? '#93c5fd' : '#cbd5e1' }}>
                あなた
              </span>
              <span className="ml-2 font-display text-lg" style={{ color: PLAYER_COLOR }}>{counts.player}</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500">TURN</div>
            <div className="font-display text-base text-slate-300">{turnCount + 1}</div>
          </div>
          <div className="flex items-center gap-2.5">
            <div>
              <span className="font-display text-lg" style={{ color: CPU_COLOR }}>{counts.cpu}</span>
              <span className="ml-2 text-sm font-bold" style={{ color: cpuLeading ? '#fca5a5' : '#cbd5e1' }}>
                CPU
              </span>
            </div>
            <div className="w-5 h-5 rounded-full shadow-md" style={{ background: CPU_GRADIENT }} />
          </div>
        </div>
      </div>
    )
  }

  const renderQuestion = () => {
    if (!currentQuestion) return null
    const answered = feedback !== null

    return (
      <div className="card anim-fade-up">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgba(59, 130, 246, 0.18)', color: '#93c5fd' }}>
              {currentQuestion.field} · {currentQuestion.unit}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(148, 163, 184, 0.14)', color: 'var(--text-muted)' }}>
              {getQuestionTypeShortLabel(currentQuestion.type)}
            </span>
          </div>
        </div>

        <div className="text-xl font-bold text-white leading-relaxed mb-4">{currentQuestion.question}</div>

        {currentQuestion.image_url && currentQuestionImageDisplay && (
          <div className="mt-2 mb-4 flex justify-center">
            <div
              className="overflow-hidden rounded-[24px] border bg-slate-950/50"
              style={{
                borderColor: 'rgba(148, 163, 184, 0.16)',
                width: `min(100%, ${currentQuestionImageDisplay.width}px)`,
                aspectRatio: currentQuestionImageDisplay.aspectRatio,
              }}
            >
              <img
                src={currentQuestion.image_url}
                alt={`${currentQuestion.question} の画像`}
                className="block h-full w-full object-fill"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {/* Feedback strip */}
        {feedback && (
          <div
            className="mb-4 rounded-xl px-4 py-3 text-center font-semibold text-sm"
            style={{
              background: feedback === 'correct' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: feedback === 'correct' ? '#86efac' : '#fca5a5',
              border: `1px solid ${feedback === 'correct' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            {feedback === 'correct'
              ? 'マスを選んで陣地を取ろう！'
              : `不正解… 正解: ${getQuestionCorrectAnswerText(currentQuestion)}`
            }
          </div>
        )}

        {/* Question type rendering */}
        {!answered && (() => {
          if (currentQuestion.type === 'choice' || currentQuestion.type === 'choice4') {
            return (
              <Choice4Question
                choices={currentQuestion.choices ?? []}
                selectedChoice={selectedChoice}
                answer={currentQuestion.answer}
                answerResult={answerResult}
                disabled={false}
                onSelect={handleChoice}
              />
            )
          }
          if (currentQuestion.type === 'true_false') {
            return (
              <TrueFalseQuestion
                choices={currentQuestion.choices ?? ['○', '×']}
                selectedChoice={selectedChoice}
                answer={currentQuestion.answer}
                answerResult={answerResult}
                disabled={false}
                onSelect={handleChoice}
              />
            )
          }
          if (currentQuestion.type === 'fill_choice') {
            return (
              <FillChoiceQuestion
                choices={currentQuestion.choices ?? []}
                selectedChoice={selectedChoice}
                answer={currentQuestion.answer}
                answerResult={answerResult}
                disabled={false}
                onSelect={handleChoice}
              />
            )
          }
          if (currentQuestion.type === 'match') {
            return (
              <MatchQuestion
                questionId={currentQuestion.id}
                pairs={currentQuestion.match_pairs ?? []}
                disabled={false}
                onSubmit={pairs => handleStructuredSubmit({ kind: 'match', pairs })}
              />
            )
          }
          if (currentQuestion.type === 'sort') {
            return (
              <SortQuestion
                questionId={currentQuestion.id}
                items={currentQuestion.sort_items ?? []}
                disabled={false}
                onSubmit={items => handleStructuredSubmit({ kind: 'sort', items })}
              />
            )
          }
          if (currentQuestion.type === 'multi_select') {
            return (
              <MultiSelectQuestion
                questionId={currentQuestion.id}
                choices={currentQuestion.choices ?? []}
                disabled={false}
                onSubmit={selected => handleStructuredSubmit({ kind: 'multi_select', selected })}
              />
            )
          }
          if (currentQuestion.type === 'word_bank') {
            return (
              <WordBankQuestion
                questionId={currentQuestion.id}
                wordTokens={currentQuestion.word_tokens ?? []}
                distractorTokens={currentQuestion.distractor_tokens ?? []}
                disabled={false}
                onSubmit={tokens => handleStructuredSubmit({ kind: 'word_bank', tokens })}
              />
            )
          }
          if (currentQuestion.type === 'text') {
            const blankPrompt = getQuestionBlankPrompt(currentQuestion)
            return (
              <div className="space-y-3">
                {blankPrompt && (
                  <div className="text-sm text-slate-400">{blankPrompt.promptText}</div>
                )}
                <input
                  type="text"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                  placeholder="答えを入力..."
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button onClick={handleTextSubmit} className="btn-primary w-full" disabled={!textInput.trim()}>
                  回答する
                </button>
              </div>
            )
          }
          return null
        })()}
      </div>
    )
  }

  // ─── Screens ──────────────────────────

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card text-slate-400">陣取りクイズを準備中...</div>
      </div>
    )
  }

  if (allQuestions.length < 4) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card w-full max-w-xl text-center">
          <div className="font-display text-3xl text-white">問題が足りません</div>
          <p className="mt-3 text-slate-300">陣取りクイズには最低4問必要です。問題を追加してください。</p>
          <div className="mt-6">
            <button onClick={onBack} className="btn-primary">ホームへ</button>
          </div>
        </div>
      </div>
    )
  }

  // Intro screen
  if (phase === 'intro') {
    return (
      <div className="page-shell page-shell-dashboard">
        <div className="hero-card science-surface p-6 sm:p-7">
          <div className="text-xs font-semibold tracking-[0.2em] text-blue-200 uppercase">Territory Quiz</div>
          <h1 className="font-display mt-3 text-4xl text-white">陣取りクイズ</h1>
          <p className="mt-3 text-slate-300">5×5のマス目をクイズで奪い合え！</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="subcard p-5">
              <div className="text-sm font-semibold text-white mb-3">ルール</div>
              <div className="space-y-2 text-sm leading-7 text-slate-300">
                <div>クイズに正解すると好きな空きマスに自分の色を置けます。</div>
                <div>相手のマスを自分のマスで<span className="font-bold text-amber-300">挟むと</span>、挟まれたマスが全部ひっくり返ります！（縦・横・ナナメ）</div>
                <div>不正解だとCPUのターンになります。</div>
                <div>全マスが埋まったとき、<span className="font-bold text-blue-300">マスが多い方の勝ち</span>！</div>
              </div>
            </div>

            <div className="subcard p-5">
              <div className="text-sm font-semibold text-white mb-3">戦略のコツ</div>
              <div className="space-y-2 text-sm leading-7 text-slate-300">
                <div><span className="font-bold text-amber-300">角</span>を取ると挟まれにくい！</div>
                <div>挟み撃ちで<span className="font-bold text-amber-300">一気に逆転</span>もあり得る。</div>
                <div>正解数だけじゃなく、<span className="font-bold text-blue-300">どこに置くか</span>が勝負の分かれ目！</div>
              </div>

              <div className="mt-5 grid gap-1.5 grid-cols-5">
                {Array.from({ length: BOARD_SIZE }, (_, r) =>
                  Array.from({ length: BOARD_SIZE }, (_, c) => {
                    const isCorner = (r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1)
                    return (
                      <div
                        key={`preview-${r}-${c}`}
                        className="aspect-square rounded-lg"
                        style={{
                          background: isCorner ? 'rgba(251, 191, 36, 0.25)' : 'rgba(148, 163, 184, 0.08)',
                          border: `1px solid ${isCorner ? 'rgba(251, 191, 36, 0.4)' : 'rgba(148, 163, 184, 0.14)'}`,
                        }}
                      />
                    )
                  }),
                )}
              </div>
              <div className="mt-2 text-xs text-amber-300/60 text-center">角が有利！</div>
            </div>
          </div>

          <div className="mt-5 subcard p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">出題プール</div>
                <div className="mt-1 font-display text-2xl text-sky-300">{allQuestions.length} 問</div>
              </div>
              <div className="text-4xl">🏴</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={startGame} className="btn-primary">
              ゲーム開始
            </button>
            <button onClick={onBack} className="btn-secondary">
              ホームへ
            </button>
          </div>
          <button onClick={() => logout()} className="btn-ghost w-full mt-3">
            ログアウト
          </button>
        </div>
      </div>
    )
  }

  // Finished screen
  if (phase === 'finished') {
    const winner = getWinner(board)
    const winMessage = winner === 'player'
      ? 'あなたの勝ち！'
      : winner === 'cpu'
        ? 'CPUの勝ち…'
        : '引き分け！'
    const winEmoji = winner === 'player' ? '🎉' : winner === 'cpu' ? '😢' : '🤝'
    const total = BOARD_SIZE * BOARD_SIZE
    const playerPercent = Math.round((counts.player / total) * 100)
    const cpuPercent = Math.round((counts.cpu / total) * 100)

    return (
      <div className="page-shell flex flex-col items-center justify-center anim-fade">
        <div className={`hero-card reward-card w-full max-w-xl p-6 text-center sm:p-7 ${winner === 'player' ? 'perfect-shimmer' : ''}`}>
          {winner === 'player' && (
            <div className="reward-confetti" aria-hidden="true">
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={`confetti-${i}`}
                  className="reward-confetti__piece"
                  style={{
                    left: `${4 + ((i * 7) % 92)}%`,
                    animationDelay: `${(i % 8) * 0.06}s`,
                    background: ['#3b82f6', '#6366f1', '#22c55e', '#fbbf24'][i % 4],
                  }}
                />
              ))}
            </div>
          )}

          <div className="text-5xl mb-3 anim-pop">{winEmoji}</div>
          <div className="font-display text-4xl text-white">{winMessage}</div>

          {/* Territory visual bar */}
          <div className="mt-5 flex items-center gap-3">
            <span className="text-xs font-bold" style={{ color: PLAYER_COLOR }}>{playerPercent}%</span>
            <div className="flex-1 flex gap-0.5 rounded-full overflow-hidden" style={{ height: 14 }}>
              <div style={{ flex: counts.player || 0.01, background: PLAYER_GRADIENT, transition: 'flex 0.8s ease' }} />
              <div style={{ flex: counts.cpu || 0.01, background: CPU_GRADIENT, transition: 'flex 0.8s ease' }} />
            </div>
            <span className="text-xs font-bold" style={{ color: CPU_COLOR }}>{cpuPercent}%</span>
          </div>

          <div className="mt-5 grid gap-3 grid-cols-3">
            <div className="subcard p-4">
              <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-500">あなた</div>
              <div className="mt-2 font-display text-3xl" style={{ color: PLAYER_COLOR }}>{counts.player}</div>
              <div className="mt-1 text-xs text-slate-500">/ {total} マス</div>
            </div>
            <div className="subcard p-4">
              <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-500">CPU</div>
              <div className="mt-2 font-display text-3xl" style={{ color: CPU_COLOR }}>{counts.cpu}</div>
              <div className="mt-1 text-xs text-slate-500">/ {total} マス</div>
            </div>
            <div className="subcard p-4">
              <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-500">ターン数</div>
              <div className="mt-2 font-display text-3xl text-slate-200">{turnCount}</div>
              <div className="mt-1 text-xs text-slate-500">合計</div>
            </div>
          </div>

          {/* Final board */}
          <div className="mt-5 mx-auto max-w-[260px]">
            {renderBoard()}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={startGame} className="btn-primary">
              もう一度
            </button>
            <button onClick={onBack} className="btn-secondary">
              ホームへ
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Playing screens (player_turn, placing, cpu_turn)
  return (
    <div className="page-shell">
      {/* Top bar */}
      <div className="card mb-4 anim-fade-up">
        <div className="flex items-center justify-between gap-3">
          <button onClick={onBack} className="btn-secondary text-sm !px-4 !py-2.5">
            やめる
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{
              background: phase === 'cpu_turn' ? CPU_COLOR : PLAYER_COLOR,
              boxShadow: `0 0 8px ${phase === 'cpu_turn' ? CPU_COLOR : PLAYER_COLOR}`,
            }} />
            <span className="text-sm font-semibold" style={{
              color: phase === 'cpu_turn' ? CPU_COLOR : PLAYER_COLOR,
            }}>
              {phase === 'cpu_turn' ? 'CPUのターン...' : phase === 'placing' ? 'マスを選ぼう！' : 'あなたのターン'}
            </span>
          </div>
          <button onClick={() => logout()} className="btn-ghost text-sm !px-4 !py-2.5">
            ログアウト
          </button>
        </div>
      </div>

      {/* Board + Score */}
      <div className="card mb-4 anim-fade-up">
        {renderScoreBar()}

        {/* Territory progress bar */}
        <div className="mb-4 flex gap-0.5 rounded-full overflow-hidden" style={{ height: 10 }}>
          <div
            style={{
              flex: counts.player || 0.01,
              background: PLAYER_COLOR,
              transition: 'flex 0.5s ease',
            }}
          />
          <div
            style={{
              flex: counts.empty || 0.01,
              background: 'rgba(148, 163, 184, 0.15)',
              transition: 'flex 0.5s ease',
            }}
          />
          <div
            style={{
              flex: counts.cpu || 0.01,
              background: CPU_COLOR,
              transition: 'flex 0.5s ease',
            }}
          />
        </div>

        <div className="mx-auto max-w-[320px]">
          {renderBoard()}
        </div>

        {phase === 'placing' && (
          <div className="mt-3 text-center text-sm text-blue-300 animate-pulse">
            空きマスをタップして陣地を取ろう！
          </div>
        )}
      </div>

      {/* CPU thinking */}
      {phase === 'cpu_turn' && (
        <div className="card mb-4 anim-fade-up text-center" style={{
          borderColor: 'rgba(239, 68, 68, 0.2)',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06), rgba(249, 115, 22, 0.04))',
        }}>
          <div className="flex items-center justify-center gap-3">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-base font-semibold" style={{ color: CPU_COLOR }}>CPUが考え中...</span>
          </div>
        </div>
      )}

      {/* Question */}
      {phase === 'player_turn' && renderQuestion()}
    </div>
  )
}
