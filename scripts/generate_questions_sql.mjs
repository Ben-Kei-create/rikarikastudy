#!/usr/bin/env node

import fs from 'node:fs'

const FIELDS = new Set(['生物', '化学', '物理', '地学'])
const QUESTION_TYPES = new Set(['choice', 'choice4', 'true_false', 'fill_choice', 'match', 'sort', 'multi_select', 'word_bank', 'text'])

function fail(message) {
  console.error(message)
  process.exit(1)
}

function escapeSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
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

  const choices = parseStringArray(item?.choices)
  const keywords = parseStringArray(item?.keywords)
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
    return { field, unit, question, type, choices, answer, keywords: null, explanation, grade, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'choice4' || type === 'fill_choice') {
    if (!choices || choices.length < 3 || choices.length > 4) fail(`${prefix}: ${type} は choices を3〜4件にしてください。`)
    if (!choices.includes(answer)) fail(`${prefix}: ${type} の answer は choices と一致させてください。`)
    if (type === 'fill_choice' && !question.includes('【')) fail(`${prefix}: fill_choice の question には【　　】を入れてください。`)
    return { field, unit, question, type, choices, answer, keywords: null, explanation, grade, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'true_false') {
    if (answer !== '○' && answer !== '×') fail(`${prefix}: true_false の answer は ○ か × にしてください。`)
    return { field, unit, question, type, choices: ['○', '×'], answer, keywords: null, explanation, grade, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'match') {
    if (!matchPairs || matchPairs.length < 2) fail(`${prefix}: match は match_pairs を2組以上入れてください。`)
    return { field, unit, question, type, choices: null, answer: '', keywords: null, explanation, grade, match_pairs: matchPairs, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'sort') {
    if (!sortItems || sortItems.length < 3) fail(`${prefix}: sort は sort_items を3件以上入れてください。`)
    return { field, unit, question, type, choices: null, answer: '', keywords: null, explanation, grade, match_pairs: null, sort_items: sortItems, correct_choices: null, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'multi_select') {
    if (!choices || choices.length < 4) fail(`${prefix}: multi_select は choices を4件以上にしてください。`)
    if (!correctChoices || correctChoices.length < 2) fail(`${prefix}: multi_select は correct_choices を2件以上にしてください。`)
    if (!correctChoices.every(choice => choices.includes(choice))) fail(`${prefix}: multi_select の correct_choices は choices の中から選んでください。`)
    return { field, unit, question, type, choices, answer: '', keywords: null, explanation, grade, match_pairs: null, sort_items: null, correct_choices: correctChoices, word_tokens: null, distractor_tokens: null }
  }

  if (type === 'word_bank') {
    if (!wordTokens || wordTokens.length < 2) fail(`${prefix}: word_bank は word_tokens を2件以上にしてください。`)
    if (!distractorTokens || distractorTokens.length < 1) fail(`${prefix}: word_bank は distractor_tokens を1件以上にしてください。`)
    return { field, unit, question, type, choices: null, answer: answer || wordTokens.join(' '), keywords: null, explanation, grade, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: wordTokens, distractor_tokens: distractorTokens }
  }

  if (!answer) fail(`${prefix}: text の answer は必須です。`)
  return { field, unit, question, type, choices: null, answer, keywords, explanation, grade, match_pairs: null, sort_items: null, correct_choices: null, word_tokens: null, distractor_tokens: null }
}

const inputPath = process.argv[2]

if (!inputPath) {
  fail('Usage: node scripts/generate_questions_sql.mjs <questions.json>')
}

const raw = fs.readFileSync(inputPath, 'utf8')
const parsed = JSON.parse(raw)
const items = Array.isArray(parsed)
  ? parsed
  : Array.isArray(parsed?.questions)
    ? parsed.questions
    : null

if (!items || items.length === 0) {
  fail('JSON は配列、または {"questions":[...]} の形で指定してください。')
}

const questions = items.map(normalizeQuestion)

const values = questions.map(question => {
  const toJsonb = value => value ? `${escapeSqlString(JSON.stringify(value))}::jsonb` : 'NULL'
  const explanationValue = question.explanation ? escapeSqlString(question.explanation) : 'NULL'

  return `  (${[
    escapeSqlString(question.field),
    escapeSqlString(question.unit),
    escapeSqlString(question.question),
    escapeSqlString(question.type),
    toJsonb(question.choices),
    escapeSqlString(question.answer),
    toJsonb(question.keywords),
    toJsonb(question.match_pairs),
    toJsonb(question.sort_items),
    toJsonb(question.correct_choices),
    toJsonb(question.word_tokens),
    toJsonb(question.distractor_tokens),
    explanationValue,
    escapeSqlString(question.grade),
  ].join(', ')})`
})

process.stdout.write(`INSERT INTO questions (
  field,
  unit,
  question,
  type,
  choices,
  answer,
  keywords,
  match_pairs,
  sort_items,
  correct_choices,
  word_tokens,
  distractor_tokens,
  explanation,
  grade
) VALUES
${values.join(',\n')};
`)
