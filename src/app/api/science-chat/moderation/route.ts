import { NextRequest, NextResponse } from 'next/server'
import { detectScienceChatModeration, ChatModerationSource } from '@/lib/chatModeration'
import { SCIENCE_CHAT_FIELDS, ScienceChatField } from '@/lib/scienceChat'
import { supabase } from '@/lib/supabase'

function isScienceField(value: string): value is ScienceChatField {
  return SCIENCE_CHAT_FIELDS.includes(value as ScienceChatField)
}

function isStudentId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      studentId?: number
      field?: string
      prompt?: string
      source?: ChatModerationSource
    }

    if (!isStudentId(body.studentId)) {
      return NextResponse.json({ error: 'studentId が不正です。' }, { status: 400 })
    }

    if (!body.field || !isScienceField(body.field)) {
      return NextResponse.json({ error: 'field が不正です。' }, { status: 400 })
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) {
      return NextResponse.json({ error: 'prompt がありません。' }, { status: 400 })
    }

    const moderation = detectScienceChatModeration(prompt)
    if (!moderation.blocked) {
      return NextResponse.json({ blocked: false })
    }

    const { error } = await supabase.from('chat_guard_logs').insert({
      student_id: body.studentId,
      field: body.field,
      categories: moderation.categories,
      matched_terms: moderation.matchedTerms,
      message_excerpt: prompt.slice(0, 160),
      source: body.source === 'send' ? 'send' : 'draft',
    })

    return NextResponse.json({
      blocked: true,
      warning: moderation.warningMessage,
      logged: !error,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'moderation report failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
