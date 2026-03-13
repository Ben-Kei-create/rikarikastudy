#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const FIELDS = new Set(['生物', '化学', '物理', '地学'])
const QUESTION_TYPES = new Set(['choice', 'choice4', 'true_false', 'fill_choice', 'match', 'sort', 'multi_select', 'word_bank', 'text'])
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

function parseStringArray(value) {
  if (!Array.isArray(value)) return null
  const items = value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
  return items.length > 0 ? items : null
}

function parseMatchPairs(value) {
  if (!Array.isArray(value)) return null
  const pairs = value
    .map(item => {
      const row = typeof item === 'object' && item !== null ? item : {}
      const left = typeof row.left === 'string' ? row.left.trim() : ''
      const right = typeof row.right === 'string' ? row.right.trim() : ''
      return left && right ? { left, right } : null
    })
    .filter(Boolean)
  return pairs.length > 0 ? pairs : null
}

function normalizeQuestion(item, index) {
  const prefix = `${index + 1}問目`
  const field = typeof item?.field === 'string' ? item.field.trim() : ''
  const unit = typeof item?.unit === 'string' ? item.unit.trim() : ''
  const question = typeof item?.question === 'string' ? item.question.trim() : ''
  const type = typeof item?.type === 'string' ? item.type.trim() : ''
  const answer = typeof item?.answer === 'string' ? item.answer.trim() : ''
  const explanation = typeof item?.explanation === 'string' && item.explanation.trim()
    ? item.explanation.trim()
    : null
  const grade = typeof item?.grade === 'string' && item.grade.trim()
    ? item.grade.trim()
    : '中3'

  const acceptAnswers = parseStringArray(item?.accept_answers)
  const keywords = parseStringArray(item?.keywords)
  const choices = parseStringArray(item?.choices)
  const matchPairs = parseMatchPairs(item?.match_pairs)
  const sortItems = parseStringArray(item?.sort_items)
  const correctChoices = parseStringArray(item?.correct_choices)
  const wordTokens = parseStringArray(item?.word_tokens)
  const distractorTokens = parseStringArray(item?.distractor_tokens)

  if (!FIELDS.has(field)) fail(`${prefix}: field は 生物 / 化学 / 物理 / 地学 のどれかにしてください。`)
  if (!unit) fail(`${prefix}: unit は必須です。`)
  if (!question) fail(`${prefix}: question は必須です。`)
  if (!QUESTION_TYPES.has(type)) fail(`${prefix}: type が不正です。`)

  if (type === 'choice') {
    if (!choices || choices.length !== 2) fail(`${prefix}: choice は choices を2件にしてください。`)
    if (!choices.includes(answer)) fail(`${prefix}: choice の answer は choices と一致させてください。`)
    return { field, unit, question, type, choices, answer, explanation, grade, accept_answers: acceptAnswers, keywords: null, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'choice4' || type === 'fill_choice') {
    if (!choices || choices.length < 3 || choices.length > 4) fail(`${prefix}: ${type} は choices を3〜4件にしてください。`)
    if (!choices.includes(answer)) fail(`${prefix}: ${type} の answer は choices と一致させてください。`)
    if (type === 'fill_choice' && !question.includes('【')) fail(`${prefix}: fill_choice の question には【　　】を入れてください。`)
    return { field, unit, question, type, choices, answer, explanation, grade, accept_answers: acceptAnswers, keywords: null, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'true_false') {
    if (answer !== '○' && answer !== '×') fail(`${prefix}: true_false の answer は ○ か × にしてください。`)
    return { field, unit, question, type, choices: ['○', '×'], answer, explanation, grade, accept_answers: acceptAnswers, keywords: null, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'match') {
    if (!matchPairs || matchPairs.length < 2) fail(`${prefix}: match は match_pairs を2組以上入れてください。`)
    return { field, unit, question, type, choices: null, answer: '', explanation, grade, accept_answers: acceptAnswers, keywords: null, match_pairs: matchPairs, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'sort') {
    if (!sortItems || sortItems.length < 3) fail(`${prefix}: sort は sort_items を3件以上入れてください。`)
    return { field, unit, question, type, choices: null, answer: '', explanation, grade, accept_answers: acceptAnswers, keywords: null, match_pairs: null, sort_items: sortItems, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'multi_select') {
    if (!choices || choices.length < 4) fail(`${prefix}: multi_select は choices を4件以上入れてください。`)
    if (!correctChoices || correctChoices.length < 2) fail(`${prefix}: multi_select は correct_choices を2件以上入れてください。`)
    if (!correctChoices.every(choice => choices.includes(choice))) fail(`${prefix}: multi_select の correct_choices は choices の中から選んでください。`)
    return { field, unit, question, type, choices, answer: '', explanation, grade, accept_answers: acceptAnswers, keywords: null, match_pairs: null, sort_items: null, correct_choices: correctChoices, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'word_bank') {
    if (!wordTokens || wordTokens.length < 2) fail(`${prefix}: word_bank は word_tokens を2件以上入れてください。`)
    if (!distractorTokens || distractorTokens.length < 1) fail(`${prefix}: word_bank は distractor_tokens を1件以上入れてください。`)
    return { field, unit, question, type, choices: null, answer: answer || wordTokens.join(' '), explanation, grade, accept_answers: acceptAnswers, keywords: null, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: wordTokens, distractor_tokens: distractorTokens }
  }

  if (!answer) fail(`${prefix}: text の answer は必須です。`)
  return { field, unit, question, type, choices: null, answer, explanation, grade, accept_answers: acceptAnswers, keywords, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
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
