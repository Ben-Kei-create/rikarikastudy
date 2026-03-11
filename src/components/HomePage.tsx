'use client'
import { useAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const FIELDS = [
  { name: '生物', emoji: '🌿', color: 'var(--bio)', desc: '細胞・遺伝・消化' },
  { name: '化学', emoji: '⚗️', color: 'var(--chem)', desc: '原子・イオン・化学変化' },
  { name: '物理', emoji: '⚡', color: 'var(--phys)', desc: '力・電気・エネルギー' },
  { name: '地学', emoji: '🌏', color: 'var(--earth)', desc: '地震・天気・宇宙' },
]

interface FieldStats { [field: string]: { total: number; correct: number } }

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
    ;(async () => {
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
    })()
  }, [studentId])

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 anim-fade-up">
        <div>
          <div className="text-2xl font-bold">こんにちは、{nickname}さん</div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>分野を選んで始めよう</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={onMyPage} className="btn-secondary text-sm !px-3 !py-2">マイページ</button>
          <button onClick={() => logout()} className="btn-ghost text-sm !px-3 !py-2">ログアウト</button>
        </div>
      </div>

      {/* Field cards */}
      <div className="grid gap-3">
        {FIELDS.map((field, i) => {
          const stat = stats[field.name]
          const rate = stat && stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : null

          return (
            <button
              key={field.name}
              onClick={() => onSelectField(field.name)}
              className="card anim-fade-up text-left transition-transform active:scale-[0.98]"
              style={{ animationDelay: `${i * 0.06}s`, cursor: 'pointer' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl flex-shrink-0"
                  style={{ background: 'var(--input-bg)' }}
                >
                  {field.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-lg" style={{ color: field.color }}>{field.name}</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{field.desc}</div>
                </div>
                {rate !== null && (
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-lg" style={{ color: rate >= 70 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                      {rate}%
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{stat?.total}問</div>
                  </div>
                )}
              </div>
              {rate !== null && (
                <div className="mt-3 soft-track" style={{ height: 4 }}>
                  <div style={{
                    width: `${rate}%`, height: '100%',
                    background: field.color, borderRadius: 999, transition: 'width 0.8s ease',
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
