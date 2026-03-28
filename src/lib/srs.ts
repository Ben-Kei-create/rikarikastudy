'use client'

// Simplified SM-2 Spaced Repetition System
// All data stored in localStorage — no DB migration needed

const STORAGE_KEY = 'rikaquiz-srs'

// ─── Types ────────────────────────────────────────────

export interface SrsCard {
  questionId: string
  /** Interval in days until next review */
  interval: number
  /** Ease factor (multiplier for interval growth) */
  ease: number
  /** Number of consecutive correct reviews */
  streak: number
  /** ISO timestamp of next scheduled review */
  nextReviewAt: string
  /** ISO timestamp of last review */
  lastReviewedAt: string
}

interface SrsStore {
  /** Keyed by `${studentId}` */
  [studentKey: string]: SrsCard[]
}

// ─── Storage ──────────────────────────────────────────

function readStore(): SrsStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeStore(store: SrsStore) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // localStorage full — silently fail
  }
}

function getStudentCards(studentId: number | null): SrsCard[] {
  const key = String(studentId ?? 'guest')
  return readStore()[key] ?? []
}

function setStudentCards(studentId: number | null, cards: SrsCard[]) {
  const store = readStore()
  const key = String(studentId ?? 'guest')
  store[key] = cards
  writeStore(store)
}

// ─── SM-2 Algorithm ───────────────────────────────────

const MIN_EASE = 1.3
const MAX_EASE = 3.0
const DEFAULT_EASE = 2.5

function computeNextReview(now: Date, intervalDays: number): string {
  const next = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)
  return next.toISOString()
}

function reviewCard(card: SrsCard, correct: boolean, now: Date): SrsCard {
  if (correct) {
    const nextStreak = card.streak + 1
    let nextInterval: number
    if (nextStreak === 1) {
      nextInterval = 1     // 1 day
    } else if (nextStreak === 2) {
      nextInterval = 3     // 3 days
    } else {
      nextInterval = Math.round(card.interval * card.ease)
    }
    // Cap at 180 days
    nextInterval = Math.min(nextInterval, 180)
    const nextEase = Math.min(MAX_EASE, card.ease + 0.1)

    return {
      ...card,
      interval: nextInterval,
      ease: nextEase,
      streak: nextStreak,
      nextReviewAt: computeNextReview(now, nextInterval),
      lastReviewedAt: now.toISOString(),
    }
  } else {
    // Wrong — reset interval, reduce ease
    return {
      ...card,
      interval: 0,
      ease: Math.max(MIN_EASE, card.ease - 0.2),
      streak: 0,
      nextReviewAt: now.toISOString(), // due immediately
      lastReviewedAt: now.toISOString(),
    }
  }
}

function createCard(questionId: string, correct: boolean, now: Date): SrsCard {
  const base: SrsCard = {
    questionId,
    interval: 0,
    ease: DEFAULT_EASE,
    streak: 0,
    nextReviewAt: now.toISOString(),
    lastReviewedAt: now.toISOString(),
  }
  return reviewCard(base, correct, now)
}

// ─── Public API ───────────────────────────────────────

export interface AnswerForSrs {
  questionId: string
  correct: boolean
}

/**
 * クイズ終了後に呼ぶ — 回答結果でSRSカードを更新
 */
export function updateSrsAfterQuiz(studentId: number | null, answers: AnswerForSrs[]) {
  const cards = getStudentCards(studentId)
  const cardMap = new Map(cards.map(c => [c.questionId, c]))
  const now = new Date()

  for (const answer of answers) {
    const existing = cardMap.get(answer.questionId)
    if (existing) {
      cardMap.set(answer.questionId, reviewCard(existing, answer.correct, now))
    } else {
      cardMap.set(answer.questionId, createCard(answer.questionId, answer.correct, now))
    }
  }

  setStudentCards(studentId, Array.from(cardMap.values()))
}

/**
 * 今復習すべき問題IDの一覧を返す（nextReviewAt <= now）
 */
export function getDueQuestionIds(studentId: number | null): string[] {
  const cards = getStudentCards(studentId)
  const now = new Date().toISOString()

  return cards
    .filter(card => card.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt)) // oldest first
    .map(card => card.questionId)
}

/**
 * 復習が必要な問題数を返す
 */
export function getDueCount(studentId: number | null): number {
  return getDueQuestionIds(studentId).length
}

/**
 * 全SRSカードを返す（デバッグ・統計用）
 */
export function getAllSrsCards(studentId: number | null): SrsCard[] {
  return getStudentCards(studentId)
}
