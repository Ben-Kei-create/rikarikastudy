'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchStudents } from '@/lib/auth'
import { sampleQuestions } from '@/lib/sampleQuestions'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const ADMIN_PW = 'rika_admin_2024'
const FIELDS = ['生物', '化学', '物理', '地学'] as const
const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e',
  '化学': '#f97316',
  '物理': '#3b82f6',
  '地学': '#a855f7',
}

interface StudentStats {
  id: number
  nickname: string
  password: string
  totalQ: number
  totalC: number
  lastActivity: string | null
  byField: Record<string, { total: number; correct: number }>
}

type AdminTab = 'overview' | 'questions' | 'add'

export default function AdminPage({ onBack }: { onBack: () => void }) {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [tab, setTab] = useState<AdminTab>('overview')
  const [stats, setStats] = useState<StudentStats[]>([])
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    field: '生物' as typeof FIELDS[number],
    unit: '',
    question: '',
    type: 'choice' as 'choice' | 'text',
    choices: ['', '', '', ''],
    answer: '',
    explanation: '',
    grade: '中3',
  })
  const [addMsg, setAddMsg] = useState('')

  const checkPw = () => {
    if (pw === ADMIN_PW) {
      setAuthed(true)
      setPwError(false)
      return
    }
    setPwError(true)
    setPw('')
  }

  useEffect(() => {
    if (!authed) return
    loadData()
  }, [authed, tab])

  const loadData = async () => {
    setLoading(true)

    if (tab === 'overview') {
      const [students, { data: sessions }] = await Promise.all([
        fetchStudents(),
        supabase.from('quiz_sessions').select('*'),
      ])

      const statsMap: Record<number, StudentStats> = {}
      students.forEach(student => {
        statsMap[student.id] = {
          id: student.id,
          nickname: student.nickname,
          password: student.password,
          totalQ: 0,
          totalC: 0,
          lastActivity: null,
          byField: {},
        }
      })

      sessions?.forEach(session => {
        const current = statsMap[session.student_id]
        if (!current) return
        current.totalQ += session.total_questions
        current.totalC += session.correct_count
        if (!current.lastActivity || session.created_at > current.lastActivity) {
          current.lastActivity = session.created_at
        }
        if (!current.byField[session.field]) current.byField[session.field] = { total: 0, correct: 0 }
        current.byField[session.field].total += session.total_questions
        current.byField[session.field].correct += session.correct_count
      })

      setStats(Object.values(statsMap))
    } else if (tab === 'questions') {
      const { data } = await supabase.from('questions').select('*').order('created_at', { ascending: false })
      setQuestions(data || [])
    }

    setLoading(false)
  }

  const handleSeedQuestions = async () => {
    if (!confirm(`サンプル問題（${sampleQuestions.length}問）を追加しますか？`)) return
    const toInsert = sampleQuestions.map(question => ({
      ...question,
      choices: question.choices ? JSON.stringify(question.choices) : null,
    }))
    const { error } = await supabase.from('questions').insert(toInsert)
    if (error) alert('エラー: ' + error.message)
    else {
      alert('サンプル問題を追加しました！')
      loadData()
    }
  }

  const handleAddQuestion = async () => {
    if (!form.unit || !form.question || !form.answer) {
      setAddMsg('単元・問題・答えは必須です')
      return
    }

    const payload: any = {
      field: form.field,
      unit: form.unit,
      question: form.question,
      type: form.type,
      answer: form.answer,
      explanation: form.explanation || null,
      grade: form.grade,
    }

    if (form.type === 'choice') {
      const filled = form.choices.filter(choice => choice.trim())
      if (filled.length < 2) {
        setAddMsg('選択肢を2つ以上入力してください')
        return
      }
      payload.choices = filled
    }

    const { error } = await supabase.from('questions').insert([payload])
    if (error) {
      setAddMsg('エラー: ' + error.message)
      return
    }

    setAddMsg('✅ 問題を追加しました！')
    setForm({
      field: '生物',
      unit: '',
      question: '',
      type: 'choice',
      choices: ['', '', '', ''],
      answer: '',
      explanation: '',
      grade: '中3',
    })
    setTimeout(() => setAddMsg(''), 3000)
  }

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('この問題を削除しますか？')) return
    await supabase.from('questions').delete().eq('id', id)
    setQuestions(current => current.filter(question => question.id !== id))
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <button onClick={onBack} className="self-start text-slate-400 hover:text-white mb-8">← もどる</button>
        <div className="card w-full max-w-sm">
          <h2 className="text-xl font-bold mb-2 text-center">🔒 もぎ先生ログイン</h2>
          <p className="text-slate-500 text-sm text-center mb-6">管理者パスワードを入力</p>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkPw()}
            placeholder="管理者パスワード"
            className="w-full px-4 py-3 rounded-xl text-center mb-3 outline-none"
            style={{ background: '#0f172a', border: `2px solid ${pwError ? '#ef4444' : '#334155'}`, color: '#f1f5f9' }}
            autoFocus
          />
          {pwError && <p className="text-red-400 text-sm text-center mb-3">パスワードが違います</p>}
          <button onClick={checkPw} className="btn-primary w-full">ログイン</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-slate-400 hover:text-white">← もどる</button>
        <h1 className="font-display text-2xl text-white">🛠 管理画面</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {([['overview', '📊 生徒データ'], ['questions', '📝 問題一覧'], ['add', '➕ 問題追加']] as const).map(([currentTab, label]) => (
          <button
            key={currentTab}
            onClick={() => setTab(currentTab)}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{
              background: tab === currentTab ? '#3b82f6' : '#1e293b',
              color: tab === currentTab ? 'white' : '#94a3b8',
              border: tab === currentTab ? 'none' : '1px solid #334155',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          {loading ? (
            <div className="text-slate-400 text-center py-12">読み込み中...</div>
          ) : (
            <div className="space-y-4">
              {stats.map(student => {
                const rate = student.totalQ > 0 ? Math.round((student.totalC / student.totalQ) * 100) : 0
                return (
                  <div key={student.id} className="card">
                    <div className="flex items-start justify-between mb-4 gap-4">
                      <div className="flex items-start gap-3">
                        <div className="font-display text-3xl text-blue-400">{student.id}</div>
                        <div>
                          <div className="font-bold text-white text-lg">{student.nickname}</div>
                          <div className="text-slate-500 text-xs mt-1">PW: <span className="text-slate-200 font-mono">{student.password}</span></div>
                          <div className="text-slate-500 text-xs mt-1">
                            {student.lastActivity
                              ? `最終: ${format(new Date(student.lastActivity), 'M/d HH:mm', { locale: ja })}`
                              : '未使用'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-2xl" style={{
                          color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444',
                        }}>{rate}%</div>
                        <div className="text-slate-400 text-sm">{student.totalQ}問</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {FIELDS.map(field => {
                        const current = student.byField[field]
                        const fieldRate = current && current.total > 0 ? Math.round((current.correct / current.total) * 100) : null
                        return (
                          <div key={field} className="text-center">
                            <div className="text-xs text-slate-500 mb-1">{field}</div>
                            {fieldRate !== null ? (
                              <>
                                <div className="text-sm font-bold" style={{ color: FIELD_COLORS[field] }}>{fieldRate}%</div>
                                <div className="text-xs text-slate-600">{current!.total}問</div>
                              </>
                            ) : (
                              <div className="text-xs text-slate-600">—</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'questions' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-slate-400">{questions.length}問登録済み</p>
            <button
              onClick={handleSeedQuestions}
              className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: '#334155', color: '#94a3b8' }}
            >
              📦 サンプル問題を追加
            </button>
          </div>
          {loading ? (
            <div className="text-slate-400 text-center py-12">読み込み中...</div>
          ) : (
            <div className="space-y-2">
              {questions.map(question => (
                <div key={question.id} className="p-4 rounded-xl" style={{ background: '#1e293b', border: '1px solid #334155' }}>
                  <div className="flex items-start gap-2">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ background: `${FIELD_COLORS[question.field]}20`, color: FIELD_COLORS[question.field] }}
                    >
                      {question.field}
                    </span>
                    <span className="text-slate-400 text-xs flex-shrink-0">{question.unit}</span>
                    <p className="text-white text-sm flex-1 line-clamp-2">{question.question}</p>
                    <button
                      onClick={() => handleDeleteQuestion(question.id)}
                      className="text-red-500 hover:text-red-300 text-xs flex-shrink-0 transition-colors"
                    >
                      削除
                    </button>
                  </div>
                  <div className="mt-1 text-slate-500 text-xs">答え: {question.answer}</div>
                </div>
              ))}
              {questions.length === 0 && (
                <div className="text-slate-500 text-center py-12 card">
                  問題がありません。サンプルを追加するか、「問題追加」タブから入力してください。
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'add' && (
        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">分野 *</label>
              <select
                value={form.field}
                onChange={e => setForm(current => ({ ...current, field: e.target.value as typeof FIELDS[number] }))}
                className="w-full px-3 py-2 rounded-xl outline-none"
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}
              >
                {FIELDS.map(field => <option key={field}>{field}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">種別 *</label>
              <select
                value={form.type}
                onChange={e => setForm(current => ({ ...current, type: e.target.value as 'choice' | 'text' }))}
                className="w-full px-3 py-2 rounded-xl outline-none"
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}
              >
                <option value="choice">4択</option>
                <option value="text">記述</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">単元 *</label>
              <input
                value={form.unit}
                onChange={e => setForm(current => ({ ...current, unit: e.target.value }))}
                placeholder="例: 細胞と生物"
                className="w-full px-3 py-2 rounded-xl outline-none"
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">学年</label>
              <select
                value={form.grade}
                onChange={e => setForm(current => ({ ...current, grade: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl outline-none"
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}
              >
                {['中1', '中2', '中3', '高校'].map(grade => <option key={grade}>{grade}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-xs mb-1 block">問題文 *</label>
            <textarea
              value={form.question}
              onChange={e => setForm(current => ({ ...current, question: e.target.value }))}
              placeholder="問題文を入力..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl outline-none resize-none"
              style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}
            />
          </div>

          {form.type === 'choice' && (
            <div>
              <label className="text-slate-400 text-xs mb-1 block">選択肢（A〜D）</label>
              <div className="grid grid-cols-2 gap-2">
                {form.choices.map((choice, index) => (
                  <input
                    key={index}
                    value={choice}
                    onChange={e => setForm(current => ({
                      ...current,
                      choices: current.choices.map((currentChoice, currentIndex) => currentIndex === index ? e.target.value : currentChoice),
                    }))}
                    placeholder={`${'ABCD'[index]}. 選択肢`}
                    className="px-3 py-2 rounded-xl outline-none"
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-slate-400 text-xs mb-1 block">正解 *</label>
            <input
              value={form.answer}
              onChange={e => setForm(current => ({ ...current, answer: e.target.value }))}
              placeholder="正解をそのまま入力（選択肢の文字と完全一致）"
              className="w-full px-3 py-2 rounded-xl outline-none"
              style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}
            />
          </div>

          <div>
            <label className="text-slate-400 text-xs mb-1 block">解説（任意）</label>
            <textarea
              value={form.explanation}
              onChange={e => setForm(current => ({ ...current, explanation: e.target.value }))}
              placeholder="解説文..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl outline-none resize-none"
              style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}
            />
          </div>

          {addMsg && <p className={`text-sm ${addMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{addMsg}</p>}
          <button onClick={handleAddQuestion} className="btn-primary w-full">問題を追加する</button>
        </div>
      )}
    </div>
  )
}
