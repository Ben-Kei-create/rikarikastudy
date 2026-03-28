'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import {
  CHEMISTRY_WORKBENCH_MODES,
  COLUMN_LAYER_OPTIONS,
  ColumnLayerOption,
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

declare global {
  interface Window {
    render_game_to_text?: () => string
    advanceTime?: (ms: number) => void | Promise<void>
  }
}

export type Phase = 'adjusting' | 'result' | 'finished'

export type WorkbenchState =
  | { kind: 'chem-density'; mass: number; volume: number }
  | { kind: 'chem-concentration'; soluteMass: number; waterMass: number }
  | {
      kind: 'chem-battery'
      negativeElectrode: 'zinc' | 'copper' | null
      electronDirection: 'zinc-to-copper' | 'copper-to-zinc' | null
      currentDirection: 'zinc-to-copper' | 'copper-to-zinc' | null
      zincChange: 'dissolve' | 'attach' | null
      copperChange: 'dissolve' | 'attach' | null
    }
  | { kind: 'earth-humidity'; temperature: number; vaporAmount: number }
  | { kind: 'earth-column'; slots: [string | null, string | null, string | null]; activeSlot: 0 | 1 | 2 }
  | { kind: 'physics-motion-graph'; acceleration: number; initialVelocity: number; time: number }

export interface RoundFeedback {
  correct: boolean
  message: string
  detail: string
}

export interface WorkbenchVisualOptions {
  clockMs?: number
  intensity?: number
}

export const CANVAS_WIDTH = 900
export const CANVAS_HEIGHT = 560

export function clamp(value: number, min: number, max: number) {
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

function drawLiquidFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fillHeight: number,
  colors: { from: string; to: string; highlight: string },
  visuals?: WorkbenchVisualOptions,
) {
  const clock = (visuals?.clockMs ?? 0) / 1000
  const intensity = visuals?.intensity ?? 1
  const waveAmplitude = Math.max(3, Math.min(10, 6 * intensity))
  const topY = y + height - fillHeight

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()

  const gradient = ctx.createLinearGradient(x, topY, x, y + height)
  gradient.addColorStop(0, colors.from)
  gradient.addColorStop(1, colors.to)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(x, y + height)
  ctx.lineTo(x, topY)
  for (let offset = 0; offset <= width; offset += 12) {
    const wave = Math.sin(clock * 2.4 + offset / 28) * waveAmplitude
    ctx.lineTo(x + offset, topY + wave)
  }
  ctx.lineTo(x + width, y + height)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = colors.highlight
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, topY)
  for (let offset = 0; offset <= width; offset += 12) {
    const wave = Math.sin(clock * 2.4 + offset / 28) * waveAmplitude
    ctx.lineTo(x + offset, topY + wave)
  }
  ctx.stroke()
  ctx.restore()
}

function drawFlowDots(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  toX: number,
  y: number,
  color: string,
  visuals?: WorkbenchVisualOptions,
) {
  const clock = (visuals?.clockMs ?? 0) / 1000
  const intensity = visuals?.intensity ?? 1
  const width = toX - fromX

  ctx.save()
  ctx.fillStyle = color
  for (let index = 0; index < 5; index += 1) {
    const progress = ((clock * 0.8 * intensity + index * 0.19) % 1 + 1) % 1
    const x = fromX + width * progress
    const bob = Math.sin(clock * 3 + index) * 4
    ctx.beginPath()
    ctx.arc(x, y + bob, 4.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
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

export function getInitialState(round: ScienceWorkbenchRound): WorkbenchState {
  switch (round.kind) {
    case 'chem-density':
      return { kind: round.kind, mass: round.startMass, volume: round.startVolume }
    case 'chem-concentration':
      return { kind: round.kind, soluteMass: round.startSoluteMass, waterMass: round.startWaterMass }
    case 'chem-battery':
      return {
        kind: round.kind,
        negativeElectrode: null,
        electronDirection: null,
        currentDirection: null,
        zincChange: null,
        copperChange: null,
      }
    case 'earth-humidity':
      return { kind: round.kind, temperature: round.startTemperature, vaporAmount: round.startVaporAmount }
    case 'earth-column':
      return { kind: round.kind, slots: [null, null, null], activeSlot: 0 }
    case 'physics-motion-graph':
      return { kind: round.kind, acceleration: round.startAcceleration, initialVelocity: round.initialVelocity, time: 2 }
    default:
      return { kind: 'chem-density', mass: 40, volume: 20 }
  }
}

function getSimInitialState(mode: ScienceWorkbenchMode): WorkbenchState {
  switch (mode) {
    case 'chem-density':
      return { kind: 'chem-density', mass: 40, volume: 20 }
    case 'chem-concentration':
      return { kind: 'chem-concentration', soluteMass: 10, waterMass: 90 }
    case 'chem-battery':
      return { kind: 'chem-battery', negativeElectrode: null, electronDirection: null, currentDirection: null, zincChange: null, copperChange: null }
    case 'earth-humidity':
      return { kind: 'earth-humidity', temperature: 20, vaporAmount: 9.4 }
    case 'earth-column':
      return { kind: 'earth-column', slots: [null, null, null], activeSlot: 0 }
    case 'physics-motion-graph':
      return { kind: 'physics-motion-graph', acceleration: 0, initialVelocity: 4, time: 2 }
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

function getHumidityRatio(vaporAmount: number, saturation: number) {
  if (saturation <= 0) return 0
  return Math.max(0, (vaporAmount / saturation) * 100)
}

function getColumnOption(round: Extract<ScienceWorkbenchRound, { kind: 'earth-column' }>, key: string | null) {
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
  return { currentVelocity, currentPosition }
}

function describeMotionSim(state: Extract<WorkbenchState, { kind: 'physics-motion-graph' }>) {
  const v0 = state.initialVelocity
  const currentVelocity = Math.max(0, v0 + state.acceleration * state.time)
  const currentPosition = v0 * state.time + 0.5 * state.acceleration * state.time * state.time
  return { currentVelocity, currentPosition }
}

export function evaluateRound(round: ScienceWorkbenchRound, state: WorkbenchState): RoundFeedback {
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

  if (round.kind === 'chem-battery' && state.kind === 'chem-battery') {
    const checks = [
      round.targetNegativeElectrode === null || state.negativeElectrode === round.targetNegativeElectrode,
      round.targetElectronDirection === null || state.electronDirection === round.targetElectronDirection,
      round.targetCurrentDirection === null || state.currentDirection === round.targetCurrentDirection,
      round.targetZincChange === null || state.zincChange === round.targetZincChange,
      round.targetCopperChange === null || state.copperChange === round.targetCopperChange,
    ]
    const correct = checks.every(Boolean)
    return {
      correct,
      message: correct ? '◯ 化学電池の流れが一致' : '× まだ整理できていない',
      detail: correct
        ? `${describeBatteryState(state)}。${round.explanation}`
        : `今の設定: ${describeBatteryState(state)}。${round.hint}`,
    }
  }

  if (round.kind === 'earth-humidity' && state.kind === 'earth-humidity') {
    const saturation = getSaturatedAmount(state.temperature)
    const ratio = getHumidityRatio(state.vaporAmount, saturation)
    const correct = state.temperature === round.targetTemperature && Math.abs(state.vaporAmount - round.vaporAmount) < 0.051
    return {
      correct,
      message: correct ? '◯ 露点の条件がそろった' : '× 温度と水蒸気量を見直そう',
      detail: correct
        ? `${state.temperature}℃ で飽和水蒸気量 ${formatNumber(saturation)}g と、水蒸気量 ${formatNumber(state.vaporAmount)}g が重なりました。${round.explanation}`
        : `今は ${state.temperature}℃ で飽和水蒸気量 ${formatNumber(saturation)}g、水蒸気量 ${formatNumber(state.vaporAmount)}g、湿度 ${formatNumber(ratio)}% です。${round.hint}`,
    }
  }

  if (round.kind === 'earth-column' && state.kind === 'earth-column') {
    const complete = state.slots.every(Boolean)
    const correct = complete && state.slots.every((slot, index) => slot === round.targetOrder[index])
    const selectedLabels = state.slots
      .map(slot => getColumnOption(round, slot)?.label ?? '未選択')
      .join(' / ')

    return {
      correct,
      message: correct ? '◯ 柱状図が完成' : '× まだ並びがちがう',
      detail: correct
        ? `上から ${selectedLabels}。${round.explanation}`
        : complete
          ? `今は上から ${selectedLabels}。${round.hint}`
          : `まだ空いている段があります。上から下へ3段すべて入れてみよう。${round.hint}`,
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
  state: Extract<WorkbenchState, { kind: 'chem-density' }>,
  accent: string,
  visuals?: WorkbenchVisualOptions,
  targetDensity?: number,
) {
  const clock = (visuals?.clockMs ?? 0) / 1000
  const intensity = visuals?.intensity ?? 1
  const density = getCurrentDensity(state)
  const blockSize = clamp(70 + state.volume * 2.2, 96, 190)
  const blockX = 110
  const blockY = 196 + Math.sin(clock * 2.2) * 6 * intensity
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
  drawLiquidFill(
    ctx,
    cylinderX + 8,
    cylinderY + 8,
    134,
    cylinderHeight - 16,
    waterHeight,
    {
      from: 'rgba(147, 197, 253, 0.58)',
      to: 'rgba(37, 99, 235, 0.34)',
      highlight: 'rgba(219, 234, 254, 0.8)',
    },
    visuals,
  )
  for (let index = 0; index < 5; index += 1) {
    const bubbleX = cylinderX + 26 + index * 20 + Math.sin(clock * 1.6 + index) * 4
    const bubbleY = cylinderY + cylinderHeight - ((clock * 42 + index * 36) % Math.max(54, waterHeight - 8))
    ctx.fillStyle = 'rgba(219, 234, 254, 0.52)'
    ctx.beginPath()
    ctx.arc(bubbleX, bubbleY, 4 + (index % 2), 0, Math.PI * 2)
    ctx.fill()
  }
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

  if (targetDensity !== undefined) {
    ctx.fillStyle = '#fff7ed'
    ctx.font = '700 26px "Zen Kaku Gothic New", sans-serif'
    ctx.fillText(`目標 ${formatNumber(targetDensity)} g/cm3`, 80, 132)
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 26px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(`現在 ${formatNumber(density)} g/cm3`, targetDensity !== undefined ? 478 : 80, 132)

  const gaugeX = 96
  const gaugeY = 468
  const gaugeWidth = 702
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  drawRoundedRect(ctx, gaugeX, gaugeY, gaugeWidth, 24, 12)
  ctx.fill()
  ctx.fillStyle = createGradient(ctx, gaugeX, gaugeY, gaugeWidth, 24, '#fdba74', '#fb923c')
  drawRoundedRect(ctx, gaugeX, gaugeY, clamp((density / 4) * gaugeWidth, 40, gaugeWidth), 24, 12)
  ctx.fill()
  if (targetDensity !== undefined) {
    const targetX = gaugeX + (targetDensity / 4) * gaugeWidth
    ctx.strokeStyle = '#fff7ed'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(targetX, gaugeY - 8)
    ctx.lineTo(targetX, gaugeY + 32)
    ctx.stroke()
  }

  if (targetDensity === undefined) {
    ctx.fillStyle = density < 1.0 ? '#86efac' : density < 2.0 ? '#fde68a' : '#fca5a5'
    ctx.font = '600 16px "Zen Kaku Gothic New", sans-serif'
    ctx.fillText(density < 1.0 ? '水に浮く' : density < 2.0 ? '水に沈む (軽い固体)' : '重い固体', gaugeX, gaugeY + 54)
  }
}

function drawConcentrationScene(
  ctx: CanvasRenderingContext2D,
  state: Extract<WorkbenchState, { kind: 'chem-concentration' }>,
  accent: string,
  visuals?: WorkbenchVisualOptions,
  targetPercent?: number,
) {
  const clock = (visuals?.clockMs ?? 0) / 1000
  const intensity = visuals?.intensity ?? 1
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
  drawLiquidFill(
    ctx,
    495,
    166,
    170,
    224,
    fillHeight,
    {
      from: 'rgba(186, 230, 253, 0.6)',
      to: 'rgba(59, 130, 246, 0.24)',
      highlight: 'rgba(224, 242, 254, 0.8)',
    },
    visuals,
  )
  ctx.fillStyle = 'rgba(251, 113, 133, 0.8)'
  for (let index = 0; index < Math.max(8, Math.round(soluteRatio * 42)); index += 1) {
    const orbit = 18 + (index % 5) * 18
    const x = 580 + Math.cos(clock * (0.7 + soluteRatio) + index) * orbit + Math.sin(clock * 0.9 + index) * 10
    const y = 340 - ((index * 19 + clock * 48 * intensity) % Math.max(36, fillHeight - 10))
    ctx.beginPath()
    ctx.arc(x, y, 4 + ((index + 1) % 3), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = `${accent}88`
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  const ratioY = 388 - clamp(soluteRatio * fillHeight, 0, fillHeight)
  ctx.moveTo(470, ratioY)
  ctx.lineTo(690, ratioY)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 24px "Zen Kaku Gothic New", sans-serif'
  if (targetPercent !== undefined) {
    ctx.fillText(`目標 ${formatNumber(targetPercent)}%`, 80, 132)
    ctx.fillText(`現在 ${formatNumber(concentration)}%`, 416, 132)
  } else {
    ctx.fillText(`現在 ${formatNumber(concentration)}%`, 80, 132)
    ctx.fillText(`溶液 ${total}g`, 416, 132)
  }

  ctx.font = '700 22px "Zen Kaku Gothic New", sans-serif'
  ctx.fillStyle = '#fff1f2'
  ctx.fillText(`溶質 ${state.soluteMass}g`, 98, 252)
  ctx.fillText(`水 ${state.waterMass}g`, 98, 296)
  ctx.fillText(`溶液 ${total}g`, 98, 340)
  ctx.fillStyle = '#fecdd3'
  ctx.font = '500 14px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('ピンク粒が多いほど濃く見えます', 98, 386)
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  dashed = false
) {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 4
  ctx.setLineDash(dashed ? [8, 6] : [])
  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - 14 * Math.cos(angle - Math.PI / 6), toY - 14 * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(toX - 14 * Math.cos(angle + Math.PI / 6), toY - 14 * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function fillPattern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pattern: 'pebbles' | 'sand' | 'lines' | 'bands' | 'ash'
) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 1.5

  if (pattern === 'pebbles') {
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        ctx.beginPath()
        ctx.arc(x + 24 + col * 32 + (row % 2) * 8, y + 18 + row * 18, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (pattern === 'sand') {
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 16; col += 1) {
        ctx.beginPath()
        ctx.arc(x + 14 + col * 12 + (row % 2) * 3, y + 12 + row * 14, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (pattern === 'lines') {
    for (let offset = 10; offset < height; offset += 14) {
      ctx.beginPath()
      ctx.moveTo(x + 10, y + offset)
      ctx.lineTo(x + width - 10, y + offset + (offset % 28 === 0 ? 4 : 0))
      ctx.stroke()
    }
  } else if (pattern === 'bands') {
    for (let offset = 0; offset < height; offset += 18) {
      ctx.fillRect(x, y + offset, width, 8)
    }
  } else {
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 12; col += 1) {
        const centerX = x + 18 + col * 18 + (row % 2) * 4
        const centerY = y + 14 + row * 22
        ctx.beginPath()
        ctx.moveTo(centerX - 4, centerY - 4)
        ctx.lineTo(centerX + 4, centerY + 4)
        ctx.moveTo(centerX + 4, centerY - 4)
        ctx.lineTo(centerX - 4, centerY + 4)
        ctx.stroke()
      }
    }
  }

  ctx.restore()
}

function drawBatteryScene(
  ctx: CanvasRenderingContext2D,
  state: Extract<WorkbenchState, { kind: 'chem-battery' }>,
  accent: string,
  visuals?: WorkbenchVisualOptions,
  bottomText?: string,
) {
  const clock = (visuals?.clockMs ?? 0) / 1000
  const intensity = visuals?.intensity ?? 1
  const leftPlateX = 246
  const rightPlateX = 584
  const plateY = 196
  const plateHeight = 190
  const topWireY = 128
  const activeFlow = state.negativeElectrode === 'zinc' && state.electronDirection === 'zinc-to-copper'
  const bulbGlow = activeFlow ? 0.7 + Math.sin(clock * 5) * 0.15 * intensity : 0.18

  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  drawRoundedRect(ctx, 64, 112, 772, 332, 28)
  ctx.fill()

  ctx.fillStyle = 'rgba(96, 165, 250, 0.18)'
  drawRoundedRect(ctx, 148, 208, 604, 184, 30)
  ctx.fill()
  ctx.fillStyle = '#bfdbfe'
  ctx.font = '600 16px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('うすい硫酸', 408, 416)

  ctx.strokeStyle = 'rgba(255,255,255,0.24)'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(leftPlateX + 22, plateY)
  ctx.lineTo(leftPlateX + 22, topWireY)
  ctx.lineTo(384, topWireY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(516, topWireY)
  ctx.lineTo(rightPlateX + 22, topWireY)
  ctx.lineTo(rightPlateX + 22, plateY)
  ctx.stroke()

  ctx.fillStyle = `rgba(251, 191, 36, ${bulbGlow})`
  ctx.beginPath()
  ctx.arc(450, 126, 66, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = createGradient(ctx, 380, 92, 140, 70, '#fde68a', '#f59e0b')
  drawRoundedRect(ctx, 380, 92, 140, 70, 20)
  ctx.fill()
  ctx.fillStyle = '#422006'
  ctx.font = '700 20px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('豆電球', 425, 135)

  ctx.fillStyle = createGradient(ctx, leftPlateX, plateY, 44, plateHeight, '#a1a1aa', '#52525b')
  drawRoundedRect(ctx, leftPlateX, plateY, 44, plateHeight, 14)
  ctx.fill()
  ctx.fillStyle = createGradient(ctx, rightPlateX, plateY, 44, plateHeight, '#fdba74', '#b45309')
  drawRoundedRect(ctx, rightPlateX, plateY, 44, plateHeight, 14)
  ctx.fill()

  ctx.fillStyle = '#e5e7eb'
  ctx.font = '700 20px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('亜鉛板', 206, 176)
  ctx.fillStyle = '#fed7aa'
  ctx.fillText('銅板', 560, 176)

  if (state.negativeElectrode === 'zinc') {
    ctx.fillStyle = `${accent}22`
    drawRoundedRect(ctx, 184, 134, 72, 32, 14)
    ctx.fill()
    ctx.fillStyle = '#fef3c7'
    ctx.font = '700 18px "Zen Kaku Gothic New", sans-serif'
    ctx.fillText('－極', 206, 156)
  } else if (state.negativeElectrode === 'copper') {
    ctx.fillStyle = `${accent}22`
    drawRoundedRect(ctx, 538, 134, 72, 32, 14)
    ctx.fill()
    ctx.fillStyle = '#fef3c7'
    ctx.font = '700 18px "Zen Kaku Gothic New", sans-serif'
    ctx.fillText('－極', 560, 156)
  }

  if (state.electronDirection === 'zinc-to-copper') {
    drawArrow(ctx, 280, topWireY - 12, 620, topWireY - 12, '#f8fafc')
    drawFlowDots(ctx, 290, 610, topWireY - 12, '#f8fafc', visuals)
  } else if (state.electronDirection === 'copper-to-zinc') {
    drawArrow(ctx, 620, topWireY - 12, 280, topWireY - 12, '#f8fafc')
    drawFlowDots(ctx, 610, 290, topWireY - 12, '#f8fafc', visuals)
  }

  if (state.currentDirection === 'zinc-to-copper') {
    drawArrow(ctx, 620, topWireY + 18, 280, topWireY + 18, '#93c5fd', true)
    drawFlowDots(ctx, 610, 290, topWireY + 18, 'rgba(147, 197, 253, 0.92)', visuals)
  } else if (state.currentDirection === 'copper-to-zinc') {
    drawArrow(ctx, 280, topWireY + 18, 620, topWireY + 18, '#93c5fd', true)
    drawFlowDots(ctx, 290, 610, topWireY + 18, 'rgba(147, 197, 253, 0.92)', visuals)
  }

  ctx.fillStyle = '#e2e8f0'
  ctx.font = '600 15px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('電子', 420, topWireY - 26)
  ctx.fillText('電流', 420, topWireY + 42)

  ctx.fillStyle = 'rgba(147, 197, 253, 0.9)'
  if (state.zincChange === 'dissolve') {
    for (let index = 0; index < 6; index += 1) {
      ctx.beginPath()
      const ionX = 302 + index * 20 + Math.sin(clock * 1.8 + index) * 10
      const ionY = 242 + ((clock * 28 + index * 26) % 92)
      ctx.arc(ionX, ionY, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillText('Zn2+ が溶液へ', 200, 414)
  } else if (state.zincChange === 'attach') {
    for (let index = 0; index < 4; index += 1) {
      const wobble = Math.sin(clock * 4 + index) * 2
      ctx.fillRect(leftPlateX - 10 - index * 8, 230 + index * 28 + wobble, 10, 16)
    }
    ctx.fillText('Zn が板につく', 200, 414)
  }

  ctx.fillStyle = 'rgba(251, 146, 60, 0.92)'
  if (state.copperChange === 'attach') {
    for (let index = 0; index < 4; index += 1) {
      const wobble = Math.sin(clock * 4 + index) * 2
      ctx.fillRect(rightPlateX + 48 + index * 8, 226 + index * 30 + wobble, 10, 16)
    }
    ctx.fillText('Cu が板につく', 542, 414)
  } else if (state.copperChange === 'dissolve') {
    for (let index = 0; index < 6; index += 1) {
      ctx.beginPath()
      const ionX = 580 - index * 20 + Math.sin(clock * 1.8 + index) * 10
      const ionY = 244 + ((clock * 28 + index * 24) % 92)
      ctx.arc(ionX, ionY, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillText('Cu2+ が溶液へ', 524, 414)
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 24px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('化学電池のしくみ', 82, 94)
  ctx.font = '500 15px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(bottomText ?? 'パラメータを変えて、化学電池の流れを観察しよう', 82, 474)
}

function drawColumnScene(
  ctx: CanvasRenderingContext2D,
  state: Extract<WorkbenchState, { kind: 'earth-column' }>,
  accent: string,
  visuals?: WorkbenchVisualOptions,
  options?: ColumnLayerOption[],
) {
  const columnOptions = options ?? COLUMN_LAYER_OPTIONS
  const clock = (visuals?.clockMs ?? 0) / 1000
  const intensity = visuals?.intensity ?? 1
  const columnX = 136
  const columnY = 156
  const slotHeight = 92
  const slotWidth = 230

  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  drawRoundedRect(ctx, 72, 118, 360, 332, 28)
  ctx.fill()
  drawRoundedRect(ctx, 474, 118, 348, 332, 28)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 24px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('柱状図を上から下へ並べる', 88, 94)

  ;(['上', '中', '下'] as const).forEach((label, index) => {
    const y = columnY + index * slotHeight
    const slotKey = state.slots[index]
    const option = slotKey ? columnOptions.find(o => o.key === slotKey) ?? null : null
    const fillColor = option?.color ?? 'rgba(100, 116, 139, 0.18)'
    ctx.fillStyle = fillColor
    drawRoundedRect(ctx, columnX, y, slotWidth, slotHeight - 10, 20)
    ctx.fill()
    if (option) fillPattern(ctx, columnX, y, slotWidth, slotHeight - 10, option.pattern)
    if (state.activeSlot === index) {
      ctx.fillStyle = `rgba(45, 212, 191, ${0.1 + (Math.sin(clock * 3.2) + 1) * 0.08 * intensity})`
      drawRoundedRect(ctx, columnX, y, slotWidth, slotHeight - 10, 20)
      ctx.fill()
      for (let grain = 0; grain < 10; grain += 1) {
        const progress = ((clock * 0.55 + grain * 0.1) % 1 + 1) % 1
        const grainX = columnX + 18 + (grain % 5) * 38 + Math.sin(clock * 2 + grain) * 4
        const grainY = y - 20 + progress * (slotHeight + 14)
        ctx.fillStyle = 'rgba(226, 232, 240, 0.6)'
        ctx.beginPath()
        ctx.arc(grainX, grainY, 3.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.strokeStyle = state.activeSlot === index ? accent : 'rgba(255,255,255,0.16)'
    ctx.lineWidth = state.activeSlot === index ? 3 : 2
    drawRoundedRect(ctx, columnX, y, slotWidth, slotHeight - 10, 20)
    ctx.stroke()

    ctx.fillStyle = '#e2e8f0'
    ctx.font = '700 16px "Zen Kaku Gothic New", sans-serif'
    ctx.fillText(label, columnX - 36, y + 46)
    ctx.fillStyle = option ? '#ffffff' : '#94a3b8'
    ctx.font = '700 24px "Zen Kaku Gothic New", sans-serif'
    ctx.fillText(option?.label ?? 'ここに入れる', columnX + 22, y + 48)
  })

  ctx.fillStyle = '#f0fdfa'
  ctx.font = '600 15px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('手がかり', 508, 150)
  ctx.fillStyle = '#99f6e4'
  ctx.font = '500 14px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText('上ほど新しい地層', 246, 132)
  columnOptions.forEach((option, index) => {
    const boxY = 166 + index * 92
    ctx.fillStyle = option.color
    drawRoundedRect(ctx, 504, boxY, 286, 76, 18)
    ctx.fill()
    fillPattern(ctx, 504, boxY, 286, 76, option.pattern)
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 2
    drawRoundedRect(ctx, 504, boxY, 286, 76, 18)
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = '700 22px "Zen Kaku Gothic New", sans-serif'
    ctx.fillText(option.label, 524, boxY + 30)
    ctx.font = '500 14px "Zen Kaku Gothic New", sans-serif'
    ctx.fillText(option.detail, 524, boxY + 56)
  })
}

function drawHumidityScene(
  ctx: CanvasRenderingContext2D,
  state: Extract<WorkbenchState, { kind: 'earth-humidity' }>,
  accent: string,
  visuals?: WorkbenchVisualOptions,
) {
  const clock = (visuals?.clockMs ?? 0) / 1000
  const intensity = visuals?.intensity ?? 1
  const graphX = 86
  const graphY = 132
  const graphWidth = 520
  const graphHeight = 300
  const currentSaturation = getSaturatedAmount(state.temperature)
  const maxAmount = SATURATED_VAPOR_TABLE[SATURATED_VAPOR_TABLE.length - 1].amount
  const cloudReady = state.vaporAmount >= currentSaturation
  const humidityRatio = getHumidityRatio(state.vaporAmount, currentSaturation)

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
  ctx.fillText(`水蒸気 ${formatNumber(state.vaporAmount)} g`, 82, 98)
  ctx.fillText(`温度 ${state.temperature}℃`, 680, 160)

  ctx.strokeStyle = '#f8fafc'
  ctx.setLineDash([7, 7])
  const tempX = graphX + (state.temperature / 40) * graphWidth
  ctx.beginPath()
  ctx.moveTo(tempX, graphY)
  ctx.lineTo(tempX, graphY + graphHeight)
  ctx.stroke()

  const vaporY = graphY + graphHeight - (state.vaporAmount / maxAmount) * graphHeight
  ctx.beginPath()
  ctx.moveTo(graphX, vaporY)
  ctx.lineTo(graphX + graphWidth, vaporY)
  ctx.stroke()
  ctx.setLineDash([])

  const currentPointX = tempX
  const currentPointY = vaporY
  const saturationPointY = graphY + graphHeight - (currentSaturation / maxAmount) * graphHeight

  ctx.fillStyle = '#c4b5fd'
  ctx.beginPath()
  ctx.arc(currentPointX, currentPointY, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.arc(currentPointX, saturationPointY, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = cloudReady ? 'rgba(196, 181, 253, 0.85)' : 'rgba(125, 211, 252, 0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(currentPointX, currentPointY)
  ctx.lineTo(currentPointX, saturationPointY)
  ctx.stroke()

  for (let index = 0; index < 16; index += 1) {
    const progress = ((clock * 0.22 * intensity + index * 0.07) % 1 + 1) % 1
    const x = 692 + (index % 4) * 34 + Math.sin(clock * 2 + index) * 5
    const y = 392 - progress * 120
    ctx.fillStyle = cloudReady ? 'rgba(191, 219, 254, 0.36)' : 'rgba(125, 211, 252, 0.24)'
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = cloudReady ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.arc(742, 262, 34 + Math.sin(clock * 1.8) * 3, Math.PI * 0.9, Math.PI * 1.9)
  ctx.arc(782, 242, 40 + Math.sin(clock * 1.8 + 0.6) * 4, Math.PI, Math.PI * 2)
  ctx.arc(816, 266, 28 + Math.sin(clock * 1.8 + 1.4) * 2, Math.PI * 1.1, Math.PI * 1.95)
  ctx.closePath()
  ctx.fill()
  if (cloudReady) {
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.78)'
    ctx.lineWidth = 2.5
    for (let index = 0; index < 4; index += 1) {
      const rainX = 726 + index * 28 + Math.sin(clock * 3 + index) * 3
      const rainY = 300 + ((clock * 120 + index * 34) % 78)
      ctx.beginPath()
      ctx.moveTo(rainX, rainY)
      ctx.lineTo(rainX - 8, rainY + 18)
      ctx.stroke()
    }
  }
  ctx.fillStyle = cloudReady ? '#e9d5ff' : '#bfdbfe'
  ctx.font = '700 18px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(cloudReady ? 'くもり始める' : 'まだ余裕あり', 694, 334)
  ctx.font = '500 15px "Zen Kaku Gothic New", sans-serif'
  ctx.fillText(`飽和水蒸気量 ${formatNumber(currentSaturation)}g`, 686, 364)
  ctx.fillStyle = '#c4b5fd'
  ctx.fillText(`実際の水蒸気量 ${formatNumber(state.vaporAmount)}g`, 686, 388)
  ctx.fillStyle = '#f8fafc'
  ctx.fillText(`湿度 ${formatNumber(humidityRatio)}%`, 686, 404)
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
  state: Extract<WorkbenchState, { kind: 'physics-motion-graph' }>,
  accent: string,
  visuals?: WorkbenchVisualOptions,
  overrideInitialVelocity?: number,
) {
  const clock = (visuals?.clockMs ?? 0) / 1000
  const intensity = visuals?.intensity ?? 1
  const v0 = overrideInitialVelocity ?? state.initialVelocity
  const currentVelocity = Math.max(0, v0 + state.acceleration * state.time)
  const currentPosition = v0 * state.time + 0.5 * state.acceleration * state.time * state.time
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
  const wheelRotation = clock * (0.8 + Math.abs(currentVelocity) * 0.2)
  ctx.strokeStyle = 'rgba(191, 219, 254, 0.88)'
  ctx.lineWidth = 2
  ;[cartX + 22, cartX + 68].forEach(centerX => {
    ctx.beginPath()
    ctx.moveTo(centerX, trackY)
    ctx.lineTo(centerX + Math.cos(wheelRotation) * 10, trackY + Math.sin(wheelRotation) * 10)
    ctx.moveTo(centerX, trackY)
    ctx.lineTo(centerX + Math.cos(wheelRotation + Math.PI / 2) * 10, trackY + Math.sin(wheelRotation + Math.PI / 2) * 10)
    ctx.stroke()
  })
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cartX + 45, trackY - 70)
  ctx.lineTo(cartX + 45 + clamp(currentVelocity * 10, -30, 70), trackY - 70)
  ctx.stroke()
  drawArrow(ctx, cartX + 45, trackY - 70, cartX + 45 + clamp(currentVelocity * 10, -30, 70), trackY - 70, accent)

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
    const position = v0 * time + 0.5 * state.acceleration * time * time
    const x = graph1X + (time / 4) * graphWidth
    const y = graphY + graphHeight - clamp(position / 28, 0, 1) * graphHeight
    if (step === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  ctx.beginPath()
  for (let step = 0; step <= 40; step += 1) {
    const time = (step / 40) * 4
    const velocity = Math.max(0, v0 + state.acceleration * time)
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
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.setLineDash([6, 8])
  ctx.beginPath()
  ctx.moveTo(playhead1X, graphY)
  ctx.lineTo(playhead1X, graphY + graphHeight)
  ctx.moveTo(playhead2X, graphY)
  ctx.lineTo(playhead2X, graphY + graphHeight)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.arc(playhead1X, playhead1Y, 6, 0, Math.PI * 2)
  ctx.arc(playhead2X, playhead2Y, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(147, 197, 253, 0.6)'
  for (let index = 0; index < 3; index += 1) {
    const trailX = cartX - index * 28 - ((clock * 42 * intensity) % 28)
    ctx.fillRect(trailX, trackY - 38, 18, 4)
  }
}

export function drawWorkbenchScene(
  ctx: CanvasRenderingContext2D,
  meta: ScienceWorkbenchMeta,
  round: ScienceWorkbenchRound,
  state: WorkbenchState,
  visuals?: WorkbenchVisualOptions,
) {
  drawBackground(ctx, meta)
  switch (round.kind) {
    case 'chem-density':
      if (state.kind === round.kind) drawDensityScene(ctx, state, meta.accent, visuals, round.targetDensity)
      break
    case 'chem-concentration':
      if (state.kind === round.kind) drawConcentrationScene(ctx, state, meta.accent, visuals, round.targetPercent)
      break
    case 'chem-battery':
      if (state.kind === round.kind) drawBatteryScene(ctx, state, meta.accent, visuals, round.supportText)
      break
    case 'earth-humidity':
      if (state.kind === round.kind) drawHumidityScene(ctx, state, meta.accent, visuals)
      break
    case 'earth-column':
      if (state.kind === round.kind) drawColumnScene(ctx, state, meta.accent, visuals, round.options)
      break
    case 'physics-motion-graph':
      if (state.kind === round.kind) drawMotionScene(ctx, state, meta.accent, visuals, round.initialVelocity)
      break
    default:
      break
  }
}

function drawSimulationScene(
  ctx: CanvasRenderingContext2D,
  meta: ScienceWorkbenchMeta,
  mode: ScienceWorkbenchMode,
  state: WorkbenchState,
  visuals?: WorkbenchVisualOptions,
) {
  drawBackground(ctx, meta)
  switch (mode) {
    case 'chem-density':
      if (state.kind === mode) drawDensityScene(ctx, state, meta.accent, visuals)
      break
    case 'chem-concentration':
      if (state.kind === mode) drawConcentrationScene(ctx, state, meta.accent, visuals)
      break
    case 'chem-battery':
      if (state.kind === mode) drawBatteryScene(ctx, state, meta.accent, visuals)
      break
    case 'earth-humidity':
      if (state.kind === mode) drawHumidityScene(ctx, state, meta.accent, visuals)
      break
    case 'earth-column':
      if (state.kind === mode) drawColumnScene(ctx, state, meta.accent, visuals, COLUMN_LAYER_OPTIONS)
      break
    case 'physics-motion-graph':
      if (state.kind === mode) drawMotionScene(ctx, state, meta.accent, visuals)
      break
    default:
      break
  }
}

/* ─── Dynamic insight functions ─── */

function getDensityInsight(density: number, mass: number, volume: number): string {
  const formula = `${mass}g / ${volume}cm3 = ${formatNumber(density)} g/cm3`
  if (density < 0.5) return `${formula}。発泡スチロール（約0.03）のように非常に軽い。水に浮きます。`
  if (density < 1.0) return `${formula}。水（1.0）より軽いので水に浮きます。木材はこの範囲が多い。`
  if (Math.abs(density - 1.0) < 0.02) return `${formula}。水とほぼ同じ密度。浮きも沈みもしない境目です。`
  if (density < 2.7) return `${formula}。水に沈む固体。ガラス（約2.5）に近い。`
  if (density < 5.0) return `${formula}。アルミニウム（2.7）～鉄（7.9）の間。金属に近い重さ。`
  return `${formula}。鉄（7.9）に近づくかなり重い物体です。`
}

function getConcentrationInsight(percent: number, soluteMass: number, waterMass: number): string {
  const total = soluteMass + waterMass
  const formula = `${soluteMass}g / ${total}g x 100 = ${formatNumber(percent)}%`
  if (percent < 1) return `${formula}。ほとんど水。味はほぼしません。`
  if (Math.abs(percent - 0.9) < 0.5) return `${formula}。生理食塩水（0.9%）に近い濃度。体液と同じ浸透圧。`
  if (Math.abs(percent - 3.5) < 1.5) return `${formula}。海水（約3.5%）に近いしょっぱさです。`
  if (percent < 15) return `${formula}。料理にも使われる範囲の濃さ。`
  if (percent < 27) return `${formula}。かなり濃い食塩水。常温での飽和（約26%）に近づいています。`
  return `${formula}。飽和に近い超高濃度。これ以上は溶けにくい。`
}

function getBatteryInsight(state: Extract<WorkbenchState, { kind: 'chem-battery' }>): string {
  const parts: string[] = []
  if (state.negativeElectrode === 'zinc') {
    parts.push('亜鉛板が－極。亜鉛はイオンになりやすく、電子を放出します。')
  } else if (state.negativeElectrode === 'copper') {
    parts.push('銅板を－極にしていますが、実際は亜鉛のほうがイオンになりやすいため亜鉛が－極です。')
  }
  if (state.electronDirection === 'zinc-to-copper') {
    parts.push('電子は亜鉛→銅へ。外部回路を通って流れます。')
  } else if (state.electronDirection === 'copper-to-zinc') {
    parts.push('電子が銅→亜鉛に設定されていますが、実際は亜鉛から銅へ流れます。')
  }
  if (state.currentDirection === 'copper-to-zinc') {
    parts.push('電流は電子と逆向き（銅→亜鉛）。')
  } else if (state.currentDirection === 'zinc-to-copper') {
    parts.push('電流は電子と逆向きなので、銅→亜鉛が正しい向きです。')
  }
  if (state.zincChange === 'dissolve') parts.push('亜鉛板はとけて Zn2+ イオンに。')
  if (state.copperChange === 'attach') parts.push('銅板には Cu が析出して付着。')
  if (parts.length === 0) return '各パラメータを選んで、化学電池の流れを組み立ててみよう。'
  return parts.join(' ')
}

function getHumidityInsight(temperature: number, vaporAmount: number, saturation: number, humidityRatio: number, cloudReady: boolean): string {
  if (cloudReady) {
    const excess = roundTo(vaporAmount - saturation, 1)
    return `${temperature}℃では飽和水蒸気量が${formatNumber(saturation)}gしかないので、${formatNumber(excess)}gぶんの水蒸気が水滴になり、雲や霧が発生します。湿度${formatNumber(humidityRatio)}%。`
  }
  if (humidityRatio > 80) return `湿度${formatNumber(humidityRatio)}%。飽和に近く、少し冷えれば露点に達して結露します。あと${formatNumber(saturation - vaporAmount)}gで飽和。`
  if (humidityRatio > 40) return `湿度${formatNumber(humidityRatio)}%。まだ余裕があります。飽和水蒸気量${formatNumber(saturation)}gに対して実際は${formatNumber(vaporAmount)}g。`
  return `湿度${formatNumber(humidityRatio)}%。乾燥した空気です。飽和水蒸気量${formatNumber(saturation)}gに対して実際は${formatNumber(vaporAmount)}g。`
}

function getColumnInsight(slots: [string | null, string | null, string | null]): string {
  const filled = slots.filter(Boolean).length
  if (filled === 0) return '地層を上から下へ並べてみましょう。上ほど新しい地層、下ほど古い地層です。'
  if (filled < 3) return `${filled}段が入りました。残りの段も埋めてみましょう。上ほど新しい地層になります。`
  const labels = slots.map(key => COLUMN_LAYER_OPTIONS.find(o => o.key === key)?.label ?? '?')
  return `上（新）: ${labels[0]} → 中: ${labels[1]} → 下（古）: ${labels[2]}。この並びは、${labels[2]}ができた環境から${labels[0]}ができた環境へと変化したことを示しています。`
}

function getMotionInsight(acceleration: number, initialVelocity: number, currentVelocity: number): string {
  if (acceleration === 0) return `等速直線運動: 初速${initialVelocity} m/sのまま速さは変わりません。x-tグラフは直線、v-tグラフは水平線。`
  if (acceleration > 0) return `加速運動: 毎秒${acceleration} m/sずつ速くなります。現在${formatNumber(currentVelocity)} m/s。v-tグラフの傾き＝加速度。`
  return `減速運動: 毎秒${Math.abs(acceleration)} m/sずつ遅くなります。現在${formatNumber(currentVelocity)} m/s。速さが0になると停止。`
}

/* ─── Simulation Component ─── */

export default function ScienceWorkbenchPage({
  mode,
  onBack,
}: {
  mode: ScienceWorkbenchMode
  onBack: () => void
}) {
  const { logout } = useAuth()
  const meta = SCIENCE_WORKBENCH_MODE_META[mode]
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<WorkbenchState>(getSimInitialState(mode))

  const [state, setState] = useState<WorkbenchState>(getSimInitialState(mode))
  const [visualClock, setVisualClock] = useState(0)

  useEffect(() => {
    const initial = getSimInitialState(mode)
    stateRef.current = initial
    setState(initial)
    setVisualClock(0)
  }, [mode])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawSimulationScene(ctx, meta, mode, state, { clockMs: visualClock, intensity: 1 })
  }, [meta, mode, state, visualClock])

  useEffect(() => {
    let rafId = 0
    let last = performance.now()
    const tick = (now: number) => {
      const delta = now - last
      last = now
      setVisualClock(c => c + delta)
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)
    return () => { window.cancelAnimationFrame(rafId) }
  }, [])

  useEffect(() => {
    window.render_game_to_text = () => {
      return JSON.stringify({ mode, field: meta.field, state: stateRef.current }, null, 2)
    }
    window.advanceTime = (ms: number) => {
      if (mode !== 'physics-motion-graph') return
      setState(s => {
        if (s.kind !== 'physics-motion-graph') return s
        return { ...s, time: clamp(roundTo(s.time + ms / 1000, 1), 0, 4) }
      })
      setVisualClock(c => c + ms)
    }
    return () => { delete window.render_game_to_text; delete window.advanceTime }
  }, [meta.field, mode])

  const updateState = (updater: (s: WorkbenchState) => WorkbenchState) => {
    setState(s => updater(s))
  }

  const reset = () => {
    const initial = getSimInitialState(mode)
    stateRef.current = initial
    setState(initial)
    setVisualClock(0)
  }

  const renderRangeField = (
    label: string, value: number, min: number, max: number, step: number, unit: string,
    onChange: (next: number) => void, hint?: string,
  ) => (
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.18em] text-slate-400">{label}</div>
          {hint && <div className="mt-1 text-[11px] leading-5 text-slate-500">{hint}</div>}
        </div>
        <div className="text-xl font-bold text-white">
          {value}<span className="ml-1 text-sm text-slate-400">{unit}</span>
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="mt-3 w-full" style={{ accentColor: meta.accent }} />
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  )

  const renderInsight = (): string => {
    if (state.kind === 'chem-density') return getDensityInsight(getCurrentDensity(state), state.mass, state.volume)
    if (state.kind === 'chem-concentration') return getConcentrationInsight(getCurrentConcentration(state), state.soluteMass, state.waterMass)
    if (state.kind === 'chem-battery') return getBatteryInsight(state)
    if (state.kind === 'earth-humidity') {
      const sat = getSaturatedAmount(state.temperature)
      return getHumidityInsight(state.temperature, state.vaporAmount, sat, getHumidityRatio(state.vaporAmount, sat), state.vaporAmount >= sat)
    }
    if (state.kind === 'earth-column') return getColumnInsight(state.slots)
    if (state.kind === 'physics-motion-graph') {
      const { currentVelocity } = describeMotionSim(state)
      return getMotionInsight(state.acceleration, state.initialVelocity, currentVelocity)
    }
    return ''
  }

  const renderControls = () => {
    if (state.kind === 'chem-density') {
      const density = getCurrentDensity(state)
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {renderRangeField('質量', state.mass, 10, 120, 10, 'g', next => updateState(s => s.kind !== 'chem-density' ? s : ({ ...s, mass: next })), '重さを変える')}
            {renderRangeField('体積', state.volume, 5, 60, 5, 'cm3', next => updateState(s => s.kind !== 'chem-density' ? s : ({ ...s, volume: next })), '大きさを変える')}
          </div>
          <div className="rounded-2xl border border-orange-400/20 bg-orange-500/10 p-3 text-sm text-orange-100">
            密度 = 質量 / 体積 = <span className="font-bold">{formatNumber(density)} g/cm3</span>
          </div>
        </div>
      )
    }

    if (state.kind === 'chem-concentration') {
      const concentration = getCurrentConcentration(state)
      const total = state.soluteMass + state.waterMass
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {renderRangeField('溶質', state.soluteMass, 5, 60, 5, 'g', next => updateState(s => s.kind !== 'chem-concentration' ? s : ({ ...s, soluteMass: next })), 'ピンク粒の量')}
            {renderRangeField('水', state.waterMass, 5, 120, 5, 'g', next => updateState(s => s.kind !== 'chem-concentration' ? s : ({ ...s, waterMass: next })), '青い液体の量')}
          </div>
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">
            濃度 = 溶質 / 溶液 x 100 = <span className="font-bold">{formatNumber(concentration)}%</span> / 溶液 {total}g
          </div>
        </div>
      )
    }

    if (state.kind === 'chem-battery') {
      const choiceClassName = (selected: boolean) => `rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
        selected ? 'text-white' : 'border-white/10 bg-slate-950/30 text-slate-300'
      }`
      return (
        <div className="space-y-3">
          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">－極</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([{ key: 'zinc', label: '亜鉛板' }, { key: 'copper', label: '銅板' }] as const).map(choice => (
                  <button key={choice.key}
                    onClick={() => updateState(s => s.kind !== 'chem-battery' ? s : ({ ...s, negativeElectrode: choice.key as 'zinc' | 'copper' }))}
                    className={choiceClassName(state.negativeElectrode === choice.key)}
                    style={state.negativeElectrode === choice.key ? { borderColor: '#fcd34d', background: 'rgba(251, 191, 36, 0.18)' } : undefined}
                  >{choice.label}</button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">電子の向き</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([{ key: 'zinc-to-copper', label: '亜鉛 → 銅' }, { key: 'copper-to-zinc', label: '銅 → 亜鉛' }] as const).map(choice => (
                  <button key={choice.key}
                    onClick={() => updateState(s => s.kind !== 'chem-battery' ? s : ({ ...s, electronDirection: choice.key as 'zinc-to-copper' | 'copper-to-zinc' }))}
                    className={choiceClassName(state.electronDirection === choice.key)}
                    style={state.electronDirection === choice.key ? { borderColor: '#f8fafc', background: 'rgba(248, 250, 252, 0.16)' } : undefined}
                  >{choice.label}</button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs tracking-[0.18em] text-slate-400">電流の向き</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([{ key: 'zinc-to-copper', label: '亜鉛 → 銅' }, { key: 'copper-to-zinc', label: '銅 → 亜鉛' }] as const).map(choice => (
                  <button key={choice.key}
                    onClick={() => updateState(s => s.kind !== 'chem-battery' ? s : ({ ...s, currentDirection: choice.key as 'zinc-to-copper' | 'copper-to-zinc' }))}
                    className={choiceClassName(state.currentDirection === choice.key)}
                    style={state.currentDirection === choice.key ? { borderColor: '#93c5fd', background: 'rgba(59, 130, 246, 0.18)' } : undefined}
                  >{choice.label}</button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                <div className="text-xs tracking-[0.18em] text-slate-400">亜鉛板の変化</div>
                <div className="mt-3 grid gap-2">
                  {([{ key: 'dissolve', label: 'とけてイオンになる' }, { key: 'attach', label: '表面に付着する' }] as const).map(choice => (
                    <button key={choice.key}
                      onClick={() => updateState(s => s.kind !== 'chem-battery' ? s : ({ ...s, zincChange: choice.key as 'dissolve' | 'attach' }))}
                      className={choiceClassName(state.zincChange === choice.key)}
                      style={state.zincChange === choice.key ? { borderColor: '#60a5fa', background: 'rgba(96, 165, 250, 0.18)' } : undefined}
                    >{choice.label}</button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                <div className="text-xs tracking-[0.18em] text-slate-400">銅板の変化</div>
                <div className="mt-3 grid gap-2">
                  {([{ key: 'attach', label: '表面に付着する' }, { key: 'dissolve', label: 'とけてイオンになる' }] as const).map(choice => (
                    <button key={choice.key}
                      onClick={() => updateState(s => s.kind !== 'chem-battery' ? s : ({ ...s, copperChange: choice.key as 'dissolve' | 'attach' }))}
                      className={choiceClassName(state.copperChange === choice.key)}
                      style={state.copperChange === choice.key ? { borderColor: '#fb923c', background: 'rgba(251, 146, 60, 0.18)' } : undefined}
                    >{choice.label}</button>
                  ))}
                </div>
              </div>
            </div>
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
          <div className="grid gap-3 sm:grid-cols-2">
            {renderRangeField('温度', state.temperature, 0, 40, 10, '℃',
              next => updateState(s => s.kind !== 'earth-humidity' ? s : ({ ...s, temperature: next })),
              '空気を冷やしたり温めたりする')}
            {renderRangeField('水蒸気量', roundTo(state.vaporAmount, 1), 0, SATURATED_VAPOR_TABLE[SATURATED_VAPOR_TABLE.length - 1].amount, 0.1, 'g',
              next => updateState(s => s.kind !== 'earth-humidity' ? s : ({ ...s, vaporAmount: roundTo(next, 1) })),
              '1m3 の空気にふくまれる水蒸気')}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {SATURATED_VAPOR_TABLE.map(item => (
              <button key={item.temperature}
                onClick={() => updateState(s => s.kind !== 'earth-humidity' ? s : ({ ...s, temperature: item.temperature }))}
                className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  state.temperature === item.temperature ? 'border-violet-300 bg-violet-500/20 text-white' : 'border-white/10 bg-slate-950/30 text-slate-300'
                }`}>{item.temperature}℃</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SATURATED_VAPOR_TABLE.map(item => (
              <button key={`${item.temperature}-${item.amount}`}
                onClick={() => updateState(s => s.kind !== 'earth-humidity' ? s : ({ ...s, vaporAmount: item.amount }))}
                className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  Math.abs(state.vaporAmount - item.amount) < 0.051 ? 'border-violet-300 bg-violet-500/20 text-white' : 'border-white/10 bg-slate-950/30 text-slate-300'
                }`}>{formatNumber(item.amount)}g</button>
            ))}
          </div>
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm text-violet-100">
            飽和水蒸気量: <span className="font-bold">{formatNumber(saturation)} g</span> / 実際: <span className="font-bold">{formatNumber(state.vaporAmount)} g</span>
            <br />湿度: <span className="font-bold">{formatNumber(humidityRatio)}%</span> / 状態: <span className="font-bold">{cloudReady ? '飽和 → くもり・雨' : 'まだ飽和していない'}</span>
          </div>
        </div>
      )
    }

    if (state.kind === 'earth-column') {
      return (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-200">段を選んで入れる</div>
          <div className="grid grid-cols-3 gap-2">
            {(['上', '中', '下'] as const).map((label, index) => (
              <button key={label}
                onClick={() => updateState(s => s.kind !== 'earth-column' ? s : ({ ...s, activeSlot: index as 0 | 1 | 2 }))}
                className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                  state.activeSlot === index ? 'border-teal-300 bg-teal-500/20 text-white' : 'border-white/10 bg-slate-950/30 text-slate-300'
                }`}>
                {label}
                <div className="mt-1 text-xs font-normal text-slate-400">
                  {(state.slots[index] ? COLUMN_LAYER_OPTIONS.find(o => o.key === state.slots[index]) : null)?.label ?? '未設定'}
                </div>
              </button>
            ))}
          </div>
          <div className="text-sm font-semibold text-slate-200">地層を選ぶ</div>
          <div className="grid gap-2">
            {COLUMN_LAYER_OPTIONS.map(option => (
              <button key={option.key}
                onClick={() => updateState(s => {
                  if (s.kind !== 'earth-column') return s
                  const nextSlots = [...s.slots] as [string | null, string | null, string | null]
                  nextSlots.forEach((slot, i) => { if (slot === option.key) nextSlots[i] = null })
                  nextSlots[s.activeSlot] = option.key
                  const nextActiveSlot = s.activeSlot < 2 ? ((s.activeSlot + 1) as 0 | 1 | 2) : s.activeSlot
                  return { ...s, slots: nextSlots, activeSlot: nextActiveSlot }
                })}
                className="rounded-2xl border px-4 py-3 text-left transition"
                style={{
                  borderColor: state.slots.includes(option.key) ? `${meta.accent}66` : 'var(--border)',
                  background: state.slots.includes(option.key) ? `${meta.accent}20` : 'var(--card-gradient-base-soft)',
                }}>
                <div className="font-semibold text-white">{option.label}</div>
                <div className="mt-1 text-xs leading-6 text-slate-400">{option.detail}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateState(s => s.kind !== 'earth-column' ? s : ({
              ...s, slots: s.slots.map((slot, i) => i === s.activeSlot ? null : slot) as [string | null, string | null, string | null],
            }))} className="btn-ghost !px-4 !py-2">今の段をクリア</button>
            <button onClick={() => updateState(s => s.kind !== 'earth-column' ? s : ({ ...s, slots: [null, null, null], activeSlot: 0 }))}
              className="btn-secondary !px-4 !py-2">3段ともリセット</button>
          </div>
        </div>
      )
    }

    if (state.kind === 'physics-motion-graph') {
      return (
        <div className="space-y-3">
          {renderRangeField('初速', state.initialVelocity, 0, 8, 1, 'm/s',
            next => updateState(s => s.kind !== 'physics-motion-graph' ? s : ({ ...s, initialVelocity: next })),
            '台車のスタート速さ')}
          {renderRangeField('加速度', state.acceleration, -1, 2, 1, 'm/s2',
            next => updateState(s => s.kind !== 'physics-motion-graph' ? s : ({ ...s, acceleration: next })),
            'グラフの傾きが変わる')}
          <div className="grid grid-cols-4 gap-2">
            {[-1, 0, 1, 2].map(value => (
              <button key={value}
                onClick={() => updateState(s => s.kind !== 'physics-motion-graph' ? s : ({ ...s, acceleration: value }))}
                className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  state.acceleration === value ? 'border-sky-300 bg-sky-500/20 text-white' : 'border-white/10 bg-slate-950/30 text-slate-300'
                }`}>{value} m/s2</button>
            ))}
          </div>
          {renderRangeField('時刻', roundTo(state.time, 1), 0, 4, 0.1, 's',
            next => updateState(s => s.kind !== 'physics-motion-graph' ? s : ({ ...s, time: next })),
            '台車とグラフの位置が同期')}
          <div className="flex gap-2">
            <button onClick={() => updateState(s => s.kind !== 'physics-motion-graph' ? s : ({ ...s, time: clamp(s.time - 1, 0, 4) }))} className="btn-ghost !px-4 !py-2">-1秒</button>
            <button onClick={() => updateState(s => s.kind !== 'physics-motion-graph' ? s : ({ ...s, time: clamp(s.time + 1, 0, 4) }))} className="btn-secondary !px-4 !py-2">+1秒</button>
            <button onClick={() => updateState(s => s.kind !== 'physics-motion-graph' ? s : ({ ...s, time: 0 }))} className="btn-ghost !px-4 !py-2">0秒へ</button>
          </div>
        </div>
      )
    }

    return null
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

          <div className="grid grid-cols-2 gap-3 lg:min-w-[240px]">
            <button onClick={onBack} className="btn-secondary w-full">もどる</button>
            <button onClick={() => logout()} className="btn-ghost w-full">ログアウト</button>
          </div>
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
            {renderControls()}
            <div className="mt-4">
              <button onClick={reset} className="btn-ghost w-full">リセット</button>
            </div>
          </div>

          <div className="card anim-fade-up">
            <div className="text-sm font-semibold text-slate-200">いま何が起きている？</div>
            <p className="mt-3 text-sm leading-7 text-slate-300">{renderInsight()}</p>
          </div>

          <div className="card anim-fade-up">
            <div className="text-sm font-semibold text-slate-200">このラボのねらい</div>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-400">
              <li>パラメータを自由に動かして、変化の仕組みを体感する。</li>
              <li>式と図を同時に見て、数値と現象の関係をつかむ。</li>
              <li>答えはなし。遊びながら「なるほど」を見つけよう。</li>
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
