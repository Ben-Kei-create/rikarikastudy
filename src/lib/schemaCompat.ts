'use client'

interface ErrorLike {
  message?: string | null
  details?: string | null
  hint?: string | null
}

const columnSupportCache: Record<string, boolean | null> = {}
const STORAGE_PREFIX = 'rika_missing_column__'

function readMissingColumnFlag(column: string) {
  if (typeof window === 'undefined') return false

  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${column}`) === '1'
  } catch {
    return false
  }
}

function writeMissingColumnFlag(column: string) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${column}`, '1')
  } catch {}
}

export function isMissingColumnError(error: ErrorLike | null | undefined, column: string) {
  if (!error) return false

  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return text.includes(column.toLowerCase()) && (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('not found')
  )
}

export function getCachedColumnSupport(column: string) {
  if (columnSupportCache[column] === null || columnSupportCache[column] === undefined) {
    if (readMissingColumnFlag(column)) {
      columnSupportCache[column] = false
    }
  }

  return columnSupportCache[column] ?? null
}

export function markColumnMissing(column: string) {
  columnSupportCache[column] = false
  writeMissingColumnFlag(column)
}

export function markColumnSupported(column: string) {
  if (columnSupportCache[column] !== false) {
    columnSupportCache[column] = true
  }
}
