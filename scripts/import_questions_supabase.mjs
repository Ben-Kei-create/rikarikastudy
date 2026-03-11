#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const FIELDS = new Set(['生物', '化学', '物理', '地学'])
const FETCH_PAGE_SIZE = 1000
const INSERT_CHUNK_SIZE = 100
const KEY_SEPARATOR = '::'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const env = {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    const [, key, rawValue] = match
    let value = rawValue.trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

function loadEnv() {
  const cwd = process.cwd()

  return {
    ...parseEnvFile(path.join(cwd, '.env')),
    ...parseEnvFile(path.join(cwd, '.env.local')),
    ...process.env,
  }
}

function readInput() {
  const inputPath = process.argv[2]

  if (!inputPath || inputPath === '-') {
    return fs.readFileSync(0, 'utf8')
  }

  return fs.readFileSync(path.resolve(process.cwd(), inputPath), 'utf8')
}

function buildQuestionKey(question) {
  return [question.field, question.unit, question.question].join(KEY_SEPARATOR)
}

function normalizeQuestion(item, index) {
  const prefix = `${index + 1}問目`
  const field = typeof item?.field === 'string' ? item.field.trim() : ''
  const unit = typeof item?.unit === 'string' ? item.unit.trim() : ''
  const question = typeof item?.question === 'string' ? item.question.trim() : ''
  const type = item?.type
  const answer = typeof item?.answer === 'string' ? item.answer.trim() : ''
  const explanation = typeof item?.explanation === 'string' && item.explanation.trim()
    ? item.explanation.trim()
    : null
  const grade = typeof item?.grade === 'string' && item.grade.trim()
    ? item.grade.trim()
    : '中3'

  let acceptAnswers = null
  if (Array.isArray(item?.accept_answers)) {
    acceptAnswers = item.accept_answers
      .map(answerItem => (typeof answerItem === 'string' ? answerItem.trim() : ''))
      .filter(Boolean)
    if (acceptAnswers.length === 0) acceptAnswers = null
  }

  let keywords = null
  if (Array.isArray(item?.keywords)) {
    keywords = item.keywords
      .map(keywordItem => (typeof keywordItem === 'string' ? keywordItem.trim() : ''))
      .filter(Boolean)
    if (keywords.length === 0) keywords = null
  }

  if (!FIELDS.has(field)) fail(`${prefix}: field は 生物 / 化学 / 物理 / 地学 のどれかにしてください。`)
  if (!unit) fail(`${prefix}: unit は必須です。`)
  if (!question) fail(`${prefix}: question は必須です。`)
  if (!answer) fail(`${prefix}: answer は必須です。`)
  if (type !== 'choice' && type !== 'text') fail(`${prefix}: type は "choice" か "text" にしてください。`)

  if (type === 'choice') {
    if (!Array.isArray(item?.choices)) fail(`${prefix}: choice 問題は choices 配列が必要です。`)

    const choices = item.choices
      .map(choice => (typeof choice === 'string' ? choice.trim() : ''))
      .filter(Boolean)

    if (choices.length !== 2) fail(`${prefix}: choice 問題の choices は2件にしてください。`)
    if (!choices.includes(answer)) fail(`${prefix}: answer は choices のどちらかと一致させてください。`)

    const normalized = {
      field,
      unit,
      question,
      type,
      choices,
      answer,
      explanation,
      grade,
    }

    if (acceptAnswers) normalized.accept_answers = acceptAnswers

    return normalized
  }

  const normalized = {
    field,
    unit,
    question,
    type,
    choices: null,
    answer,
    explanation,
    grade,
  }

  if (acceptAnswers) normalized.accept_answers = acceptAnswers
  if (keywords) normalized.keywords = keywords

  return normalized
}

async function fetchExistingQuestionKeys(supabase) {
  const existingKeys = new Set()

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const to = from + FETCH_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('questions')
      .select('field, unit, question')
      .range(from, to)

    if (error) fail(`既存問題の取得に失敗しました: ${error.message}`)
    if (!data || data.length === 0) break

    data.forEach(question => {
      existingKeys.add(buildQuestionKey(question))
    })

    if (data.length < FETCH_PAGE_SIZE) break
  }

  return existingKeys
}

async function main() {
  const raw = readInput()
  const parsed = JSON.parse(raw)
  const items = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
      ? parsed.questions
      : null

  if (!items || items.length === 0) {
    fail('JSON は配列、または {"questions":[...]} の形で指定してください。')
  }

  const env = loadEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    fail('Supabase の環境変数が見つかりません。.env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を設定してください。')
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const questions = items.map(normalizeQuestion)
  const existingKeys = await fetchExistingQuestionKeys(supabase)
  const seenInBatch = new Set()
  const toInsert = []
  let skippedExisting = 0
  let skippedDuplicateInBatch = 0

  for (const question of questions) {
    const key = buildQuestionKey(question)

    if (existingKeys.has(key)) {
      skippedExisting += 1
      continue
    }

    if (seenInBatch.has(key)) {
      skippedDuplicateInBatch += 1
      continue
    }

    seenInBatch.add(key)
    toInsert.push(question)
  }

  for (let index = 0; index < toInsert.length; index += INSERT_CHUNK_SIZE) {
    const chunk = toInsert.slice(index, index + INSERT_CHUNK_SIZE)
    const { error } = await supabase.from('questions').insert(chunk)
    if (error) fail(`問題の追加に失敗しました: ${error.message}`)
  }

  process.stdout.write(`${JSON.stringify({
    provided: questions.length,
    inserted: toInsert.length,
    skipped_as_existing: skippedExisting,
    skipped_as_duplicate_in_batch: skippedDuplicateInBatch,
  }, null, 2)}\n`)
}

main().catch(error => {
  fail(error instanceof Error ? error.message : '不明なエラーが発生しました。')
})
