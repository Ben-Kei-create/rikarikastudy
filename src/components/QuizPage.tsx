'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { isAnswerMatch } from '@/lib/answerUtils'
import { isMissingColumnError, markColumnMissing } from '@/lib/schemaCompat'

const FIELD_COLORS: Record<string, string> = {
  '生物': 'var(--bio)', '化学': 'var(--chem)', '物理': 'var(--phys)', '地学': 'var(--earth)',
}

interface Question {
  id: string; field: string; unit: string; question: string
  type: 'choice' | 'text'; choices: string[] | null; answer: string
  accept_answers: string[] | null; explanation: string | null
}

type Phase = 'answering' | 'result' | 'finished'

export default function QuizPage({
  field, unit, isDrill = false, onBack,
}: {
  field: string; unit: string; isDrill?: boolean; onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const color = FIELD_COLORS[field]

  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<Phase>('answering')
  const [selected, setSelected] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [answerLogs, setAnswerLogs] = useState<{ qId: string; correct: boolean; answer: string }[]>([])
  const startedAtRef = useRef<number | null>(null)
  const questionStartRef = useRef<number | null>(null)
  const answerLockedRef = useRef(false)
  const [timePenalty, setTimePenalty] = useState(0)

  useEffect(() => {
    ;(async () => {
      setLoading(true); setQuestions([]); setCurrent(0); setPhase('answering')
      setSelected(null); setTextInput(''); setIsCorrect(null); setScore(0)
      setAnswerLogs([]); setTimePenalty(0); startedAtRef.current = null; answerLockedRef.current = false

      const baseQuery = () => {
        let query = supabase.from('questions').select('*').eq('field', field)
        if (unit !== 'all') query = query.eq('unit', unit)
        return query
      }

      let { data, error } = await baseQuery().or(
        studentId
          ? `created_by_student_id.is.null,created_by_student_id.eq.${studentId}`
          : 'created_by_student_id.is.null'
      )

      if (isMissingColumnError(error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        const fallback = await baseQuery()
        data = fallback.data
        error = fallback.error
      }

      if (!error && data && data.length > 0) {
        setQuestions([...data].sort(() => Math.random() - 0.5).slice(0, 10))
        startedAtRef.current = Date.now()
      }
      setLoading(false)
    })()
  }, [field, unit, studentId])

  useEffect(() => {
    questionStartRef.current = Date.now()
  }, [current])

  const q = questions[current]
  const progress = questions.length > 0 ? (current / questions.length) * 100 : 0

  const handleChoice = (choice: string) => {
    if (phase !== 'answering' || answerLockedRef.current) return
    const elapsed = questionStartRef.current ? Date.now() - questionStartRef.current : 0
    if (elapsed < 1000) return
    answerLockedRef.current = true
    const correct = choice === q.answer
    setSelected(choice); setIsCorrect(correct)
    if (correct) setScore(s => s + 1)
    else setTimePenalty(p => p + 5)
    setAnswerLogs(logs => [...logs, { qId: q.id, correct, answer: choice }])
    setPhase('result')
  }

  const handleTextSubmit = () => {
    const answer = textInput.trim()
    if (!answer || answerLockedRef.current) return
    const elapsed = questionStartRef.current ? Date.now() - questionStartRef.current : 0
    if (elapsed < 1000) return
    answerLockedRef.current = true
    const correct = isAnswerMatch(answer, q.answer, q.accept_answers)
    setIsCorrect(correct)
    if (correct) setScore(s => s + 1)
    else setTimePenalty(p => p + 5)
    setAnswerLogs(logs => [...logs, { qId: q.id, correct, answer }])
    setPhase('result')
  }

  const handleNext = async () => {
    if (current + 1 >= questions.length) {
      const actualDuration = startedAtRef.current
        ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
        : 0
      const durationSeconds = actualDuration + timePenalty
      const { data: sessionData } = await supabase
        .from('quiz_sessions')
        .insert({
          student_id: studentId!, field,
          unit: unit === 'all' ? '全単元' : unit,
          total_questions: questions.length,
          correct_count: score,
          duration_seconds: durationSeconds,
        })
        .select().single()

      if (sessionData) {
        await supabase.from('answer_logs').insert(
          answerLogs.map(l => ({
            session_id: sessionData.id, student_id: studentId!,
            question_id: l.qId, is_correct: l.correct, student_answer: l.answer,
          }))
        )
      }
      setPhase('finished')
    } else {
      answerLockedRef.current = false
      setCurrent(c => c + 1); setPhase('answering')
      setSelected(null); setTextInput(''); setIsCorrect(null)
    }
  }

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div style={{ color: 'var(--text-secondary)' }}>問題を読み込み中...</div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="page-shell flex flex-col items-center justify-center">
        <div className="card w-full max-w-sm text-center">
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>問題がまだ登録されていません。</p>
          <div className="flex gap-3 justify-center">
            <button onClick={onBack} className="btn-secondary">もどる</button>
            <button onClick={() => logout()} className="btn-ghost">ログアウト</button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'finished') {
    const rate = Math.round((score / questions.length) * 100)
    const msg = rate >= 90 ? 'すごい！完璧に近い！' : rate >= 70 ? 'よくできました！' : rate >= 50 ? 'もう少しがんばろう！' : '復習してみよう！'
    return (
      <div className="page-shell flex flex-col items-center justify-center anim-fade">
        <div className="card w-full max-w-sm text-center">
          <div className="text-5xl mb-3">{rate >= 70 ? '🏆' : '📚'}</div>
          <div className="text-4xl font-bold mb-1" style={{ color }}>
            {score} / {questions.length}
          </div>
          <div className="text-2xl font-bold" style={{
            color: rate >= 70 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)',
          }}>{rate}%</div>
          <p className="mt-2 mb-5" style={{ color: 'var(--text-secondary)' }}>{msg}</p>

          <div className="flex gap-1.5 justify-center mb-6">
            {questions.map((_, i) => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: answerLogs[i]?.correct ? 'var(--success)' : 'var(--danger)',
              }} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                answerLockedRef.current = false
                startedAtRef.current = Date.now(); setCurrent(0); setPhase('answering')
                setScore(0); setSelected(null); setTextInput(''); setIsCorrect(null); setAnswerLogs([]); setTimePenalty(0)
              }}
              className="btn-secondary !px-0 !py-3 text-sm"
            >もう一度</button>
            <button onClick={onBack} className="btn-primary !py-3 text-sm">
              {isDrill ? 'マイページへ' : '分野選択へ'}
            </button>
            <button onClick={() => logout()} className="btn-ghost !px-0 !py-3 text-sm">ログアウト</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      {/* Progress */}
      <div className="card mb-3 anim-fade-up">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button onClick={onBack} className="btn-secondary text-sm !px-3 !py-2 order-1">やめる</button>
          <div className="w-full order-3 sm:order-2 sm:flex-1">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              <span>{isDrill ? `復習: ${field} / ${unit}` : unit === 'all' ? '全単元' : unit}</span>
              <span>{current + 1} / {questions.length}</span>
            </div>
            <div className="soft-track" style={{ height: 6 }}>
              <div style={{
                width: `${progress}%`, height: '100%', background: color,
                borderRadius: 999, transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
          <div className="text-sm font-semibold order-2 sm:order-3" style={{ color }}>{score}正解</div>
          <button onClick={() => logout()} className="btn-ghost text-sm !px-3 !py-2 order-4">ログアウト</button>
        </div>
      </div>

      {/* Question */}
      <div key={current} className="card anim-fade-up mb-3">
        <div className="flex items-center gap-2 mb-2">
          {isDrill ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(255,149,0,0.12)', color: 'var(--warning)' }}>復習モード</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }}>{q.field} · {q.unit}</span>
          )}
          <span className="px-2 py-0.5 rounded-full text-xs"
            style={{ background: 'var(--input-bg)', color: 'var(--text-tertiary)' }}>
            {q.type === 'choice' ? `${q.choices?.length ?? 0}択` : '記述'}
          </span>
        </div>
        <p className="text-lg font-bold leading-relaxed">{q.question}</p>
      </div>

      {/* Choices / Text */}
      {q.type === 'choice' ? (
        <div className="grid gap-2">
          {q.choices?.map((c, i) => {
            let bg = 'var(--surface-grouped)'
            let border = '2px solid transparent'
            let textColor = 'var(--text)'
            if (phase === 'result') {
              if (c === q.answer) { bg = 'rgba(52,199,89,0.1)'; border = '2px solid var(--success)'; textColor = 'var(--success)' }
              else if (c === selected && !isCorrect) { bg = 'rgba(255,59,48,0.1)'; border = '2px solid var(--danger)'; textColor = 'var(--danger)' }
            }
            return (
              <button
                key={i} onClick={() => handleChoice(c)} disabled={phase === 'result'}
                className="p-4 rounded-xl text-left font-semibold transition-all anim-fade-up"
                style={{ animationDelay: `${i * 0.05}s`, background: bg, border, color: textColor, boxShadow: 'var(--shadow-sm)' }}
              >
                <span className="mr-2 opacity-40">{'ABCD'[i] ?? `${i + 1}`}.</span>{c}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="anim-fade-up">
          <textarea
            value={textInput} onChange={e => setTextInput(e.target.value)}
            disabled={phase === 'result'} placeholder="ここに答えを書いてください"
            rows={3} className="input-surface resize-none mb-3"
            style={{ border: phase === 'result' ? `2px solid ${isCorrect ? 'var(--success)' : 'var(--danger)'}` : undefined }}
          />
          {phase === 'answering' && (
            <button onClick={handleTextSubmit} disabled={!textInput.trim()} className="btn-primary w-full">答えを提出</button>
          )}
        </div>
      )}

      {/* Result */}
      {phase === 'result' && (
        <div className="card mt-3 anim-pop" style={{
          background: isCorrect ? 'rgba(52,199,89,0.08)' : 'rgba(255,59,48,0.08)',
        }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{isCorrect ? '✅' : '❌'}</span>
            <span className="font-bold" style={{ color: isCorrect ? 'var(--success)' : 'var(--danger)' }}>
              {isCorrect ? '正解！' : `不正解 → 答え：${q.answer}`}
            </span>
          </div>
          {q.explanation && (
            <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>{q.explanation}</p>
          )}
          <button onClick={handleNext} className="btn-primary w-full">
            {current + 1 >= questions.length ? '結果を見る' : '次の問題 →'}
          </button>
        </div>
      )}
    </div>
  )
}
