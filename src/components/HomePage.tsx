'use client'
import { useAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const FIELDS = [
  { name: '生物', emoji: '🌿', color: '#22c55e', dark: '#15803d', light: '#dcfce7', desc: '細胞・遺伝・消化' },
  { name: '化学', emoji: '⚗️', color: '#f97316', dark: '#c2410c', light: '#ffedd5', desc: '原子・イオン・化学変化' },
  { name: '物理', emoji: '⚡', color: '#3b82f6', dark: '#1d4ed8', light: '#dbeafe', desc: '力・電気・エネルギー' },
  { name: '地学', emoji: '🌏', color: '#a855f7', dark: '#7e22ce', light: '#f3e8ff', desc: '地震・天気・宇宙' },
]

interface FieldStats {
  [field: string]: { total: number; correct: number }
}

export default function HomePage({
  onSelectField,
  onMyPage,
}: {
  onSelectField: (field: string) => void
  onMyPage: () => void
}) {
  const { nickname, studentId, logout } = useAuth()
  const [stats, setStats] = useState<FieldStats>({})

  useEffect(() => {
    if (!studentId) return
    const load = async () => {
      const { data } = await supabase
        .from('quiz_sessions')
        .select('field, total_questions, correct_count')
        .eq('student_id', studentId)
      if (!data) return
      const s: FieldStats = {}
      for (const row of data) {
        if (!s[row.field]) s[row.field] = { total: 0, correct: 0 }
        s[row.field].total += row.total_questions
        s[row.field].correct += row.correct_count
      }
      setStats(s)
    }
    load()
  }, [studentId])

  return (
    <div className="min-h-screen p-6 max-w-lg mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-8 anim-fade-up">
        <div>
          <div className="font-display text-2xl" style={{
            background: 'linear-gradient(90deg, #22c55e, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>RikaQuiz</div>
          <p className="text-slate-400 text-sm">こんにちは、<span className="text-white font-bold">{nickname}</span>さん！</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onMyPage}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{ background: '#334155', color: '#cbd5e1' }}
          >
            📊 マイページ
          </button>
          <button
            onClick={() => logout()}
            className="px-4 py-2 rounded-xl text-sm transition-all"
            style={{ background: '#1e293b', color: '#64748b', border: '1px solid #334155' }}
          >
            ログアウト
          </button>
        </div>
      </div>

      <h2 className="text-lg font-bold mb-4 text-slate-300">分野を選ぼう</h2>

      {/* 4分野カード */}
      <div className="grid grid-cols-1 gap-4">
        {FIELDS.map((f, i) => {
          const s = stats[f.name]
          const rate = s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : null
          return (
            <button
              key={f.name}
              onClick={() => onSelectField(f.name)}
              className="anim-fade-up text-left"
              style={{
                animationDelay: `${i * 0.08}s`,
                background: '#1e293b',
                border: `2px solid ${f.color}30`,
                borderRadius: '20px',
                padding: '20px 24px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget
                el.style.border = `2px solid ${f.color}`
                el.style.transform = 'translateY(-3px)'
                el.style.boxShadow = `0 12px 32px ${f.color}30`
              }}
              onMouseLeave={e => {
                const el = e.currentTarget
                el.style.border = `2px solid ${f.color}30`
                el.style.transform = ''
                el.style.boxShadow = ''
              }}
            >
              {/* 背景デコ */}
              <div style={{
                position: 'absolute', right: -20, top: -20,
                width: 100, height: 100,
                background: `radial-gradient(circle, ${f.color}15, transparent)`,
                borderRadius: '50%',
              }} />
              <div className="flex items-center gap-4">
                <span style={{ fontSize: 40 }}>{f.emoji}</span>
                <div className="flex-1">
                  <div className="font-display text-xl" style={{ color: f.color }}>{f.name}</div>
                  <div className="text-slate-400 text-sm">{f.desc}</div>
                </div>
                {rate !== null && (
                  <div className="text-right">
                    <div className="font-bold text-xl" style={{ color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>
                      {rate}%
                    </div>
                    <div className="text-slate-500 text-xs">{s?.total}問</div>
                  </div>
                )}
              </div>
              {/* 正答率バー */}
              {rate !== null && (
                <div className="mt-3" style={{ background: '#0f172a', borderRadius: 8, height: 6 }}>
                  <div style={{
                    width: `${rate}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${f.color}, ${f.color}80)`,
                    borderRadius: 8,
                    transition: 'width 1s ease',
                  }} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
