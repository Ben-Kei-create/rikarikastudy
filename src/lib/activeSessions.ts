import { Database, supabase } from '@/lib/supabase'

export const ACTIVE_SESSION_ONLINE_WINDOW_MS = 3 * 60 * 1000

type ActiveSessionRow = Database['public']['Tables']['active_sessions']['Row']

let activeSessionsTableAvailable: boolean | null = null

function isMissingActiveSessionsTableError(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  if (!error) return false

  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return text.includes('active_sessions') && (
    text.includes('does not exist') ||
    text.includes('not found') ||
    text.includes('schema cache')
  )
}

function markActiveSessionsTableAvailable() {
  if (activeSessionsTableAvailable !== false) {
    activeSessionsTableAvailable = true
  }
}

function markActiveSessionsTableMissing() {
  activeSessionsTableAvailable = false
}

function handleActiveSessionError(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  if (isMissingActiveSessionsTableError(error)) {
    markActiveSessionsTableMissing()
    return true
  }
  return false
}

export function getOnlineCutoffIso(now = Date.now()) {
  return new Date(now - ACTIVE_SESSION_ONLINE_WINDOW_MS).toISOString()
}

export function createSessionToken() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `session-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`
}

export async function upsertActiveSession(studentId: number, sessionToken: string) {
  if (activeSessionsTableAvailable === false) return false

  const { error } = await supabase
    .from('active_sessions')
    .upsert({
      session_token: sessionToken,
      student_id: studentId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'session_token' })

  if (handleActiveSessionError(error)) return false
  if (error) throw new Error(error.message)

  markActiveSessionsTableAvailable()
  return true
}

export async function removeActiveSession(sessionToken: string | null) {
  if (!sessionToken || activeSessionsTableAvailable === false) return false

  const { error } = await supabase
    .from('active_sessions')
    .delete()
    .eq('session_token', sessionToken)

  if (handleActiveSessionError(error)) return false
  if (error) throw new Error(error.message)

  markActiveSessionsTableAvailable()
  return true
}

export async function fetchActiveSessions() {
  if (activeSessionsTableAvailable === false) return [] as ActiveSessionRow[]

  const { data, error } = await supabase
    .from('active_sessions')
    .select('*')
    .gte('last_seen_at', getOnlineCutoffIso())
    .order('last_seen_at', { ascending: false })

  if (handleActiveSessionError(error)) return [] as ActiveSessionRow[]
  if (error) throw new Error(error.message)

  markActiveSessionsTableAvailable()
  return (data || []) as ActiveSessionRow[]
}

export async function countActiveStudents() {
  const rows = await fetchActiveSessions()
  return new Set(rows.map(row => row.student_id).filter(studentId => studentId !== 5)).size
}
