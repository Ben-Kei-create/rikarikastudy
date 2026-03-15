/**
 * Shared canvas drawing utilities used by BiologyPracticePage and EarthSciencePracticePage.
 */

export const CANVAS_WIDTH = 900
export const CANVAS_HEIGHT = 560
export const CARD_COLUMNS = 5
export const CARD_ROWS = 2
export const CARD_GAP = 18
export const BOARD_PADDING_X = 42
export const BOARD_PADDING_TOP = 88
export const CARD_WIDTH = Math.floor(
  (CANVAS_WIDTH - BOARD_PADDING_X * 2 - CARD_GAP * (CARD_COLUMNS - 1)) / CARD_COLUMNS,
)
export const CARD_HEIGHT = 172

export function getCardRect(index: number) {
  const row = Math.floor(index / CARD_COLUMNS)
  const col = index % CARD_COLUMNS
  const x = BOARD_PADDING_X + col * (CARD_WIDTH + CARD_GAP)
  const y = BOARD_PADDING_TOP + row * (CARD_HEIGHT + 28)
  return { x, y, width: CARD_WIDTH, height: CARD_HEIGHT, row, col }
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
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

export function drawCardShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.save()
  ctx.shadowColor = 'rgba(15, 23, 42, 0.45)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 18
  drawRoundedRect(ctx, x, y, width, height, 24)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.12)'
  ctx.fill()
  ctx.restore()
}

export function createLinearGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  from: string,
  to: string,
) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  return gradient
}

export function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}
