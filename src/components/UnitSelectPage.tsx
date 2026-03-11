'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { CHEMISTRY_MODE_META, ChemistryPracticeMode } from '@/lib/chemistryPractice'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'

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
  onSelectSpecialMode,
  onBack,
}: {
  field: string
  onSelect: (unit: string) => void
  onSelectSpecialMode: (mode: ChemistryPracticeMode) => void
  onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const [units, setUnits] = useState<UnitStat[]>([])
  const [loading, setLoading] = useState(true)
  const color = FIELD_COLORS[field]
  const totalQuestionCount = units.reduce((sum, item) => sum + item.questionCount, 0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      let query = supabase
        .from('questions')
        .select('unit')
        .eq('field', field)
      const supportsStudentQuestionFilter = getCachedColumnSupport('created_by_student_id') !== false

      if (supportsStudentQuestionFilter) {
        query = query.or(
          studentId
            ? `created_by_student_id.is.null,created_by_student_id.eq.${studentId}`
            : 'created_by_student_id.is.null'
        )
      }

      let { data: qData, error: qError } = await query

      if (qError && isMissingColumnError(qError, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        const fallback = await supabase
          .from('questions')
          .select('unit')
          .eq('field', field)
        qData = fallback.data
        qError = fallback.error
      } else if (!qError && supportsStudentQuestionFilter) {
        markColumnSupported('created_by_student_id')
      }

      if (qError) {
        console.error('[unit-select] failed to load units', qError)
        setUnits([])
        setLoading(false)
        return
      }

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
    <div className="page-shell page-shell-dashboard">
      <div className="hero-card science-surface p-5 sm:p-6 lg:p-7 mb-5 anim-fade-up">
        <ScienceBackdrop />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">単元数</div>
              <div className="mt-2 font-display text-2xl text-white">{units.length}</div>
              <div className="mt-1 text-xs text-slate-500">units</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">問題数</div>
              <div className="mt-2 font-display text-2xl text-white">{totalQuestionCount}</div>
              <div className="mt-1 text-xs text-slate-500">questions</div>
            </div>
            <button onClick={onBack} className="btn-secondary w-full">もどる</button>
            <button onClick={() => logout()} className="btn-ghost w-full">ログアウト</button>
          </div>
        </div>
      </div>

      {field === '化学' && (
        <div className="mb-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-100">化学ラボ</h2>
            <span className="text-xs text-slate-500">special modes</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(['flash', 'equation'] as const).map(mode => {
              const meta = CHEMISTRY_MODE_META[mode]
              return (
                <button
                  key={mode}
                  onClick={() => onSelectSpecialMode(mode)}
                  className="card text-left"
                  style={{
                    borderColor: `${meta.accent}3a`,
                    background: `linear-gradient(180deg, ${meta.accent}14, rgba(15, 23, 42, 0.78))`,
                    transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                  }}
                  onMouseEnter={event => {
                    event.currentTarget.style.transform = 'translateY(-2px)'
                    event.currentTarget.style.borderColor = `${meta.accent}70`
                    event.currentTarget.style.boxShadow = `0 18px 34px ${meta.accent}22`
                  }}
                  onMouseLeave={event => {
                    event.currentTarget.style.transform = ''
                    event.currentTarget.style.borderColor = `${meta.accent}3a`
                    event.currentTarget.style.boxShadow = ''
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ background: `${meta.accent}18`, color: meta.accent }}
                      >
                        <span>{meta.badge}</span>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <span className="text-3xl">{meta.icon}</span>
                        <div>
                          <div className="font-display text-2xl text-white">{meta.title}</div>
                          <div className="mt-1 text-sm leading-6 text-slate-300">{meta.description}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => onSelect('all')}
        className="card w-full anim-fade-up mb-4 text-left"
        style={{
          borderColor: `${color}40`,
          background: `linear-gradient(180deg, ${color}18, var(--surface-elevated))`,
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
        <div className="grid gap-3 md:grid-cols-2">
          {units.map((unitItem, index) => {
            const rate = unitItem.total > 0 ? Math.round((unitItem.correct / unitItem.total) * 100) : null
            return (
              <button
                key={unitItem.unit}
                onClick={() => onSelect(unitItem.unit)}
                className="card anim-fade-up text-left h-full"
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
                {rate === null && (
                  <div className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    未チャレンジ
                  </div>
                )}
                {rate !== null && (
                <div className="mt-3 soft-track" style={{ height: 6 }}>
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
