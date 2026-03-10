'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { format, subDays, startOfDay, eachDayOfInterval, differenceInCalendarDays } from 'date-fns'
import { ja } from 'date-fns/locale'

const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e', '化学': '#f97316', '物理': '#3b82f6', '地学': '#a855f7',
}
const FIELD_EMOJI: Record<string, string> = {
  '生物': '🌿', '化学': '⚗️', '物理': '⚡', '地学': '🌏',
}
const FIELDS = ['生物', '化学', '物理', '地学']

interface Session {
  id: string; field: string; unit: string
  total_questions: number; correct_count: number; created_at: string
}
interface AnswerLog {
  question_id: string; is_correct: boolean
  questions: { unit: string; field: string } | null
}
type Tab = 'overview' | 'history' | 'weak' | 'account'

export default function MyPage({ onBack }: { onBack: () => void }) {
  const { studentId, nickname, updateProfile } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [answerLogs, setAnswerLogs] = useState<AnswerLog[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [nicknameInput, setNicknameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState<'nickname' | 'password' | null>(null)

  useEffect(() => {
    if (!studentId) return
    const load = async () => {
      const [{ data: sData }, { data: aData }] = await Promise.all([
        supabase.from('quiz_sessions').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
        supabase.from('answer_logs').select('question_id, is_correct, questions(unit, field)').eq('student_id', studentId),
      ])
      setSessions(sData || [])
      setAnswerLogs((aData as any) || [])
      setLoading(false)
    }
    load()
  }, [studentId])

  useEffect(() => {
    setNicknameInput(nickname || '')
  }, [nickname])

  const totalQ = sessions.reduce((a, s) => a + s.total_questions, 0)
  const totalC = sessions.reduce((a, s) => a + s.correct_count, 0)
  const overallRate = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0

  const byField = useMemo(() => {
    const m: Record<string, { total: number; correct: number }> = {}
    sessions.forEach(s => {
      if (!m[s.field]) m[s.field] = { total: 0, correct: 0 }
      m[s.field].total += s.total_questions
      m[s.field].correct += s.correct_count
    })
    return m
  }, [sessions])

  const weakUnits = useMemo(() => {
    const m: Record<string, { field: string; total: number; correct: number }> = {}
    answerLogs.forEach(log => {
      const unit = log.questions?.unit
      const field = log.questions?.field
      if (!unit || !field) return
      const key = `${field}::${unit}`
      if (!m[key]) m[key] = { field, total: 0, correct: 0 }
      m[key].total++
      if (log.is_correct) m[key].correct++
    })
    return Object.entries(m)
      .map(([key, v]) => ({ unit: key.split('::')[1], field: v.field, total: v.total, correct: v.correct, rate: Math.round((v.correct / v.total) * 100) }))
      .filter(u => u.total >= 3)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 8)
  }, [answerLogs])

  const dailyData = useMemo(() => {
    const today = startOfDay(new Date())
    const days = eachDayOfInterval({ start: subDays(today, 29), end: today })
    const map: Record<string, { count: number; correct: number }> = {}
    sessions.forEach(s => {
      const key = format(new Date(s.created_at), 'yyyy-MM-dd')
      if (!map[key]) map[key] = { count: 0, correct: 0 }
      map[key].count += s.total_questions
      map[key].correct += s.correct_count
    })
    return days.map(d => {
      const key = format(d, 'yyyy-MM-dd')
      return { date: d, key, ...(map[key] || { count: 0, correct: 0 }) }
    })
  }, [sessions])

  const streak = useMemo(() => {
    const activeDays = new Set(sessions.map(s => format(new Date(s.created_at), 'yyyy-MM-dd')))
    let count = 0
    let d = new Date()
    while (true) {
      const key = format(d, 'yyyy-MM-dd')
      if (!activeDays.has(key)) break
      count++
      d = subDays(d, 1)
    }
    return count
  }, [sessions])

  const maxStreak = useMemo(() => {
    const activeDays = Array.from(
      new Set(sessions.map(s => format(new Date(s.created_at), 'yyyy-MM-dd')))
    ).sort()
    let max = 0, cur = 0, prev: string | null = null
    for (const day of activeDays) {
      if (prev && differenceInCalendarDays(new Date(day), new Date(prev)) === 1) cur++
      else cur = 1
      if (cur > max) max = cur
      prev = day
    }
    return max
  }, [sessions])

  const heatColor = (count: number) => {
    if (count === 0) return '#1e293b'
    if (count < 5) return '#1d4ed8'
    if (count < 15) return '#3b82f6'
    if (count < 30) return '#60a5fa'
    return '#93c5fd'
  }

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
      setAccountMsg({ type: 'error', text: 'パスワードが一致していません。' })
      return
    }

    setSaving('password')
    const result = await updateProfile({ password: passwordInput })
    setSaving(null)
    setAccountMsg({ type: result.ok ? 'success' : 'error', text: result.message })

    if (result.ok) {
      setPasswordInput('')
      setPasswordConfirm('')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-16 max-w-lg mx-auto">
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 px-6 pt-6 pb-4" style={{ background: '#0f172a' }}>
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors text-sm mb-3 flex items-center gap-1">
          ← もどる
        </button>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl text-white">マイページ</h1>
            <p className="text-slate-400 text-sm mt-0.5">{nickname}さんの成績</p>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-2xl">🔥</span>
              <span className="font-display text-2xl text-orange-400">{streak}</span>
              <span className="text-slate-400 text-xs">日連続</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          {([['overview', '📊 概要'], ['history', '📅 履歴'], ['weak', '🎯 弱点'], ['account', '⚙️ 設定']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
              style={{
                background: tab === t ? '#3b82f6' : '#1e293b',
                color: tab === t ? 'white' : '#64748b',
                border: tab === t ? 'none' : '1px solid #334155',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6">

        {/* ===== 概要タブ ===== */}
        {tab === 'overview' && (
          <div className="space-y-4 anim-fade">
            {/* サマリー3カード */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '総問題数', value: totalQ, unit: '問', color: '#3b82f6' },
                { label: '総合正答率', value: overallRate, unit: '%', color: overallRate >= 70 ? '#22c55e' : overallRate >= 50 ? '#f59e0b' : '#ef4444' },
                { label: '最高連続', value: maxStreak, unit: '日', color: '#f97316' },
              ].map(item => (
                <div key={item.label} className="card text-center" style={{ padding: '16px 8px' }}>
                  <div className="font-display text-2xl" style={{ color: item.color }}>
                    {item.value}<span className="text-sm text-slate-400">{item.unit}</span>
                  </div>
                  <div className="text-slate-500 text-xs mt-1">{item.label}</div>
                </div>
              ))}
            </div>

            {/* 分野別正答率バー */}
            <div className="card">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">分野別正答率</h3>
              <div className="space-y-3">
                {FIELDS.map(f => {
                  const s = byField[f]
                  const rate = s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : null
                  const color = FIELD_COLORS[f]
                  return (
                    <div key={f}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 16 }}>{FIELD_EMOJI[f]}</span>
                          <span className="text-sm font-bold" style={{ color }}>{f}</span>
                          {s && <span className="text-slate-600 text-xs">{s.total}問</span>}
                        </div>
                        <span className="font-bold text-sm" style={{
                          color: rate === null ? '#475569' : rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
                        }}>
                          {rate === null ? '—' : `${rate}%`}
                        </span>
                      </div>
                      <div style={{ background: '#0f172a', borderRadius: 8, height: 8 }}>
                        <div style={{
                          width: `${rate ?? 0}%`, height: '100%',
                          background: `linear-gradient(90deg, ${color}, ${color}80)`,
                          borderRadius: 8, transition: 'width 1.2s ease',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 今週の棒グラフ */}
            <div className="card">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">今週の学習量（問題数）</h3>
              <div className="flex items-end justify-between gap-2" style={{ height: 96 }}>
                {weekData.map((d, i) => {
                  const h = d.count > 0 ? Math.max((d.count / weekMax) * 80, 8) : 0
                  const isToday = format(d.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-slate-500 text-xs" style={{ minHeight: 16 }}>
                        {d.count > 0 ? d.count : ''}
                      </div>
                      <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{
                          width: '100%', height: h,
                          background: isToday
                            ? 'linear-gradient(180deg, #60a5fa, #3b82f6)'
                            : d.count > 0 ? 'linear-gradient(180deg, #475569, #334155)' : '#1e293b',
                          borderRadius: '6px 6px 2px 2px',
                          transition: 'height 1s ease',
                        }} />
                      </div>
                      <div className="text-xs" style={{ color: isToday ? '#60a5fa' : '#475569' }}>
                        {format(d.date, 'E', { locale: ja })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 30日ヒートマップ */}
            <div className="card">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">30日間の学習記録</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                {dailyData.map((d, i) => (
                  <div
                    key={i}
                    title={`${format(d.date, 'M/d')} : ${d.count}問`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 5,
                      background: heatColor(d.count),
                      transition: 'transform 0.15s',
                      cursor: 'default',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.25)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = '' }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-slate-600 text-xs">0問</span>
                {['#1e293b', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd'].map(c => (
                  <div key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c }} />
                ))}
                <span className="text-slate-600 text-xs">30問+</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== 履歴タブ ===== */}
        {tab === 'history' && (
          <div className="space-y-2 anim-fade">
            {sessions.length === 0 ? (
              <div className="card text-center text-slate-500 py-12">
                まだ問題を解いていないよ！<br />さっそく挑戦してみよう 🚀
              </div>
            ) : sessions.slice(0, 50).map(s => {
              const rate = Math.round((s.correct_count / s.total_questions) * 100)
              const color = FIELD_COLORS[s.field]
              const dateStr = format(new Date(s.created_at), 'M月d日(E) HH:mm', { locale: ja })
              return (
                <div key={s.id} className="p-4 rounded-2xl"
                  style={{ background: '#1e293b', border: '1px solid #334155' }}>
                  <div className="flex items-start gap-3">
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{FIELD_EMOJI[s.field]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm" style={{ color }}>{s.field}</span>
                        <span className="text-slate-400 text-xs">{s.unit}</span>
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">{dateStr}</div>
                      <div className="mt-2 flex rounded-full overflow-hidden" style={{ height: 5 }}>
                        <div style={{ width: `${rate}%`, background: '#22c55e' }} />
                        <div style={{ width: `${100 - rate}%`, background: '#ef444440' }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold" style={{
                        color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444',
                        fontSize: 20,
                      }}>{s.correct_count}<span className="text-slate-500 text-sm">/{s.total_questions}</span></div>
                      <div className="text-xs" style={{
                        color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
                      }}>{rate}%</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ===== 弱点タブ ===== */}
        {tab === 'weak' && (
          <div className="anim-fade">
            <p className="text-slate-500 text-xs mb-4">3問以上解いた単元を正答率の低い順に表示</p>
            {weakUnits.length === 0 ? (
              <div className="card text-center text-slate-500 py-12">
                {totalQ < 10 ? 'もっと問題を解くと弱点が分かるよ！' : '弱点単元なし！全部得意だね 🎉'}
              </div>
            ) : (
              <div className="space-y-3">
                {weakUnits.map((u, i) => {
                  const color = FIELD_COLORS[u.field]
                  const medal = i === 0 ? '🚨' : i === 1 ? '⚠️' : i === 2 ? '📌' : '📍'
                  return (
                    <div key={`${u.field}-${u.unit}`} className="p-4 rounded-2xl"
                      style={{ background: '#1e293b', border: `1px solid ${u.rate < 50 ? '#ef444430' : '#334155'}` }}>
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: 24 }}>{medal}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${color}20`, color }}>{u.field}</span>
                            <span className="font-bold text-white text-sm">{u.unit}</span>
                          </div>
                          <div style={{ background: '#0f172a', borderRadius: 6, height: 6 }}>
                            <div style={{
                              width: `${u.rate}%`, height: '100%',
                              background: u.rate < 50 ? '#ef4444' : '#f59e0b',
                              borderRadius: 6,
                            }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-lg" style={{
                            color: u.rate < 50 ? '#ef4444' : '#f59e0b'
                          }}>{u.rate}%</div>
                          <div className="text-slate-500 text-xs">{u.total}問</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'account' && (
          <div className="space-y-4 anim-fade">
            <div className="card">
              <h3 className="text-slate-300 font-bold mb-1">アカウント設定</h3>
              <p className="text-slate-500 text-xs">ID は固定です。ニックネームとパスワードだけ変更できます。</p>
              <div className="mt-3 text-slate-400 text-sm">ログインID: <span className="text-white font-bold">{studentId}</span></div>
            </div>

            <div className="card">
              <h3 className="text-slate-300 font-bold mb-4">ニックネーム変更</h3>
              <input
                type="text"
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
                placeholder="ニックネーム"
                className="w-full px-4 py-3 rounded-xl outline-none"
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc' }}
              />
              <button
                onClick={handleSaveNickname}
                className="btn-primary w-full mt-3"
                disabled={saving === 'nickname'}
                style={{ opacity: saving === 'nickname' ? 0.7 : 1 }}
              >
                {saving === 'nickname' ? '保存中...' : 'ニックネームを保存'}
              </button>
            </div>

            <div className="card">
              <h3 className="text-slate-300 font-bold mb-4">パスワード変更</h3>
              <div className="space-y-3">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="新しいパスワード"
                  className="w-full px-4 py-3 rounded-xl outline-none"
                  style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc' }}
                />
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  placeholder="新しいパスワード（確認）"
                  className="w-full px-4 py-3 rounded-xl outline-none"
                  style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc' }}
                />
              </div>
              <button
                onClick={handleSavePassword}
                className="btn-primary w-full mt-3"
                disabled={saving === 'password'}
                style={{ opacity: saving === 'password' ? 0.7 : 1 }}
              >
                {saving === 'password' ? '保存中...' : 'パスワードを変更'}
              </button>
            </div>

            {accountMsg && (
              <div
                className="rounded-2xl px-4 py-3 text-sm"
                style={{
                  background: accountMsg.type === 'success' ? '#052e16' : '#450a0a',
                  border: `1px solid ${accountMsg.type === 'success' ? '#166534' : '#991b1b'}`,
                  color: accountMsg.type === 'success' ? '#86efac' : '#fca5a5',
                }}
              >
                {accountMsg.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
