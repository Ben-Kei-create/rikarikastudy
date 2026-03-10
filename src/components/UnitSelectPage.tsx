'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e',
  '化学': '#f97316',
  '物理': '#4da2ff',
  '地学': '#8b7cff',
}
const FIELD_EMOJI: Record<string, string> = {
  '生物': '🌿',
  '化学': '⚗️',
  '物理': '⚡',
  '地学': '🌏',
}

interface UnitStat {
  unit: string
  total: number
  correct: number
  questionCount: number
}

export default function UnitSelectPage({
  field,
  onSelect,
  onBack,
}: {
  field: string
  onSelect: (unit: string) => void
  onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const [units, setUnits] = useState<UnitStat[]>([])
  const [loading, setLoading] = useState(true)
  const color = FIELD_COLORS[field]

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: qData } = await supabase
        .from('questions')
        .select('unit')
        .eq('field', field)

      const unitCounts: Record<string, number> = {}
      qData?.forEach(question => {
        unitCounts[question.unit] = (unitCounts[question.unit] || 0) + 1
      })

      const { data: sData } = await supabase
        .from('quiz_sessions')
        .select('unit, total_questions, correct_count')
        .eq('field', field)
        .eq('student_id', studentId!)

      const sessionStats: Record<string, { total: number; correct: number }> = {}
      sData?.forEach(session => {
        if (!sessionStats[session.unit]) sessionStats[session.unit] = { total: 0, correct: 0 }
        sessionStats[session.unit].total += session.total_questions
        sessionStats[session.unit].correct += session.correct_count
      })

      const unitList = Object.keys(unitCounts).map(unitName => ({
        unit: unitName,
        questionCount: unitCounts[unitName],
        total: sessionStats[unitName]?.total || 0,
        correct: sessionStats[unitName]?.correct || 0,
      }))

      setUnits(unitList)
      setLoading(false)
    }
    load()
  }, [field, studentId])

  return (
    <div className="page-shell">
      <div className="hero-card p-5 sm:p-6 mb-5 anim-fade-up">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-[22px] text-3xl"
              style={{ background: `${color}18`, border: `1px solid ${color}26` }}
            >
              {FIELD_EMOJI[field]}
            </div>
            <div>
              <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2">
                Unit Select
              </div>
              <div className="font-display text-3xl" style={{ color }}>{field}</div>
              <p className="text-slate-400 text-sm mt-1">単元を選んで、そのまま解き始められます。</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onBack} className="btn-secondary">もどる</button>
            <button onClick={() => logout()} className="btn-ghost">ログアウト</button>
          </div>
        </div>
      </div>

      <button
        onClick={() => onSelect('all')}
        className="card w-full anim-fade-up mb-4 text-left"
        style={{
          borderColor: `${color}40`,
          background: `linear-gradient(180deg, ${color}18, rgba(11, 16, 28, 0.88))`,
          animationDelay: '0.05s',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        }}
        onMouseEnter={event => {
          event.currentTarget.style.transform = 'translateY(-2px)'
          event.currentTarget.style.boxShadow = `0 18px 34px ${color}20`
        }}
        onMouseLeave={event => {
          event.currentTarget.style.transform = ''
          event.currentTarget.style.boxShadow = ''
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-lg" style={{ color }}>全単元ランダム</div>
            <div className="text-slate-400 text-sm mt-1">この分野の問題をまとめて解きます</div>
          </div>
          <div
            className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ background: `${color}18`, color }}
          >
            quick start
          </div>
        </div>
      </button>

      {loading ? (
        <div className="text-center text-slate-400 py-12">読み込み中...</div>
      ) : (
        <div className="grid gap-3">
          {units.map((unitItem, index) => {
            const rate = unitItem.total > 0 ? Math.round((unitItem.correct / unitItem.total) * 100) : null
            return (
              <button
                key={unitItem.unit}
                onClick={() => onSelect(unitItem.unit)}
                className="card anim-fade-up text-left"
                style={{
                  animationDelay: `${(index + 1) * 0.07}s`,
                  transition: 'transform 0.18s ease, border-color 0.18s ease',
                }}
                onMouseEnter={event => {
                  event.currentTarget.style.transform = 'translateY(-2px)'
                  event.currentTarget.style.borderColor = `${color}45`
                }}
                onMouseLeave={event => {
                  event.currentTarget.style.transform = ''
                  event.currentTarget.style.borderColor = ''
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-white">{unitItem.unit}</div>
                    <div className="text-slate-500 text-xs mt-1">{unitItem.questionCount}問</div>
                  </div>
                  {rate !== null && (
                    <div className="text-right">
                      <div className="font-semibold" style={{ color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>
                        {rate}%
                      </div>
                      <div className="text-slate-500 text-xs mt-1">{unitItem.total}問解答</div>
                    </div>
                  )}
                </div>
                {rate !== null && (
                  <div className="mt-3" style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 999, height: 6 }}>
                    <div
                      style={{
                        width: `${rate}%`,
                        height: '100%',
                        background: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
