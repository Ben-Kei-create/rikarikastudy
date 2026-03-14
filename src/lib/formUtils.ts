/**
 * Shared form/input parsing utilities used by AdminPage and MyPage.
 */

import { FIELD_COLORS } from '@/lib/constants'

/** Split comma/newline-separated keyword input into an array (or null if empty). */
export function parseKeywordInput(input: string) {
  const keywords = input
    .split(/[,、\n]/)
    .map(keyword => keyword.trim())
    .filter(Boolean)

  return keywords.length > 0 ? keywords : null
}

/** Split comma/newline-separated list input into an array. */
export function parseListInput(input: string) {
  return input
    .split(/\n|,|、/)
    .map(item => item.trim())
    .filter(Boolean)
}

/** Parse "left | right" line-separated text into match-pair objects. */
export function parseMatchPairsText(input: string) {
  const pairs = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [left, right] = line.split(/\s*\|\s*/)
      return {
        left: (left ?? '').trim(),
        right: (right ?? '').trim(),
      }
    })
    .filter(pair => pair.left && pair.right)

  return pairs.length > 0 ? pairs : null
}

/** Return field colour with a fallback. */
export function getFieldColor(field: string, fallback = '#64748b') {
  return FIELD_COLORS[field as keyof typeof FIELD_COLORS] ?? fallback
}

/** Trigger a JSON file download in the browser. */
export function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Format a duration in seconds as a Japanese time string (e.g. "3時間15分"). */
export function formatStudyTime(totalSeconds: number) {
  if (totalSeconds <= 0) return '0分'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}時間${minutes}分`
  if (minutes > 0) return `${minutes}分`
  return `${seconds}秒`
}
