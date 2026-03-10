#!/usr/bin/env node

import fs from 'node:fs'

const FIELDS = new Set(['生物', '化学', '物理', '地学'])

function fail(message) {
  console.error(message)
  process.exit(1)
}

function escapeSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
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

    return { field, unit, question, type, choices, answer, explanation, grade }
  }

  return { field, unit, question, type, choices: null, answer, explanation, grade }
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
  const choicesValue = question.choices
    ? `${escapeSqlString(JSON.stringify(question.choices))}::jsonb`
    : 'NULL'
  const explanationValue = question.explanation ? escapeSqlString(question.explanation) : 'NULL'

  return `  (${[
    escapeSqlString(question.field),
    escapeSqlString(question.unit),
    escapeSqlString(question.question),
    escapeSqlString(question.type),
    choicesValue,
    escapeSqlString(question.answer),
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
  explanation,
  grade
) VALUES
${values.join(',\n')};
`)
