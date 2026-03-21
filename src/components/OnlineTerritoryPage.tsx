'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import Choice4Question from '@/components/quiz/Choice4Question'
import FillChoiceQuestion from '@/components/quiz/FillChoiceQuestion'
import MatchQuestion from '@/components/quiz/MatchQuestion'
import MultiSelectQuestion from '@/components/quiz/MultiSelectQuestion'
import SortQuestion from '@/components/quiz/SortQuestion'
import TrueFalseQuestion from '@/components/quiz/TrueFalseQuestion'
import WordBankQuestion from '@/components/quiz/WordBankQuestion'
import { useAuth } from '@/lib/auth'
import { Json, supabase } from '@/lib/supabase'
import { hasValidChoiceAnswer, normalizeQuestionChoices } from '@/lib/questionChoices'
import { evaluateQuestionAnswer, getQuestionBlankPrompt, QuestionSubmission } from '@/lib/questionEval'
import { getQuestionImageDisplaySize } from '@/lib/questionImages'
import { isGuestStudentId } from '@/lib/guestStudy'
import { fetchOnlineTerritoryRoom, subscribeOnlineTerritoryRoom, upsertOnlineTerritoryRoom } from '@/lib/onlineTerritory'
import {
  BOARD_SIZE,
  CellOwner,
  countCells,
  createEmptyBoard,
  getEmptyCells,
  getFlippableCells,
  getOpponentOwner,
  getWinner,
  parseTerritoryBoard,
  placeAndFlip,
  TerritoryBoard,
} from '@/lib/territoryQuiz'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'
import { TextAnswerResult } from '@/lib/answerUtils'
import {
  getQuestionCorrectAnswerText,
  getQuestionTypeShortLabel,
  isChallengeSupportedQuestionType,
  normalizeQuestionRecord,
  QuestionShape,
} from '@/lib/questionTypes'
import { playCorrect, playPerfect, playWrong } from '@/lib/sounds'

type Question = QuestionShape
type SeatRole = Exclude<CellOwner, null>
type LocalPhase = 'waiting' | 'answering' | 'placing' | 'opponent_turn' | 'finished'

const ROOM_MISSING_MESSAGE = 'Supabase に online_territory_rooms テーブルがありません。最新の supabase_schema.sql か sql_editor_missing_tables.sql を SQL Editor で実行してください。'
const ROLE_META: Record<SeatRole, { label: string; color: string; soft: string; accent: string }> = {
  player: {
    label: '青',
    color: '#3b82f6',
    soft: 'rgba(59, 130, 246, 0.22)',
    accent: '#93c5fd',
  },
  cpu: {
    label: '赤',
    color: '#ef4444',
    soft: 'rgba(239, 68, 68, 0.22)',
    accent: '#fca5a5',
  },
}

function getSeatName(nickname: string | null | undefined, studentId: number | null | undefined, fallback: string) {
  if (nickname && nickname.trim()) return nickname
  if (typeof studentId === 'number') return `ID ${studentId}`
  return fallback
}

function serializeLastMove(row: number, col: number, owner: SeatRole) {
  return { row, col, owner }
}

function parseLastMove(value: Json | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.row !== 'number' || typeof record.col !== 'number') return null
  if (record.owner !== 'player' && record.owner !== 'cpu') return null
  return {
    row: record.row,
    col: record.col,
    owner: record.owner as SeatRole,
  }
}

function createInitialRoomState() {
  return {
    board_json: createEmptyBoard() as unknown as Json,
    current_turn: 'player' as const,
    status: 'waiting' as const,
    winner: null,
    last_move_json: null,
  }
}

export default function OnlineTerritoryPage({
  onBack,
  onOpenLab,
}: {
  onBack: () => void
  onOpenLab: () => void
}) {
  const { studentId, nickname, logout } = useAuth()
  const [loadingRoom, setLoadingRoom] = useState(true)
  const [room, setRoom] = useState<Awaited<ReturnType<typeof fetchOnlineTerritoryRoom>>>(null)
  const [error, setError] = useState<string | null>(null)
  const [joiningSeat, setJoiningSeat] = useState(false)

  const [questionDeck, setQuestionDeck] = useState<Question[]>([])
  const [questionLoading, setQuestionLoading] = useState(true)
  const [questionCursor, setQuestionCursor] = useState(-1)
  const [localPhase, setLocalPhase] = useState<LocalPhase>('waiting')

  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [answerResult, setAnswerResult] = useState<TextAnswerResult | null>(null)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set())
  const [lastFlipped, setLastFlipped] = useState<Set<string>>(new Set())
  const [lastPlaced, setLastPlaced] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const myTurnKeyRef = useRef('')

  const myRole: SeatRole | null = useMemo(() => {
    if (room?.player_student_id === studentId) return 'player'
    if (room?.cpu_student_id === studentId) return 'cpu'
    return null
  }, [room?.cpu_student_id, room?.player_student_id, studentId])
  const guestBlocked = studentId !== null && isGuestStudentId(studentId)

  const roomFull = Boolean(room?.player_student_id && room?.cpu_student_id)
  const board = useMemo(() => parseTerritoryBoard(room?.board_json), [room?.board_json])
  const counts = useMemo(() => countCells(board), [board])
  const emptyCells = useMemo(() => getEmptyCells(board), [board])
  const currentQuestion = questionDeck.length > 0 && questionCursor >= 0
    ? questionDeck[questionCursor % questionDeck.length]
    : null
  const currentQuestionImageDisplay = currentQuestion?.image_url
    ? getQuestionImageDisplaySize(currentQuestion)
    : null
  const isMyTurn = Boolean(myRole && room?.status === 'playing' && room.current_turn === myRole)
  const opponentRole = myRole ? getOpponentOwner(myRole) : null
  const opponentName = opponentRole
    ? opponentRole === 'player'
      ? getSeatName(room?.player_nickname, room?.player_student_id, '青プレイヤー')
      : getSeatName(room?.cpu_nickname, room?.cpu_student_id, '赤プレイヤー')
    : null
  const playerName = getSeatName(room?.player_nickname, room?.player_student_id, '青プレイヤー')
  const cpuName = getSeatName(room?.cpu_nickname, room?.cpu_student_id, '赤プレイヤー')
  const parsedLastMove = useMemo(() => parseLastMove(room?.last_move_json), [room?.last_move_json])

  const resetAnswerUi = useCallback(() => {
    setSelectedChoice(null)
    setTextInput('')
    setAnswerResult(null)
    setFeedback(null)
  }, [])

  const syncRoom = useCallback(async (payload: Parameters<typeof upsertOnlineTerritoryRoom>[0]) => {
    const ok = await upsertOnlineTerritoryRoom(payload)
    if (!ok) {
      setError(ROOM_MISSING_MESSAGE)
      return false
    }
    return true
  }, [])

  useEffect(() => {
    let active = true

    const loadRoom = async () => {
      try {
        const nextRoom = await fetchOnlineTerritoryRoom()
        if (active) setRoom(nextRoom)
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'オンライン対戦の読み込みに失敗しました。')
        }
      } finally {
        if (active) setLoadingRoom(false)
      }
    }

    void loadRoom()
    const unsubscribe = subscribeOnlineTerritoryRoom(nextRoom => {
      if (active) setRoom(nextRoom)
    })
    const pollId = window.setInterval(() => {
      void loadRoom()
    }, 1500)

    return () => {
      active = false
      unsubscribe()
      window.clearInterval(pollId)
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadQuestions = async () => {
      setQuestionLoading(true)

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
        setQuestionDeck([])
        setQuestionLoading(false)
        return
      }

      const pool = data
        .map(question => normalizeQuestionChoices(normalizeQuestionRecord(question), {
          shuffleChoices: question.type === 'choice' || question.type === 'choice4' || question.type === 'fill_choice' || question.type === 'multi_select',
        }))
        .filter(question => hasValidChoiceAnswer(question))
        .filter(question => isChallengeSupportedQuestionType(question.type))

      setQuestionDeck(pool.sort(() => Math.random() - 0.5))
      setQuestionLoading(false)
    }

    void loadQuestions()

    return () => {
      active = false
    }
  }, [studentId])

  useEffect(() => {
    if (loadingRoom || !studentId || guestBlocked || joiningSeat || myRole || roomFull) return

    let cancelled = false

    const claimSeat = async () => {
      setJoiningSeat(true)

      try {
        const seatName = nickname?.trim() || `ID ${studentId}`
        if (!room) {
          await syncRoom({
            ...createInitialRoomState(),
            player_student_id: studentId,
            player_nickname: seatName,
          })
          return
        }

        if (!room.player_student_id) {
          await syncRoom({
            ...createInitialRoomState(),
            player_student_id: studentId,
            player_nickname: seatName,
            cpu_student_id: room.cpu_student_id,
            cpu_nickname: room.cpu_nickname,
            status: room.cpu_student_id ? 'playing' : 'waiting',
          })
          return
        }

        if (!room.cpu_student_id) {
          await syncRoom({
            ...createInitialRoomState(),
            player_student_id: room.player_student_id,
            player_nickname: room.player_nickname,
            cpu_student_id: studentId,
            cpu_nickname: seatName,
            status: 'playing',
          })
        }
      } catch (claimError) {
        if (!cancelled) {
          setError(claimError instanceof Error ? claimError.message : '対戦席の確保に失敗しました。')
        }
      } finally {
        if (!cancelled) setJoiningSeat(false)
      }
    }

    void claimSeat()

    return () => {
      cancelled = true
    }
  }, [guestBlocked, joiningSeat, loadingRoom, myRole, nickname, room, roomFull, studentId, syncRoom])

  useEffect(() => {
    if (questionDeck.length === 0) return

    if (room?.status === 'finished') {
      setLocalPhase('finished')
      setHighlightedCells(new Set())
      return
    }

    if (!myRole) {
      setLocalPhase('waiting')
      setHighlightedCells(new Set())
      myTurnKeyRef.current = ''
      return
    }

    if (room?.status !== 'playing') {
      setLocalPhase('waiting')
      setHighlightedCells(new Set())
      myTurnKeyRef.current = ''
      return
    }

    if (room.current_turn !== myRole) {
      setLocalPhase('opponent_turn')
      setHighlightedCells(new Set())
      myTurnKeyRef.current = ''
      return
    }

    const turnKey = `${room.updated_at}:${room.current_turn}:${myRole}`
    if (myTurnKeyRef.current !== turnKey) {
      myTurnKeyRef.current = turnKey
      resetAnswerUi()
      setQuestionCursor(current => current + 1)
      setHighlightedCells(new Set())
      setLocalPhase('answering')
      setLastFlipped(new Set())
      setLastPlaced(null)
    }
  }, [myRole, questionDeck.length, resetAnswerUi, room?.current_turn, room?.status, room?.updated_at])

  const handleLeaveSeat = useCallback(async (afterLeave: () => void) => {
    if (!room || !myRole || !studentId) {
      afterLeave()
      return
    }

    setActionBusy(true)
    const nextBoard = createEmptyBoard()
    const payload = myRole === 'player'
      ? {
          ...createInitialRoomState(),
          player_student_id: null,
          player_nickname: null,
          cpu_student_id: room.cpu_student_id === studentId ? null : room.cpu_student_id,
          cpu_nickname: room.cpu_student_id === studentId ? null : room.cpu_nickname,
        }
      : {
          ...createInitialRoomState(),
          player_student_id: room.player_student_id === studentId ? null : room.player_student_id,
          player_nickname: room.player_student_id === studentId ? null : room.player_nickname,
          cpu_student_id: null,
          cpu_nickname: null,
        }

    const remainingPlayers = [payload.player_student_id, payload.cpu_student_id].filter(Boolean).length
    const nextStatus: 'waiting' | 'playing' = remainingPlayers === 2 ? 'playing' : 'waiting'
    const nextPayload = {
      ...payload,
      board_json: nextBoard as unknown as Json,
      status: nextStatus,
    }

    await syncRoom(nextPayload)
    setActionBusy(false)
    afterLeave()
  }, [myRole, room, studentId, syncRoom])

  const passTurnToOpponent = useCallback(async () => {
    if (!myRole) return
    await syncRoom({
      current_turn: getOpponentOwner(myRole),
      status: 'playing',
    })
  }, [myRole, syncRoom])

  const handleAnswered = useCallback((submission: QuestionSubmission) => {
    if (!currentQuestion || !myRole || localPhase !== 'answering') return

    const evaluated = evaluateQuestionAnswer(currentQuestion, submission)
    const correct = evaluated.result === 'exact'

    setAnswerResult(evaluated.result)
    setFeedback(correct ? 'correct' : 'wrong')

    if (correct) {
      playCorrect()
      setLocalPhase('placing')
      setHighlightedCells(new Set(emptyCells.map(([row, col]) => `${row}-${col}`)))
      return
    }

    playWrong()
    setHighlightedCells(new Set())

    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = setTimeout(() => {
      resetAnswerUi()
      setLocalPhase('opponent_turn')
      void passTurnToOpponent()
    }, 1100)
  }, [currentQuestion, emptyCells, localPhase, myRole, passTurnToOpponent, resetAnswerUi])

  const handlePlaceCell = async (row: number, col: number) => {
    if (!myRole || localPhase !== 'placing' || board[row][col] !== null) return

    const flippable = getFlippableCells(board, row, col, myRole)
    const { newBoard, flippedCount } = placeAndFlip(board, row, col, myRole)
    const nextWinner = getEmptyCells(newBoard).length === 0 ? getWinner(newBoard) : null

    setLastPlaced(`${row}-${col}`)
    setLastFlipped(new Set(flippable.map(([flipRow, flipCol]) => `${flipRow}-${flipCol}`)))
    setHighlightedCells(new Set())
    setActionBusy(true)

    window.setTimeout(async () => {
      resetAnswerUi()
      setLocalPhase(nextWinner ? 'finished' : 'opponent_turn')
      setLastFlipped(new Set())
      await syncRoom({
        board_json: newBoard as unknown as Json,
        current_turn: getOpponentOwner(myRole),
        status: nextWinner ? 'finished' : 'playing',
        winner: nextWinner,
        last_move_json: serializeLastMove(row, col, myRole) as unknown as Json,
      })
      if (nextWinner) playPerfect()
      setActionBusy(false)
    }, flippedCount > 0 ? 850 : 450)
  }

  const handleRestart = async () => {
    if (!myRole || !roomFull) return
    setActionBusy(true)
    await syncRoom({
      ...createInitialRoomState(),
      player_student_id: room?.player_student_id ?? null,
      player_nickname: room?.player_nickname ?? null,
      cpu_student_id: room?.cpu_student_id ?? null,
      cpu_nickname: room?.cpu_nickname ?? null,
      status: 'playing',
    })
    setActionBusy(false)
  }

  const handleChoice = (choice: string) => {
    setSelectedChoice(choice)
    handleAnswered({ kind: 'single', value: choice })
  }

  const handleTextSubmit = () => {
    const answer = textInput.trim()
    if (!answer) return
    handleAnswered({ kind: 'text', value: answer })
  }

  const renderCell = (row: number, col: number) => {
    const owner = board[row][col]
    const key = `${row}-${col}`
    const canPlace = localPhase === 'placing' && owner === null && !actionBusy
    const previewFlips = canPlace ? getFlippableCells(board, row, col, myRole ?? 'player').length : 0
    const isFlipped = lastFlipped.has(key)
    const isPlaced = lastPlaced === key
    const isSuggested = highlightedCells.has(key)

    let background = 'rgba(148, 163, 184, 0.08)'
    let borderColor = 'rgba(148, 163, 184, 0.16)'
    let shadow = 'none'

    if (owner) {
      background = isFlipped ? '#fbbf24' : ROLE_META[owner].color
      borderColor = ROLE_META[owner].color
      shadow = isPlaced ? `0 0 18px ${ROLE_META[owner].soft}` : 'none'
    } else if (isSuggested) {
      borderColor = 'rgba(251, 191, 36, 0.45)'
      shadow = '0 0 14px rgba(251, 191, 36, 0.16)'
    }

    return (
      <button
        key={key}
        type="button"
        onClick={() => canPlace && handlePlaceCell(row, col)}
        disabled={!canPlace}
        className="relative rounded-xl transition-all duration-300"
        style={{
          aspectRatio: '1',
          background,
          border: `2px solid ${borderColor}`,
          boxShadow: shadow,
          cursor: canPlace ? 'pointer' : 'default',
          transform: isPlaced ? 'scale(1.08)' : isFlipped ? 'scale(1.04)' : 'scale(1)',
        }}
      >
        {owner && (
          <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white sm:text-xl">
            ●
          </div>
        )}
        {!owner && canPlace && previewFlips > 0 && (
          <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-300 text-[10px] font-bold text-slate-950">
            {previewFlips}
          </div>
        )}
        {!owner && canPlace && previewFlips === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">+</div>
        )}
      </button>
    )
  }

  const renderQuestion = () => {
    if (!currentQuestion) return null

    return (
      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-xs font-bold"
            style={{ background: ROLE_META[myRole ?? 'player'].soft, color: ROLE_META[myRole ?? 'player'].accent }}
          >
            あなたのターン
          </span>
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-slate-300">
            {currentQuestion.field} · {currentQuestion.unit}
          </span>
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-slate-400">
            {getQuestionTypeShortLabel(currentQuestion.type)}
          </span>
        </div>

        <div className="mt-4 text-xl font-bold leading-relaxed text-white">{currentQuestion.question}</div>

        {currentQuestion.image_url && currentQuestionImageDisplay && (
          <div className="mt-4 flex justify-center">
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

        {feedback && (
          <div
            className="mt-4 rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{
              background: feedback === 'correct' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              borderColor: feedback === 'correct' ? 'rgba(34, 197, 94, 0.24)' : 'rgba(239, 68, 68, 0.24)',
              color: feedback === 'correct' ? '#86efac' : '#fca5a5',
            }}
          >
            {feedback === 'correct'
              ? '正解。好きなマスに置いて相手をはさもう。'
              : `不正解。正解: ${getQuestionCorrectAnswerText(currentQuestion)}`}
          </div>
        )}

        {!feedback && (() => {
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
                questionId={`online-territory-${currentQuestion.id}`}
                pairs={currentQuestion.match_pairs ?? []}
                disabled={false}
                onSubmit={pairs => handleAnswered({ kind: 'match', pairs })}
              />
            )
          }
          if (currentQuestion.type === 'sort') {
            return (
              <SortQuestion
                questionId={`online-territory-${currentQuestion.id}`}
                items={currentQuestion.sort_items ?? []}
                disabled={false}
                onSubmit={items => handleAnswered({ kind: 'sort', items })}
              />
            )
          }
          if (currentQuestion.type === 'multi_select') {
            return (
              <MultiSelectQuestion
                questionId={`online-territory-${currentQuestion.id}`}
                choices={currentQuestion.choices ?? []}
                disabled={false}
                onSubmit={selected => handleAnswered({ kind: 'multi_select', selected })}
              />
            )
          }
          if (currentQuestion.type === 'word_bank') {
            return (
              <WordBankQuestion
                questionId={`online-territory-${currentQuestion.id}`}
                wordTokens={currentQuestion.word_tokens ?? []}
                distractorTokens={currentQuestion.distractor_tokens ?? []}
                disabled={false}
                onSubmit={tokens => handleAnswered({ kind: 'word_bank', tokens })}
              />
            )
          }
          if (currentQuestion.type === 'text') {
            const blankPrompt = getQuestionBlankPrompt(currentQuestion)
            return (
              <div className="mt-4 space-y-3">
                {blankPrompt && (
                  <div className="text-sm text-slate-400">{blankPrompt.promptText}</div>
                )}
                <input
                  type="text"
                  value={textInput}
                  onChange={event => setTextInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') handleTextSubmit()
                  }}
                  placeholder="答えを入力..."
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
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

  if (guestBlocked) {
    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <div className="card w-full max-w-xl text-center">
          <div className="font-display text-3xl text-white">ゲストでは参加できません</div>
          <p className="mt-3 text-slate-300">
            オンライン陣取りは通常ユーザーでログインしたときに利用できます。
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={onBack} className="btn-secondary">ホームへ</button>
            <button onClick={() => logout()} className="btn-primary">ログアウト</button>
          </div>
        </div>
      </div>
    )
  }

  if (loadingRoom || questionLoading) {
    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <div className="card text-slate-400">オンライン陣取りを準備中...</div>
      </div>
    )
  }

  if (questionDeck.length < 4) {
    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <div className="card w-full max-w-xl text-center">
          <div className="font-display text-3xl text-white">問題が足りません</div>
          <p className="mt-3 text-slate-300">オンライン陣取りには最低4問必要です。問題を追加してください。</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={onBack} className="btn-secondary">ホームへ</button>
            <button onClick={onOpenLab} className="btn-primary">実験ラボへ</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell page-shell-dashboard">
      <div className="hero-card science-surface mb-5 p-5 sm:p-6 lg:p-7 anim-fade-up">
        <ScienceBackdrop />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
              Online Battle
            </div>
            <div className="mt-4">
              <h1 className="font-display text-3xl text-white sm:text-4xl">オンライン陣取り</h1>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                オンラインの相手と交互にクイズへ答えて、4×4 の盤面を取り合います。正解すると好きな空きマスに置けます。
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <button
              onClick={() => void handleLeaveSeat(onBack)}
              className="btn-secondary w-full"
              disabled={actionBusy}
            >
              ホームへ
            </button>
            <button
              onClick={() => void handleLeaveSeat(onOpenLab)}
              className="btn-ghost w-full"
              disabled={actionBusy}
            >
              実験ラボへ
            </button>
            <button onClick={() => void handleLeaveSeat(() => logout())} className="btn-ghost w-full" disabled={actionBusy}>
              ログアウト
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="subcard p-4">
            <div className="text-xs tracking-[0.18em] text-slate-400">青</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="font-semibold text-white">{playerName}</div>
              <div className="font-display text-2xl" style={{ color: ROLE_META.player.color }}>{counts.player}</div>
            </div>
          </div>
          <div className="subcard p-4">
            <div className="text-xs tracking-[0.18em] text-slate-400">状態</div>
            <div className="mt-2 font-semibold text-white">
              {room?.status === 'finished'
                ? '対戦終了'
                : roomFull
                  ? isMyTurn
                    ? 'あなたの番'
                    : `${opponentName ?? '相手'} の番`
                  : joiningSeat
                    ? '席を確保中'
                    : '相手を待っています'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {myRole ? `${ROLE_META[myRole].label}担当` : roomFull ? '観戦中' : '入室中'}
            </div>
          </div>
          <div className="subcard p-4">
            <div className="text-xs tracking-[0.18em] text-slate-400">赤</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="font-semibold text-white">{cpuName}</div>
              <div className="font-display text-2xl" style={{ color: ROLE_META.cpu.color }}>{counts.cpu}</div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-[20px] border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">盤面</div>
            {room?.status === 'finished' && (
              <div className="text-sm font-semibold text-amber-300">
                {room.winner === 'draw'
                  ? '引き分け'
                  : room.winner
                    ? `${ROLE_META[room.winner].label}の勝ち`
                    : '終了'}
              </div>
            )}
          </div>

          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}>
            {Array.from({ length: BOARD_SIZE }, (_, row) =>
              Array.from({ length: BOARD_SIZE }, (_, col) => renderCell(row, col)),
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 text-sm leading-6 text-slate-300">
              空きマス {emptyCells.length} / {BOARD_SIZE * BOARD_SIZE}
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 text-sm leading-6 text-slate-300">
              {parsedLastMove
                ? `直前の一手: ${parsedLastMove.owner === 'player' ? '青' : '赤'} が ${parsedLastMove.row + 1}-${parsedLastMove.col + 1}`
                : 'まだ一手目は置かれていません'}
            </div>
          </div>

          {room?.status === 'finished' && roomFull && (
            <button onClick={() => void handleRestart()} className="btn-primary mt-4 w-full" disabled={actionBusy}>
              もう一度はじめる
            </button>
          )}
        </div>

        {roomFull ? (
          localPhase === 'answering' || localPhase === 'placing' ? (
            renderQuestion()
          ) : localPhase === 'finished' ? (
            <div className="card">
              <div className="font-display text-3xl text-white">対戦終了</div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {room?.winner === 'draw'
                  ? '同点で引き分けです。'
                  : room?.winner
                    ? `${ROLE_META[room.winner].label}が勝ちました。`
                    : '勝敗を集計中です。'}
              </p>
            </div>
          ) : (
            <div className="card">
              <div className="font-display text-2xl text-white">
                {isMyTurn ? 'あなたの問題を準備しています' : `${opponentName ?? '相手'}のターンです`}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {isMyTurn
                  ? '問題が表示されたら答えて、正解したら好きなマスに置いてください。'
                  : '相手が答え終わると、盤面が自動で更新されます。'}
              </p>
            </div>
          )
        ) : (
          <div className="card">
            <div className="font-display text-2xl text-white">
              {myRole ? '相手を待っています' : joiningSeat ? '席を確保しています' : '満席か、入室待ちです'}
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {myRole
                ? `あなたは${ROLE_META[myRole].label}担当です。もう 1 人入室すると自動で対戦が始まります。`
                : roomFull
                  ? 'いまは 2 人で対戦中です。空いたら次の試合で参加できます。'
                  : 'オンライン広場の席を準備しています。'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
