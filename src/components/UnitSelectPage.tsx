'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

const FIELD_COLORS: Record<string, string> = {
  '生物': 'var(--bio)', '化学': 'var(--chem)', '物理': 'var(--phys)', '地学': 'var(--earth)',
}
const FIELD_EMOJI: Record<string, string> = {
  '生物': '🌿', '化学': '⚗️', '物理': '⚡', '地学': '🌏',
}

interface UnitStat { unit: string; total: number; correct: number; questionCount: number }

export default function UnitSelectPage({
  field, onSelect, onBack,
}: {
  field: string; onSelect: (unit: string) => void; onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const [units, setUnits] = useState<UnitStat[]>([])
  const [loading, setLoading] = useState(true)
  const color = FIELD_COLORS[field]

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      let questionQuery = supabase.from('questions').select('unit').eq('field', field)
      questionQuery = questionQuery.or(
        studentId
          ? `created_by_student_id.is.null,created_by_student_id.eq.${studentId}`
          : 'created_by_student_id.is.null'
      )
      const { data: qData } = await questionQuery
      const unitCounts: Record<string, number> = {}
      qData?.forEach(q => { unitCounts[q.unit] = (unitCounts[q.unit] || 0) + 1 })

      const { data: sData } = await supabase
        .from('quiz_sessions').select('unit, total_questions, correct_count')
        .eq('field', field).eq('student_id', studentId!)
      const sessionStats: Record<string, { total: number; correct: number }> = {}
      sData?.forEach(s => {
        if (!sessionStats[s.unit]) sessionStats[s.unit] = { total: 0, correct: 0 }
        sessionStats[s.unit].total += s.total_questions
        sessionStats[s.unit].correct += s.correct_count
      })

      setUnits(Object.keys(unitCounts).map(u => ({
        unit: u, questionCount: unitCounts[u],
        total: sessionStats[u]?.total || 0, correct: sessionStats[u]?.correct || 0,
      })))
      setLoading(false)
    })()
  }, [field, studentId])

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 anim-fade-up">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl" style={{ background: 'var(--input-bg)' }}>
            {FIELD_EMOJI[field]}
          </div>
          <div>
            <div className="font-bold text-xl" style={{ color }}>{field}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>単元を選んで始めよう</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="btn-secondary text-sm !px-3 !py-2">もどる</button>
          <button onClick={() => logout()} className="btn-ghost text-sm !px-3 !py-2">ログアウト</button>
        </div>
      </div>

      {/* Quick start */}
      <button
        onClick={() => onSelect('all')}
        className="card w-full anim-fade-up mb-4 text-left transition-transform active:scale-[0.98]"
        style={{ animationDelay: '0.04s' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold" style={{ color }}>全単元ランダム</div>
            <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>この分野をまとめて解く</div>
          </div>
          <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--tint-bg)', color: 'var(--tint)' }}>
            Quick Start
          </div>
        </div>
      </button>

      {/* Unit list */}
      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>読み込み中...</div>
      ) : (
        <div className="grid gap-2">
          {units.map((u, i) => {
            const rate = u.total > 0 ? Math.round((u.correct / u.total) * 100) : null
            return (
              <button
                key={u.unit}
                onClick={() => onSelect(u.unit)}
                className="card anim-fade-up text-left transition-transform active:scale-[0.98]"
                style={{ animationDelay: `${(i + 1) * 0.05}s` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{u.unit}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{u.questionCount}問</div>
                  </div>
                  {rate !== null && (
                    <div className="text-right">
                      <div className="font-bold" style={{ color: rate >= 70 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                        {rate}%
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{u.total}問解答</div>
                    </div>
                  )}
                </div>
                {rate !== null && (
                  <div className="mt-2 soft-track" style={{ height: 4 }}>
                    <div style={{
                      width: `${rate}%`, height: '100%', borderRadius: 999,
                      background: rate >= 70 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)',
                    }} />
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
