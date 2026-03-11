'use client'

import { supabase } from '@/lib/supabase'

export interface DuplicateQuestionCandidate {
  field: string
  unit: string
  question: string
  type: 'choice' | 'text'
  choices: string[] | null
  answer: string
}

interface ExistingQuestionRow extends DuplicateQuestionCandidate {
  id: string
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeChoices(choices: string[] | null) {
  if (!choices || choices.length === 0) return []
  return choices.map(choice => normalizeText(choice)).filter(Boolean).sort()
}

export function buildQuestionDuplicateKey(question: DuplicateQuestionCandidate) {
  return [
    normalizeText(question.field),
    normalizeText(question.unit),
    normalizeText(question.question),
    question.type,
    normalizeText(question.answer),
    JSON.stringify(normalizeChoices(question.choices)),
  ].join('||')
}

function formatQuestionLabel(question: DuplicateQuestionCandidate) {
  const title = normalizeText(question.question)
  return `${question.field} / ${question.unit} / ${title.length > 36 ? `${title.slice(0, 36)}...` : title}`
}

async function fetchExistingQuestions() {
  const { data, error } = await supabase
    .from('questions')
    .select('id, field, unit, question, type, choices, answer')

  if (error) {
    throw new Error(`既存問題の確認に失敗しました: ${error.message}`)
  }

  return (data || []) as ExistingQuestionRow[]
}

export async function ensureNoDuplicateQuestions(candidates: DuplicateQuestionCandidate[]) {
  if (candidates.length === 0) return

  const internalMap = new Map<string, { count: number; label: string }>()
  for (const candidate of candidates) {
    const key = buildQuestionDuplicateKey(candidate)
    const current = internalMap.get(key)
    if (!current) {
      internalMap.set(key, { count: 1, label: formatQuestionLabel(candidate) })
      continue
    }
    current.count += 1
  }

  const internalDuplicates = Array.from(internalMap.values()).filter(item => item.count > 1)
  if (internalDuplicates.length > 0) {
    const labels = internalDuplicates.slice(0, 3).map(item => `・${item.label}`).join('\n')
    throw new Error(`同じ内容の問題が入力データ内で重複しています。\n${labels}`)
  }

  const existingQuestions = await fetchExistingQuestions()
  const existingMap = new Map(existingQuestions.map(question => [buildQuestionDuplicateKey(question), question]))
  const matchedDuplicates = candidates
    .map(candidate => existingMap.get(buildQuestionDuplicateKey(candidate)))
    .filter((question): question is ExistingQuestionRow => Boolean(question))

  if (matchedDuplicates.length > 0) {
    const uniqueLabels = Array.from(
      new Set(matchedDuplicates.map(question => formatQuestionLabel(question))),
    )
    const labels = uniqueLabels.slice(0, 3).map(label => `・${label}`).join('\n')
    throw new Error(`すでに同じ問題が登録されています。\n${labels}`)
  }
}
