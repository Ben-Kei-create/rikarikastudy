'use client'

import { supabase } from '@/lib/supabase'

export const HAYAOSHI_REVEAL_CHARS_PER_SEC = 4   // chars revealed per second (slow ヌルヌル feel)
export const HAYAOSHI_TOTAL_ROUNDS = 10
export const HAYAOSHI_ANSWER_SECONDS = 8          // buzzed player answer window
export const HAYAOSHI_RESULT_SECONDS = 3500       // ms to show result before advancing
export const HAYAOSHI_XP_PER_CORRECT = 15         // XP per correct answer in online play

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

// ─── Room code helpers ───

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous 0/O/1/I

export function generateRoomCode(): string {
  return Array.from(
    { length: 4 },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join('')
}

// ─── Supabase operations (all take roomKey) ───

export async function fetchHayaoshiRoom(roomKey: string): Promise<HayaoshiRoom | null> {
  const { data, error } = await supabase
    .from('online_hayaoshi_rooms')
    .select('*')
    .eq('room_key', roomKey)
    .maybeSingle()
  if (error) throw error
  return data as HayaoshiRoom | null
}

export async function upsertHayaoshiRoom(roomKey: string, patch: Partial<HayaoshiRoom>) {
  const { error } = await supabase
    .from('online_hayaoshi_rooms')
    .upsert({
      room_key: roomKey,
      ...patch,
      updated_at: new Date().toISOString(),
    })
  if (error) throw error
}

/**
 * Create a brand-new room with the given code and host player.
 * Throws if the code already exists.
 */
export async function createHayaoshiRoom(
  roomKey: string,
  hostPlayer: HayaoshiPlayer,
): Promise<void> {
  const { error } = await supabase.from('online_hayaoshi_rooms').insert({
    room_key: roomKey,
    phase: 'lobby',
    players_json: [hostPlayer],
    current_round: 0,
    total_rounds: HAYAOSHI_TOTAL_ROUNDS,
    question_json: null,
    question_started_at: null,
    chars_revealed: 0,
    buzzed_student_id: null,
    buzz_answer: null,
    buzz_correct: null,
    used_ids_json: [],
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

/** List rooms currently in lobby (joinable). */
export async function listOpenHayaoshiRooms(): Promise<HayaoshiRoom[]> {
  const { data, error } = await supabase
    .from('online_hayaoshi_rooms')
    .select('*')
    .eq('phase', 'lobby')
    .order('updated_at', { ascending: false })
    .limit(20)
  if (error) return []
  return (data ?? []) as HayaoshiRoom[]
}

/**
 * Atomic buzz-in. Returns true if this player won the race.
 * Uses conditional update: only succeeds if no one has buzzed yet.
 */
export async function tryBuzz(
  roomKey: string,
  studentId: number,
  charsRevealed: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('online_hayaoshi_rooms')
    .update({
      buzzed_student_id: studentId,
      chars_revealed: charsRevealed,
      phase: 'buzzed',
      updated_at: new Date().toISOString(),
    })
    .eq('room_key', roomKey)
    .is('buzzed_student_id', null)
    .eq('phase', 'revealing')
    .select('room_key')
  return !error && (data?.length ?? 0) > 0
}

/**
 * Remove a player from the hayaoshi lobby (called on unmount or explicit leave).
 * Only removes during lobby phase to avoid corrupting an in-progress game.
 */
export async function leaveHayaoshiLobby(roomKey: string, studentId: number): Promise<void> {
  const room = await fetchHayaoshiRoom(roomKey)
  if (!room || room.phase !== 'lobby') return
  const filtered = room.players_json.filter(p => p.student_id !== studentId)
  if (filtered.length === room.players_json.length) return
  await upsertHayaoshiRoom(roomKey, { players_json: filtered })
}

/**
 * Award XP to a student for answering correctly in online hayaoshi.
 * Fetches current XP, adds the earned amount, and writes it back.
 * Returns { previousXp, newXp } so callers can detect level-ups.
 */
export async function awardHayaoshiXp(
  studentId: number,
  xpToAdd: number,
): Promise<{ previousXp: number; newXp: number }> {
  const { data } = await supabase
    .from('students')
    .select('student_xp, xp')
    .eq('id', studentId)
    .single()

  const raw = data as { student_xp?: number; xp?: number } | null
  const currentXp =
    typeof raw?.student_xp === 'number' && raw.student_xp > 0
      ? raw.student_xp
      : (raw?.xp ?? 0)
  const newXp = currentXp + xpToAdd

  await supabase
    .from('students')
    .update({ student_xp: newXp, xp: newXp })
    .eq('id', studentId)

  return { previousXp: currentXp, newXp }
}

export function subscribeHayaoshiRoom(roomKey: string, callback: (room: HayaoshiRoom) => void) {
  return supabase
    .channel(`hayaoshi:room:${roomKey}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'online_hayaoshi_rooms', filter: `room_key=eq.${roomKey}` },
      payload => { if (payload.new) callback(payload.new as HayaoshiRoom) },
    )
    .subscribe()
}

// ─── Live ephemeral state via Supabase broadcast (no DB writes) ───

export interface HayaoshiLiveEvent {
  studentId: number
  nickname: string
  color: string
  kind: 'hover' | 'buzz_attempt'
  choice?: string | null
  ts: number
}

/**
 * Broadcast channel for ephemeral live state (hover indicators, buzz attempts).
 * Uses Supabase Realtime broadcast — no database writes.
 */
export function createHayaoshiLiveChannel(
  roomKey: string,
  onEvent: (event: HayaoshiLiveEvent) => void,
) {
  const channel = supabase.channel(`hayaoshi:live:${roomKey}`, { config: { broadcast: { self: false } } })
  channel.on('broadcast', { event: 'live' }, payload => {
    const data = payload.payload as HayaoshiLiveEvent
    if (data) onEvent(data)
  })
  channel.subscribe()
  return {
    send(event: Omit<HayaoshiLiveEvent, 'ts'>) {
      void channel.send({ type: 'broadcast', event: 'live', payload: { ...event, ts: Date.now() } })
    },
    unsubscribe() {
      void channel.unsubscribe()
    },
  }
}
