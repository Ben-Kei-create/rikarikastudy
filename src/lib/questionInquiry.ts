'use client'

import { Database } from '@/lib/supabase'
import { isMissingRelationError } from '@/lib/schemaCompat'

export type QuestionInquiryRow = Database['public']['Tables']['question_inquiries']['Row']
export type QuestionInquiryInsert = Database['public']['Tables']['question_inquiries']['Insert']
export type QuestionInquiryStatus = QuestionInquiryRow['status']
export type QuestionInquiryCategory = QuestionInquiryRow['category']

export const QUESTION_INQUIRY_CATEGORY_OPTIONS: Array<{
  value: QuestionInquiryCategory
  label: string
  description: string
}> = [
  {
    value: 'question_content',
    label: '問題文がおかしい',
    description: '問題文や選択肢、表現の違和感を知らせます。',
  },
  {
    value: 'answer_content',
    label: '解答がおかしい',
    description: '正解や解説の内容に違和感がある時に送ります。',
  },
  {
    value: 'other',
    label: 'その他',
    description: '画像や表示など、気づいたことを自由に送れます。',
  },
]

export const QUESTION_INQUIRY_STATUS_META: Record<QuestionInquiryStatus, {
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

export function getQuestionInquiryCategoryLabel(category: QuestionInquiryCategory) {
  return QUESTION_INQUIRY_CATEGORY_OPTIONS.find(option => option.value === category)?.label ?? 'その他'
}

export function getQuestionInquiryStatusLabel(status: QuestionInquiryStatus) {
  return QUESTION_INQUIRY_STATUS_META[status]?.label ?? '未対応'
}

export function isQuestionInquiryTableMissing(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  return isMissingRelationError(error, 'question_inquiries')
}

export function getQuestionInquirySchemaErrorMessage(message: string) {
  if (
    message.includes('question_inquiries')
    || message.includes('student_nickname')
    || message.includes('question_text')
    || message.includes('question_type')
    || message.includes('answer_text')
    || message.includes('admin_note')
    || message.includes('admin_reply')
  ) {
    return 'Supabase に question_inquiries テーブルがありません。最新の supabase_schema.sql を SQL Editor で実行してください。'
  }

  return message
}
