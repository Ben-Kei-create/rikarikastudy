'use client'

import { supabase } from '@/lib/supabase'

export const HAYAOSHI_ROOM_KEY = 'main'
export const HAYAOSHI_REVEAL_CHARS_PER_SEC = 6   // chars revealed per second
export const HAYAOSHI_TOTAL_ROUNDS = 10
export const HAYAOSHI_ANSWER_SECONDS = 8          // buzzed player answer window
export const HAYAOSHI_RESULT_SECONDS = 3500       // ms to show result before advancing

export const HAYAOSHI_PLAYER_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ec4899', // pink
]

export interface HayaoshiPlayer {
  student_id: number
  nickname: string
  score: number
  color: string
}

export interface HayaoshiQuestionData {
  id: string | number
  question: string
  choices: string[]
  answer: string
  field: string
  unit: string
  type: string
}

export interface HayaoshiRoom {
  room_key: string
  phase: 'lobby' | 'revealing' | 'buzzed' | 'result' | 'finished'
  players_json: HayaoshiPlayer[]
  current_round: number
  total_rounds: number
  question_json: HayaoshiQuestionData | null
  question_started_at: string | null   // ISO string — clients compute reveal progress from this
  chars_revealed: number               // chars frozen at buzz moment
  buzzed_student_id: number | null
  buzz_answer: string | null
  buzz_correct: boolean | null
  used_ids_json: (string | number)[]
  updated_at: string
}

// ─── Supabase operations ───

export async function fetchHayaoshiRoom(): Promise<HayaoshiRoom | null> {
  const { data, error } = await supabase
    .from('online_hayaoshi_rooms')
    .select('*')
    .eq('room_key', HAYAOSHI_ROOM_KEY)
    .maybeSingle()
  if (error) throw error
  return data as HayaoshiRoom | null
}

export async function upsertHayaoshiRoom(patch: Partial<HayaoshiRoom>) {
  const { error } = await supabase
    .from('online_hayaoshi_rooms')
    .upsert({
      room_key: HAYAOSHI_ROOM_KEY,
      ...patch,
      updated_at: new Date().toISOString(),
    })
  if (error) throw error
}

/**
 * Atomic buzz-in. Returns true if this player won the race.
 * Uses conditional update: only succeeds if no one has buzzed yet.
 */
export async function tryBuzz(studentId: number, charsRevealed: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('online_hayaoshi_rooms')
    .update({
      buzzed_student_id: studentId,
      chars_revealed: charsRevealed,
      phase: 'buzzed',
      updated_at: new Date().toISOString(),
    })
    .eq('room_key', HAYAOSHI_ROOM_KEY)
    .is('buzzed_student_id', null)
    .eq('phase', 'revealing')
    .select('room_key')
  return !error && (data?.length ?? 0) > 0
}

export function subscribeHayaoshiRoom(callback: (room: HayaoshiRoom) => void) {
  return supabase
    .channel('hayaoshi:main')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'online_hayaoshi_rooms', filter: `room_key=eq.${HAYAOSHI_ROOM_KEY}` },
      payload => { if (payload.new) callback(payload.new as HayaoshiRoom) },
    )
    .subscribe()
}
