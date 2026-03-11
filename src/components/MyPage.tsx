'use client'
import { useEffect, useState, useMemo } from 'react'
import { Database, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { format, subDays, startOfDay, eachDayOfInterval, differenceInCalendarDays } from 'date-fns'
import { ja } from 'date-fns/locale'

const FIELD_COLORS: Record<string, string> = {
  '生物': 'var(--bio)', '化学': 'var(--chem)', '物理': 'var(--phys)', '地学': 'var(--earth)',
}
const FIELD_EMOJI: Record<string, string> = {
  '生物': '🌿', '化学': '⚗️', '物理': '⚡', '地学': '🌏',
}
const FIELDS = ['生物', '化学', '物理', '地学']

interface Session {
  id: string; field: string; unit: string
  total_questions: number; correct_count: number; duration_seconds: number; created_at: string
}
interface AnswerLog {
  question_id: string; is_correct: boolean
  questions: { unit: string; field: string } | null
}
type QuestionRow = Database['public']['Tables']['questions']['Row']

interface CustomQuestionForm {
  field: string; unit: string; question: string; type: 'choice' | 'text'
  choices: [string, string]; answer: string; explanation: string; grade: string
}

const INITIAL_FORM: CustomQuestionForm = {
  field: '生物', unit: '', question: '', type: 'choice',
  choices: ['', ''], answer: '', explanation: '', grade: '中3',
}

function formatStudyTime(s: number) {
  if (s <= 0) return '0分'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}時間${m}分`
  if (m > 0) return `${m}分`
  return `${sec}秒`
}

type Tab = 'overview' | 'history' | 'weak' | 'questions' | 'account'

export default function MyPage({
  onBack, onStartDrill,
}: {
  onBack: () => void; onStartDrill: (field: string, unit: string) => void
}) {
  const { studentId, nickname, updateProfile, logout } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [answerLogs, setAnswerLogs] = useState<AnswerLog[]>([])
  const [myQuestions, setMyQuestions] = useState<QuestionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [nicknameInput, setNicknameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState<'nickname' | 'password' | null>(null)
  const [questionForm, setQuestionForm] = useState<CustomQuestionForm>(INITIAL_FORM)
  const [questionMsg, setQuestionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [savingQuestion, setSavingQuestion] = useState(false)

  useEffect(() => {
    if (!studentId) return
    ;(async () => {
      const [{ data: sData }, { data: aData }, { data: qData }] = await Promise.all([
        supabase.from('quiz_sessions').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
        supabase.from('answer_logs').select('question_id, is_correct, questions(unit, field)').eq('student_id', studentId),
        supabase.from('questions').select('*').eq('created_by_student_id', studentId).order('created_at', { ascending: false }),
      ])
      setSessions(sData || [])
      setAnswerLogs((aData as any) || [])
      setMyQuestions((qData as QuestionRow[]) || [])
      setLoading(false)
    })()
  }, [studentId])

  useEffect(() => { setNicknameInput(nickname || '') }, [nickname])

  const totalQ = sessions.reduce((a, s) => a + s.total_questions, 0)
  const totalC = sessions.reduce((a, s) => a + s.correct_count, 0)
  const totalStudySeconds = sessions.reduce((a, s) => a + (s.duration_seconds ?? 0), 0)
  const overallRate = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0

  const byField = useMemo(() => {
    const m: Record<string, { total: number; correct: number }> = {}
    sessions.forEach(s => {
      if (!m[s.field]) m[s.field] = { total: 0, correct: 0 }
      m[s.field].total += s.total_questions; m[s.field].correct += s.correct_count
    })
    return m
  }, [sessions])

  const weakUnits = useMemo(() => {
    const m: Record<string, { field: string; total: number; correct: number }> = {}
    answerLogs.forEach(log => {
      const unit = log.questions?.unit, f = log.questions?.field
      if (!unit || !f) return
      const key = `${f}::${unit}`
      if (!m[key]) m[key] = { field: f, total: 0, correct: 0 }
      m[key].total++
      if (log.is_correct) m[key].correct++
    })
    return Object.entries(m)
      .map(([key, v]) => ({ unit: key.split('::')[1], field: v.field, total: v.total, correct: v.correct, rate: Math.round((v.correct / v.total) * 100) }))
      .filter(u => u.total >= 3).sort((a, b) => a.rate - b.rate).slice(0, 8)
  }, [answerLogs])

  const dailyData = useMemo(() => {
    const today = startOfDay(new Date())
    const days = eachDayOfInterval({ start: subDays(today, 29), end: today })
    const map: Record<string, { count: number; correct: number }> = {}
    sessions.forEach(s => {
      const key = format(new Date(s.created_at), 'yyyy-MM-dd')
      if (!map[key]) map[key] = { count: 0, correct: 0 }
      map[key].count += s.total_questions; map[key].correct += s.correct_count
    })
    return days.map(d => { const key = format(d, 'yyyy-MM-dd'); return { date: d, key, ...(map[key] || { count: 0, correct: 0 }) } })
  }, [sessions])

  const streak = useMemo(() => {
    const active = new Set(sessions.map(s => format(new Date(s.created_at), 'yyyy-MM-dd')))
    let c = 0, d = new Date()
    while (active.has(format(d, 'yyyy-MM-dd'))) { c++; d = subDays(d, 1) }
    return c
  }, [sessions])

  const maxStreak = useMemo(() => {
    const days = Array.from(new Set(sessions.map(s => format(new Date(s.created_at), 'yyyy-MM-dd')))).sort()
    let max = 0, cur = 0, prev: string | null = null
    for (const day of days) {
      if (prev && differenceInCalendarDays(new Date(day), new Date(prev)) === 1) cur++
      else cur = 1
      if (cur > max) max = cur; prev = day
    }
    return max
  }, [sessions])

  const weekData = dailyData.slice(-7)
  const weekMax = Math.max(...weekData.map(d => d.count), 1)

  const handleSaveNickname = async () => {
    setSaving('nickname')
    const result = await updateProfile({ nickname: nicknameInput })
    setSaving(null)
    setAccountMsg({ type: result.ok ? 'success' : 'error', text: result.message })
  }

  const handleSavePassword = async () => {
    if (passwordInput.trim() !== passwordConfirm.trim()) {
      setAccountMsg({ type: 'error', text: 'パスワードが一致していません。' }); return
    }
    setSaving('password')
    const result = await updateProfile({ password: passwordInput })
    setSaving(null)
    setAccountMsg({ type: result.ok ? 'success' : 'error', text: result.message })
    if (result.ok) { setPasswordInput(''); setPasswordConfirm('') }
  }

  const handleAddQuestion = async () => {
    if (!studentId) return
    if (!questionForm.unit.trim() || !questionForm.question.trim() || !questionForm.answer.trim()) {
      setQuestionMsg({ type: 'error', text: '分野・単元・問題・答えを入力してください。' }); return
    }
    if (questionForm.type === 'choice') {
      const filled = questionForm.choices.map(c => c.trim()).filter(Boolean)
      if (filled.length !== 2) { setQuestionMsg({ type: 'error', text: '2択問題は選択肢を2つ入力してください。' }); return }
      if (!filled.includes(questionForm.answer.trim())) { setQuestionMsg({ type: 'error', text: '答えは選択肢AかBと同じ内容にしてください。' }); return }
    }
    try {
      setSavingQuestion(true); setQuestionMsg(null)
      const { data, error } = await supabase.from('questions').insert({
        created_by_student_id: studentId, field: questionForm.field,
        unit: questionForm.unit.trim(), question: questionForm.question.trim(),
        type: questionForm.type,
        choices: questionForm.type === 'choice' ? questionForm.choices.map(c => c.trim()) : null,
        answer: questionForm.answer.trim(),
        explanation: questionForm.explanation.trim() || null, grade: questionForm.grade,
      }).select().single()
      if (error) throw new Error(error.message)
      if (data) setMyQuestions(cur => [data as QuestionRow, ...cur])
      setQuestionForm(INITIAL_FORM)
      setQuestionMsg({ type: 'success', text: '自分用の問題を追加しました。' })
    } catch (e) {
      setQuestionMsg({ type: 'error', text: e instanceof Error ? `保存失敗: ${e.message}` : '保存に失敗しました。' })
    } finally { setSavingQuestion(false) }
  }

  const heatColor = (count: number) => {
    if (count === 0) return 'var(--input-bg)'
    if (count < 5) return 'rgba(0,122,255,0.25)'
    if (count < 15) return 'rgba(0,122,255,0.5)'
    if (count < 30) return 'rgba(0,122,255,0.7)'
    return 'var(--tint)'
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div style={{ color: 'var(--text-secondary)' }}>読み込み中...</div></div>
  }

  const inputStyle = { background: 'var(--input-bg)', border: '1.5px solid transparent', color: 'var(--text)' } as const

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="mb-4 anim-fade-up">
        <div className="flex items-center justify-between gap-3 mb-3">
          <button onClick={onBack} className="btn-secondary text-sm !px-3 !py-2">もどる</button>
          <button onClick={() => logout()} className="btn-ghost text-sm !px-3 !py-2">ログアウト</button>
        </div>
        <div className="card">
          <div className="flex items-end justify-between gap-3 mb-4">
            <div>
              <div className="text-2xl font-bold">マイページ</div>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{nickname}さんの成績</p>
            </div>
            {streak > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,149,0,0.1)' }}>
                <span className="text-lg">🔥</span>
                <span className="font-bold text-lg" style={{ color: 'var(--warning)' }}>{streak}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>日連続</span>
              </div>
            )}
          </div>
          <div className="segment-bar w-full">
            {([['overview', '概要'], ['history', '履歴'], ['weak', '弱点'], ['questions', '問題作成'], ['account', '設定']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} className={`segment-button flex-1 ${tab === t ? 'is-active' : ''}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Overview ===== */}
      {tab === 'overview' && (
        <div className="space-y-3 anim-fade">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '総問題数', val: `${totalQ}問`, c: 'var(--tint)' },
              { label: '正答率', val: `${overallRate}%`, c: overallRate >= 70 ? 'var(--success)' : overallRate >= 50 ? 'var(--warning)' : 'var(--danger)' },
              { label: '勉強時間', val: formatStudyTime(totalStudySeconds), c: 'var(--tint)' },
              { label: '最高連続', val: `${maxStreak}日`, c: 'var(--warning)' },
            ].map(item => (
              <div key={item.label} className="card text-center" style={{ padding: '14px 8px' }}>
                <div className="text-xl font-bold" style={{ color: item.c }}>{item.val}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{item.label}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>分野別正答率</h3>
            <div className="space-y-3">
              {FIELDS.map(f => {
                const s = byField[f]; const rate = s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : null
                return (
                  <div key={f}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 14 }}>{FIELD_EMOJI[f]}</span>
                        <span className="text-sm font-semibold" style={{ color: FIELD_COLORS[f] }}>{f}</span>
                        {s && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.total}問</span>}
                      </div>
                      <span className="font-semibold text-sm" style={{ color: rate === null ? 'var(--text-tertiary)' : rate >= 70 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                        {rate === null ? '—' : `${rate}%`}
                      </span>
                    </div>
                    <div className="soft-track" style={{ height: 6 }}>
                      <div style={{ width: `${rate ?? 0}%`, height: '100%', background: FIELD_COLORS[f], borderRadius: 999, transition: 'width 1s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>今週の学習量</h3>
            <div className="flex items-end justify-between gap-2" style={{ height: 80 }}>
              {weekData.map((d, i) => {
                const h = d.count > 0 ? Math.max((d.count / weekMax) * 64, 6) : 0
                const isToday = format(d.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)', minHeight: 14 }}>{d.count > 0 ? d.count : ''}</div>
                    <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{
                        width: '100%', height: h,
                        background: isToday ? 'var(--tint)' : d.count > 0 ? 'var(--input-bg)' : 'transparent',
                        borderRadius: '4px 4px 2px 2px', transition: 'height 0.8s ease',
                      }} />
                    </div>
                    <div className="text-xs" style={{ color: isToday ? 'var(--tint)' : 'var(--text-tertiary)' }}>
                      {format(d.date, 'E', { locale: ja })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>30日間の記録</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
              {dailyData.map((d, i) => (
                <div key={i} title={`${format(d.date, 'M/d')}: ${d.count}問`}
                  style={{ aspectRatio: '1', borderRadius: 4, background: heatColor(d.count) }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== History ===== */}
      {tab === 'history' && (
        <div className="space-y-2 anim-fade">
          {sessions.length === 0 ? (
            <div className="card text-center py-10" style={{ color: 'var(--text-secondary)' }}>まだ問題を解いていません</div>
          ) : sessions.slice(0, 50).map(s => {
            const rate = Math.round((s.correct_count / s.total_questions) * 100)
            return (
              <div key={s.id} className="card">
                <div className="flex items-start gap-3">
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{FIELD_EMOJI[s.field]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: FIELD_COLORS[s.field] }}>{s.field}</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.unit}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {format(new Date(s.created_at), 'M月d日(E) HH:mm', { locale: ja })}
                    </div>
                    <div className="mt-2 soft-track" style={{ height: 4 }}>
                      <div style={{ width: `${rate}%`, height: '100%', background: 'var(--success)', borderRadius: 999 }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-lg" style={{
                      color: rate >= 70 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)',
                    }}>{s.correct_count}<span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>/{s.total_questions}</span></div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== Weak ===== */}
      {tab === 'weak' && (
        <div className="anim-fade">
          <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>3問以上解いた単元を正答率の低い順に表示</p>
          {weakUnits.length === 0 ? (
            <div className="card text-center py-10" style={{ color: 'var(--text-secondary)' }}>
              {totalQ < 10 ? 'もっと問題を解くと弱点が分かるよ！' : '弱点単元なし！全部得意だね'}
            </div>
          ) : (
            <div className="space-y-2">
              {weakUnits.map((u, i) => (
                <div key={`${u.field}-${u.unit}`} className="card">
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 20 }}>{i === 0 ? '🚨' : i === 1 ? '⚠️' : '📌'}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--input-bg)', color: FIELD_COLORS[u.field] }}>{u.field}</span>
                        <span className="font-semibold text-sm">{u.unit}</span>
                      </div>
                      <div className="soft-track" style={{ height: 4 }}>
                        <div style={{ width: `${u.rate}%`, height: '100%', borderRadius: 999, background: u.rate < 50 ? 'var(--danger)' : 'var(--warning)' }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold" style={{ color: u.rate < 50 ? 'var(--danger)' : 'var(--warning)' }}>{u.rate}%</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{u.total}問</div>
                    </div>
                  </div>
                  <button onClick={() => onStartDrill(u.field, u.unit)} className="btn-secondary w-full mt-3 text-sm">復習する →</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Questions ===== */}
      {tab === 'questions' && (
        <div className="space-y-3 anim-fade">
          <div className="card">
            <h3 className="font-semibold mb-0.5">自分の問題を追加</h3>
            <p className="text-xs leading-5 mb-4" style={{ color: 'var(--text-secondary)' }}>
              ここで作った問題は自分だけが解けます。先生は管理画面で確認できます。
            </p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select value={questionForm.field} onChange={e => setQuestionForm(c => ({ ...c, field: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle}>
                {FIELDS.map(f => <option key={f}>{f}</option>)}
              </select>
              <select value={questionForm.type} onChange={e => setQuestionForm(c => ({ ...c, type: e.target.value as 'choice' | 'text' }))}
                className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle}>
                <option value="choice">2択</option><option value="text">記述</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input type="text" value={questionForm.unit} onChange={e => setQuestionForm(c => ({ ...c, unit: e.target.value }))}
                placeholder="単元" className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle} />
              <select value={questionForm.grade} onChange={e => setQuestionForm(c => ({ ...c, grade: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle}>
                {['中1', '中2', '中3', '高校'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <textarea value={questionForm.question} onChange={e => setQuestionForm(c => ({ ...c, question: e.target.value }))}
                placeholder="問題文" rows={3} className="w-full px-3 py-2.5 rounded-xl outline-none resize-y" style={inputStyle} />
              {questionForm.type === 'choice' && (
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={questionForm.choices[0]} onChange={e => setQuestionForm(c => ({ ...c, choices: [e.target.value, c.choices[1]] }))}
                    placeholder="選択肢A" className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle} />
                  <input type="text" value={questionForm.choices[1]} onChange={e => setQuestionForm(c => ({ ...c, choices: [c.choices[0], e.target.value] }))}
                    placeholder="選択肢B" className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle} />
                </div>
              )}
              <input type="text" value={questionForm.answer} onChange={e => setQuestionForm(c => ({ ...c, answer: e.target.value }))}
                placeholder={questionForm.type === 'choice' ? '答え（AかBと同じ内容）' : '答え'}
                className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle} />
              <textarea value={questionForm.explanation} onChange={e => setQuestionForm(c => ({ ...c, explanation: e.target.value }))}
                placeholder="解説（任意）" rows={2} className="w-full px-3 py-2.5 rounded-xl outline-none resize-y" style={inputStyle} />
            </div>
            <button onClick={handleAddQuestion} className="btn-primary w-full mt-3" disabled={savingQuestion}
              style={{ opacity: savingQuestion ? 0.6 : 1 }}>
              {savingQuestion ? '追加中...' : 'この問題を追加'}
            </button>
            {questionMsg && (
              <div className="rounded-xl px-3 py-2.5 text-sm mt-2" style={{
                background: questionMsg.type === 'success' ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)',
                color: questionMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
              }}>{questionMsg.text}</div>
            )}
          </div>

          {myQuestions.length === 0 ? (
            <div className="card text-center py-8" style={{ color: 'var(--text-secondary)' }}>まだ自分で作った問題はありません。</div>
          ) : myQuestions.map(q => (
            <div key={q.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ background: 'var(--input-bg)', color: FIELD_COLORS[q.field] }}>{q.field}</span>
                    <span className="font-semibold text-sm">{q.unit}</span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {format(new Date(q.created_at), 'M月d日(E) HH:mm', { locale: ja })}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,149,0,0.1)', color: 'var(--warning)' }}>自分専用</span>
              </div>
              <p className="text-sm leading-6 mt-2 whitespace-pre-wrap">{q.question}</p>
              <div className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>答え: {q.answer}</div>
              {q.explanation && <p className="text-sm leading-6 mt-1 whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{q.explanation}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ===== Account ===== */}
      {tab === 'account' && (
        <div className="space-y-3 anim-fade">
          <div className="card">
            <h3 className="font-semibold mb-0.5">アカウント設定</h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>IDは固定です。ニックネームとパスワードだけ変更できます。</p>
            <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>ログインID: <span className="font-bold" style={{ color: 'var(--text)' }}>{studentId}</span></div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">ニックネーム変更</h3>
            <input type="text" value={nicknameInput} onChange={e => setNicknameInput(e.target.value)}
              placeholder="ニックネーム" className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle} />
            <button onClick={handleSaveNickname} className="btn-primary w-full mt-3" disabled={saving === 'nickname'}
              style={{ opacity: saving === 'nickname' ? 0.6 : 1 }}>
              {saving === 'nickname' ? '保存中...' : 'ニックネームを保存'}
            </button>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">パスワード変更</h3>
            <div className="space-y-2">
              <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)}
                placeholder="新しいパスワード" className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle} />
              <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
                placeholder="新しいパスワード（確認）" className="w-full px-3 py-2.5 rounded-xl outline-none" style={inputStyle} />
            </div>
            <button onClick={handleSavePassword} className="btn-primary w-full mt-3" disabled={saving === 'password'}
              style={{ opacity: saving === 'password' ? 0.6 : 1 }}>
              {saving === 'password' ? '保存中...' : 'パスワードを変更'}
            </button>
          </div>

          {accountMsg && (
            <div className="rounded-xl px-3 py-2.5 text-sm" style={{
              background: accountMsg.type === 'success' ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)',
              color: accountMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
            }}>{accountMsg.text}</div>
          )}
        </div>
      )}
    </div>
  )
}
