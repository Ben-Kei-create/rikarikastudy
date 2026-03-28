'use client'

import ScienceBackdrop from '@/components/ScienceBackdrop'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clamp,
  drawWorkbenchScene,
  evaluateRound,
  getInitialState,
  Phase,
  RoundFeedback,
  WorkbenchState,
} from '@/components/ScienceWorkbenchPage'
import { useAuth } from '@/lib/auth'
import {
  CHEMISTRY_WORKBENCH_MODES,
  EARTH_WORKBENCH_MODES,
  getScienceWorkbenchRounds,
  PHYSICS_WORKBENCH_MODES,
  SATURATED_VAPOR_TABLE,
  ColumnWorkbenchRound,
  MotionWorkbenchRound,
  ScienceWorkbenchMode,
  ScienceWorkbenchRound,
  SCIENCE_WORKBENCH_MODE_META,
} from '@/lib/scienceWorkbench'
import {
  clearOnlineLabRoom,
  fetchOnlineLabRoom,
  fetchOnlineLabEntryPassword,
  updateOnlineLabEntryPassword,
  isOnlineLabRoomLive,
  ONLINE_LAB_STALE_MS,
  OnlineLabRoomRow,
  subscribeOnlineLabRoom,
  upsertOnlineLabRoom,
} from '@/lib/onlineLab'
import { Json } from '@/lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'

const ADMIN_STUDENT_ID = 5
const ROOM_MISSING_MESSAGE = 'Supabase に online_lab_rooms テーブルがありません。最新の supabase_schema.sql を SQL Editor で実行してください。'

type WhiteboardTool = 'none' | 'pen'

interface WhiteboardPoint {
  x: number
  y: number
}

interface WhiteboardStroke {
  id: string
  color: string
  width: number
  points: WhiteboardPoint[]
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function formatNumber(value: number, digits = 1) {
  return roundTo(value, digits).toFixed(digits)
}

function getCurrentDensity(state: WorkbenchState) {
  if (state.kind !== 'chem-density') return 0
  return state.volume <= 0 ? 0 : state.mass / state.volume
}

function getCurrentConcentration(state: WorkbenchState) {
  if (state.kind !== 'chem-concentration') return 0
  const total = state.soluteMass + state.waterMass
  return total <= 0 ? 0 : (state.soluteMass / total) * 100
}

function getSaturatedAmount(temperature: number) {
  return SATURATED_VAPOR_TABLE.find(item => item.temperature === temperature)?.amount ?? 0
}

function getHumidityRatio(vaporAmount: number, saturation: number) {
  if (saturation <= 0) return 0
  return Math.max(0, (vaporAmount / saturation) * 100)
}

function getColumnOption(round: ColumnWorkbenchRound, key: string | null) {
  if (!key) return null
  return round.options.find(option => option.key === key) ?? null
}

function getBatteryElectrodeLabel(value: 'zinc' | 'copper' | null) {
  if (value === 'zinc') return '亜鉛板'
  if (value === 'copper') return '銅板'
  return '未選択'
}

function getBatteryDirectionLabel(value: 'zinc-to-copper' | 'copper-to-zinc' | null) {
  if (value === 'zinc-to-copper') return '亜鉛 → 銅'
  if (value === 'copper-to-zinc') return '銅 → 亜鉛'
  return '未選択'
}

function getBatteryChangeLabel(value: 'dissolve' | 'attach' | null) {
  if (value === 'dissolve') return 'とけてイオンになる'
  if (value === 'attach') return '表面に付着する'
  return '未選択'
}

function describeBatteryState(state: Extract<WorkbenchState, { kind: 'chem-battery' }>) {
  return [
    `－極: ${getBatteryElectrodeLabel(state.negativeElectrode)}`,
    `電子: ${getBatteryDirectionLabel(state.electronDirection)}`,
    `電流: ${getBatteryDirectionLabel(state.currentDirection)}`,
    `亜鉛板: ${getBatteryChangeLabel(state.zincChange)}`,
    `銅板: ${getBatteryChangeLabel(state.copperChange)}`,
  ].join(' / ')
}

function describeMotion(round: MotionWorkbenchRound, state: Extract<WorkbenchState, { kind: 'physics-motion-graph' }>) {
  const currentVelocity = Math.max(0, round.initialVelocity + state.acceleration * state.time)
  const currentPosition = round.initialVelocity * state.time + 0.5 * state.acceleration * state.time * state.time
  return {
    currentVelocity,
    currentPosition,
  }
}

function createStrokeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isScienceWorkbenchMode(value: string | null | undefined): value is ScienceWorkbenchMode {
  if (!value) return false
  return value in SCIENCE_WORKBENCH_MODE_META
}

function normalizePhase(value: string | null | undefined): Phase {
  if (value === 'adjusting' || value === 'result' || value === 'finished') return value
  return 'adjusting'
}

function parseWhiteboardStrokes(value: Json | null | undefined): WhiteboardStroke[] {
  if (!Array.isArray(value)) return []

  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const candidate = entry as Record<string, unknown>
    const points = Array.isArray(candidate.points)
      ? candidate.points.flatMap(point => {
          if (!point || typeof point !== 'object' || Array.isArray(point)) return []
          const next = point as Record<string, unknown>
          return typeof next.x === 'number' && typeof next.y === 'number'
            ? [{ x: clamp(next.x, 0, 1), y: clamp(next.y, 0, 1) }]
            : []
        })
      : []

    if (points.length === 0) return []

    return [{
      id: typeof candidate.id === 'string' ? candidate.id : createStrokeId(),
      color: typeof candidate.color === 'string' ? candidate.color : '#fef08a',
      width: typeof candidate.width === 'number' ? candidate.width : 4,
      points,
    }]
  })
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, strokes: WhiteboardStroke[]) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x * CANVAS_WIDTH, stroke.points[0].y * CANVAS_HEIGHT)
    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index]
      ctx.lineTo(point.x * CANVAS_WIDTH, point.y * CANVAS_HEIGHT)
    }
    ctx.stroke()
    ctx.restore()
  }
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent): WhiteboardPoint {
  const rect = canvas.getBoundingClientRect()
  const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
  const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
  return { x, y }
}

function applyRoomSnapshot(mode: ScienceWorkbenchMode, room: OnlineLabRoomRow) {
  const rounds = getScienceWorkbenchRounds(mode)
  const nextIndex = clamp(room.round_index ?? 0, 0, Math.max(0, rounds.length - 1))
  const nextRound = rounds[nextIndex]
  const fallbackState = getInitialState(nextRound)
  const rawState = room.state_json && typeof room.state_json === 'object' && !Array.isArray(room.state_json)
    ? room.state_json as unknown as WorkbenchState
    : fallbackState
  const nextState = rawState.kind === 'earth-humidity' && typeof rawState.vaporAmount !== 'number'
    ? { ...rawState, vaporAmount: nextRound.kind === 'earth-humidity' ? nextRound.startVaporAmount : 0 }
    : rawState
  const nextFeedback = room.feedback_json && typeof room.feedback_json === 'object' && !Array.isArray(room.feedback_json)
    ? room.feedback_json as unknown as RoundFeedback
    : null
  const nextHistory = Array.isArray(room.history_json)
    ? room.history_json.filter(entry => typeof entry === 'boolean')
    : []

  return {
    mode,
    current: nextIndex,
    phase: normalizePhase(room.phase),
    score: room.score ?? 0,
    state: nextState,
    feedback: nextFeedback,
    history: nextHistory,
    memoText: room.memo_text ?? '',
    strokes: parseWhiteboardStrokes(room.whiteboard_strokes),
  }
}

function getFieldModeGroups() {
  return [
    { field: '化学', modes: CHEMISTRY_WORKBENCH_MODES },
    { field: '物理', modes: PHYSICS_WORKBENCH_MODES },
    { field: '地学', modes: EARTH_WORKBENCH_MODES },
  ] as const
}

export default function OnlineLabPage({
  onBack,
  onOpenTerritory,
}: {
  onBack: () => void
  onOpenTerritory?: () => void
}) {
  const { studentId, nickname, logout } = useAuth()
  const isController = studentId === ADMIN_STUDENT_ID
  const [room, setRoom] = useState<OnlineLabRoomRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<ScienceWorkbenchMode>('chem-density')
  const [liveMode, setLiveMode] = useState<ScienceWorkbenchMode>('chem-density')
  const [broadcasting, setBroadcasting] = useState(false)
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<Phase>('adjusting')
  const [score, setScore] = useState(0)
  const [state, setState] = useState<WorkbenchState>(getInitialState(getScienceWorkbenchRounds('chem-density')[0]))
  const [feedback, setFeedback] = useState<RoundFeedback | null>(null)
  const [history, setHistory] = useState<boolean[]>([])
  const [memoText, setMemoText] = useState('')
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([])
  const [tool, setTool] = useState<WhiteboardTool>('none')
  const [visualClock, setVisualClock] = useState(0)
  const [entryPassword, setEntryPassword] = useState('')
  const [entryPasswordSaved, setEntryPasswordSaved] = useState(false)
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const whiteboardCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingStrokeRef = useRef<WhiteboardStroke | null>(null)
  const publishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controllerRestoredRef = useRef(false)

  const liveRoom = isOnlineLabRoomLive(room) ? room : null
  const viewerMode = !isController && liveRoom && isScienceWorkbenchMode(liveRoom.mode) ? liveRoom.mode : null
  const viewerSnapshot = useMemo(
    () => viewerMode && liveRoom ? applyRoomSnapshot(viewerMode, liveRoom) : null,
    [liveRoom, viewerMode],
  )

  const effectiveMode = isController ? liveMode : viewerSnapshot?.mode ?? null
  const rounds = useMemo(
    () => effectiveMode ? getScienceWorkbenchRounds(effectiveMode) : [],
    [effectiveMode],
  )
  const meta = effectiveMode ? SCIENCE_WORKBENCH_MODE_META[effectiveMode] : null
  const currentRound = effectiveMode
    ? rounds[isController ? current : (viewerSnapshot?.current ?? 0)] ?? null
    : null
  const effectivePhase = isController ? phase : viewerSnapshot?.phase ?? 'adjusting'
  const effectiveScore = isController ? score : viewerSnapshot?.score ?? 0
  const effectiveState = isController ? state : viewerSnapshot?.state ?? null
  const effectiveFeedback = isController ? feedback : viewerSnapshot?.feedback ?? null
  const effectiveHistory = isController ? history : viewerSnapshot?.history ?? []
  const effectiveMemoText = isController ? memoText : viewerSnapshot?.memoText ?? ''
  const effectiveStrokes = isController ? strokes : viewerSnapshot?.strokes ?? []
  const progress = rounds.length > 0
    ? (((isController ? current : viewerSnapshot?.current ?? 0)) / rounds.length) * 100
    : 0

  useEffect(() => {
    let active = true

    const loadRoom = async () => {
      try {
        const nextRoom = await fetchOnlineLabRoom()
        if (active) setRoom(nextRoom)
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'オンラインラボの読み込みに失敗しました。')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadRoom()
    if (isController) {
      fetchOnlineLabEntryPassword().then(pw => {
        if (active) setEntryPassword(pw)
      })
    }
    const unsubscribe = subscribeOnlineLabRoom(nextRoom => {
      if (active) setRoom(nextRoom)
    })
    const pollId = window.setInterval(() => {
      void loadRoom()
    }, 1500)

    return () => {
      active = false
      unsubscribe()
      window.clearInterval(pollId)
      if (publishTimeoutRef.current) clearTimeout(publishTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isController || controllerRestoredRef.current || !room || !isOnlineLabRoomLive(room)) return
    if (room.controller_student_id !== studentId || !isScienceWorkbenchMode(room.mode)) return

    const restored = applyRoomSnapshot(room.mode, room)
    controllerRestoredRef.current = true
    setSelectedMode(room.mode)
    setLiveMode(room.mode)
    setBroadcasting(true)
    setCurrent(restored.current)
    setPhase(restored.phase)
    setScore(restored.score)
    setState(restored.state)
    setFeedback(restored.feedback)
    setHistory(restored.history)
    setMemoText(restored.memoText)
    setStrokes(restored.strokes)
  }, [isController, room, studentId])

  useEffect(() => {
    if (!meta || !currentRound || !effectiveState || !baseCanvasRef.current) return
    const ctx = baseCanvasRef.current.getContext('2d')
    if (!ctx) return
    drawWorkbenchScene(ctx, meta, currentRound, effectiveState, {
      clockMs: visualClock,
      intensity: 1.15,
    })
  }, [currentRound, effectiveState, meta, visualClock])

  useEffect(() => {
    let rafId = 0
    let last = performance.now()

    const tick = (now: number) => {
      const delta = now - last
      last = now
      setVisualClock(currentValue => currentValue + delta)
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [])

  useEffect(() => {
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawWhiteboard(ctx, effectiveStrokes)
  }, [effectiveStrokes])

  useEffect(() => {
    if (!isController || !broadcasting || !meta) return
    const round = rounds[current]
    if (!round) return

    const payload = JSON.stringify({
      mode: liveMode,
      phase,
      round_index: current,
      score,
      history,
      state,
      feedback,
      memoText,
      strokes,
    })

    if (publishTimeoutRef.current) clearTimeout(publishTimeoutRef.current)
    publishTimeoutRef.current = setTimeout(() => {
      void upsertOnlineLabRoom({
        mode: liveMode,
        controller_student_id: studentId,
        controller_nickname: nickname,
        is_live: true,
        phase,
        round_index: current,
        score,
        history_json: history,
        state_json: state as unknown as Json,
        feedback_json: feedback as unknown as Json | null,
        memo_text: memoText,
        whiteboard_strokes: strokes as unknown as Json,
      }).then(ok => {
        if (!ok) setError(ROOM_MISSING_MESSAGE)
      }).catch(publishError => {
        setError(publishError instanceof Error ? publishError.message : 'オンライン配信の更新に失敗しました。')
      })
    }, payload.includes('points') ? 120 : 80)

    return () => {
      if (publishTimeoutRef.current) {
        clearTimeout(publishTimeoutRef.current)
        publishTimeoutRef.current = null
      }
    }
  }, [broadcasting, current, feedback, history, isController, liveMode, memoText, meta, nickname, phase, rounds, score, state, strokes, studentId])

  const resetControllerState = (mode: ScienceWorkbenchMode) => {
    const initialRound = getScienceWorkbenchRounds(mode)[0]
    const initialState = getInitialState(initialRound)
    setLiveMode(mode)
    setCurrent(0)
    setPhase('adjusting')
    setScore(0)
    setState(initialState)
    setFeedback(null)
    setHistory([])
    setMemoText('')
    setStrokes([])
    setTool('none')
  }

  const startBroadcast = async (mode: ScienceWorkbenchMode) => {
    resetControllerState(mode)
    setBroadcasting(true)
    setError(null)
    const initialRound = getScienceWorkbenchRounds(mode)[0]
    const initialState = getInitialState(initialRound)
    const ok = await upsertOnlineLabRoom({
      mode,
      controller_student_id: studentId,
      controller_nickname: nickname,
      is_live: true,
      phase: 'adjusting',
      round_index: 0,
      score: 0,
      history_json: [],
      state_json: initialState as unknown as Json,
      feedback_json: null,
      memo_text: '',
      whiteboard_strokes: [],
    })
    if (!ok) {
      setBroadcasting(false)
      setError(ROOM_MISSING_MESSAGE)
    }
  }

  const endBroadcast = async () => {
    setBroadcasting(false)
    setTool('none')
    const ok = await clearOnlineLabRoom(studentId, nickname)
    if (!ok) setError(ROOM_MISSING_MESSAGE)
  }

  const updateState = (updater: (currentState: WorkbenchState) => WorkbenchState) => {
    if (!isController || !broadcasting || phase !== 'adjusting') return
    setState(currentState => updater(currentState))
  }

  const handleSubmit = () => {
    if (!isController || !broadcasting || phase !== 'adjusting' || !currentRound) return
    const nextFeedback = evaluateRound(currentRound, state)
    if (nextFeedback.correct) {
      setScore(currentScore => currentScore + 1)
      setHistory(currentHistory => [...currentHistory, true])
    } else {
      setHistory(currentHistory => [...currentHistory, false])
    }
    setFeedback(nextFeedback)
    setPhase('result')
  }

  const handleNext = () => {
    if (!isController || !broadcasting) return
    if (current + 1 >= rounds.length) {
      setPhase('finished')
      return
    }

    const nextIndex = current + 1
    const nextRound = rounds[nextIndex]
    const nextState = getInitialState(nextRound)
    setCurrent(nextIndex)
    setState(nextState)
    setFeedback(null)
    setPhase('adjusting')
  }

  const restart = () => {
    if (!isController || !broadcasting) return
    resetControllerState(liveMode)
  }

  const clearBoard = () => {
    if (!isController) return
    setStrokes([])
  }

  const renderControls = () => {
    if (!isController || !broadcasting || !currentRound) {
      return (
        <div className="rounded-[24px] border border-white/10 bg-slate-950/30 p-4 text-sm leading-7 text-slate-300">
          管理者が操作しているラボをこのまま閲覧できます。今の段階、判定結果、ホワイトボードのメモがリアルタイムで反映されます。
        </div>
      )
    }

    if (state.kind === 'chem-density') {
      const density = getCurrentDensity(state)
      return (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-200">調整</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">質量</div>
              <div className="mt-1 text-2xl font-bold text-white">{state.mass} g</div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => updateState(currentState => currentState.kind !== 'chem-density' ? currentState : ({ ...currentState, mass: clamp(currentState.mass - 10, 10, 120) }))} className="btn-ghost !px-4 !py-2">-10</button>
                <button onClick={() => updateState(currentState => currentState.kind !== 'chem-density' ? currentState : ({ ...currentState, mass: clamp(currentState.mass + 10, 10, 120) }))} className="btn-secondary !px-4 !py-2">+10</button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">体積</div>
              <div className="mt-1 text-2xl font-bold text-white">{state.volume} cm3</div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => updateState(currentState => currentState.kind !== 'chem-density' ? currentState : ({ ...currentState, volume: clamp(currentState.volume - 5, 5, 60) }))} className="btn-ghost !px-4 !py-2">-5</button>
                <button onClick={() => updateState(currentState => currentState.kind !== 'chem-density' ? currentState : ({ ...currentState, volume: clamp(currentState.volume + 5, 5, 60) }))} className="btn-secondary !px-4 !py-2">+5</button>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-orange-400/20 bg-orange-500/10 p-3 text-sm text-orange-100">
            現在の密度: <span className="font-bold">{formatNumber(density)} g/cm3</span>
          </div>
        </div>
      )
    }

    if (state.kind === 'chem-concentration') {
      const concentration = getCurrentConcentration(state)
      const total = state.soluteMass + state.waterMass
      return (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-200">調整</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">溶質</div>
              <div className="mt-1 text-2xl font-bold text-white">{state.soluteMass} g</div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => updateState(currentState => currentState.kind !== 'chem-concentration' ? currentState : ({ ...currentState, soluteMass: clamp(currentState.soluteMass - 5, 5, 60) }))} className="btn-ghost !px-4 !py-2">-5</button>
                <button onClick={() => updateState(currentState => currentState.kind !== 'chem-concentration' ? currentState : ({ ...currentState, soluteMass: clamp(currentState.soluteMass + 5, 5, 60) }))} className="btn-secondary !px-4 !py-2">+5</button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">水</div>
              <div className="mt-1 text-2xl font-bold text-white">{state.waterMass} g</div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => updateState(currentState => currentState.kind !== 'chem-concentration' ? currentState : ({ ...currentState, waterMass: clamp(currentState.waterMass - 5, 5, 120) }))} className="btn-ghost !px-4 !py-2">-5</button>
                <button onClick={() => updateState(currentState => currentState.kind !== 'chem-concentration' ? currentState : ({ ...currentState, waterMass: clamp(currentState.waterMass + 5, 5, 120) }))} className="btn-secondary !px-4 !py-2">+5</button>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">
            現在の濃度: <span className="font-bold">{formatNumber(concentration)}%</span> / 溶液 {total}g
          </div>
        </div>
      )
    }

    if (state.kind === 'chem-battery' && currentRound.kind === 'chem-battery') {
      const choiceClassName = (selected: boolean) => `rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
        selected
          ? 'text-white'
          : 'border-white/10 bg-slate-950/30 text-slate-300'
      }`

      return (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-200">しくみを選ぶ</div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">－極</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { key: 'zinc', label: '亜鉛板' },
                  { key: 'copper', label: '銅板' },
                ].map(choice => (
                  <button
                    key={choice.key}
                    onClick={() => updateState(currentState => currentState.kind !== 'chem-battery' ? currentState : ({ ...currentState, negativeElectrode: choice.key as 'zinc' | 'copper' }))}
                    className={choiceClassName(state.negativeElectrode === choice.key)}
                    style={state.negativeElectrode === choice.key ? { borderColor: '#fcd34d', background: 'rgba(251, 191, 36, 0.18)' } : undefined}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">電子の向き</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { key: 'zinc-to-copper', label: '亜鉛 → 銅' },
                  { key: 'copper-to-zinc', label: '銅 → 亜鉛' },
                ].map(choice => (
                  <button
                    key={choice.key}
                    onClick={() => updateState(currentState => currentState.kind !== 'chem-battery' ? currentState : ({ ...currentState, electronDirection: choice.key as 'zinc-to-copper' | 'copper-to-zinc' }))}
                    className={choiceClassName(state.electronDirection === choice.key)}
                    style={state.electronDirection === choice.key ? { borderColor: '#f8fafc', background: 'rgba(248, 250, 252, 0.16)' } : undefined}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">電流の向き</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { key: 'zinc-to-copper', label: '亜鉛 → 銅' },
                  { key: 'copper-to-zinc', label: '銅 → 亜鉛' },
                ].map(choice => (
                  <button
                    key={choice.key}
                    onClick={() => updateState(currentState => currentState.kind !== 'chem-battery' ? currentState : ({ ...currentState, currentDirection: choice.key as 'zinc-to-copper' | 'copper-to-zinc' }))}
                    className={choiceClassName(state.currentDirection === choice.key)}
                    style={state.currentDirection === choice.key ? { borderColor: '#93c5fd', background: 'rgba(59, 130, 246, 0.18)' } : undefined}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                <div className="text-xs tracking-[0.18em] text-slate-400">亜鉛板の変化</div>
                <div className="mt-3 grid gap-2">
                  {[
                    { key: 'dissolve', label: 'とけてイオンになる' },
                    { key: 'attach', label: '表面に付着する' },
                  ].map(choice => (
                    <button
                      key={choice.key}
                      onClick={() => updateState(currentState => currentState.kind !== 'chem-battery' ? currentState : ({ ...currentState, zincChange: choice.key as 'dissolve' | 'attach' }))}
                      className={choiceClassName(state.zincChange === choice.key)}
                      style={state.zincChange === choice.key ? { borderColor: '#60a5fa', background: 'rgba(96, 165, 250, 0.18)' } : undefined}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                <div className="text-xs tracking-[0.18em] text-slate-400">銅板の変化</div>
                <div className="mt-3 grid gap-2">
                  {[
                    { key: 'attach', label: '表面に付着する' },
                    { key: 'dissolve', label: 'とけてイオンになる' },
                  ].map(choice => (
                    <button
                      key={choice.key}
                      onClick={() => updateState(currentState => currentState.kind !== 'chem-battery' ? currentState : ({ ...currentState, copperChange: choice.key as 'dissolve' | 'attach' }))}
                      className={choiceClassName(state.copperChange === choice.key)}
                      style={state.copperChange === choice.key ? { borderColor: '#fb923c', background: 'rgba(251, 146, 60, 0.18)' } : undefined}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            現在の設定: <span className="font-bold">{describeBatteryState(state)}</span>
          </div>
        </div>
      )
    }

    if (state.kind === 'earth-humidity') {
      const saturation = getSaturatedAmount(state.temperature)
      const humidityRatio = getHumidityRatio(state.vaporAmount, saturation)
      const cloudReady = state.vaporAmount >= saturation
      return (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-200">温度と水蒸気量を動かす</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">温度</div>
              <div className="mt-2 text-xl font-bold text-white">{state.temperature}<span className="ml-1 text-sm text-slate-400">℃</span></div>
              <input
                type="range"
                min={0}
                max={40}
                step={10}
                value={state.temperature}
                onChange={event => updateState(currentState => currentState.kind !== 'earth-humidity' ? currentState : ({ ...currentState, temperature: Number(event.target.value) }))}
                className="mt-3 w-full"
                style={{ accentColor: meta?.accent ?? '#8b7cff' }}
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">水蒸気量</div>
              <div className="mt-2 text-xl font-bold text-white">{formatNumber(state.vaporAmount)}<span className="ml-1 text-sm text-slate-400">g</span></div>
              <input
                type="range"
                min={0}
                max={SATURATED_VAPOR_TABLE[SATURATED_VAPOR_TABLE.length - 1].amount}
                step={0.1}
                value={state.vaporAmount}
                onChange={event => updateState(currentState => currentState.kind !== 'earth-humidity' ? currentState : ({ ...currentState, vaporAmount: roundTo(Number(event.target.value), 1) }))}
                className="mt-3 w-full"
                style={{ accentColor: meta?.accent ?? '#8b7cff' }}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SATURATED_VAPOR_TABLE.map(item => (
              <button
                key={item.temperature}
                onClick={() => updateState(currentState => currentState.kind !== 'earth-humidity' ? currentState : ({ ...currentState, temperature: item.temperature }))}
                className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                  state.temperature === item.temperature
                    ? 'border-violet-300 bg-violet-500/20 text-white'
                    : 'border-white/10 bg-slate-950/30 text-slate-300'
                }`}
              >
                {item.temperature}℃
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SATURATED_VAPOR_TABLE.map(item => (
              <button
                key={`${item.temperature}-${item.amount}`}
                onClick={() => updateState(currentState => currentState.kind !== 'earth-humidity' ? currentState : ({ ...currentState, vaporAmount: item.amount }))}
                className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  Math.abs(state.vaporAmount - item.amount) < 0.051
                    ? 'border-violet-300 bg-violet-500/20 text-white'
                    : 'border-white/10 bg-slate-950/30 text-slate-300'
                }`}
              >
                {formatNumber(item.amount)}g
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm text-violet-100">
            この温度の飽和水蒸気量: <span className="font-bold">{formatNumber(saturation)} g</span>
            <br />
            実際の水蒸気量: <span className="font-bold">{formatNumber(state.vaporAmount)} g</span>
            <br />
            湿度: <span className="font-bold">{formatNumber(humidityRatio)}%</span>
            <br />
            状態: <span className="font-bold">{cloudReady ? '飽和してくもり始める' : 'まだ飽和していない'}</span>
          </div>
        </div>
      )
    }

    if (state.kind === 'earth-column' && currentRound.kind === 'earth-column') {
      return (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-200">段を選んで入れる</div>
          <div className="grid grid-cols-3 gap-2">
            {(['上', '中', '下'] as const).map((label, index) => (
              <button
                key={label}
                onClick={() => updateState(currentState => currentState.kind !== 'earth-column' ? currentState : ({ ...currentState, activeSlot: index as 0 | 1 | 2 }))}
                className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                  state.activeSlot === index
                    ? 'border-teal-300 bg-teal-500/20 text-white'
                    : 'border-white/10 bg-slate-950/30 text-slate-300'
                }`}
              >
                {label}
                <div className="mt-1 text-xs font-normal text-slate-400">
                  {getColumnOption(currentRound, state.slots[index])?.label ?? '未設定'}
                </div>
              </button>
            ))}
          </div>
          <div className="text-sm font-semibold text-slate-200">地層を選ぶ</div>
          <div className="grid gap-2">
            {currentRound.options.map(option => (
              <button
                key={option.key}
                onClick={() => updateState(currentState => {
                  if (currentState.kind !== 'earth-column') return currentState
                  const nextSlots = [...currentState.slots] as [string | null, string | null, string | null]
                  nextSlots.forEach((slot, index) => {
                    if (slot === option.key) nextSlots[index] = null
                  })
                  nextSlots[currentState.activeSlot] = option.key
                  const nextActiveSlot = currentState.activeSlot < 2 ? ((currentState.activeSlot + 1) as 0 | 1 | 2) : currentState.activeSlot
                  return {
                    ...currentState,
                    slots: nextSlots,
                    activeSlot: nextActiveSlot,
                  }
                })}
                className="rounded-2xl border px-4 py-3 text-left transition"
                style={{
                  borderColor: state.slots.includes(option.key) ? `${meta?.accent ?? '#2dd4bf'}66` : 'var(--border)',
                  background: state.slots.includes(option.key) ? `${meta?.accent ?? '#2dd4bf'}20` : 'var(--card-gradient-base-soft)',
                }}
              >
                <div className="font-semibold text-white">{option.label}</div>
                <div className="mt-1 text-xs leading-6 text-slate-400">{option.detail}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => updateState(currentState => currentState.kind !== 'earth-column' ? currentState : ({
                ...currentState,
                slots: currentState.slots.map((slot, index) => index === currentState.activeSlot ? null : slot) as [string | null, string | null, string | null],
              }))}
              className="btn-ghost !px-4 !py-2"
            >
              今の段をクリア
            </button>
            <button
              onClick={() => updateState(currentState => currentState.kind !== 'earth-column' ? currentState : ({ ...currentState, slots: [null, null, null], activeSlot: 0 }))}
              className="btn-secondary !px-4 !py-2"
            >
              3段ともリセット
            </button>
          </div>
        </div>
      )
    }

    if (state.kind === 'physics-motion-graph') {
      const motionRound = currentRound.kind === 'physics-motion-graph' ? currentRound : null
      const motion = motionRound ? describeMotion(motionRound, state) : null
      return (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-200">加速度を選ぶ</div>
          <div className="grid grid-cols-4 gap-2">
            {[-1, 0, 1, 2].map(value => (
              <button
                key={value}
                onClick={() => updateState(currentState => currentState.kind !== 'physics-motion-graph' ? currentState : ({ ...currentState, acceleration: value }))}
                className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                  state.acceleration === value
                    ? 'border-sky-300 bg-sky-500/20 text-white'
                    : 'border-white/10 bg-slate-950/30 text-slate-300'
                }`}
              >
                {value} m/s2
              </button>
            ))}
          </div>
          <div className="text-sm font-semibold text-slate-200">時刻を見る</div>
          <div className="flex gap-2">
            <button onClick={() => updateState(currentState => currentState.kind !== 'physics-motion-graph' ? currentState : ({ ...currentState, time: clamp(currentState.time - 1, 0, 4) }))} className="btn-ghost !px-4 !py-2">-1秒</button>
            <button onClick={() => updateState(currentState => currentState.kind !== 'physics-motion-graph' ? currentState : ({ ...currentState, time: clamp(currentState.time + 1, 0, 4) }))} className="btn-secondary !px-4 !py-2">+1秒</button>
            <button onClick={() => updateState(currentState => currentState.kind !== 'physics-motion-graph' ? currentState : ({ ...currentState, time: 0 }))} className="btn-ghost !px-4 !py-2">0秒へ</button>
          </div>
          {motion && (
            <div className="rounded-2xl border border-sky-300/20 bg-sky-500/10 p-3 text-sm text-sky-100">
              速さ: <span className="font-bold">{formatNumber(motion.currentVelocity)} m/s</span>
              <span className="mx-2 text-sky-300/60">/</span>
              位置: <span className="font-bold">{formatNumber(motion.currentPosition)} m</span>
            </div>
          )}
        </div>
      )
    }

    return null
  }

  const handleOverlayPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isController || tool !== 'pen') return
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const nextStroke: WhiteboardStroke = {
      id: createStrokeId(),
      color: '#fef08a',
      width: 4,
      points: [getCanvasPoint(canvas, event.nativeEvent)],
    }
    drawingStrokeRef.current = nextStroke
    setStrokes(currentStrokes => [...currentStrokes, nextStroke])
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleOverlayPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isController || tool !== 'pen' || !drawingStrokeRef.current) return
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const nextPoint = getCanvasPoint(canvas, event.nativeEvent)
    drawingStrokeRef.current = {
      ...drawingStrokeRef.current,
      points: [...drawingStrokeRef.current.points, nextPoint],
    }
    const currentStroke = drawingStrokeRef.current
    setStrokes(currentStrokes => currentStrokes.map(stroke => stroke.id === currentStroke.id ? currentStroke : stroke))
  }

  const handleOverlayPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isController || tool !== 'pen') return
    drawingStrokeRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const modeCards = getFieldModeGroups()

  if (loading) {
    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <div className="card text-slate-400">オンライン実験ラボを準備中...</div>
      </div>
    )
  }

  if (!isController && (!viewerMode || !viewerSnapshot || !meta || !currentRound || !effectiveState)) {
    const stale = room?.is_live && !isOnlineLabRoomLive(room)
    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <div className="hero-card science-surface w-full max-w-3xl p-6 sm:p-7 text-center">
          <ScienceBackdrop />
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-sky-200">Online Lab</div>
          <h1 className="mt-4 font-display text-4xl text-white">オンライン実験ラボ</h1>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            {stale
              ? `管理者の配信が ${Math.round(ONLINE_LAB_STALE_MS / 1000)} 秒以上更新されていません。再開されると自動で反映されます。`
              : 'いまは配信中の実験ラボがありません。管理者が開始すると、そのまま閲覧モードで入れます。'}
          </p>
          {error && (
            <div className="mt-4 rounded-[20px] border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          )}
          <div className={`mt-6 grid gap-3 ${onOpenTerritory ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <button onClick={onBack} className="btn-primary">ホームへ</button>
            {onOpenTerritory && (
              <button onClick={onOpenTerritory} className="btn-secondary">陣取りへ</button>
            )}
            <button onClick={() => logout()} className="btn-ghost">ログアウト</button>
          </div>
        </div>
      </div>
    )
  }

  if (isController && !broadcasting && (!room || !isOnlineLabRoomLive(room) || room.controller_student_id !== studentId)) {
    return (
      <div className="page-shell page-shell-dashboard">
        <div className="hero-card science-surface p-5 sm:p-6 lg:p-8 anim-fade-up">
          <ScienceBackdrop />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold tracking-[0.18em] uppercase text-emerald-200">Online Lab Control</div>
              <h1 className="mt-4 font-display text-4xl text-white">オンライン実験ラボ</h1>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                先生が操作するラボを、そのまま全員に配信できます。右のホワイトボードも一緒に共有され、生徒側は閲覧専用で同じ画面を見られます。
              </p>
            </div>
            <div className={`grid gap-3 ${onOpenTerritory ? 'sm:grid-cols-3 lg:w-[520px]' : 'sm:grid-cols-2 lg:w-[340px]'}`}>
              <button onClick={onBack} className="btn-secondary w-full">ホームへ</button>
              {onOpenTerritory && (
                <button onClick={onOpenTerritory} className="btn-primary w-full">陣取りへ</button>
              )}
              <button onClick={() => logout()} className="btn-ghost w-full">ログアウト</button>
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-[20px] border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="subcard p-5">
              <div className="text-sm font-semibold text-white">配信するラボを選ぶ</div>
              <div className="mt-4 space-y-5">
                {modeCards.map(group => (
                  <div key={group.field}>
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">{group.field}</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {group.modes.map(mode => {
                        const modeMeta = SCIENCE_WORKBENCH_MODE_META[mode]
                        const selected = selectedMode === mode
                        return (
                          <button
                            key={mode}
                            onClick={() => setSelectedMode(mode)}
                            className="rounded-[24px] border p-4 text-left transition"
                            style={{
                              borderColor: selected ? `${modeMeta.accent}66` : 'rgba(148, 163, 184, 0.16)',
                              background: selected
                                ? `linear-gradient(135deg, ${modeMeta.accent}1f, var(--card-gradient-base))`
                                : 'var(--card-gradient-base-soft)',
                              boxShadow: selected ? `0 0 0 1px ${modeMeta.accent}33 inset` : 'none',
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: modeMeta.accent }}>
                                  {modeMeta.badge}
                                </div>
                                <div className="mt-2 font-display text-2xl text-white">{modeMeta.title}</div>
                              </div>
                              <div className="text-3xl">{modeMeta.icon}</div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-300">{modeMeta.description}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="subcard p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">選択中</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="text-4xl">{SCIENCE_WORKBENCH_MODE_META[selectedMode].icon}</div>
                <div>
                  <div className="font-display text-3xl text-white">{SCIENCE_WORKBENCH_MODE_META[selectedMode].title}</div>
                  <div className="mt-1 text-sm text-slate-400">{SCIENCE_WORKBENCH_MODE_META[selectedMode].field}</div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-300">{SCIENCE_WORKBENCH_MODE_META[selectedMode].description}</p>

              <div className="mt-5 rounded-[20px] border border-sky-300/16 bg-sky-300/5 p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">Entry Password</div>
                <p className="mt-1 text-[11px] text-slate-400">生徒が入室に使う5文字の合言葉</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={5}
                    value={entryPassword}
                    onChange={event => {
                      setEntryPassword(event.target.value.toUpperCase().slice(0, 5))
                      setEntryPasswordSaved(false)
                    }}
                    placeholder="ABCDE"
                    className="input-surface text-center font-display text-lg tracking-[0.3em] uppercase"
                    style={{ flex: 1, maxWidth: '180px' }}
                  />
                  <button
                    className="btn-secondary text-sm !px-3 !py-2"
                    disabled={entryPassword.length !== 5}
                    style={{ opacity: entryPassword.length !== 5 ? 0.5 : 1 }}
                    onClick={() => {
                      void updateOnlineLabEntryPassword(entryPassword).then(ok => {
                        if (ok) setEntryPasswordSaved(true)
                      })
                    }}
                  >
                    {entryPasswordSaved ? '保存済み' : '保存'}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <button
                  onClick={() => void startBroadcast(selectedMode)}
                  className="btn-primary w-full"
                  disabled={entryPassword.length !== 5}
                  style={{ opacity: entryPassword.length !== 5 ? 0.6 : 1 }}
                >
                  このラボを配信開始
                </button>
                {entryPassword.length !== 5 && (
                  <p className="text-center text-xs text-amber-300">配信開始には5文字の合言葉を設定してください</p>
                )}
                <div className="rounded-[20px] border border-white/10 bg-slate-950/30 p-4 text-sm leading-7 text-slate-300">
                  生徒はマイページの <span className="font-semibold text-white">オンライン</span> ボタンから合言葉を入力して入室できます。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!meta || !currentRound || !effectiveState || !effectiveMode) {
    return null
  }

  const disabled = !isController || !broadcasting || phase !== 'adjusting'
  const controllerName = room?.controller_nickname ?? nickname ?? '先生'

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
              <span>Online Lab</span>
              <span>{isController ? 'controller' : 'viewer'}</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="text-4xl">{meta.icon}</div>
              <div>
                <h1 className="font-display text-3xl text-white sm:text-4xl">{meta.title}</h1>
                <p className="mt-1 text-sm text-slate-300 sm:text-base">
                  {isController
                    ? '先生が操作し、全員の画面へリアルタイムで反映されるオンライン配信モードです。'
                    : `${controllerName} が操作しているラボを閲覧しています。`}
                </p>
              </div>
            </div>
          </div>

          <div className={`grid gap-3 ${onOpenTerritory ? 'grid-cols-3 lg:min-w-[540px]' : 'grid-cols-2 lg:min-w-[360px]'}`}>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">進行</div>
              <div className="mt-2 font-display text-2xl text-white">
                {(isController ? current : viewerSnapshot?.current ?? 0) + 1}
                <span className="text-base text-slate-400"> / {rounds.length}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">round</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">正解</div>
              <div className="mt-2 font-display text-2xl" style={{ color: meta.accent }}>{effectiveScore}</div>
              <div className="mt-1 text-xs text-slate-500">{effectivePhase}</div>
            </div>
            {isController ? (
              <button onClick={() => void endBroadcast()} className="btn-secondary w-full">配信終了</button>
            ) : (
              <button onClick={onBack} className="btn-secondary w-full">ホームへ</button>
            )}
            {onOpenTerritory && (
              <button onClick={onOpenTerritory} className="btn-primary w-full">陣取りへ</button>
            )}
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

      {error && (
        <div className="mb-4 rounded-[20px] border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.16fr_0.84fr]">
        <div className="card anim-fade-up">
          <div className="relative mx-auto w-full max-w-[900px]">
            <canvas
              ref={baseCanvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="block w-full rounded-[28px]"
            />
            <canvas
              ref={whiteboardCanvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="absolute inset-0 h-full w-full rounded-[28px]"
              style={{
                pointerEvents: isController && tool === 'pen' ? 'auto' : 'none',
                cursor: isController && tool === 'pen' ? 'crosshair' : 'default',
              }}
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handleOverlayPointerMove}
              onPointerUp={handleOverlayPointerUp}
              onPointerCancel={handleOverlayPointerUp}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card anim-fade-up">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-200">{currentRound.prompt}</div>
              {!isController && (
                <div className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  live
                </div>
              )}
            </div>
            <p className="mt-2 text-sm leading-7 text-slate-400">{currentRound.supportText}</p>
          </div>

          <div className={`card anim-fade-up ${disabled ? 'opacity-90' : ''}`}>
            {renderControls()}

            {isController && broadcasting && (
              <div className="mt-4 flex gap-2">
                <button onClick={handleSubmit} className="btn-primary w-full" disabled={disabled}>判定する</button>
                <button onClick={restart} className="btn-ghost w-full">最初から</button>
              </div>
            )}
          </div>

          <div className="card anim-fade-up">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-200">今回の判定</div>
              {isController && broadcasting && phase === 'result' && (
                <button onClick={handleNext} className="btn-secondary text-sm !px-4 !py-2.5">次へ</button>
              )}
            </div>

            <div
              className="mt-4 rounded-[24px] border p-4"
              style={{
                borderColor: effectiveFeedback?.correct ? 'rgba(74, 222, 128, 0.28)' : 'rgba(248, 113, 113, 0.24)',
                background: effectiveFeedback
                  ? effectiveFeedback.correct
                    ? 'rgba(34, 197, 94, 0.08)'
                    : 'rgba(127, 29, 29, 0.12)'
                  : 'var(--card-gradient-base-soft)',
              }}
            >
              <div className="text-lg font-bold text-white">
                {effectiveFeedback?.message ?? 'まだ判定していません'}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {effectiveFeedback?.detail ?? currentRound.hint}
              </p>
            </div>
          </div>

          <div className="card anim-fade-up">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-200">ホワイトボード</div>
              <div className="text-xs text-slate-500">{effectiveStrokes.length} stroke</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {isController && (
                <>
                  <button
                    onClick={() => setTool(currentTool => currentTool === 'pen' ? 'none' : 'pen')}
                    className={tool === 'pen' ? 'btn-primary !px-4 !py-2.5' : 'btn-secondary !px-4 !py-2.5'}
                  >
                    {tool === 'pen' ? '書き込み中' : '書く'}
                  </button>
                  <button onClick={clearBoard} className="btn-ghost !px-4 !py-2.5">全部消す</button>
                </>
              )}
              {!isController && (
                <div className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  閲覧専用
                </div>
              )}
            </div>
            <textarea
              value={effectiveMemoText}
              onChange={event => {
                if (!isController) return
                setMemoText(event.target.value)
              }}
              readOnly={!isController}
              placeholder={isController ? 'ここに補足メモを書けます。生徒側にもそのまま表示されます。' : '管理者のメモがここに表示されます。'}
              className="mt-4 min-h-[140px] w-full rounded-[24px] border border-white/10 bg-slate-950/40 px-4 py-3 text-sm leading-7 text-slate-100 outline-none"
            />
          </div>

          <div className="card anim-fade-up">
            <div className="text-sm font-semibold text-slate-200">共有状況</div>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-400">
              <li>管理者の操作と判定は、配信ルームへ自動で保存されています。</li>
              <li>ホワイトボードの線とメモは、生徒側へリアルタイムで共有されます。</li>
              <li>生徒側は閲覧専用なので、内容が勝手にずれることはありません。</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {effectiveHistory.map((correct, index) => (
                <div
                  key={`online-history-${index}`}
                  className="h-3 w-3 rounded-full"
                  style={{ background: correct ? '#22c55e' : '#ef4444' }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
