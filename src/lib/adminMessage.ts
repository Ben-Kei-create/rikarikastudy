'use client'

import { Database } from '@/lib/supabase'
import { isMissingRelationError } from '@/lib/schemaCompat'

export type AdminMessageRow = Database['public']['Tables']['admin_messages']['Row']
export type AdminMessageInsert = Database['public']['Tables']['admin_messages']['Insert']
export type AdminMessageStatus = AdminMessageRow['status']
export type AdminMessageCategory = AdminMessageRow['category']

export const ADMIN_MESSAGE_CATEGORY_OPTIONS: Array<{
  value: AdminMessageCategory
  label: string
}> = [
  { value: 'request', label: '要望' },
  { value: 'update', label: 'アップデート' },
  { value: 'other', label: 'その他' },
]

export const ADMIN_MESSAGE_STATUS_META: Record<AdminMessageStatus, {
  label: string
  color: string
  background: string
}> = {
  open: {
    label: '未対応',
    color: '#fbbf24',
    background: 'rgba(245, 158, 11, 0.14)',
  },
  reviewing: {
    label: '確認中',
    color: '#7dd3fc',
    background: 'rgba(56, 189, 248, 0.14)',
  },
  resolved: {
    label: '対応済み',
    color: '#86efac',
    background: 'rgba(34, 197, 94, 0.14)',
  },
}

export function getAdminMessageCategoryLabel(category: AdminMessageCategory) {
  return ADMIN_MESSAGE_CATEGORY_OPTIONS.find(option => option.value === category)?.label ?? 'その他'
}

export function isAdminMessagesTableMissing(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  return isMissingRelationError(error, 'admin_messages')
}

export function getAdminMessageSchemaErrorMessage(message: string) {
  if (
    message.includes('admin_messages')
    || message.includes('student_nickname')
    || message.includes('admin_note')
    || message.includes('admin_reply')
  ) {
    return 'Supabase に admin_messages テーブルがありません。最新の supabase_schema.sql を SQL Editor で実行してください。'
  }

  return message
}
