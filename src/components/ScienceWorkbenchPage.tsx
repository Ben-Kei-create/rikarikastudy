'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { getBadgeRarityLabel } from '@/lib/badges'
import { getLevelInfo } from '@/lib/engagement'
import LevelUnlockNotice from '@/components/LevelUnlockNotice'
import {
  CHEMISTRY_WORKBENCH_MODES,
  EARTH_WORKBENCH_MODES,
  getScienceWorkbenchRounds,
  MotionWorkbenchRound,
  PHYSICS_WORKBENCH_MODES,
  SATURATED_VAPOR_TABLE,
  ScienceWorkbenchMeta,
  ScienceWorkbenchMode,
  ScienceWorkbenchRound,
  SCIENCE_WORKBENCH_MODE_META,
} from '@/lib/scienceWorkbench'
import { recordStudySession, StudyRewardSummary } from '@/lib/studyRewards'

declare global {
  interface Window {
    render_game_to_text?: () => string
    advanceTime?: (ms: number) => void | Promise<void>
  }
}

type Phase = 'adjusting' | 'result' | 'finished'

type WorkbenchState =
  | { kind: 'chem-density'; mass: number; volume: number }
  | { kind: 'chem-concentration'; soluteMass: number; waterMass: number }
  | { kind: 'earth-humidity'; temperature: number }
  | { kind: 'physics-motion-graph'; acceleration: number; time: number }

interface RoundFeedback {
  correct: boolean
  message: string
  detail: string
}

const CANVAS_WIDTH = 900
const CANVAS_HEIGHT = 560

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function formatNumber(value: number, digits = 1) {
  return roundTo(value, digits).toFixed(digits)
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function createGradient(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, from: string, to: string) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  return gradient
}

function drawBackground(ctx: CanvasRenderingContext2D, meta: ScienceWorkbenchMeta) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = createGradient(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, '#101827', '#172554')
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.fillStyle = `${meta.accent}22`
  ctx.beginPath()
  ctx.arc(120, 110, 88, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(776, 126, 70, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = `${meta.accent}44`
  ctx.lineWidth = 1
  for (let x = 32; x <= CANVAS_WIDTH - 32; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 40)
    ctx.lineTo(x, CANVAS_HEIGHT - 40)
    ctx.stroke()
  }

  ctx.fillStyle = '#f8fafc'
  ctx.font = '700 30px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(meta.title, 42, 48)
  ctx.fillStyle = 'rgba(226, 232, 240, 0.8)'
  ctx.font = '500 15px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(meta.description, 42, 74)
}

function getInitialState(round: ScienceWorkbenchRound): WorkbenchState {
  switch (round.kind) {
    case 'chem-density':
      return { kind: round.kind, mass: round.startMass, volume: round.startVolume }
    case 'chem-concentration':
      return { kind: round.kind, soluteMass: round.startSoluteMass, waterMass: round.startWaterMass }
    case 'earth-humidity':
      return { kind: round.kind, temperature: round.startTemperature }
    case 'physics-motion-graph':
      return { kind: round.kind, acceleration: round.startAcceleration, time: 2 }
    default:
      return { kind: 'chem-density', mass: 40, volume: 20 }
  }
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

function describeMotion(round: MotionWorkbenchRound, state: Extract<WorkbenchState, { kind: 'physics-motion-graph' }>) {
  const currentVelocity = Math.max(0, round.initialVelocity + state.acceleration * state.time)
  const currentPosition = round.initialVelocity * state.time + 0.5 * state.acceleration * state.time * state.time
  return {
    currentVelocity,
    currentPosition,
  }
}

function evaluateRound(round: ScienceWorkbenchRound, state: WorkbenchState): RoundFeedback {
  if (round.kind === 'chem-density' && state.kind === 'chem-density') {
    const density = getCurrentDensity(state)
    const correct = Math.abs(density - round.targetDensity) < 0.001
    return {
      correct,
      message: correct ? '◯ 密度ぴったり' : '× まだちがう',
      detail: correct
        ? `${state.mass}g ÷ ${state.volume}cm3 = ${formatNumber(density)} g/cm3。${round.explanation}`
        : `今は ${state.mass}g ÷ ${state.volume}cm3 = ${formatNumber(density)} g/cm3。${round.hint}`,
    }
  }

  if (round.kind === 'chem-concentration' && state.kind === 'chem-concentration') {
    const concentration = getCurrentConcentration(state)
    const correct = Math.abs(concentration - round.targetPercent) < 0.001
    const total = state.soluteMass + state.waterMass
    return {
      correct,
      message: correct ? '◯ 濃度ぴったり' : '× まだちがう',
      detail: correct
        ? `${state.soluteMass}g ÷ ${total}g × 100 = ${formatNumber(concentration)}%。${round.explanation}`
        : `今は ${state.soluteMass}g ÷ ${total}g × 100 = ${formatNumber(concentration)}%。${round.hint}`,
    }
  }

  if (round.kind === 'earth-humidity' && state.kind === 'earth-humidity') {
    const saturation = getSaturatedAmount(state.temperature)
    const correct = state.temperature === round.targetTemperature
    return {
      correct,
      message: correct ? '◯ 露点に到達' : '× 温度を見直そう',
      detail: correct
        ? `${state.temperature}℃ の飽和水蒸気量は ${formatNumber(saturation)}g。${round.explanation}`
        : `今の ${state.temperature}℃ では飽和水蒸気量が ${formatNumber(saturation)}g です。${round.hint}`,
    }
  }

  if (round.kind === 'physics-motion-graph' && state.kind === 'physics-motion-graph') {
    const correct = state.acceleration === round.targetAcceleration
    return {
      correct,
      message: correct ? '◯ グラフ一致' : '× 加速度を見直そう',
      detail: correct
        ? `加速度 ${state.acceleration} m/s2 にすると狙ったグラフになります。${round.explanation}`
        : `今は加速度 ${state.acceleration} m/s2 です。${round.hint}`,
    }
  }

  return {
    correct: false,
    message: '× まだちがう',
    detail: '状態を見直してみよう。',
  }
}

function drawDensityScene(
  ctx: CanvasRenderingContext2D,
  round: Extract<ScienceWorkbenchRound, { kind: 'chem-density' }>,
  state: Extract<WorkbenchState, { kind: 'chem-density' }>,
  accent: string
) {
  const density = getCurrentDensity(state)
  const blockSize = clamp(70 + state.volume * 2.2, 96, 190)
  const blockX = 110
  const blockY = 196
  const cylinderX = 510
  const cylinderY = 170
  const cylinderHeight = 250
  const waterHeight = clamp((state.volume / 60) * 180, 28, 190)

  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  drawRoundedRect(ctx, 60, 118, 340, 320, 28)
  ctx.fill()
  drawRoundedRect(ctx, 450, 118, 380, 320, 28)
  ctx.fill()

  ctx.fillStyle = `${accent}22`
  drawRoundedRect(ctx, 94, 146, 112, 36, 16)
  ctx.fill()
  ctx.fillStyle = '#fed7aa'
  ctx.font = '700 16px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('密度 = 質量 ÷ 体積', 110, 170)

  ctx.fillStyle = createGradient(ctx, blockX, blockY, blockSize, blockSize, '#fb923c', '#9a3412')
  drawRoundedRect(ctx, blockX, blockY, blockSize, blockSize, 26)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = '#fff7ed'
  ctx.font = '700 24px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(`${state.mass} g`, 116, 424)
  ctx.fillText(`${state.volume} cm3`, 116, 452)

  ctx.strokeStyle = 'rgba(191, 219, 254, 0.75)'
  ctx.lineWidth = 4
  drawRoundedRect(ctx, cylinderX, cylinderY, 150, cylinderHeight, 28)
  ctx.stroke()
  ctx.fillStyle = 'rgba(96, 165, 250, 0.36)'
  drawRoundedRect(ctx, cylinderX + 8, cylinderY + cylinderHeight - waterHeight - 8, 134, waterHeight, 22)
  ctx.fill()
  ctx.fillStyle = '#dbeafe'
  ctx.font = '700 18px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('体積メモリ', cylinderX + 182, cylinderY + 24)
  ctx.font = '500 15px "Zen Kaku Gothic New", sans-serif'
  ;[10, 20, 30, 40, 50].forEach((mark, index) => {
    const y = cylinderY + cylinderHeight - 20 - index * 36
    ctx.strokeStyle = 'rgba(219, 234, 254, 0.4)'
    ctx.beginPath()
    ctx.moveTo(cylinderX + 170, y)
    ctx.lineTo(cylinderX + 212, y)
    ctx.stroke()
    ctx.fillText(`${mark}cm3`, cylinderX + 222, y + 5)
  })

  ctx.fillStyle = '#fff7ed'
  ctx.font = '700 26px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(`目標 ${formatNumber(round.targetDensity)} g/cm3`, 80, 132)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`現在 ${formatNumber(density)} g/cm3`, 478, 134)
}

function drawConcentrationScene(
  ctx: CanvasRenderingContext2D,
  round: Extract<ScienceWorkbenchRound, { kind: 'chem-concentration' }>,
  state: Extract<WorkbenchState, { kind: 'chem-concentration' }>,
  accent: string
) {
  const concentration = getCurrentConcentration(state)
  const total = state.soluteMass + state.waterMass
  const fillHeight = clamp((total / 130) * 210, 40, 220)
  const soluteRatio = total > 0 ? state.soluteMass / total : 0

  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  drawRoundedRect(ctx, 60, 118, 300, 320, 28)
  ctx.fill()
  drawRoundedRect(ctx, 400, 118, 430, 320, 28)
  ctx.fill()

  ctx.fillStyle = `${accent}1f`
  drawRoundedRect(ctx, 88, 142, 160, 42, 18)
  ctx.fill()
  ctx.fillStyle = '#fecdd3'
  ctx.font = '700 18px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('溶質 ÷ 溶液 × 100', 104, 169)

  ctx.strokeStyle = 'rgba(191, 219, 254, 0.7)'
  ctx.lineWidth = 4
  drawRoundedRect(ctx, 485, 158, 190, 240, 34)
  ctx.stroke()
  ctx.fillStyle = 'rgba(125, 211, 252, 0.28)'
  drawRoundedRect(ctx, 495, 388 - fillHeight, 170, fillHeight, 28)
  ctx.fill()
  ctx.fillStyle = 'rgba(251, 113, 133, 0.8)'
  for (let index = 0; index < Math.max(4, Math.round(soluteRatio * 30)); index += 1) {
    const x = 515 + (index % 6) * 24
    const y = 370 - (index * 11) % Math.max(34, fillHeight - 20)
    ctx.beginPath()
    ctx.arc(x, y, 6, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 24px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(`目標 ${formatNumber(round.targetPercent)}%`, 80, 132)
  ctx.fillText(`現在 ${formatNumber(concentration)}%`, 416, 132)

  ctx.font = '700 22px "Zen Kaku Gothic New", sans-serif'
  ctx.fillStyle = '#fff1f2'
  ctx.fillText(`溶質 ${state.soluteMass}g`, 98, 252)
  ctx.fillText(`水 ${state.waterMass}g`, 98, 296)
  ctx.fillText(`溶液 ${total}g`, 98, 340)
}

function drawHumidityScene(
  ctx: CanvasRenderingContext2D,
  round: Extract<ScienceWorkbenchRound, { kind: 'earth-humidity' }>,
  state: Extract<WorkbenchState, { kind: 'earth-humidity' }>,
  accent: string
) {
  const graphX = 86
  const graphY = 132
  const graphWidth = 520
  const graphHeight = 300
  const currentSaturation = getSaturatedAmount(state.temperature)
  const maxAmount = SATURATED_VAPOR_TABLE[SATURATED_VAPOR_TABLE.length - 1].amount
  const cloudReady = round.vaporAmount >= currentSaturation

  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  drawRoundedRect(ctx, 50, 110, 590, 340, 28)
  ctx.fill()
  drawRoundedRect(ctx, 670, 124, 180, 286, 28)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  for (let index = 0; index <= 5; index += 1) {
    const y = graphY + graphHeight - (graphHeight / 5) * index
    ctx.beginPath()
    ctx.moveTo(graphX, y)
    ctx.lineTo(graphX + graphWidth, y)
    ctx.stroke()
  }

  ctx.strokeStyle = accent
  ctx.lineWidth = 4
  ctx.beginPath()
  SATURATED_VAPOR_TABLE.forEach((item, index) => {
    const x = graphX + (item.temperature / 40) * graphWidth
    const y = graphY + graphHeight - (item.amount / maxAmount) * graphHeight
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 24px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(`水蒸気 ${formatNumber(round.vaporAmount)} g`, 82, 98)
  ctx.fillText(`温度 ${state.temperature}℃`, 680, 160)

  ctx.strokeStyle = '#f8fafc'
  ctx.setLineDash([7, 7])
  const tempX = graphX + (state.temperature / 40) * graphWidth
  ctx.beginPath()
  ctx.moveTo(tempX, graphY)
  ctx.lineTo(tempX, graphY + graphHeight)
  ctx.stroke()

  const vaporY = graphY + graphHeight - (round.vaporAmount / maxAmount) * graphHeight
  ctx.beginPath()
  ctx.moveTo(graphX, vaporY)
  ctx.lineTo(graphX + graphWidth, vaporY)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = cloudReady ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.arc(742, 262, 34, Math.PI * 0.9, Math.PI * 1.9)
  ctx.arc(782, 242, 40, Math.PI, Math.PI * 2)
  ctx.arc(816, 266, 28, Math.PI * 1.1, Math.PI * 1.95)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = cloudReady ? '#e9d5ff' : '#bfdbfe'
  ctx.font = '700 18px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(cloudReady ? 'くもり始める' : 'まだ余裕あり', 694, 334)
  ctx.font = '500 15px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(`飽和水蒸気量 ${formatNumber(currentSaturation)}g`, 686, 364)
}

function drawGraphAxes(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, xLabel: string, yLabel: string) {
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y + height)
  ctx.lineTo(x + width, y + height)
  ctx.stroke()
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '500 14px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(yLabel, x - 4, y - 8)
  ctx.fillText(xLabel, x + width - 6, y + height + 22)
}

function drawMotionScene(
  ctx: CanvasRenderingContext2D,
  round: Extract<ScienceWorkbenchRound, { kind: 'physics-motion-graph' }>,
  state: Extract<WorkbenchState, { kind: 'physics-motion-graph' }>,
  accent: string
) {
  const { currentPosition, currentVelocity } = describeMotion(round, state)
  const trackX = 78
  const trackY = 150
  const trackWidth = 720
  const graphWidth = 300
  const graphHeight = 180
  const graphY = 320
  const cartX = trackX + clamp((currentPosition / 28) * (trackWidth - 110), 0, trackWidth - 110)

  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  drawRoundedRect(ctx, 50, 116, 800, 320, 28)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(trackX, trackY)
  ctx.lineTo(trackX + trackWidth, trackY)
  ctx.stroke()

  ctx.fillStyle = createGradient(ctx, cartX, trackY - 56, 90, 54, '#60a5fa', '#1d4ed8')
  drawRoundedRect(ctx, cartX, trackY - 56, 90, 54, 18)
  ctx.fill()
  ctx.fillStyle = '#dbeafe'
  ctx.beginPath()
  ctx.arc(cartX + 22, trackY, 10, 0, Math.PI * 2)
  ctx.arc(cartX + 68, trackY, 10, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 24px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(`加速度 ${state.acceleration} m/s2`, 72, 94)
  ctx.fillText(`時間 ${state.time} s`, 362, 94)
  ctx.fillText(`速さ ${formatNumber(currentVelocity)} m/s`, 588, 94)

  const graph1X = 86
  const graph2X = 444
  drawGraphAxes(ctx, graph1X, graphY, graphWidth, graphHeight, 't', 'x')
  drawGraphAxes(ctx, graph2X, graphY, graphWidth, graphHeight, 't', 'v')

  ctx.strokeStyle = accent
  ctx.lineWidth = 4
  ctx.beginPath()
  for (let step = 0; step <= 40; step += 1) {
    const time = (step / 40) * 4
    const position = round.initialVelocity * time + 0.5 * state.acceleration * time * time
    const x = graph1X + (time / 4) * graphWidth
    const y = graphY + graphHeight - clamp(position / 28, 0, 1) * graphHeight
    if (step === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  ctx.beginPath()
  for (let step = 0; step <= 40; step += 1) {
    const time = (step / 40) * 4
    const velocity = Math.max(0, round.initialVelocity + state.acceleration * time)
    const x = graph2X + (time / 4) * graphWidth
    const y = graphY + graphHeight - clamp(velocity / 12, 0, 1) * graphHeight
    if (step === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  const playhead1X = graph1X + (state.time / 4) * graphWidth
  const playhead1Y = graphY + graphHeight - clamp(currentPosition / 28, 0, 1) * graphHeight
  const playhead2X = graph2X + (state.time / 4) * graphWidth
  const playhead2Y = graphY + graphHeight - clamp(currentVelocity / 12, 0, 1) * graphHeight
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.arc(playhead1X, playhead1Y, 6, 0, Math.PI * 2)
  ctx.arc(playhead2X, playhead2Y, 6, 0, Math.PI * 2)
  ctx.fill()
}

function drawWorkbenchScene(
  ctx: CanvasRenderingContext2D,
  meta: ScienceWorkbenchMeta,
  round: ScienceWorkbenchRound,
  state: WorkbenchState
) {
  drawBackground(ctx, meta)
  switch (round.kind) {
    case 'chem-density':
      if (state.kind === round.kind) drawDensityScene(ctx, round, state, meta.accent)
      break
    case 'chem-concentration':
      if (state.kind === round.kind) drawConcentrationScene(ctx, round, state, meta.accent)
      break
    case 'earth-humidity':
      if (state.kind === round.kind) drawHumidityScene(ctx, round, state, meta.accent)
      break
    case 'physics-motion-graph':
      if (state.kind === round.kind) drawMotionScene(ctx, round, state, meta.accent)
      break
    default:
      break
  }
}

export default function ScienceWorkbenchPage({
  mode,
  onBack,
}: {
  mode: ScienceWorkbenchMode
  onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const meta = SCIENCE_WORKBENCH_MODE_META[mode]
  const rounds = useMemo(() => getScienceWorkbenchRounds(mode), [mode])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const phaseRef = useRef<Phase>('adjusting')
  const roundRef = useRef<ScienceWorkbenchRound>(rounds[0])
  const stateRef = useRef<WorkbenchState>(getInitialState(rounds[0]))
  const scoreRef = useRef(0)
  const feedbackRef = useRef<RoundFeedback | null>(null)

  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<Phase>('adjusting')
  const [score, setScore] = useState(0)
  const [state, setState] = useState<WorkbenchState>(getInitialState(rounds[0]))
  const [feedback, setFeedback] = useState<RoundFeedback | null>(null)
  const [history, setHistory] = useState<boolean[]>([])
  const [rewardSummary, setRewardSummary] = useState<StudyRewardSummary | null>(null)

  const round = rounds[current]
  const progress = rounds.length > 0 ? (current / rounds.length) * 100 : 0

  useEffect(() => {
    const initialRound = rounds[0]
    const initialState = getInitialState(initialRound)
    startedAtRef.current = Date.now()
    phaseRef.current = 'adjusting'
    roundRef.current = initialRound
    stateRef.current = initialState
    scoreRef.current = 0
    feedbackRef.current = null
    setCurrent(0)
    setPhase('adjusting')
    setScore(0)
    setState(initialState)
    setFeedback(null)
    setHistory([])
    setRewardSummary(null)
  }, [mode, rounds])

  useEffect(() => {
    roundRef.current = round
  }, [round])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    scoreRef.current = score
  }, [score])

  useEffect(() => {
    feedbackRef.current = feedback
  }, [feedback])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawWorkbenchScene(ctx, meta, round, state)
  }, [meta, round, state])

  useEffect(() => {
    window.render_game_to_text = () => {
      const currentRound = roundRef.current
      const currentState = stateRef.current
      const payload = {
        mode,
        phase: phaseRef.current,
        field: meta.field,
        round: current + 1,
        totalRounds: rounds.length,
        score: scoreRef.current,
        prompt: currentRound.prompt,
        supportText: currentRound.supportText,
        state: currentState,
        feedback: feedbackRef.current,
      }
      return JSON.stringify(payload, null, 2)
    }

    window.advanceTime = (ms: number) => {
      if (phaseRef.current !== 'adjusting') return
      const currentRound = roundRef.current
      if (currentRound.kind !== 'physics-motion-graph') return

      setState(currentState => {
        if (currentState.kind !== 'physics-motion-graph') return currentState
        return {
          ...currentState,
          time: clamp(roundTo(currentState.time + ms / 1000, 1), 0, 4),
        }
      })
    }

    return () => {
      delete window.render_game_to_text
      delete window.advanceTime
    }
  }, [current, meta.field, mode, rounds.length])

  const updateState = (updater: (currentState: WorkbenchState) => WorkbenchState) => {
    if (phase !== 'adjusting') return
    setState(currentState => updater(currentState))
  }

  const handleSubmit = () => {
    if (phase !== 'adjusting') return
    const nextFeedback = evaluateRound(round, state)
    if (nextFeedback.correct) {
      setScore(currentScore => currentScore + 1)
      setHistory(currentHistory => [...currentHistory, true])
    } else {
      setHistory(currentHistory => [...currentHistory, false])
    }
    setFeedback(nextFeedback)
    setPhase('result')
  }

  const saveSession = async (finalScore: number) => {
    if (studentId === null) return
    const durationSeconds = startedAtRef.current
      ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
      : 0

    const reward = await recordStudySession({
      studentId,
      field: meta.field,
      unit: meta.sessionUnit,
      totalQuestions: rounds.length,
      correctCount: finalScore,
      durationSeconds,
      sessionMode: meta.sessionMode,
    })

    setRewardSummary(reward)
  }

  const handleNext = async () => {
    if (current + 1 >= rounds.length) {
      const finalScore = scoreRef.current
      await saveSession(finalScore)
      setPhase('finished')
      return
    }

    const nextIndex = current + 1
    const nextRound = rounds[nextIndex]
    const nextState = getInitialState(nextRound)
    roundRef.current = nextRound
    stateRef.current = nextState
    setCurrent(nextIndex)
    setState(nextState)
    setFeedback(null)
    setPhase('adjusting')
  }

  const restart = () => {
    const firstRound = rounds[0]
    const firstState = getInitialState(firstRound)
    startedAtRef.current = Date.now()
    roundRef.current = firstRound
    stateRef.current = firstState
    phaseRef.current = 'adjusting'
    scoreRef.current = 0
    feedbackRef.current = null
    setCurrent(0)
    setPhase('adjusting')
    setScore(0)
    setState(firstState)
    setFeedback(null)
    setHistory([])
    setRewardSummary(null)
  }

  const renderControls = () => {
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

    if (state.kind === 'earth-humidity') {
      return (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-200">温度を選ぶ</div>
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
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm text-violet-100">
            この温度の飽和水蒸気量: <span className="font-bold">{formatNumber(getSaturatedAmount(state.temperature))} g</span>
          </div>
        </div>
      )
    }

    if (state.kind === 'physics-motion-graph') {
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
        </div>
      )
    }

    return null
  }

  if (phase === 'finished') {
    const rate = rounds.length > 0 ? Math.round((score / rounds.length) * 100) : 0
    const levelInfo = rewardSummary ? getLevelInfo(rewardSummary.totalXp) : null
    const message = rate >= 90
      ? '図と数値の関係がかなり安定しています。'
      : rate >= 70
        ? '考え方の筋がかなり見えてきました。'
        : 'もう一度動かしてみると、式とイメージがつながりやすくなります。'

    return (
      <div className="page-shell page-shell-dashboard flex items-center justify-center">
        <div className={`hero-card reward-card w-full max-w-3xl px-6 py-7 text-center sm:px-8 ${rewardSummary?.leveledUp ? 'is-level-up' : ''}`}>
          <div className="text-5xl">{meta.icon}</div>
          <div className="mt-4 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: meta.accent }}>
            {meta.badge}
          </div>
          <div className="mt-3 font-display text-4xl text-white">{score} / {rounds.length}</div>
          <div className="mt-2 text-2xl font-bold" style={{ color: meta.accent }}>{rate}%</div>
          <p className="mt-3 text-slate-300">{message}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {history.map((correct, index) => (
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
                <div className="mt-1 text-xs text-slate-500">ラボ学習の結果</div>
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
            <button onClick={restart} className="btn-secondary w-full">もう一度</button>
            <button onClick={onBack} className="btn-primary w-full">分野へ戻る</button>
            <button onClick={() => logout()} className="btn-ghost w-full">ログアウト</button>
          </div>
        </div>
      </div>
    )
  }

  const disabled = phase !== 'adjusting'

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
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">進行</div>
              <div className="mt-2 font-display text-2xl text-white">{current + 1}<span className="text-base text-slate-400"> / {rounds.length}</span></div>
              <div className="mt-1 text-xs text-slate-500">round</div>
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

      <div className="grid gap-4 lg:grid-cols-[1.16fr_0.84fr]">
        <div className="card anim-fade-up">
          <canvas
            ref={canvasRef}
            id="science-workbench-canvas"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="mx-auto block w-full max-w-[900px] rounded-[28px]"
          />
        </div>

        <div className="space-y-4">
          <div className="card anim-fade-up">
            <div className="text-sm font-semibold text-slate-200">{round.prompt}</div>
            <p className="mt-2 text-sm leading-7 text-slate-400">{round.supportText}</p>
          </div>

          <div className={`card anim-fade-up ${disabled ? 'opacity-90' : ''}`}>
            {renderControls()}

            <div className="mt-4 flex gap-2">
              <button onClick={handleSubmit} className="btn-primary w-full" disabled={disabled}>判定する</button>
              <button onClick={restart} className="btn-ghost w-full">最初から</button>
            </div>
          </div>

          <div className="card anim-fade-up">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-200">今回の判定</div>
              {phase === 'result' && (
                <button onClick={() => void handleNext()} className="btn-secondary text-sm !px-4 !py-2.5">次へ</button>
              )}
            </div>

            <div
              className="mt-4 rounded-[24px] border p-4"
              style={{
                borderColor: feedback?.correct ? 'rgba(74, 222, 128, 0.28)' : 'rgba(248, 113, 113, 0.24)',
                background: feedback
                  ? feedback.correct
                    ? 'rgba(34, 197, 94, 0.08)'
                    : 'rgba(127, 29, 29, 0.12)'
                  : 'rgba(15, 23, 42, 0.42)',
              }}
            >
              <div className="text-lg font-bold text-white">
                {feedback?.message ?? 'まだ判定していません'}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {feedback?.detail ?? round.hint}
              </p>
            </div>
          </div>

          <div className="card anim-fade-up">
            <div className="text-sm font-semibold text-slate-200">このラボのねらい</div>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-400">
              <li>式だけでなく、図と数値を同時に見て関係をつかみます。</li>
              <li>1ラウンドごとに手を動かして、目標の状態を自分で作ります。</li>
              <li>正解後の説明で、式とイメージがどうつながるかを確かめられます。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export {
  CHEMISTRY_WORKBENCH_MODES,
  EARTH_WORKBENCH_MODES,
  PHYSICS_WORKBENCH_MODES,
}
