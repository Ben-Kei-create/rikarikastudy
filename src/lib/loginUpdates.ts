'use client'

import { Database } from '@/lib/supabase'
import { isMissingRelationError } from '@/lib/schemaCompat'

export type LoginUpdateRow = Database['public']['Tables']['login_updates']['Row']
export type LoginUpdateInsert = Database['public']['Tables']['login_updates']['Insert']

export function isLoginUpdatesTableMissing(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  return isMissingRelationError(error, 'login_updates')
}

export function getLoginUpdatesSchemaErrorMessage(message: string) {
  if (
    message.includes('login_updates')
    || message.includes('created_by_student_id')
  ) {
    return 'Supabase に login_updates テーブルがありません。最新の supabase_schema.sql を SQL Editor で実行してください。'
  }

  return message
}
