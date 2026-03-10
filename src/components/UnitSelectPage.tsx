'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e', '化学': '#f97316', '物理': '#3b82f6', '地学': '#a855f7',
}
const FIELD_EMOJI: Record<string, string> = {
  '生物': '🌿', '化学': '⚗️', '物理': '⚡', '地学': '🌏',
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
      // 問題の単元一覧
      const { data: qData } = await supabase
        .from('questions')
        .select('unit')
        .eq('field', field)

      const unitCounts: Record<string, number> = {}
      qData?.forEach(q => { unitCounts[q.unit] = (unitCounts[q.unit] || 0) + 1 })

      // セッション統計
      const { data: sData } = await supabase
        .from('quiz_sessions')
        .select('unit, total_questions, correct_count')
        .eq('field', field)
        .eq('student_id', studentId!)

      const sessionStats: Record<string, { total: number; correct: number }> = {}
      sData?.forEach(s => {
        if (!sessionStats[s.unit]) sessionStats[s.unit] = { total: 0, correct: 0 }
        sessionStats[s.unit].total += s.total_questions
        sessionStats[s.unit].correct += s.correct_count
      })

      const unitList = Object.keys(unitCounts).map(u => ({
        unit: u,
        questionCount: unitCounts[u],
        total: sessionStats[u]?.total || 0,
        correct: sessionStats[u]?.correct || 0,
      }))

      setUnits(unitList)
      setLoading(false)
    }
    load()
  }, [field, studentId])

  return (
    <div className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          ← もどる
        </button>
        <button
          onClick={() => logout()}
          className="px-4 py-2 rounded-xl text-sm transition-all"
          style={{ background: '#1e293b', color: '#64748b', border: '1px solid #334155' }}
        >
          ログアウト
        </button>
      </div>

      <div className="flex items-center gap-3 mb-2 anim-fade-up">
        <span style={{ fontSize: 40 }}>{FIELD_EMOJI[field]}</span>
        <div>
          <div className="font-display text-3xl" style={{ color }}>{field}</div>
          <p className="text-slate-400 text-sm">単元を選ぼう</p>
        </div>
      </div>

      {/* 全問チャレンジ */}
      <button
        onClick={() => onSelect('all')}
        className="w-full anim-fade-up mt-6 mb-3 p-5 rounded-2xl text-left transition-all"
        style={{
          background: `linear-gradient(135deg, ${color}20, ${color}05)`,
          border: `2px solid ${color}`,
          animationDelay: '0.05s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${color}30` }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
      >
        <div className="font-bold text-lg" style={{ color }}>⭐ 全単元ランダム</div>
        <div className="text-slate-400 text-sm mt-1">すべての問題からランダム出題</div>
      </button>

      {loading ? (
        <div className="text-center text-slate-400 py-12">読み込み中...</div>
      ) : (
        <div className="grid gap-3">
          {units.map((u, i) => {
            const rate = u.total > 0 ? Math.round((u.correct / u.total) * 100) : null
            return (
              <button
                key={u.unit}
                onClick={() => onSelect(u.unit)}
                className="anim-fade-up p-4 rounded-2xl text-left transition-all"
                style={{
                  animationDelay: `${(i + 1) * 0.07}s`,
                  background: '#1e293b',
                  border: '1px solid #334155',
                }}
                onMouseEnter={e => { e.currentTarget.style.border = `1px solid ${color}60`; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.border = '1px solid #334155'; e.currentTarget.style.transform = '' }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white">{u.unit}</div>
                    <div className="text-slate-500 text-xs mt-0.5">{u.questionCount}問</div>
                  </div>
                  {rate !== null && (
                    <div className="text-right">
                      <div className="font-bold" style={{ color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>
                        {rate}%
                      </div>
                      <div className="text-slate-500 text-xs">{u.total}問解答</div>
                    </div>
                  )}
                </div>
                {rate !== null && (
                  <div className="mt-2" style={{ background: '#0f172a', borderRadius: 6, height: 4 }}>
                    <div style={{
                      width: `${rate}%`, height: '100%',
                      background: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444',
                      borderRadius: 6,
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
