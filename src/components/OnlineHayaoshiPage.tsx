'use client'

import { useEffect, useRef, useState } from 'react'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { hasValidChoiceAnswer, normalizeQuestionChoices } from '@/lib/questionChoices'
import { getQuestionCorrectAnswerText, isChallengeSupportedQuestionType, normalizeQuestionRecord, QuestionShape } from '@/lib/questionTypes'
import { getCachedColumnSupport, isMissingColumnError, markColumnMissing, markColumnSupported } from '@/lib/schemaCompat'
import { shuffleArray } from '@/lib/questionPicker'
import { playCorrect, playPerfect, playWrong } from '@/lib/sounds'
import {
  HayaoshiLiveEvent,
  HayaoshiPlayer,
  HayaoshiQuestionData,
  HayaoshiRoom,
  HAYAOSHI_ANSWER_SECONDS,
  HAYAOSHI_PLAYER_COLORS,
  HAYAOSHI_RESULT_SECONDS,
  HAYAOSHI_REVEAL_CHARS_PER_SEC,
  HAYAOSHI_TOTAL_ROUNDS,
  HAYAOSHI_XP_PER_CORRECT,
  awardHayaoshiXp,
  createHayaoshiLiveChannel,
  createHayaoshiRoom,
  fetchHayaoshiRoom,
  generateRoomCode,
  leaveHayaoshiLobby,
  listOpenHayaoshiRooms,
  subscribeHayaoshiRoom,
  tryBuzz,
  upsertHayaoshiRoom,
} from '@/lib/onlineHayaoshi'
import { getLevel } from '@/lib/xp'

const ADMIN_STUDENT_ID = 5

type LiveEntry = { kind: string; choice: string | null; color: string; nickname: string; expiresAt: number }

// Questions that work well for early-press (choice-based only)
function isSuitableForHayaoshi(q: QuestionShape) {
  return (
    hasValidChoiceAnswer(q) &&
    isChallengeSupportedQuestionType(q.type) &&
    (q.type === 'choice' || q.type === 'choice4' || q.type === 'true_false' || q.type === 'fill_choice')
  )
}

function toHayaoshiQuestion(q: QuestionShape): HayaoshiQuestionData {
  return {
    id: q.id,
    question: q.question,
    choices: q.choices ?? [],
    answer: q.answer,
    field: q.field,
    unit: q.unit,
    type: q.type,
  }
}

export default function OnlineHayaoshiPage({
  onBack,
}: {
  onBack: () => void
}) {
  const { studentId, nickname, logout } = useAuth()
  const isAdmin = studentId === ADMIN_STUDENT_ID

  // ── Room selection (shown before lobby) ──
  const [roomKey, setRoomKey] = useState<string | null>(null)        // null = not in any room yet
  const [selectMode, setSelectMode] = useState<'menu' | 'join'>('menu')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const [openRooms, setOpenRooms] = useState<HayaoshiRoom[]>([])
  const [loadingRooms, setLoadingRooms] = useState(false)

  // Question pool (loaded once)
  const [allQuestions, setAllQuestions] = useState<HayaoshiQuestionData[]>([])
  const [loadingQ, setLoadingQ] = useState(true)

  // Room state (from Supabase)
  const [room, setRoom] = useState<HayaoshiRoom | null>(null)
  const [loading, setLoading] = useState(false)          // only loads once roomKey is set
  const [error, setError] = useState<string | null>(null)

  // Local reveal progress (calculated from question_started_at)
  const [charsToShow, setCharsToShow] = useState(0)
  const revealRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Answer phase (for buzzed player)
  const [answerTimeLeft, setAnswerTimeLeft] = useState(HAYAOSHI_ANSWER_SECONDS)
  const answerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [buzzing, setBuzzing] = useState(false)
  const [buzzFailed, setBuzzFailed] = useState(false) // lost the race

  // Dramatic buzz-in overlay
  const [buzzFlashVisible, setBuzzFlashVisible] = useState(false)
  // Floating +1 score particles: keyed by unique id
  const [floatingScores, setFloatingScores] = useState<{ id: number; studentId: number; color: string }[]>([])
  // Next-round countdown (seconds)
  const [nextRoundSec, setNextRoundSec] = useState<number | null>(null)
  // XP toast: shown after correct answer
  const [xpToast, setXpToast] = useState<{ xp: number; levelUp: boolean; newLevel: number } | null>(null)
  // Total XP earned this session (for finished screen)
  const [sessionXpEarned, setSessionXpEarned] = useState(0)
  // Live state via broadcast: keyed by studentId
  const [liveHovers, setLiveHovers] = useState<Record<number, LiveEntry>>({})
  const liveChannelRef = useRef<ReturnType<typeof createHayaoshiLiveChannel> | null>(null)

  // Ref to avoid stale closure in timers
  const roomRef = useRef<HayaoshiRoom | null>(null)
  const charsToShowRef = useRef(0)
  const allQuestionsRef = useRef<HayaoshiQuestionData[]>([])
  const prevScoresRef = useRef<Record<number, number>>({})
  const nextRoundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => { roomRef.current = room }, [room])
  useEffect(() => { charsToShowRef.current = charsToShow }, [charsToShow])
  useEffect(() => { allQuestionsRef.current = allQuestions }, [allQuestions])

  // ─── Load questions ───

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoadingQ(true)
      let query = supabase.from('questions').select('*')
      const supportsFilter = getCachedColumnSupport('created_by_student_id') !== false
      if (supportsFilter) {
        query = query.or(
          studentId
            ? `created_by_student_id.is.null,created_by_student_id.eq.${studentId}`
            : 'created_by_student_id.is.null',
        )
      }
      let { data, error: qErr } = await query
      if (qErr && isMissingColumnError(qErr, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        const fb = await supabase.from('questions').select('*')
        data = fb.data; qErr = fb.error
      } else if (!qErr && supportsFilter) {
        markColumnSupported('created_by_student_id')
      }
      if (!active) return
      if (!data) { setLoadingQ(false); return }
      const pool = shuffleArray(
        data
          .map(q => normalizeQuestionChoices(normalizeQuestionRecord(q), { shuffleChoices: true }))
          .filter(isSuitableForHayaoshi)
          .map(toHayaoshiQuestion)
      )
      setAllQuestions(pool)
      setLoadingQ(false)
    }
    void load()
    return () => { active = false }
  }, [studentId])

  // ─── Load room + subscribe (only once roomKey is chosen) ───

  useEffect(() => {
    if (!roomKey) return
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await fetchHayaoshiRoom(roomKey)
        if (!active) return
        setRoom(r)
      } catch {
        if (active) setError('接続エラーが発生しました')
      }
      setLoading(false)
    }
    void load()
    const sub = subscribeHayaoshiRoom(roomKey, r => { if (active) setRoom(r) })
    return () => { active = false; void sub.unsubscribe() }
  }, [roomKey])

  // ─── Join room when lobby ───

  useEffect(() => {
    if (!room || !studentId || !nickname) return
    if (room.phase !== 'lobby') return
    const already = room.players_json.some(p => p.student_id === studentId)
    if (already) return
    if (room.players_json.length >= 5) return

    const newPlayer: HayaoshiPlayer = {
      student_id: studentId,
      nickname,
      score: 0,
      color: HAYAOSHI_PLAYER_COLORS[room.players_json.length % HAYAOSHI_PLAYER_COLORS.length],
    }
    void upsertHayaoshiRoom(roomKey!, { players_json: [...room.players_json, newPlayer] })
  }, [room?.phase, studentId, nickname])

  // ─── Karaoke reveal interval ───

  useEffect(() => {
    if (revealRef.current) { clearInterval(revealRef.current); revealRef.current = null }
    if (!room || room.phase !== 'revealing' || !room.question_started_at || !room.question_json) return

    const startedAt = new Date(room.question_started_at).getTime()
    const totalChars = room.question_json.question.length

    revealRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000
      const next = Math.min(Math.floor(elapsed * HAYAOSHI_REVEAL_CHARS_PER_SEC), totalChars)
      setCharsToShow(next)
    }, 80)

    return () => { if (revealRef.current) { clearInterval(revealRef.current); revealRef.current = null } }
  }, [room?.phase, room?.question_started_at, room?.question_json?.question])

  // Freeze reveal at chars_revealed when buzzed
  useEffect(() => {
    if (!room) return
    if (room.phase === 'buzzed' || room.phase === 'result') {
      if (revealRef.current) { clearInterval(revealRef.current); revealRef.current = null }
      setCharsToShow(room.chars_revealed ?? room.question_json?.question.length ?? 0)
    }
    if (room.phase === 'lobby' || room.phase === 'finished') {
      setCharsToShow(0)
    }
  }, [room?.phase, room?.chars_revealed])

  // ─── Answer timer (buzzed player only) ───

  useEffect(() => {
    if (answerTimerRef.current) { clearInterval(answerTimerRef.current); answerTimerRef.current = null }
    if (!room || room.phase !== 'buzzed' || room.buzzed_student_id !== studentId) return

    setAnswerTimeLeft(HAYAOSHI_ANSWER_SECONDS)
    answerTimerRef.current = setInterval(() => {
      setAnswerTimeLeft(t => {
        if (t <= 1) {
          clearInterval(answerTimerRef.current!)
          answerTimerRef.current = null
          // Time out → auto-wrong
          void handleAnswerSubmit(null)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (answerTimerRef.current) { clearInterval(answerTimerRef.current); answerTimerRef.current = null } }
  }, [room?.phase, room?.buzzed_student_id])

  // ─── Admin: auto-advance after result ───

  useEffect(() => {
    if (!isAdmin || !room || room.phase !== 'result') return
    const t = setTimeout(() => {
      void advanceToNextQuestion()
    }, HAYAOSHI_RESULT_SECONDS)
    return () => clearTimeout(t)
  }, [room?.phase, room?.current_round])

  // ─── Reset buzz state when new question starts ───

  useEffect(() => {
    if (room?.phase === 'revealing') {
      setBuzzFailed(false)
      setBuzzing(false)
      setSelectedChoice(null)
    }
  }, [room?.phase, room?.question_json?.id])

  // ─── Buzz flash overlay (show for ~1.3s when phase → buzzed) ───

  useEffect(() => {
    if (room?.phase !== 'buzzed') return
    setBuzzFlashVisible(true)
    const t = setTimeout(() => setBuzzFlashVisible(false), 1300)
    return () => clearTimeout(t)
  }, [room?.phase, room?.buzzed_student_id])

  // ─── Floating +1 score particles ───

  useEffect(() => {
    if (!room || room.phase !== 'result') return
    const prev = prevScoresRef.current
    const newFloats: typeof floatingScores = []
    room.players_json.forEach(p => {
      const prevScore = prev[p.student_id] ?? 0
      if (p.score > prevScore) {
        newFloats.push({ id: Date.now() + p.student_id, studentId: p.student_id, color: p.color })
      }
    })
    if (newFloats.length > 0) {
      setFloatingScores(f => [...f, ...newFloats])
      setTimeout(() => setFloatingScores([]), 1100)
    }
    const updated: Record<number, number> = {}
    room.players_json.forEach(p => { updated[p.student_id] = p.score })
    prevScoresRef.current = updated
  }, [room?.phase, room?.current_round])

  // ─── Live broadcast channel for hover indicators ───

  useEffect(() => {
    const live = createHayaoshiLiveChannel(roomKey ?? 'default', event => {
      setLiveHovers(prev => ({
        ...prev,
        [event.studentId]: {
          kind: event.kind,
          choice: event.choice ?? null,
          color: event.color,
          nickname: event.nickname,
          expiresAt: Date.now() + (event.kind === 'buzz_attempt' ? 1800 : 2500),
        },
      }))
    })
    liveChannelRef.current = live
    // Periodically prune expired hovers
    const prune = setInterval(() => {
      setLiveHovers(prev => {
        const now = Date.now()
        const next: typeof prev = {}
        let changed = false
        for (const [k, v] of Object.entries(prev) as [string, typeof prev[number]][]) {
          if (v.expiresAt > now) next[Number(k)] = v
          else changed = true
        }
        return changed ? next : prev
      })
    }, 500)
    return () => {
      clearInterval(prune)
      live.unsubscribe()
      liveChannelRef.current = null
    }
  }, [])

  // ─── Cleanup: leave the lobby on unmount ───

  useEffect(() => {
    return () => {
      const r = roomRef.current
      if (r && r.phase === 'lobby' && studentId != null) {
        void leaveHayaoshiLobby(r.room_key, studentId)
      }
    }
  }, [studentId])

  // ─── Next-round countdown ───

  useEffect(() => {
    if (nextRoundTimerRef.current) { clearInterval(nextRoundTimerRef.current); nextRoundTimerRef.current = null }
    if (!room || room.phase !== 'result') { setNextRoundSec(null); return }
    const startSec = Math.ceil(HAYAOSHI_RESULT_SECONDS / 1000)
    setNextRoundSec(startSec)
    nextRoundTimerRef.current = setInterval(() => {
      setNextRoundSec(s => {
        if (s === null || s <= 1) { clearInterval(nextRoundTimerRef.current!); nextRoundTimerRef.current = null; return null }
        return s - 1
      })
    }, 1000)
    return () => { if (nextRoundTimerRef.current) { clearInterval(nextRoundTimerRef.current); nextRoundTimerRef.current = null } }
  }, [room?.phase, room?.current_round])

  // ─── Actions ───

  // ── Room selection actions ──

  const handleCreateRoom = async () => {
    if (!studentId || !nickname) return
    setJoining(true)
    setJoinError('')
    const code = generateRoomCode()
    const hostPlayer: HayaoshiPlayer = {
      student_id: studentId,
      nickname,
      score: 0,
      color: HAYAOSHI_PLAYER_COLORS[0],
    }
    try {
      await createHayaoshiRoom(code, hostPlayer)
      setRoomKey(code)
      setSessionXpEarned(0)
    } catch {
      setJoinError('ルーム作成に失敗しました。もう一度お試しください。')
    }
    setJoining(false)
  }

  const handleJoinByCode = async (code: string) => {
    const key = code.toUpperCase().trim()
    if (key.length !== 4) { setJoinError('4文字のコードを入力してください'); return }
    setJoining(true)
    setJoinError('')
    try {
      const existing = await fetchHayaoshiRoom(key)
      if (!existing) { setJoinError(`ルーム「${key}」が見つかりません`); setJoining(false); return }
      if (existing.phase !== 'lobby') { setJoinError('そのルームはすでにゲーム中です'); setJoining(false); return }
      if (existing.players_json.length >= 5) { setJoinError('そのルームは満員です'); setJoining(false); return }
      setRoomKey(key)
      setSessionXpEarned(0)
    } catch {
      setJoinError('接続エラーが発生しました')
    }
    setJoining(false)
  }

  const handleShowJoin = async () => {
    setSelectMode('join')
    setJoinError('')
    setJoinCodeInput('')
    setLoadingRooms(true)
    const rooms = await listOpenHayaoshiRooms()
    setOpenRooms(rooms)
    setLoadingRooms(false)
  }

  const startGame = async () => {
    if (!room || allQuestions.length === 0) return
    const q = allQuestions[0]
    await upsertHayaoshiRoom(roomKey!, {
      phase: 'revealing',
      current_round: 1,
      question_json: q,
      question_started_at: new Date().toISOString(),
      chars_revealed: 0,
      buzzed_student_id: null,
      buzz_answer: null,
      buzz_correct: null,
      used_ids_json: [q.id],
    })
  }

  const handleBuzz = async () => {
    if (buzzing || !room || room.phase !== 'revealing') return
    setBuzzing(true)
    // Broadcast buzz attempt for spectators (so everyone sees the rush)
    const me = room.players_json.find(p => p.student_id === studentId)
    if (me && studentId != null) {
      liveChannelRef.current?.send({
        studentId, nickname: me.nickname, color: me.color, kind: 'buzz_attempt',
      })
    }
    const won = await tryBuzz(roomKey!, studentId!, charsToShowRef.current)
    if (!won) {
      setBuzzFailed(true)
      setTimeout(() => setBuzzFailed(false), 1500)
    }
    setBuzzing(false)
  }

  // Broadcast hover state to other players (for choice picker visibility)
  const broadcastHover = (choice: string | null) => {
    if (!room || studentId == null) return
    const me = room.players_json.find(p => p.student_id === studentId)
    if (!me) return
    liveChannelRef.current?.send({
      studentId, nickname: me.nickname, color: me.color, kind: 'hover', choice,
    })
  }

  const handleAnswerSubmit = async (choice: string | null) => {
    if (answerTimerRef.current) { clearInterval(answerTimerRef.current); answerTimerRef.current = null }
    if (submitting) return
    setSubmitting(true)

    const currentRoom = roomRef.current
    if (!currentRoom?.question_json) { setSubmitting(false); return }

    const correct = choice !== null && choice === currentRoom.question_json.answer
    if (correct) { playCorrect() } else { playWrong() }

    // Update scores
    const updatedPlayers = currentRoom.players_json.map(p =>
      p.student_id === studentId ? { ...p, score: p.score + (correct ? 1 : 0) } : p
    )

    await upsertHayaoshiRoom(roomKey!, {
      phase: 'result',
      buzz_answer: choice,
      buzz_correct: correct,
      players_json: updatedPlayers,
    })

    // Award XP for correct answers (fire-and-forget; non-blocking)
    if (correct && studentId != null) {
      awardHayaoshiXp(studentId, HAYAOSHI_XP_PER_CORRECT).then(({ previousXp, newXp }) => {
        const levelBefore = getLevel(previousXp)
        const levelAfter = getLevel(newXp)
        setXpToast({ xp: HAYAOSHI_XP_PER_CORRECT, levelUp: levelAfter > levelBefore, newLevel: levelAfter })
        setSessionXpEarned(prev => prev + HAYAOSHI_XP_PER_CORRECT)
        setTimeout(() => setXpToast(null), 2800)
      }).catch(() => { /* XP update failure is non-fatal */ })
    }

    setSubmitting(false)
    setSelectedChoice(null)
  }

  const advanceToNextQuestion = async () => {
    const currentRoom = roomRef.current
    if (!currentRoom) return
    const nextRound = currentRoom.current_round + 1
    if (nextRound > currentRoom.total_rounds) {
      playPerfect()
      await upsertHayaoshiRoom(roomKey!, { phase: 'finished' })
      return
    }
    const usedIds = currentRoom.used_ids_json ?? []
    const pool = allQuestionsRef.current
    const next = pool.find(q => !usedIds.includes(q.id)) ?? pool[0]
    if (!next) {
      await upsertHayaoshiRoom(roomKey!, { phase: 'finished' })
      return
    }
    await upsertHayaoshiRoom(roomKey!, {
      phase: 'revealing',
      current_round: nextRound,
      question_json: next,
      question_started_at: new Date().toISOString(),
      chars_revealed: 0,
      buzzed_student_id: null,
      buzz_answer: null,
      buzz_correct: null,
      used_ids_json: [...usedIds, next.id],
    })
  }

  const resetRoom = async () => {
    // Wipe all player state so stale entries (e.g. players who left without cleanup) are cleared
    await upsertHayaoshiRoom(roomKey!, {
      phase: 'lobby',
      players_json: [],
      current_round: 0,
      question_json: null,
      question_started_at: null,
      chars_revealed: 0,
      buzzed_student_id: null,
      buzz_answer: null,
      buzz_correct: null,
      used_ids_json: [],
    })
  }

  // ─── Render helpers ───

  const renderKaraokeText = (text: string) => {
    return (
      <div style={{ fontSize: 'clamp(18px, 2.8vw, 26px)', fontWeight: 700, lineHeight: 1.85, letterSpacing: '0.03em', color: 'white', position: 'relative' }}>
        {text.split('').map((char, i) => {
          const revealed = i < charsToShow
          const distFromCursor = charsToShow - 1 - i  // 0 = current, 1 = just revealed, ...
          const isCursor = distFromCursor === 0
          const isRecent = distFromCursor >= 0 && distFromCursor < 3
          return (
            <span
              key={i}
              style={{
                // Always apply transition so the fade-in is visible
                transition: 'opacity 0.28s ease-out, color 0.5s ease, text-shadow 0.35s ease, transform 0.35s ease',
                display: 'inline-block',
                opacity: revealed ? 1 : 0.06,
                color: isCursor
                  ? '#fde047'
                  : isRecent
                    ? '#fbbf24'
                    : revealed
                      ? 'white'
                      : 'rgba(255,255,255,0.28)',
                textShadow: isCursor
                  ? '0 0 18px rgba(253,224,71,1), 0 0 36px rgba(251,191,36,0.7), 0 0 60px rgba(251,191,36,0.4)'
                  : isRecent
                    ? '0 0 12px rgba(251,191,36,0.5)'
                    : 'none',
                transform: isCursor ? 'translateY(-2px) scale(1.08)' : 'translateY(0) scale(1)',
              }}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          )
        })}
      </div>
    )
  }

  const renderPlayerCard = (player: HayaoshiPlayer, buzzedId: number | null) => {
    const isBuzzed = player.student_id === buzzedId
    const isMe = player.student_id === studentId
    return (
      <div
        key={player.student_id}
        style={{
          padding: '10px 14px',
          borderRadius: 16,
          border: `1.5px solid ${isBuzzed ? `${player.color}80` : `${player.color}25`}`,
          background: isBuzzed ? `${player.color}22` : `${player.color}0a`,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          transition: 'all 0.3s ease',
          boxShadow: isBuzzed ? `0 0 20px ${player.color}40` : 'none',
        }}
      >
        {/* Floating +1 score particle */}
        {floatingScores.some(f => f.studentId === player.student_id) && (
          <div style={{
            position: 'absolute', top: -8, right: 4,
            fontFamily: 'var(--font-display)',
            fontSize: 20, fontWeight: 900,
            color: player.color,
            textShadow: `0 0 12px ${player.color}, 0 0 24px ${player.color}80`,
            animation: 'score-float 1.05s ease forwards',
            pointerEvents: 'none',
            zIndex: 20,
          }}>+1</div>
        )}
        {/* Avatar */}
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${player.color}, ${player.color}88)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 800,
          color: 'white',
          boxShadow: isBuzzed ? `0 0 14px ${player.color}70` : 'none',
        }}>
          {player.nickname.charAt(0)}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.nickname}{isMe && ' (自分)'}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: player.color }}>
          {player.score}
          <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginLeft: 2 }}>pt</span>
        </div>
        {isBuzzed && (
          <div className="anim-pop" style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 20, filter: `drop-shadow(0 0 8px ${player.color})` }}>
            ✋
          </div>
        )}
      </div>
    )
  }

  // ─── Main render ───

  // ── Room selection screen ──
  if (!roomKey) {
    return (
      <div className="page-shell flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="hero-card science-surface w-full max-w-md p-6 sm:p-8 anim-fade-up">
          <ScienceBackdrop />
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-200 mb-1">Online Hayaoshi</div>
          <h1 className="font-display mt-1 text-3xl text-white mb-1">早押しクイズ</h1>
          <p className="text-sm text-slate-400 mb-6">ルームを作成するか、コードで参加してください</p>

          {selectMode === 'menu' && (
            <div className="grid gap-3">
              <button
                onClick={() => void handleCreateRoom()}
                disabled={joining || loadingQ}
                className="btn-primary"
                style={{ fontSize: 16, padding: '14px 20px' }}
              >
                {joining ? '作成中...' : '🏠 ルームを作成する'}
              </button>
              <button
                onClick={() => void handleShowJoin()}
                className="btn-secondary"
                style={{ fontSize: 16, padding: '14px 20px' }}
              >
                🔑 コードで参加する
              </button>
              {joinError && <p className="text-center text-sm text-red-400">{joinError}</p>}
              <button onClick={onBack} className="btn-ghost text-sm mt-2">もどる</button>
            </div>
          )}

          {selectMode === 'join' && (
            <div>
              {/* Code input */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(148,163,184,0.7)', marginBottom: 6, letterSpacing: '0.1em' }}>
                  4文字のルームコードを入力
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    maxLength={4}
                    value={joinCodeInput}
                    onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') void handleJoinByCode(joinCodeInput) }}
                    placeholder="例: BX7K"
                    className="input-surface"
                    style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '0.25em', textAlign: 'center', textTransform: 'uppercase' }}
                    autoFocus
                  />
                  <button
                    onClick={() => void handleJoinByCode(joinCodeInput)}
                    disabled={joining || joinCodeInput.length < 4}
                    className="btn-primary"
                    style={{ flexShrink: 0, padding: '10px 16px' }}
                  >
                    {joining ? '...' : '参加'}
                  </button>
                </div>
                {joinError && <p className="mt-2 text-sm text-red-400">{joinError}</p>}
              </div>

              {/* Open rooms list */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', letterSpacing: '0.12em', marginBottom: 8 }}>
                  {loadingRooms ? '募集中のルームを検索中...' : `募集中のルーム (${openRooms.length}件)`}
                </div>
                {openRooms.length === 0 && !loadingRooms && (
                  <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)', textAlign: 'center', padding: '12px 0' }}>
                    募集中のルームはありません
                  </div>
                )}
                {openRooms.map(r => (
                  <button
                    key={r.room_key}
                    onClick={() => void handleJoinByCode(r.room_key)}
                    disabled={joining}
                    style={{
                      width: '100%', marginBottom: 8,
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 14,
                      background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, color: '#60a5fa', letterSpacing: '0.15em' }}>
                      {r.room_key}
                    </span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>
                        {r.players_json.map(p => p.nickname).join(', ')}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
                        {r.players_json.length}/5人
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700 }}>参加 →</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setSelectMode('menu'); setJoinError('') }} className="btn-ghost text-sm">
                  ← もどる
                </button>
                <button onClick={() => void handleShowJoin()} className="btn-secondary text-sm" disabled={loadingRooms}>
                  {loadingRooms ? '検索中...' : '🔄 更新'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading || loadingQ) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card text-slate-400">接続中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card text-center">
          <div className="text-red-400 mb-4">{error}</div>
          <button onClick={onBack} className="btn-secondary">もどる</button>
        </div>
      </div>
    )
  }

  // ── Room not found (bad code or deleted) ──
  if (!room) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="hero-card science-surface w-full max-w-md p-6 sm:p-8 text-center">
          <ScienceBackdrop />
          <p className="mt-4 text-slate-300">ルーム「{roomKey}」が見つかりません</p>
          <button onClick={() => { setRoomKey(null); setSelectMode('menu') }} className="btn-primary w-full mt-6">
            ルーム選択にもどる
          </button>
        </div>
      </div>
    )
  }

  const myPlayer = room.players_json.find(p => p.student_id === studentId)
  const buzzedPlayer = room.players_json.find(p => p.student_id === room.buzzed_student_id) ?? null
  const iAmBuzzed = room.buzzed_student_id === studentId
  const question = room.question_json

  // ── Lobby ──
  if (room.phase === 'lobby') {
    const canStart = isAdmin && room.players_json.length >= 2 && allQuestions.length >= 5
    return (
      <div className="page-shell flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="hero-card science-surface w-full max-w-lg p-6 sm:p-8 anim-fade-up">
          <ScienceBackdrop />
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-200">Online Hayaoshi</div>
          <h1 className="font-display mt-2 text-3xl text-white">早押しクイズ</h1>
          <p className="mt-2 text-sm text-slate-400">全{room.total_rounds}問 — 問題文が流れてくる！いちばん早く押してクイズに答えよう</p>

          {/* Room code badge — share with friends */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            marginTop: 14, padding: '8px 18px', borderRadius: 14,
            background: 'rgba(251,191,36,0.12)', border: '1.5px solid rgba(251,191,36,0.35)',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(251,191,36,0.7)', fontWeight: 700, letterSpacing: '0.12em' }}>ROOM CODE</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 900, color: '#fbbf24', letterSpacing: '0.22em' }}>{roomKey}</span>
          </div>

          <div className="mt-6 space-y-2">
            <div className="text-xs font-semibold tracking-[0.15em] text-slate-400 uppercase mb-3">参加中 ({room.players_json.length}/5)</div>
            {room.players_json.map((p, i) => (
              <div key={p.student_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14, background: `${p.color}10`, border: `1px solid ${p.color}25` }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${p.color}, ${p.color}80)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'white' }}>
                  {p.nickname.charAt(0)}
                </div>
                <span style={{ flex: 1, fontWeight: 600, color: 'white', fontSize: 14 }}>{p.nickname}</span>
                {p.student_id === ADMIN_STUDENT_ID && <span style={{ fontSize: 10, color: p.color, fontWeight: 700, letterSpacing: '0.1em' }}>HOST</span>}
                {p.student_id === studentId && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>あなた</span>}
              </div>
            ))}
            {room.players_json.length < 5 && (
              <div style={{ padding: '10px 14px', borderRadius: 14, border: '1px dashed rgba(148,163,184,0.2)', textAlign: 'center', fontSize: 12, color: 'rgba(148,163,184,0.4)' }}>
                {room.players_json.length < 2 ? 'もう1人以上参加が必要です' : '最大5人まで参加可能'}
              </div>
            )}
          </div>

          {!myPlayer && room.players_json.length < 5 && (
            <p className="mt-4 text-sm text-amber-300 text-center animate-pulse">接続中... しばらくお待ちください</p>
          )}

          <div className="mt-6 grid gap-3">
            {isAdmin && (
              <button onClick={() => void startGame()} className="btn-primary" disabled={!canStart}>
                {canStart ? 'ゲーム開始！' : `あと${Math.max(0, 2 - room.players_json.length)}人待機中`}
              </button>
            )}
            {!isAdmin && (
              <p className="text-center text-sm text-slate-400 py-2">先生がゲームを開始するまでお待ちください...</p>
            )}
            {/* Reset button is now available to ALL players to clean up stale state */}
            <button onClick={() => void resetRoom()} className="btn-ghost text-xs">
              🧹 ルームをリセット（全プレイヤー消去）
            </button>
            <button onClick={onBack} className="btn-secondary">もどる</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Finished ──
  if (room.phase === 'finished') {
    const sorted = [...room.players_json].sort((a, b) => b.score - a.score)
    const podiumEmojis = ['🥇', '🥈', '🥉']
    return (
      <div className="page-shell flex items-center justify-center anim-fade">
        <div className="hero-card reward-card w-full max-w-lg p-6 sm:p-8 text-center perfect-shimmer">
          <div className="reward-confetti" aria-hidden="true">
            {Array.from({ length: 20 }).map((_, i) => (
              <span key={i} className="reward-confetti__piece" style={{ left: `${4 + ((i * 7) % 92)}%`, animationDelay: `${(i % 8) * 0.07}s`, background: HAYAOSHI_PLAYER_COLORS[i % HAYAOSHI_PLAYER_COLORS.length] }} />
            ))}
          </div>
          <div className="text-xs font-semibold tracking-[0.18em] text-amber-200 uppercase mb-2">Game Over</div>
          <h2 className="font-display text-4xl text-white">早押し終了！</h2>
          <p className="mt-2 text-slate-300">全{room.total_rounds}問完了</p>
          {sessionXpEarned > 0 && (
            <div className="anim-pop" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              marginTop: 10, padding: '6px 16px', borderRadius: 999,
              background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)',
            }}>
              <span style={{ fontSize: 16 }}>⭐</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: '#86efac' }}>
                +{sessionXpEarned} XP
              </span>
              <span style={{ fontSize: 12, color: 'rgba(134,239,172,0.7)' }}>今回の対戦で獲得！</span>
            </div>
          )}

          <div className="mt-6 space-y-3">
            {sorted.map((p, i) => (
              <div key={p.student_id} className={i === 0 ? 'anim-pop' : ''} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderRadius: 16,
                background: i === 0 ? `${p.color}20` : `${p.color}0a`,
                border: `1.5px solid ${i === 0 ? `${p.color}50` : `${p.color}20`}`,
                boxShadow: i === 0 ? `0 0 20px ${p.color}30` : 'none',
              }}>
                <span style={{ fontSize: 24, minWidth: 30 }}>{podiumEmojis[i] ?? `${i + 1}.`}</span>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${p.color}, ${p.color}80)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'white', fontSize: 14 }}>{p.nickname.charAt(0)}</div>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: 'white', textAlign: 'left' }}>{p.nickname}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: p.color }}>{p.score}<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 3 }}>pt</span></span>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {isAdmin && <button onClick={() => void resetRoom()} className="btn-primary">もう一度</button>}
            <button onClick={onBack} className="btn-secondary">もどる</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main game screen (revealing / buzzed / result) ──
  const totalChars = question?.question.length ?? 0
  const revealProgress = totalChars > 0 ? Math.min(charsToShow / totalChars, 1) : 0
  const fullyRevealed = charsToShow >= totalChars

  return (
    <div className="page-shell page-shell-dashboard" style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        padding: '10px 16px',
        borderRadius: 16,
        background: 'rgba(2,6,23,0.5)',
        border: '1px solid rgba(148,163,184,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#fbbf24' }}>早押しクイズ</div>
          {question && (
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)', padding: '2px 8px', borderRadius: 999, background: 'rgba(148,163,184,0.08)' }}>
              {question.field} · {question.unit}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>
            {room.current_round} <span style={{ color: 'rgba(148,163,184,0.4)', fontSize: 12 }}>/ {room.total_rounds}</span>
          </div>
          <button onClick={() => logout()} style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
            ログアウト
          </button>
        </div>
      </div>

      {/* Round progress bar */}
      <div style={{ height: 3, borderRadius: 999, background: 'rgba(148,163,184,0.1)', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(room.current_round / room.total_rounds) * 100}%`, borderRadius: 999, background: 'linear-gradient(90deg, #f59e0b, #fbbf24)', transition: 'width 0.5s ease' }} />
      </div>

      {/* Question card */}
      <div style={{
        borderRadius: 24,
        padding: '24px 28px',
        background: 'rgba(2,6,23,0.6)',
        border: `1px solid ${room.phase === 'result' ? (room.buzz_correct ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(148,163,184,0.12)'}`,
        marginBottom: 16,
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.3s ease',
        boxShadow: room.phase === 'result'
          ? (room.buzz_correct ? '0 0 40px rgba(34,197,94,0.1)' : '0 0 40px rgba(239,68,68,0.1)')
          : 'none',
      }}>
        {/* Reveal progress bar (karaoke track) */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(148,163,184,0.08)' }}>
          <div style={{
            height: '100%',
            width: `${revealProgress * 100}%`,
            background: fullyRevealed ? 'rgba(34,197,94,0.5)' : 'linear-gradient(90deg, #fbbf24, #f59e0b)',
            transition: 'width 0.1s linear',
            boxShadow: '0 0 6px rgba(251,191,36,0.5)',
          }} />
        </div>

        {question ? renderKaraokeText(question.question) : (
          <div style={{ color: 'rgba(148,163,184,0.4)', fontSize: 16 }}>問題を読み込み中...</div>
        )}

        {/* Result overlay */}
        {room.phase === 'result' && room.buzz_correct !== null && (
          <div className="anim-pop" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 14, background: room.buzz_correct ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${room.buzz_correct ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>{room.buzz_correct ? '🎉' : '💥'}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: room.buzz_correct ? '#86efac' : '#fca5a5' }}>
                {buzzedPlayer?.nickname} — {room.buzz_correct ? '正解！' : '不正解…'}
              </div>
              {!room.buzz_correct && question && (
                <div style={{ fontSize: 12, color: 'rgba(203,213,225,0.6)', marginTop: 2 }}>
                  正解: <strong style={{ color: '#fbbf24' }}>{question.answer}</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Choices (shown in buzzed/result phase) */}
      {question && question.choices.length > 0 && (room.phase === 'buzzed' || room.phase === 'result') && (
        <div style={{ display: 'grid', gridTemplateColumns: question.choices.length <= 2 ? '1fr 1fr' : 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
          {question.choices.map((choice, i) => {
            const isCorrect = choice === question.answer
            const isSelected = choice === room.buzz_answer
            const showResult = room.phase === 'result'
            let bg = 'rgba(148,163,184,0.07)'
            let border = 'rgba(148,163,184,0.12)'
            let textColor = 'rgba(203,213,225,0.8)'
            if (showResult && isCorrect) { bg = 'rgba(34,197,94,0.15)'; border = 'rgba(34,197,94,0.4)'; textColor = '#86efac' }
            else if (showResult && isSelected && !isCorrect) { bg = 'rgba(239,68,68,0.12)'; border = 'rgba(239,68,68,0.3)'; textColor = '#fca5a5' }
            else if (iAmBuzzed && !showResult && selectedChoice === choice) { bg = 'rgba(251,191,36,0.12)'; border = 'rgba(251,191,36,0.4)'; textColor = '#fbbf24' }

            const labels = ['A', 'B', 'C', 'D']
            // Live hover indicators from other players (excluding self)
            const hoveringOthers = (Object.entries(liveHovers) as [string, LiveEntry][])
              .filter(([sid, h]) => Number(sid) !== studentId && h.kind === 'hover' && h.choice === choice)
              .map(([, h]) => h)
            return (
              <button
                key={i}
                disabled={!iAmBuzzed || room.phase !== 'buzzed' || submitting}
                onMouseEnter={() => { if (iAmBuzzed && room.phase === 'buzzed') broadcastHover(choice) }}
                onMouseLeave={() => { if (iAmBuzzed && room.phase === 'buzzed') broadcastHover(null) }}
                onClick={() => {
                  if (!iAmBuzzed || room.phase !== 'buzzed') return
                  setSelectedChoice(choice)
                  void handleAnswerSubmit(choice)
                }}
                style={{
                  position: 'relative',
                  padding: '14px 16px',
                  borderRadius: 16,
                  border: `1.5px solid ${border}`,
                  background: bg,
                  color: textColor,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: iAmBuzzed && room.phase === 'buzzed' ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(148,163,184,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  {labels[i] ?? i + 1}
                </span>
                {choice}
                {showResult && isCorrect && <span style={{ marginLeft: 'auto' }}>✓</span>}
                {/* Live hover indicators from spectators */}
                {hoveringOthers.length > 0 && (
                  <div style={{
                    position: 'absolute', top: -8, right: -6,
                    display: 'flex', gap: 3,
                  }}>
                    {hoveringOthers.slice(0, 4).map((h, idx) => (
                      <div key={idx} title={`${h.nickname} が見ている`} className="anim-pop" style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${h.color}, ${h.color}99)`,
                        border: '2px solid rgba(2,6,23,0.9)',
                        fontSize: 9, fontWeight: 900, color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 0 10px ${h.color}80`,
                      }}>
                        {h.nickname.charAt(0)}
                      </div>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Players grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(room.players_json.length, 5)}, 1fr)`,
        gap: 10,
        marginBottom: 16,
      }}>
        {room.players_json.map(p => renderPlayerCard(p, room.buzzed_student_id))}
      </div>

      {/* Live activity feed: buzz attempts from other players */}
      {room.phase === 'revealing' && (() => {
        const buzzAttempts = (Object.entries(liveHovers) as [string, LiveEntry][])
          .filter(([sid, h]) => Number(sid) !== studentId && h.kind === 'buzz_attempt')
          .map(([sid, h]) => ({ sid: Number(sid), ...h }))
        if (buzzAttempts.length === 0) return null
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, minHeight: 20 }}>
            {buzzAttempts.map(a => (
              <div key={a.sid} className="anim-pop" style={{
                fontSize: 11, fontWeight: 700, color: a.color,
                padding: '3px 10px', borderRadius: 999,
                background: `${a.color}15`, border: `1px solid ${a.color}35`,
              }}>
                ✋ {a.nickname} が押した！
              </div>
            ))}
          </div>
        )
      })()}

      {/* Buzz button / status */}
      {room.phase === 'revealing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {buzzFailed && (
            <div className="anim-pop" style={{ fontSize: 13, color: '#f87171', fontWeight: 600 }}>
              ✗ 誰かに先を越された！
            </div>
          )}
          <button
            onClick={() => void handleBuzz()}
            disabled={buzzing || !myPlayer}
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '20px 32px',
              borderRadius: 24,
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: '0.05em',
              color: 'white',
              background: buzzing
                ? 'rgba(251,191,36,0.3)'
                : 'linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b)',
              border: '2px solid rgba(251,191,36,0.6)',
              cursor: buzzing ? 'wait' : 'pointer',
              boxShadow: '0 0 40px rgba(251,191,36,0.35), 0 8px 32px rgba(0,0,0,0.4)',
              transition: buzzing ? 'all 0.15s ease' : 'none',
              transform: buzzing ? 'scale(0.97)' : undefined,
              fontFamily: 'var(--font-display)',
              animation: buzzing ? 'none' : revealProgress > 0.25
                ? `button-pulse-urgent ${Math.max(0.38, 1.1 - revealProgress * 0.75).toFixed(2)}s ease-in-out infinite`
                : 'none',
            }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)' }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
          >
            ✋ 早押し！
          </button>
          <div style={{ fontSize: 11, color: revealProgress >= 1 ? 'rgba(251,191,36,0.6)' : 'rgba(148,163,184,0.4)', fontWeight: revealProgress >= 1 ? 700 : 400, transition: 'color 0.3s' }}>
            {fullyRevealed ? '⚡ 全文表示！今すぐ押せ！' : `文字表示中 ${charsToShow} / ${totalChars}`}
          </div>
        </div>
      )}

      {/* Buzzed status for non-buzzed players */}
      {room.phase === 'buzzed' && !iAmBuzzed && buzzedPlayer && (
        <div style={{ textAlign: 'center', padding: '16px 20px', borderRadius: 20, background: `${buzzedPlayer.color}14`, border: `1.5px solid ${buzzedPlayer.color}40`, boxShadow: `0 0 24px ${buzzedPlayer.color}20` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: `linear-gradient(135deg, ${buzzedPlayer.color}, ${buzzedPlayer.color}80)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 900, color: 'white',
              boxShadow: `0 0 16px ${buzzedPlayer.color}60`,
            }}>
              {buzzedPlayer.nickname.charAt(0)}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'white', fontWeight: 700 }}>
                <span style={{ color: buzzedPlayer.color }}>{buzzedPlayer.nickname}</span> が押した！
              </div>
              <div className="animate-pulse" style={{ fontSize: 12, color: 'rgba(203,213,225,0.5)', marginTop: 2 }}>
                回答中...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buzzed player answer timer */}
      {room.phase === 'buzzed' && iAmBuzzed && (
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            borderRadius: 999,
            background: answerTimeLeft <= 3 ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.1)',
            border: `1px solid ${answerTimeLeft <= 3 ? 'rgba(239,68,68,0.4)' : 'rgba(251,191,36,0.25)'}`,
            animation: answerTimeLeft <= 3 ? 'timerDangerPulse 0.5s ease-in-out infinite' : 'none',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: answerTimeLeft <= 3 ? '#ef4444' : '#fbbf24' }}>
              {answerTimeLeft}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(203,213,225,0.6)' }}>秒以内に選んでください</span>
          </div>
        </div>
      )}

      {/* Next-round countdown (result phase) */}
      {room.phase === 'result' && nextRoundSec !== null && (
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'rgba(148,163,184,0.5)',
            padding: '4px 14px', borderRadius: 999,
            background: 'rgba(148,163,184,0.06)',
          }}>
            次の問題まで
            <span key={nextRoundSec} style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: '#fbbf24', animation: 'countdown-tick 0.4s ease' }}>
              {nextRoundSec}
            </span>
            秒
          </span>
        </div>
      )}

      {/* ── XP toast ── */}
      {xpToast && (
        <div style={{
          position: 'fixed', bottom: 80, right: 20, zIndex: 300,
          pointerEvents: 'none',
        }}>
          {xpToast.levelUp ? (
            // Level-up: bigger celebration
            <div className="anim-pop" style={{
              padding: '14px 20px',
              borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15))',
              border: '1.5px solid rgba(251,191,36,0.6)',
              boxShadow: '0 0 30px rgba(251,191,36,0.4)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>⬆️</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: '#fbbf24', marginTop: 4 }}>
                LEVEL UP!
              </div>
              <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700 }}>Lv. {xpToast.newLevel}</div>
              <div style={{ fontSize: 12, color: 'rgba(203,213,225,0.7)', marginTop: 2 }}>+{xpToast.xp} XP</div>
            </div>
          ) : (
            // Normal XP gain
            <div className="anim-fade-up" style={{
              padding: '10px 18px',
              borderRadius: 16,
              background: 'rgba(34,197,94,0.18)',
              border: '1px solid rgba(34,197,94,0.4)',
              boxShadow: '0 0 18px rgba(34,197,94,0.25)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>⭐</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, color: '#86efac' }}>
                +{xpToast.xp} XP
              </span>
              <span style={{ fontSize: 11, color: 'rgba(134,239,172,0.7)', fontWeight: 600 }}>獲得！</span>
            </div>
          )}
        </div>
      )}

      {/* ── Buzz flash overlay ── */}
      {buzzFlashVisible && buzzedPlayer && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'buzz-flash 1.3s ease forwards',
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${buzzedPlayer.color}28 0%, transparent 75%)`,
        }}>
          {/* Ripple ring */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            width: 120, height: 120, borderRadius: '50%',
            border: `3px solid ${buzzedPlayer.color}60`,
            animation: 'buzz-ripple 1.3s ease forwards',
          }} />
          {/* Player name reveal */}
          <div style={{ textAlign: 'center', animation: 'buzz-player-reveal 1.3s ease forwards', position: 'relative', zIndex: 1 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: `linear-gradient(135deg, ${buzzedPlayer.color}, ${buzzedPlayer.color}80)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, fontWeight: 900, color: 'white',
              margin: '0 auto 10px',
              boxShadow: `0 0 40px ${buzzedPlayer.color}80`,
            }}>
              {buzzedPlayer.nickname.charAt(0)}
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(24px, 5vw, 40px)',
              fontWeight: 900,
              color: buzzedPlayer.color,
              textShadow: `0 0 30px ${buzzedPlayer.color}, 0 0 60px ${buzzedPlayer.color}60`,
              letterSpacing: '0.04em',
            }}>
              {buzzedPlayer.nickname}
            </div>
            <div style={{
              marginTop: 6,
              fontSize: 'clamp(13px, 2vw, 18px)',
              fontWeight: 800,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'white',
              textShadow: '0 0 14px rgba(255,255,255,0.4)',
            }}>
              BUZZ !!
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
