'use client'

import { isMissingRelationError } from '@/lib/schemaCompat'
import { Database, supabase } from '@/lib/supabase'

export const ONLINE_LAB_ROOM_KEY = 'main'
export const ONLINE_LAB_STALE_MS = 45 * 1000

export type OnlineLabRoomRow = Database['public']['Tables']['online_lab_rooms']['Row']
export type OnlineLabRoomInsert = Database['public']['Tables']['online_lab_rooms']['Insert']
export type OnlineLabRoomUpdate = Database['public']['Tables']['online_lab_rooms']['Update']

let onlineLabRoomTableAvailable: boolean | null = null

function markOnlineLabRoomMissing() {
  onlineLabRoomTableAvailable = false
}

function markOnlineLabRoomSupported() {
  if (onlineLabRoomTableAvailable !== false) {
    onlineLabRoomTableAvailable = true
  }
}

function handleOnlineLabRoomError(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  if (isMissingRelationError(error, 'online_lab_rooms')) {
    markOnlineLabRoomMissing()
    return true
  }
  return false
}

export function isOnlineLabRoomLive(room: OnlineLabRoomRow | null | undefined, now = Date.now()) {
  if (!room || !room.is_live) return false
  const updatedAtMs = Date.parse(room.updated_at)
  if (Number.isNaN(updatedAtMs)) return room.is_live
  return now - updatedAtMs <= ONLINE_LAB_STALE_MS
}

export async function fetchOnlineLabRoom() {
  if (onlineLabRoomTableAvailable === false) return null

  const { data, error } = await supabase
    .from('online_lab_rooms')
    .select('*')
    .eq('room_key', ONLINE_LAB_ROOM_KEY)
    .maybeSingle()

  if (handleOnlineLabRoomError(error)) return null
  if (error) throw new Error(error.message)

  markOnlineLabRoomSupported()
  return (data || null) as OnlineLabRoomRow | null
}

export async function upsertOnlineLabRoom(payload: OnlineLabRoomInsert | OnlineLabRoomUpdate) {
  if (onlineLabRoomTableAvailable === false) return false

  const nextPayload = {
    room_key: ONLINE_LAB_ROOM_KEY,
    updated_at: new Date().toISOString(),
    ...payload,
  }

  const { error } = await supabase
    .from('online_lab_rooms')
    .upsert(nextPayload, { onConflict: 'room_key' })

  if (handleOnlineLabRoomError(error)) return false
  if (error) throw new Error(error.message)

  markOnlineLabRoomSupported()
  return true
}

export async function clearOnlineLabRoom(controllerStudentId: number | null, controllerNickname: string | null) {
  return upsertOnlineLabRoom({
    room_key: ONLINE_LAB_ROOM_KEY,
    mode: null,
    controller_student_id: controllerStudentId,
    controller_nickname: controllerNickname,
    is_live: false,
    phase: 'idle',
    round_index: 0,
    score: 0,
    history_json: [],
    state_json: null,
    feedback_json: null,
    memo_text: '',
    whiteboard_strokes: [],
  })
}

export function subscribeOnlineLabRoom(onChange: (room: OnlineLabRoomRow | null) => void) {
  const channel = supabase
    .channel(`online-lab-room-${ONLINE_LAB_ROOM_KEY}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'online_lab_rooms',
        filter: `room_key=eq.${ONLINE_LAB_ROOM_KEY}`,
      },
      payload => {
        const next = payload.eventType === 'DELETE'
          ? null
          : (payload.new as OnlineLabRoomRow | null)
        onChange(next)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
