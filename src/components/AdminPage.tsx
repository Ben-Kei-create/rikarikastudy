'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { STUDENTS } from '@/lib/auth'
import { sampleQuestions } from '@/lib/sampleQuestions'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const ADMIN_PW = 'rika_admin_2024'
const FIELDS = ['生物', '化学', '物理', '地学'] as const
const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e', '化学': '#f97316', '物理': '#3b82f6', '地学': '#a855f7',
}

interface StudentStats {
  id: number
  nickname: string
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

  // 問題追加フォーム
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
    if (pw === ADMIN_PW) { setAuthed(true); setPwError(false) }
    else { setPwError(true); setPw('') }
  }

  useEffect(() => {
    if (!authed) return
    loadData()
  }, [authed, tab])

  const loadData = async () => {
    setLoading(true)
    if (tab === 'overview') {
      const { data: sessions } = await supabase.from('quiz_sessions').select('*')
      const statsMap: Record<number, StudentStats> = {}
      Object.entries(STUDENTS).forEach(([id, name]) => {
        statsMap[Number(id)] = {
          id: Number(id), nickname: name,
          totalQ: 0, totalC: 0, lastActivity: null,
          byField: {},
        }
      })
      sessions?.forEach(s => {
        const st = statsMap[s.student_id]
        if (!st) return
        st.totalQ += s.total_questions
        st.totalC += s.correct_count
        if (!st.lastActivity || s.created_at > st.lastActivity) st.lastActivity = s.created_at
        if (!st.byField[s.field]) st.byField[s.field] = { total: 0, correct: 0 }
        st.byField[s.field].total += s.total_questions
        st.byField[s.field].correct += s.correct_count
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
    const toInsert = sampleQuestions.map(q => ({
      ...q,
      choices: q.choices ? JSON.stringify(q.choices) : null,
    }))
    const { error } = await supabase.from('questions').insert(toInsert)
    if (error) alert('エラー: ' + error.message)
    else { alert('サンプル問題を追加しました！'); loadData() }
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
      const filled = form.choices.filter(c => c.trim())
      if (filled.length < 2) { setAddMsg('選択肢を2つ以上入力してください'); return }
      payload.choices = filled
    }
    const { error } = await supabase.from('questions').insert([payload])
    if (error) { setAddMsg('エラー: ' + error.message); return }
    setAddMsg('✅ 問題を追加しました！')
    setForm({ field: '生物', unit: '', question: '', type: 'choice', choices: ['', '', '', ''], answer: '', explanation: '', grade: '中3' })
    setTimeout(() => setAddMsg(''), 3000)
  }

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('この問題を削除しますか？')) return
    await supabase.from('questions').delete().eq('id', id)
    setQuestions(qs => qs.filter(q => q.id !== id))
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <button onClick={onBack} className="self-start text-slate-400 hover:text-white mb-8">← もどる</button>
        <div className="card w-full max-w-sm">
          <h2 className="text-xl font-bold mb-2 text-center">🔒 管理者ログイン</h2>
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

      {/* タブ */}
      <div className="flex gap-2 mb-6">
        {([['overview', '📊 生徒データ'], ['questions', '📝 問題一覧'], ['add', '➕ 問題追加']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{
              background: tab === t ? '#3b82f6' : '#1e293b',
              color: tab === t ? 'white' : '#94a3b8',
              border: tab === t ? 'none' : '1px solid #334155',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* 生徒データ */}
      {tab === 'overview' && (
        <div>
          {loading ? <div className="text-slate-400 text-center py-12">読み込み中...</div> : (
            <div className="space-y-4">
              {stats.map(s => {
                const rate = s.totalQ > 0 ? Math.round((s.totalC / s.totalQ) * 100) : 0
                return (
                  <div key={s.id} className="card">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="font-display text-3xl text-blue-400">{s.id}</div>
                        <div>
                          <div className="font-bold text-white text-lg">{s.nickname}</div>
                          <div className="text-slate-500 text-xs">
                            {s.lastActivity
                              ? `最終: ${format(new Date(s.lastActivity), 'M/d HH:mm', { locale: ja })}`
                              : '未使用'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-2xl" style={{
                          color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
                        }}>{rate}%</div>
                        <div className="text-slate-400 text-sm">{s.totalQ}問</div>
                      </div>
                    </div>
                    {/* 分野別バー */}
                    <div className="grid grid-cols-4 gap-2">
                      {FIELDS.map(f => {
                        const fs = s.byField[f]
                        const fr = fs && fs.total > 0 ? Math.round((fs.correct / fs.total) * 100) : null
                        return (
                          <div key={f} className="text-center">
                            <div className="text-xs text-slate-500 mb-1">{f}</div>
                            {fr !== null ? (
                              <>
                                <div className="text-sm font-bold" style={{ color: FIELD_COLORS[f] }}>{fr}%</div>
                                <div className="text-xs text-slate-600">{fs!.total}問</div>
                              </>
                            ) : <div className="text-xs text-slate-600">—</div>}
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

      {/* 問題一覧 */}
      {tab === 'questions' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-slate-400">{questions.length}問登録済み</p>
            <button onClick={handleSeedQuestions}
              className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: '#334155', color: '#94a3b8' }}>
              📦 サンプル問題を追加
            </button>
          </div>
          {loading ? <div className="text-slate-400 text-center py-12">読み込み中...</div> : (
            <div className="space-y-2">
              {questions.map(q => (
                <div key={q.id} className="p-4 rounded-xl" style={{ background: '#1e293b', border: '1px solid #334155' }}>
                  <div className="flex items-start gap-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ background: `${FIELD_COLORS[q.field]}20`, color: FIELD_COLORS[q.field] }}>
                      {q.field}
                    </span>
                    <span className="text-slate-400 text-xs flex-shrink-0">{q.unit}</span>
                    <p className="text-white text-sm flex-1 line-clamp-2">{q.question}</p>
                    <button onClick={() => handleDeleteQuestion(q.id)}
                      className="text-red-500 hover:text-red-300 text-xs flex-shrink-0 transition-colors">
                      削除
                    </button>
                  </div>
                  <div className="mt-1 text-slate-500 text-xs">答え: {q.answer}</div>
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

      {/* 問題追加 */}
      {tab === 'add' && (
        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">分野 *</label>
              <select value={form.field} onChange={e => setForm(f => ({ ...f, field: e.target.value as any }))}
                className="w-full px-3 py-2 rounded-xl outline-none"
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}>
                {FIELDS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">種別 *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                className="w-full px-3 py-2 rounded-xl outline-none"
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}>
                <option value="choice">4択</option>
                <option value="text">記述</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">単元 *</label>
              <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="例: 細胞と生物"
                className="w-full px-3 py-2 rounded-xl outline-none"
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }} />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">学年</label>
              <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl outline-none"
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}>
                {['中1', '中2', '中3', '高校'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-xs mb-1 block">問題文 *</label>
            <textarea value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
              placeholder="問題文を入力..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl outline-none resize-none"
              style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }} />
          </div>

          {form.type === 'choice' && (
            <div>
              <label className="text-slate-400 text-xs mb-1 block">選択肢（A〜D）</label>
              <div className="grid grid-cols-2 gap-2">
                {form.choices.map((c, i) => (
                  <input key={i} value={c}
                    onChange={e => setForm(f => ({ ...f, choices: f.choices.map((ch, j) => j === i ? e.target.value : ch) }))}
                    placeholder={`${'ABCD'[i]}. 選択肢`}
                    className="px-3 py-2 rounded-xl outline-none"
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }} />
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-slate-400 text-xs mb-1 block">正解 *</label>
            <input value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
              placeholder="正解をそのまま入力（選択肢の文字と完全一致）"
              className="w-full px-3 py-2 rounded-xl outline-none"
              style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }} />
          </div>

          <div>
            <label className="text-slate-400 text-xs mb-1 block">解説（任意）</label>
            <textarea value={form.explanation} onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
              placeholder="解説文..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl outline-none resize-none"
              style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }} />
          </div>

          {addMsg && <p className={`text-sm ${addMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{addMsg}</p>}
          <button onClick={handleAddQuestion} className="btn-primary w-full">問題を追加する</button>
        </div>
      )}
    </div>
  )
}
