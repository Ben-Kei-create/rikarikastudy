'use client'
import { useAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const FIELDS = [
  { name: '生物', emoji: '🌿', color: '#22c55e', desc: '細胞・遺伝・消化' },
  { name: '化学', emoji: '⚗️', color: '#f97316', desc: '原子・イオン・化学変化' },
  { name: '物理', emoji: '⚡', color: '#4da2ff', desc: '力・電気・エネルギー' },
  { name: '地学', emoji: '🌏', color: '#8b7cff', desc: '地震・天気・宇宙' },
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
    <div className="page-shell">
      <div className="hero-card p-5 sm:p-6 mb-6 anim-fade-up">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-3">
              Home
            </div>
            <div className="font-display text-3xl text-white">こんにちは、{nickname}さん</div>
            <p className="text-slate-400 text-sm mt-2">今日の理科を、分野からすぐ始められます。</p>
          </div>
          <div className="flex gap-2 sm:flex-col sm:w-[160px]">
            <button
              onClick={onMyPage}
              className="btn-secondary flex-1 sm:flex-none"
            >
              マイページ
            </button>
            <button
              onClick={() => logout()}
              className="btn-ghost flex-1 sm:flex-none"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">分野を選ぶ</h2>
        <span className="text-xs text-slate-500">4 categories</span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {FIELDS.map((field, index) => {
          const stat = stats[field.name]
          const rate = stat && stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : null

          return (
            <button
              key={field.name}
              onClick={() => onSelectField(field.name)}
              className="card anim-fade-up text-left"
              style={{
                animationDelay: `${index * 0.08}s`,
                cursor: 'pointer',
                transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
                borderColor: `${field.color}30`,
              }}
              onMouseEnter={event => {
                const element = event.currentTarget
                element.style.borderColor = `${field.color}70`
                element.style.transform = 'translateY(-2px)'
                element.style.boxShadow = `0 20px 34px ${field.color}20`
              }}
              onMouseLeave={event => {
                const element = event.currentTarget
                element.style.borderColor = `${field.color}30`
                element.style.transform = ''
                element.style.boxShadow = ''
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  right: -30,
                  top: -30,
                  width: 120,
                  height: 120,
                  background: `radial-gradient(circle, ${field.color}18, transparent 66%)`,
                  borderRadius: '50%',
                }}
              />
              <div className="relative z-[1] flex items-center gap-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-[18px] text-2xl"
                  style={{ background: `${field.color}18`, border: `1px solid ${field.color}26` }}
                >
                  {field.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="font-display text-[1.45rem]" style={{ color: field.color }}>{field.name}</div>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">start</span>
                  </div>
                  <div className="text-slate-400 text-sm mt-1">{field.desc}</div>
                </div>
                {rate !== null && (
                  <div className="text-right">
                    <div className="font-semibold text-xl" style={{ color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>
                      {rate}%
                    </div>
                    <div className="text-slate-500 text-xs mt-1">{stat?.total}問</div>
                  </div>
                )}
              </div>
              {rate !== null && (
                <div className="mt-4 relative z-[1] soft-track" style={{ height: 7 }}>
                  <div
                    style={{
                      width: `${rate}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${field.color}, ${field.color}80)`,
                      borderRadius: 999,
                      transition: 'width 1s ease',
                    }}
                  />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
