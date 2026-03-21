'use client'

// 陣取りクイズ — オセロ風の挟み撃ちルール
// 4x4ボード、正解で好きなマスに置ける、挟んだ敵マスをひっくり返す

export type CellOwner = null | 'player' | 'cpu'
export type TerritoryBoard = CellOwner[][]

export const BOARD_SIZE = 4

export function createEmptyBoard(): TerritoryBoard {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  )
}

// 8方向
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
] as const

function inBounds(r: number, c: number) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE
}

/** 指定セルに置いた場合に挟み撃ちでひっくり返せるセル一覧を返す */
export function getFlippableCells(
  board: TerritoryBoard,
  row: number,
  col: number,
  owner: CellOwner,
): [number, number][] {
  if (!owner || board[row][col] !== null) return []
  const opponent = owner === 'player' ? 'cpu' : 'player'
  const flipped: [number, number][] = []

  for (const [dr, dc] of DIRECTIONS) {
    const line: [number, number][] = []
    let r = row + dr
    let c = col + dc

    // 相手のマスを辿る
    while (inBounds(r, c) && board[r][c] === opponent) {
      line.push([r, c])
      r += dr
      c += dc
    }

    // 自分のマスで挟めていたらフリップ確定
    if (line.length > 0 && inBounds(r, c) && board[r][c] === owner) {
      flipped.push(...line)
    }
  }

  return flipped
}

/** マスを置いてフリップを適用した新しいボードを返す */
export function placeAndFlip(
  board: TerritoryBoard,
  row: number,
  col: number,
  owner: CellOwner,
): { newBoard: TerritoryBoard; flippedCount: number } {
  if (!owner) return { newBoard: board, flippedCount: 0 }

  const newBoard = board.map(r => [...r])
  newBoard[row][col] = owner

  const flipped = getFlippableCells(board, row, col, owner)
  for (const [r, c] of flipped) {
    newBoard[r][c] = owner
  }

  return { newBoard, flippedCount: flipped.length }
}

/** 空きマス一覧 */
export function getEmptyCells(board: TerritoryBoard): [number, number][] {
  const cells: [number, number][] = []
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) cells.push([r, c])
    }
  }
  return cells
}

/** 各プレイヤーのマス数をカウント */
export function countCells(board: TerritoryBoard): { player: number; cpu: number; empty: number } {
  let player = 0
  let cpu = 0
  let empty = 0
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 'player') player++
      else if (board[r][c] === 'cpu') cpu++
      else empty++
    }
  }
  return { player, cpu, empty }
}

/** CPU の手を選ぶ（フリップ数が最大のマスを優先、同数なら角→辺→中央の順） */
export function pickCpuMove(board: TerritoryBoard): [number, number] | null {
  const empty = getEmptyCells(board)
  if (empty.length === 0) return null

  // 各セルのスコアを計算
  const scored = empty.map(([r, c]) => {
    const flipped = getFlippableCells(board, r, c, 'cpu')
    // 角は超有利（+10）、辺は少し有利（+3）
    const isCorner = (r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1)
    const isEdge = r === 0 || r === BOARD_SIZE - 1 || c === 0 || c === BOARD_SIZE - 1
    const positionBonus = isCorner ? 10 : isEdge ? 3 : 0
    return { r, c, score: flipped.length + positionBonus }
  })

  // スコアが高い順にソートし、同スコアならランダム
  scored.sort((a, b) => b.score - a.score || (Math.random() - 0.5))
  return [scored[0].r, scored[0].c]
}

/** ゲーム終了判定 */
export function isGameOver(board: TerritoryBoard): boolean {
  return getEmptyCells(board).length === 0
}

/** 勝者判定 */
export function getWinner(board: TerritoryBoard): 'player' | 'cpu' | 'draw' {
  const { player, cpu } = countCells(board)
  if (player > cpu) return 'player'
  if (cpu > player) return 'cpu'
  return 'draw'
}
