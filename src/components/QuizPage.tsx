'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e', '化学': '#f97316', '物理': '#3b82f6', '地学': '#a855f7',
}

interface Question {
  id: string
  field: string
  unit: string
  question: string
  type: 'choice' | 'text'
  choices: string[] | null
  answer: string
  explanation: string | null
}

type Phase = 'answering' | 'result' | 'finished'

export default function QuizPage({
  field,
  unit,
  onBack,
}: {
  field: string
  unit: string
  onBack: () => void
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
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [answerLogs, setAnswerLogs] = useState<{ qId: string; correct: boolean; answer: string }[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      let query = supabase.from('questions').select('*').eq('field', field)
      if (unit !== 'all') query = query.eq('unit', unit)
      const { data } = await query
      if (data && data.length > 0) {
        const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 10)
        setQuestions(shuffled)
      }
      setLoading(false)
    }
    load()
  }, [field, unit])

  const q = questions[current]
  const progress = questions.length > 0 ? ((current) / questions.length) * 100 : 0

  const handleChoice = (choice: string) => {
    if (phase !== 'answering') return
    const correct = choice === q.answer
    setSelected(choice)
    setIsCorrect(correct)
    if (correct) setScore(s => s + 1)
    setAnswerLogs(logs => [...logs, { qId: q.id, correct, answer: choice }])
    setPhase('result')
  }

  const handleTextSubmit = () => {
    if (!textInput.trim()) return
    const correct = textInput.trim() === q.answer.trim()
    setIsCorrect(correct)
    if (correct) setScore(s => s + 1)
    setAnswerLogs(logs => [...logs, { qId: q.id, correct, answer: textInput.trim() }])
    setPhase('result')
  }

  const handleNext = async () => {
    if (current + 1 >= questions.length) {
      // セッション保存
      const { data: sessionData } = await supabase
        .from('quiz_sessions')
        .insert({
          student_id: studentId!,
          field,
          unit: unit === 'all' ? '全単元' : unit,
          total_questions: questions.length,
          correct_count: score + (isCorrect ? 0 : 0), // すでに加算済み
        })
        .select()
        .single()

      if (sessionData) {
        const sid = sessionData.id
        setSessionId(sid)
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
      setIsCorrect(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">問題を読み込み中...</div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <p className="text-slate-400 mb-4">問題がまだ登録されていません。</p>
        <div className="flex gap-3">
          <button onClick={onBack} className="btn-primary">もどる</button>
          <button
            onClick={() => logout()}
            className="px-4 py-3 rounded-xl text-sm transition-all"
            style={{ background: '#1e293b', color: '#64748b', border: '1px solid #334155' }}
          >
            ログアウト
          </button>
        </div>
      </div>
    )
  }

  // 終了画面
  if (phase === 'finished') {
    const rate = Math.round((score / questions.length) * 100)
    const msg = rate >= 90 ? '🎉 すごい！完璧に近い！' : rate >= 70 ? '👍 よくできました！' : rate >= 50 ? '😊 もう少しがんばろう！' : '💪 復習してみよう！'
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 anim-fade">
        <div className="card w-full max-w-sm text-center">
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
                background: answerLogs[i]?.correct ? '#22c55e' : '#ef4444',
              }} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => { setCurrent(0); setPhase('answering'); setScore(0); setSelected(null); setTextInput(''); setIsCorrect(null); setAnswerLogs([]) }}
              className="py-3 rounded-xl font-bold transition-all"
              style={{ background: '#334155', color: '#cbd5e1' }}
            >
              もう一度
            </button>
            <button onClick={onBack} className="btn-primary py-3">
              分野選択へ
            </button>
            <button
              onClick={() => logout()}
              className="py-3 rounded-xl text-sm transition-all"
              style={{ background: '#1e293b', color: '#64748b', border: '1px solid #334155' }}
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
    <div className="min-h-screen p-6 max-w-lg mx-auto">
      {/* プログレス */}
      <div className="flex items-center gap-3 mb-6 anim-fade-up">
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors text-sm">
          ← やめる
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{unit === 'all' ? '全単元' : unit}</span>
            <span>{current + 1} / {questions.length}</span>
          </div>
          <div style={{ background: '#1e293b', borderRadius: 8, height: 6 }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: `linear-gradient(90deg, ${color}, ${color}80)`,
              borderRadius: 8,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
        <div className="text-sm font-bold" style={{ color }}>
          {score}正解
        </div>
        <button
          onClick={() => logout()}
          className="px-3 py-2 rounded-xl text-sm transition-all"
          style={{ background: '#1e293b', color: '#64748b', border: '1px solid #334155' }}
        >
          ログアウト
        </button>
      </div>

      {/* 問題カード */}
      <div key={current} className="card anim-fade-up mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${color}20`, color }}>
            {q.field} · {q.unit}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#334155', color: '#94a3b8' }}>
            {q.type === 'choice' ? `${q.choices?.length ?? 0}択` : '記述'}
          </span>
        </div>
        <p className="text-lg font-bold leading-relaxed text-white">{q.question}</p>
      </div>

      {/* 選択肢 / 記述 */}
      {q.type === 'choice' ? (
        <div className="grid gap-3">
          {q.choices?.map((c, i) => {
            let bg = '#1e293b'
            let border = '1px solid #334155'
            let textColor = '#e2e8f0'
            if (phase === 'result') {
              if (c === q.answer) { bg = '#14532d'; border = '2px solid #22c55e'; textColor = '#86efac' }
              else if (c === selected && !isCorrect) { bg = '#450a0a'; border = '2px solid #ef4444'; textColor = '#fca5a5' }
            }
            return (
              <button
                key={i}
                onClick={() => handleChoice(c)}
                disabled={phase === 'result'}
                className="p-4 rounded-xl text-left font-bold transition-all anim-fade-up"
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
            className="w-full p-4 rounded-xl outline-none resize-none mb-3"
            style={{
              background: '#1e293b',
              border: phase === 'result'
                ? `2px solid ${isCorrect ? '#22c55e' : '#ef4444'}`
                : '2px solid #334155',
              color: '#f1f5f9',
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
        <div className={`card mt-4 anim-pop`} style={{
          borderColor: isCorrect ? '#22c55e50' : '#ef444450',
          background: isCorrect ? '#052e1620' : '#450a0a20',
        }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{isCorrect ? '✅' : '❌'}</span>
            <span className="font-bold text-lg" style={{ color: isCorrect ? '#22c55e' : '#ef4444' }}>
              {isCorrect ? '正解！' : `不正解 → 答え：${q.answer}`}
            </span>
          </div>
          {q.explanation && (
            <p className="text-slate-300 text-sm leading-relaxed">{q.explanation}</p>
          )}
          <button onClick={handleNext} className="btn-primary w-full mt-4">
            {current + 1 >= questions.length ? '結果を見る' : '次の問題 →'}
          </button>
        </div>
      )}
    </div>
  )
}
