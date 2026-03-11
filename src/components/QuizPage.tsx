'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { evaluateTextAnswer, TextAnswerResult } from '@/lib/answerUtils'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'

const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e', '化学': '#f97316', '物理': '#3b82f6', '地学': '#a855f7',
  'all': '#38bdf8',
}
const CORE_FIELDS = ['生物', '化学', '物理', '地学']

function pickQuizQuestions(pool: Question[], field: string) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)

  if (field !== 'all') {
    return shuffled.slice(0, 10)
  }

  const picked: Question[] = []
  const usedIds = new Set<string>()

  for (const currentField of CORE_FIELDS) {
    const candidate = shuffled.find(question => question.field === currentField && !usedIds.has(question.id))
    if (!candidate) continue
    picked.push(candidate)
    usedIds.add(candidate.id)
  }

  for (const question of shuffled) {
    if (usedIds.has(question.id)) continue
    picked.push(question)
    usedIds.add(question.id)
    if (picked.length >= 10) break
  }

  return picked.slice(0, 10)
}

interface Question {
  id: string
  field: string
  unit: string
  question: string
  type: 'choice' | 'text'
  choices: string[] | null
  answer: string
  accept_answers: string[] | null
  keywords: string[] | null
  explanation: string | null
}

type Phase = 'answering' | 'result' | 'finished'

export default function QuizPage({
  field,
  unit,
  isDrill = false,
  quickStartAll = false,
  onBack,
}: {
  field: string
  unit: string
  isDrill?: boolean
  quickStartAll?: boolean
  onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const color = FIELD_COLORS[field] ?? '#38bdf8'

  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<Phase>('answering')
  const [selected, setSelected] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [answerResult, setAnswerResult] = useState<TextAnswerResult | null>(null)
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [answerLogs, setAnswerLogs] = useState<{ qId: string; correct: boolean; answer: string; result: TextAnswerResult }[]>([])
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setQuestions([])
      setCurrent(0)
      setPhase('answering')
      setSelected(null)
      setTextInput('')
      setAnswerResult(null)
      setScore(0)
      setAnswerLogs([])
      startedAtRef.current = null

      let query = supabase.from('questions').select('*')
      if (field !== 'all') query = query.eq('field', field)
      if (unit !== 'all') query = query.eq('unit', unit)
      const supportsStudentQuestionFilter = getCachedColumnSupport('created_by_student_id') !== false

      if (supportsStudentQuestionFilter) {
        query = query.or(
          studentId
            ? `created_by_student_id.is.null,created_by_student_id.eq.${studentId}`
            : 'created_by_student_id.is.null'
        )
      }

      let { data, error } = await query

      // Backward compatibility for deployments where created_by_student_id is not migrated yet.
      if (error && isMissingColumnError(error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        let fallbackQuery = supabase.from('questions').select('*')
        if (field !== 'all') fallbackQuery = fallbackQuery.eq('field', field)
        if (unit !== 'all') fallbackQuery = fallbackQuery.eq('unit', unit)
        const fallbackResponse = await fallbackQuery
        data = fallbackResponse.data
        error = fallbackResponse.error
      } else if (!error && supportsStudentQuestionFilter) {
        markColumnSupported('created_by_student_id')
      }

      if (error) {
        console.error('[quiz] failed to load questions', error)
        setLoading(false)
        return
      }

      if (data && data.length > 0) {
        setQuestions(pickQuizQuestions(data as Question[], field))
        startedAtRef.current = Date.now()
      }
      setLoading(false)
    }
    load()
  }, [field, unit, studentId])

  const q = questions[current]
  const progress = questions.length > 0 ? ((current) / questions.length) * 100 : 0

  const handleChoice = (choice: string) => {
    if (phase !== 'answering') return
    const result: TextAnswerResult = choice === q.answer ? 'exact' : 'incorrect'
    setSelected(choice)
    setAnswerResult(result)
    if (result === 'exact') setScore(s => s + 1)
    setAnswerLogs(logs => [...logs, { qId: q.id, correct: result === 'exact', answer: choice, result }])
    setPhase('result')
  }

  const handleTextSubmit = () => {
    const answer = textInput.trim()
    if (!answer) return
    const result = evaluateTextAnswer(answer, q.answer, q.accept_answers, q.keywords)
    setAnswerResult(result)
    if (result === 'exact') setScore(s => s + 1)
    setAnswerLogs(logs => [...logs, { qId: q.id, correct: result === 'exact', answer, result }])
    setPhase('result')
  }

  const handleNext = async () => {
    if (current + 1 >= questions.length) {
      const durationSeconds = startedAtRef.current
        ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
        : 0

      // セッション保存
      let sessionResponse = await supabase
        .from('quiz_sessions')
        .insert({
          student_id: studentId!,
          field: quickStartAll ? '4分野総合' : field,
          unit: quickStartAll ? 'クイックスタート' : unit === 'all' ? '全単元' : unit,
          total_questions: questions.length,
          correct_count: score,
          duration_seconds: durationSeconds,
        })
        .select()
        .single()

      if (sessionResponse.error && isMissingColumnError(sessionResponse.error, 'duration_seconds')) {
        markColumnMissing('duration_seconds')
        sessionResponse = await supabase
          .from('quiz_sessions')
          .insert({
            student_id: studentId!,
            field: quickStartAll ? '4分野総合' : field,
            unit: quickStartAll ? 'クイックスタート' : unit === 'all' ? '全単元' : unit,
            total_questions: questions.length,
            correct_count: score,
          })
          .select()
          .single()
      } else if (!sessionResponse.error) {
        markColumnSupported('duration_seconds')
      }

      const sessionData = sessionResponse.data

      if (sessionResponse.error) {
        console.error('[quiz] failed to save session', sessionResponse.error)
      }

      if (sessionData) {
        const sid = sessionData.id
        // 回答ログ保存
        const logs = answerLogs.map(l => ({
          session_id: sid,
          student_id: studentId!,
          question_id: l.qId,
          is_correct: l.correct,
          student_answer: l.answer,
        }))
        await supabase.from('answer_logs').insert(logs)
      }
      setPhase('finished')
    } else {
      setCurrent(c => c + 1)
      setPhase('answering')
      setSelected(null)
      setTextInput('')
      setAnswerResult(null)
    }
  }

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card text-slate-400">問題を読み込み中...</div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="page-shell flex flex-col items-center justify-center">
        <div className="card w-full max-w-md text-center">
          <p className="text-slate-400 mb-4">問題がまだ登録されていません。</p>
          <div className="flex gap-3 justify-center">
            <button onClick={onBack} className="btn-secondary">もどる</button>
            <button
              onClick={() => logout()}
              className="btn-ghost"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 終了画面
  if (phase === 'finished') {
    const rate = Math.round((score / questions.length) * 100)
    const msg = rate >= 90 ? '🎉 すごい！完璧に近い！' : rate >= 70 ? '👍 よくできました！' : rate >= 50 ? '😊 もう少しがんばろう！' : '💪 復習してみよう！'
    const backLabel = isDrill ? 'マイページへ' : quickStartAll ? 'ホームへ' : '分野選択へ'
    return (
      <div className="page-shell flex flex-col items-center justify-center anim-fade">
        <div className="hero-card w-full max-w-2xl text-center p-6 sm:p-7">
          <div className="text-5xl mb-4">{rate >= 70 ? '🏆' : '📚'}</div>
          <div className="font-display text-4xl mb-2" style={{ color }}>
            {score} / {questions.length}
          </div>
          <div className="text-2xl font-bold mb-1" style={{
            color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
          }}>{rate}%</div>
          <p className="text-slate-300 mb-6">{msg}</p>

          {/* 分布 */}
          <div className="flex gap-2 justify-center mb-8">
            {questions.map((_, i) => (
              <div key={i} style={{
                width: 12, height: 12, borderRadius: '50%',
                background: answerLogs[i]?.result === 'exact' ? '#22c55e' : answerLogs[i]?.result === 'keyword' ? '#f59e0b' : '#ef4444',
              }} />
            ))}
          </div>
          {answerLogs.some(log => log.result === 'keyword') && (
            <p className="text-xs text-slate-500 mb-8">▲ はキーワード一致で、スコアには加算していません。</p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              onClick={() => {
                startedAtRef.current = Date.now()
                setCurrent(0)
                setPhase('answering')
                setScore(0)
                setSelected(null)
                setTextInput('')
                setAnswerResult(null)
                setAnswerLogs([])
              }}
              className="btn-secondary !px-0 !py-3"
            >
              もう一度
            </button>
            <button onClick={onBack} className="btn-primary py-3">
              {backLabel}
            </button>
            <button
              onClick={() => logout()}
              className="btn-ghost !px-0 !py-3"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
    )
  }

  // クイズ画面
  return (
    <div className="page-shell">
      <div className="card mb-4 anim-fade-up">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center justify-between gap-3 sm:w-auto">
            <button onClick={onBack} className="btn-secondary text-sm !px-4 !py-2.5">
              やめる
            </button>
            <button
              onClick={() => logout()}
              className="btn-ghost text-sm !px-4 !py-2.5 sm:hidden"
            >
              ログアウト
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>
                {isDrill
                  ? `復習: ${field} / ${unit}`
                  : quickStartAll
                    ? '4分野総合クイックスタート'
                    : unit === 'all'
                      ? '全単元'
                      : unit}
              </span>
              <span>{current + 1} / {questions.length}</span>
            </div>
            <div className="soft-track" style={{ height: 8 }}>
              <div style={{
                width: `${progress}%`, height: '100%',
                background: `linear-gradient(90deg, ${color}, ${color}80)`,
                borderRadius: 999,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="text-sm font-semibold" style={{ color }}>
              {score}正解
            </div>
            <button
              onClick={() => logout()}
              className="btn-ghost hidden text-sm !px-4 !py-2.5 sm:inline-flex"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div key={current} className="card anim-fade-up mb-4">
        <div className="flex items-center gap-2 mb-3">
          {isDrill ? (
            <span
              className="px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: '#f59e0b20', color: '#fbbf24' }}
            >
              復習モード
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${color}20`, color }}>
              {q.field} · {q.unit}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(148, 163, 184, 0.14)', color: '#b6c2d2' }}>
            {q.type === 'choice' ? `${q.choices?.length ?? 0}択` : '記述'}
          </span>
        </div>
        <p className="text-lg font-bold leading-relaxed text-white sm:text-[1.35rem]">{q.question}</p>
      </div>

      {/* 選択肢 / 記述 */}
      {q.type === 'choice' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {q.choices?.map((c, i) => {
            let bg = 'var(--surface-elevated)'
            let border = '1px solid var(--surface-elevated-border)'
            let textColor = '#e2e8f0'
            if (phase === 'result') {
              if (c === q.answer) { bg = '#14532d'; border = '2px solid #22c55e'; textColor = '#86efac' }
              else if (c === selected && answerResult === 'incorrect') { bg = '#450a0a'; border = '2px solid #ef4444'; textColor = '#fca5a5' }
            }
            return (
              <button
                key={i}
                onClick={() => handleChoice(c)}
                disabled={phase === 'result'}
                className="min-h-[92px] p-4 rounded-xl text-left font-bold transition-all anim-fade-up"
                style={{ animationDelay: `${i * 0.06}s`, background: bg, border, color: textColor }}
              >
                <span className="mr-3 opacity-50">{'ABCD'[i] ?? `${i + 1}` }.</span>{c}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="anim-fade-up">
          <textarea
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            disabled={phase === 'result'}
            placeholder="ここに答えを書いてください"
            rows={3}
            className="input-surface resize-none mb-3"
            style={{
              border: phase === 'result'
                ? `2px solid ${answerResult === 'exact' ? '#22c55e' : answerResult === 'keyword' ? '#f59e0b' : '#ef4444'}`
                : undefined,
              fontSize: '1rem',
            }}
          />
          {phase === 'answering' && (
            <button onClick={handleTextSubmit} disabled={!textInput.trim()} className="btn-primary w-full">
              答えを提出
            </button>
          )}
        </div>
      )}

      {/* 解説 */}
      {phase === 'result' && (
        (() => {
          const currentResult = answerResult ?? 'incorrect'
          const accent = currentResult === 'exact' ? '#22c55e' : currentResult === 'keyword' ? '#f59e0b' : '#ef4444'
          const background = currentResult === 'exact'
            ? 'rgba(34, 197, 94, 0.12)'
            : currentResult === 'keyword'
              ? 'rgba(245, 158, 11, 0.12)'
              : 'rgba(239, 68, 68, 0.12)'
          const title = currentResult === 'exact'
            ? '◯ 正解！'
            : currentResult === 'keyword'
              ? '▲ キーワード一致'
              : '❌ 不正解'

          return (
            <div className={`card mt-4 anim-pop`} style={{ borderColor: `${accent}50`, background }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-lg" style={{ color: accent }}>
                  {title}
                </span>
              </div>
              {currentResult !== 'exact' && (
                <p className="text-slate-200 text-sm mb-2">模範解答: {q.answer}</p>
              )}
              {currentResult === 'keyword' && (
                <p className="text-amber-200 text-xs mb-2">キーワードを含むため部分一致です。スコアには加算しません。</p>
              )}
              {q.explanation && (
                <p className="text-slate-300 text-sm leading-relaxed">{q.explanation}</p>
              )}
              <button onClick={handleNext} className="btn-primary w-full mt-4">
                {current + 1 >= questions.length ? '結果を見る' : '次の問題 →'}
              </button>
            </div>
          )
        })()
      )}
    </div>
  )
}
