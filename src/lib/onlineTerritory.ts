'use client'

import { isMissingRelationError } from '@/lib/schemaCompat'
import { Database, supabase } from '@/lib/supabase'

export const ONLINE_TERRITORY_ROOM_KEY = 'main'

export type OnlineTerritoryRoomRow = Database['public']['Tables']['online_territory_rooms']['Row']
export type OnlineTerritoryRoomInsert = Database['public']['Tables']['online_territory_rooms']['Insert']
export type OnlineTerritoryRoomUpdate = Database['public']['Tables']['online_territory_rooms']['Update']

let onlineTerritoryRoomTableAvailable: boolean | null = null

function markOnlineTerritoryRoomMissing() {
  onlineTerritoryRoomTableAvailable = false
}

function markOnlineTerritoryRoomSupported() {
  if (onlineTerritoryRoomTableAvailable !== false) {
    onlineTerritoryRoomTableAvailable = true
  }
}

function handleOnlineTerritoryRoomError(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  if (isMissingRelationError(error, 'online_territory_rooms')) {
    markOnlineTerritoryRoomMissing()
    return true
  }
  return false
}

export async function fetchOnlineTerritoryRoom() {
  if (onlineTerritoryRoomTableAvailable === false) return null

  const { data, error } = await supabase
    .from('online_territory_rooms')
    .select('*')
    .eq('room_key', ONLINE_TERRITORY_ROOM_KEY)
    .maybeSingle()

  if (handleOnlineTerritoryRoomError(error)) return null
  if (error) throw new Error(error.message)

  markOnlineTerritoryRoomSupported()
  return (data || null) as OnlineTerritoryRoomRow | null
}

export async function upsertOnlineTerritoryRoom(payload: OnlineTerritoryRoomInsert | OnlineTerritoryRoomUpdate) {
  if (onlineTerritoryRoomTableAvailable === false) return false

  const nextPayload = {
    room_key: ONLINE_TERRITORY_ROOM_KEY,
    updated_at: new Date().toISOString(),
    ...payload,
  }

  const { error } = await supabase
    .from('online_territory_rooms')
    .upsert(nextPayload, { onConflict: 'room_key' })

  if (handleOnlineTerritoryRoomError(error)) return false
  if (error) throw new Error(error.message)

  markOnlineTerritoryRoomSupported()
  return true
}

export function subscribeOnlineTerritoryRoom(onChange: (room: OnlineTerritoryRoomRow | null) => void) {
  const channel = supabase
    .channel(`online-territory-room-${ONLINE_TERRITORY_ROOM_KEY}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'online_territory_rooms',
        filter: `room_key=eq.${ONLINE_TERRITORY_ROOM_KEY}`,
      },
      payload => {
        const next = payload.eventType === 'DELETE'
          ? null
          : (payload.new as OnlineTerritoryRoomRow | null)
        onChange(next)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
