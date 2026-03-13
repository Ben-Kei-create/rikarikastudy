'use client'

import { getJstDateKey } from '@/lib/engagement'
import {
  getGuestPeriodicCards,
  isGuestStudentId,
  loadGuestStudyStore,
  updateGuestStudyStore,
} from '@/lib/guestStudy'
import {
  getPeriodicCardByKey,
  isPeriodicCardUnlockedAtLevel,
  PERIODIC_ELEMENT_CARDS,
  PERIODIC_CARD_UNLOCK_LEVEL,
} from '@/lib/periodicCards'
import { isMissingRelationError } from '@/lib/schemaCompat'
import { Database, supabase } from '@/lib/supabase'

export type PeriodicCardRewardSource = 'login' | 'perfect_clear' | 'level_up'

export interface PeriodicCardCollectionEntry {
  cardKey: string
  obtainCount: number
  firstObtainedAt: string
  lastObtainedAt: string
  lastSource: PeriodicCardRewardSource
}

export interface PeriodicCardReward {
  cardKey: string
  source: PeriodicCardRewardSource
  obtainedAt: string
  isNew: boolean
  obtainCount: number
}

type StudentElementCardRow = Database['public']['Tables']['student_element_cards']['Row']

const PERIODIC_CARD_TABLE_MISSING_MESSAGE = 'Supabase に student_element_cards / element_card_rewards テーブルがありません。最新の supabase_schema.sql を SQL Editor で実行してください。'

function normalizeCollectionRows(rows: StudentElementCardRow[] | null | undefined) {
  const next = (rows ?? [])
    .map(row => ({
      cardKey: row.card_key,
      obtainCount: row.obtain_count,
      firstObtainedAt: row.first_obtained_at,
      lastObtainedAt: row.last_obtained_at,
      lastSource: row.last_source,
    }))
    .filter(row => getPeriodicCardByKey(row.cardKey))

  return next.sort((left, right) => {
    const leftCard = getPeriodicCardByKey(left.cardKey)
    const rightCard = getPeriodicCardByKey(right.cardKey)
    return (leftCard?.atomicNumber ?? 999) - (rightCard?.atomicNumber ?? 999)
  })
}

function normalizeGuestCollection() {
  return getGuestPeriodicCards()
    .map(row => ({
      cardKey: row.card_key,
      obtainCount: row.obtain_count,
      firstObtainedAt: row.first_obtained_at,
      lastObtainedAt: row.last_obtained_at,
      lastSource: row.last_source,
    }))
    .filter(row => getPeriodicCardByKey(row.cardKey))
    .sort((left, right) => {
      const leftCard = getPeriodicCardByKey(left.cardKey)
      const rightCard = getPeriodicCardByKey(right.cardKey)
      return (leftCard?.atomicNumber ?? 999) - (rightCard?.atomicNumber ?? 999)
    })
}

function pickRewardCardKey(collection: PeriodicCardCollectionEntry[]) {
  const owned = new Set(collection.map(entry => entry.cardKey))
  const remaining = PERIODIC_ELEMENT_CARDS.filter(card => !owned.has(card.key))
  const pool = remaining.length > 0 ? remaining : PERIODIC_ELEMENT_CARDS
  const selected = pool[Math.floor(Math.random() * pool.length)]
  return selected.key
}

function buildRewardSourceForStudy(levelBefore: number, levelAfter: number, totalQuestions: number, correctCount: number) {
  if (!isPeriodicCardUnlockedAtLevel(levelAfter)) return null
  if (levelBefore < PERIODIC_CARD_UNLOCK_LEVEL && levelAfter >= PERIODIC_CARD_UNLOCK_LEVEL) return 'level_up' as const
  if (totalQuestions >= 4 && totalQuestions > 0 && correctCount === totalQuestions) return 'perfect_clear' as const
  return null
}

function updateGuestCardCollection(cardKey: string, source: PeriodicCardRewardSource, options?: { markLoginToday?: boolean }) {
  const obtainedAt = new Date().toISOString()
  let reward: PeriodicCardReward | null = null

  updateGuestStudyStore(store => {
    const existing = store.periodicCards.find(card => card.card_key === cardKey)
    const isNew = !existing

    const nextCards = existing
      ? store.periodicCards.map(card => card.card_key === cardKey
          ? {
              ...card,
              obtain_count: card.obtain_count + 1,
              last_obtained_at: obtainedAt,
              last_source: source,
            }
          : card)
      : [
          ...store.periodicCards,
          {
            card_key: cardKey,
            obtain_count: 1,
            first_obtained_at: obtainedAt,
            last_obtained_at: obtainedAt,
            last_source: source,
          },
        ]

    reward = {
      cardKey,
      source,
      obtainedAt,
      isNew,
      obtainCount: existing ? existing.obtain_count + 1 : 1,
    }

    return {
      ...store,
      periodicCards: nextCards,
      lastPeriodicLoginRewardDate: options?.markLoginToday ? store.dayKey : store.lastPeriodicLoginRewardDate,
    }
  })

  return reward
}

async function loadSupabaseCollection(studentId: number) {
  const response = await supabase
    .from('student_element_cards')
    .select('*')
    .eq('student_id', studentId)

  if (response.error) {
    if (!isMissingRelationError(response.error, 'student_element_cards')) {
      console.error('[periodic-cards] failed to load collection', response.error)
    }
    return { entries: [] as PeriodicCardCollectionEntry[], missingSchema: isMissingRelationError(response.error, 'student_element_cards') }
  }

  return { entries: normalizeCollectionRows(response.data as StudentElementCardRow[]), missingSchema: false }
}

async function upsertSupabaseCard(studentId: number, cardKey: string, source: PeriodicCardRewardSource, collection: PeriodicCardCollectionEntry[]) {
  const obtainedAt = new Date().toISOString()
  const existing = collection.find(card => card.cardKey === cardKey)
  const isNew = !existing

  if (existing) {
    const updateResponse = await supabase
      .from('student_element_cards')
      .update({
        obtain_count: existing.obtainCount + 1,
        last_obtained_at: obtainedAt,
        last_source: source,
      })
      .eq('student_id', studentId)
      .eq('card_key', cardKey)

    if (updateResponse.error) {
      throw updateResponse.error
    }
  } else {
    const insertResponse = await supabase
      .from('student_element_cards')
      .insert({
        student_id: studentId,
        card_key: cardKey,
        obtain_count: 1,
        first_obtained_at: obtainedAt,
        last_obtained_at: obtainedAt,
        last_source: source,
      })

    if (insertResponse.error) {
      throw insertResponse.error
    }
  }

  return {
    cardKey,
    source,
    obtainedAt,
    isNew,
    obtainCount: existing ? existing.obtainCount + 1 : 1,
  } satisfies PeriodicCardReward
}

async function appendRewardLog(studentId: number, cardKey: string, source: PeriodicCardRewardSource, rewardDate: string) {
  const response = await supabase
    .from('element_card_rewards')
    .insert({
      student_id: studentId,
      card_key: cardKey,
      source,
      reward_date: rewardDate,
    })

  if (response.error && !isMissingRelationError(response.error, 'element_card_rewards')) {
    console.error('[periodic-cards] failed to append reward log', response.error)
  }
}

export function getPeriodicCardSchemaErrorMessage(message: string) {
  if (
    message.includes('student_element_cards')
    || message.includes('element_card_rewards')
    || message.includes('card_key')
    || message.includes('last_source')
    || message.includes('reward_date')
  ) {
    return PERIODIC_CARD_TABLE_MISSING_MESSAGE
  }

  return message
}

export async function loadPeriodicCardCollection(studentId: number | null) {
  if (studentId === null) {
    return { entries: [] as PeriodicCardCollectionEntry[], missingSchema: false }
  }

  if (isGuestStudentId(studentId)) {
    return { entries: normalizeGuestCollection(), missingSchema: false }
  }

  return loadSupabaseCollection(studentId)
}

export async function claimDailyLoginPeriodicCard(studentId: number | null, level: number) {
  if (studentId === null || !isPeriodicCardUnlockedAtLevel(level)) return null

  const todayKey = getJstDateKey()

  if (isGuestStudentId(studentId)) {
    const store = loadGuestStudyStore()
    if (store.lastPeriodicLoginRewardDate === todayKey) return null

    const collection = normalizeGuestCollection()
    const cardKey = pickRewardCardKey(collection)
    return updateGuestCardCollection(cardKey, 'login', { markLoginToday: true })
  }

  const todayReward = await supabase
    .from('element_card_rewards')
    .select('id')
    .eq('student_id', studentId)
    .eq('source', 'login')
    .eq('reward_date', todayKey)
    .limit(1)
    .maybeSingle()

  if (todayReward.error) {
    if (isMissingRelationError(todayReward.error, 'element_card_rewards')) {
      return null
    }
    console.error('[periodic-cards] failed to check daily login reward', todayReward.error)
    return null
  }

  if (todayReward.data) return null

  const { entries, missingSchema } = await loadSupabaseCollection(studentId)
  if (missingSchema) return null

  const cardKey = pickRewardCardKey(entries)
  try {
    const reward = await upsertSupabaseCard(studentId, cardKey, 'login', entries)
    await appendRewardLog(studentId, cardKey, 'login', todayKey)
    return reward
  } catch (error) {
    console.error('[periodic-cards] failed to claim daily login card', error)
    return null
  }
}

export async function claimStudyPeriodicCardReward(
  studentId: number | null,
  levelBefore: number,
  levelAfter: number,
  totalQuestions: number,
  correctCount: number,
) {
  const source = buildRewardSourceForStudy(levelBefore, levelAfter, totalQuestions, correctCount)
  if (!source || studentId === null) return null

  if (isGuestStudentId(studentId)) {
    const collection = normalizeGuestCollection()
    const cardKey = pickRewardCardKey(collection)
    return updateGuestCardCollection(cardKey, source)
  }

  const { entries, missingSchema } = await loadSupabaseCollection(studentId)
  if (missingSchema) return null

  const cardKey = pickRewardCardKey(entries)
  try {
    const reward = await upsertSupabaseCard(studentId, cardKey, source, entries)
    await appendRewardLog(studentId, cardKey, source, getJstDateKey(reward.obtainedAt))
    return reward
  } catch (error) {
    console.error('[periodic-cards] failed to grant study reward card', error)
    return null
  }
}

export function getPeriodicCardRewardSourceLabel(source: PeriodicCardRewardSource) {
  switch (source) {
    case 'login':
      return 'ログインボーナス'
    case 'level_up':
      return 'レベルアップ報酬'
    case 'perfect_clear':
      return 'パーフェクト報酬'
    default:
      return 'カード報酬'
  }
}
