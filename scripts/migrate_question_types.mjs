#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readInput() {
  const inputPath = process.argv[2]

  if (!inputPath || inputPath === '-') {
    return {
      raw: fs.readFileSync(0, 'utf8'),
      inputPath: null,
    }
  }

  const resolved = path.resolve(process.cwd(), inputPath)
  return {
    raw: fs.readFileSync(resolved, 'utf8'),
    inputPath: resolved,
  }
}

function migrateQuestion(question) {
  const next = { ...question }

  if (next.type === 'choice' && Array.isArray(next.choices) && next.choices.length === 4) {
    next.type = 'choice4'
  }

  if (next.type === 'true_false') {
    next.choices = ['○', '×']
  }

  if ((next.type === 'match' || next.type === 'sort' || next.type === 'multi_select') && next.answer == null) {
    next.answer = ''
  }

  if (next.type === 'word_bank' && (!next.answer || !String(next.answer).trim()) && Array.isArray(next.word_tokens)) {
    next.answer = next.word_tokens.join(' ')
  }

  return next
}

const { raw, inputPath } = readInput()
const parsed = JSON.parse(raw)
const items = Array.isArray(parsed)
  ? parsed
  : Array.isArray(parsed?.questions)
    ? parsed.questions
    : null

if (!items) {
  fail('JSON は配列、または {"questions":[...]} の形で指定してください。')
}

const migrated = items.map(migrateQuestion)
const payload = Array.isArray(parsed)
  ? migrated
  : { ...parsed, questions: migrated }

if (process.argv.includes('--write')) {
  if (!inputPath) fail('--write はファイル入力のときだけ使えます。')
  fs.writeFileSync(inputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  process.stdout.write(`updated ${path.basename(inputPath)}\n`)
} else {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}
