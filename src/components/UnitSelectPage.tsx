'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { BIOLOGY_MODE_META, BiologyPracticeMode } from '@/lib/biologyPractice'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { CHEMISTRY_MODE_META, ChemistryPracticeMode } from '@/lib/chemistryPractice'
import { EARTH_SCIENCE_MODE_META, EarthSciencePracticeMode } from '@/lib/earthSciencePractice'
import {
  CHEMISTRY_WORKBENCH_MODES,
  EARTH_WORKBENCH_MODES,
  PHYSICS_WORKBENCH_MODES,
  SCIENCE_WORKBENCH_MODE_META,
  ScienceWorkbenchMode,
} from '@/lib/scienceWorkbench'
import { ScienceChatField } from '@/lib/scienceChat'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import {
  CustomQuizHistoryFilter,
  CustomQuizOptions,
  CustomQuizQuestionType,
  DEFAULT_CUSTOM_QUIZ_OPTIONS,
  getCustomQuizHistoryFilterLabel,
  getCustomQuizQuestionTypeLabel,
  getCustomQuizSummaryParts,
} from '@/lib/customQuiz'
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
  onStartCustomQuiz,
  onSelectBiologyMode,
  onSelectSpecialMode,
  onSelectEarthMode,
  onSelectWorkbenchMode,
  onOpenChat,
  onBack,
}: {
  field: string
  onSelect: (unit: string) => void
  onStartCustomQuiz: (options: CustomQuizOptions) => void
  onSelectBiologyMode: (mode: BiologyPracticeMode) => void
  onSelectSpecialMode: (mode: ChemistryPracticeMode) => void
  onSelectEarthMode: (mode: EarthSciencePracticeMode) => void
  onSelectWorkbenchMode: (mode: ScienceWorkbenchMode) => void
  onOpenChat: (field: ScienceChatField) => void
  onBack: () => void
}) {
  const { studentId, logout } = useAuth()
  const [units, setUnits] = useState<UnitStat[]>([])
  const [loading, setLoading] = useState(true)
  const [showCustomPanel, setShowCustomPanel] = useState(false)
  const [customOptions, setCustomOptions] = useState<CustomQuizOptions>(DEFAULT_CUSTOM_QUIZ_OPTIONS)
  const color = FIELD_COLORS[field]
  const totalQuestionCount = units.reduce((sum, item) => sum + item.questionCount, 0)
  const isGuest = isGuestStudentId(studentId)

  useEffect(() => {
    setShowCustomPanel(false)
    setCustomOptions(DEFAULT_CUSTOM_QUIZ_OPTIONS)
  }, [field])

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

      const sessionStats: Record<string, { total: number; correct: number }> = {}

      if (isGuest) {
        const store = loadGuestStudyStore()
        store.sessions
          .filter(session => session.field === field)
          .forEach(session => {
            if (!sessionStats[session.unit]) sessionStats[session.unit] = { total: 0, correct: 0 }
            sessionStats[session.unit].total += session.total_questions
            sessionStats[session.unit].correct += session.correct_count
          })
      } else if (studentId !== null) {
        const { data: sData } = await supabase
          .from('quiz_sessions')
          .select('unit, total_questions, correct_count')
          .eq('field', field)
          .eq('student_id', studentId)

        sData?.forEach(session => {
          if (!sessionStats[session.unit]) sessionStats[session.unit] = { total: 0, correct: 0 }
          sessionStats[session.unit].total += session.total_questions
          sessionStats[session.unit].correct += session.correct_count
        })
      }

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
  }, [field, isGuest, studentId])

  const updateQuestionType = (questionType: CustomQuizQuestionType) => {
    setCustomOptions(current => ({ ...current, questionType }))
  }

  const updateHistoryFilter = (historyFilter: CustomQuizHistoryFilter) => {
    setCustomOptions(current => ({ ...current, historyFilter }))
  }

  return (
    <div className="page-shell page-shell-dashboard">
      <div className="hero-card science-surface mb-4 anim-fade-up px-4 py-4 sm:px-5 sm:py-5">
        <ScienceBackdrop />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] text-[1.7rem]"
              style={{ background: `${color}18`, border: `1px solid ${color}26` }}
            >
              {FIELD_EMOJI[field]}
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                Unit Select
              </div>
              <div className="font-display text-[2rem] leading-none sm:text-[2.35rem]" style={{ color }}>{field}</div>
              <p className="mt-1 text-sm text-slate-400">単元を選んで、そのまま解き始められます。</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:min-w-[284px] lg:items-end">
            <div className="grid grid-cols-2 gap-2 w-full lg:w-auto">
              <div className="subcard px-4 py-3">
                <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">単元数</div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="font-display text-[1.9rem] leading-none text-white">{units.length}</div>
                  <div className="pb-0.5 text-[11px] text-slate-500">units</div>
                </div>
              </div>
              <div className="subcard px-4 py-3">
                <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">問題数</div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="font-display text-[1.9rem] leading-none text-white">{totalQuestionCount}</div>
                  <div className="pb-0.5 text-[11px] text-slate-500">questions</div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full lg:w-[284px]">
              <button onClick={onBack} className="btn-secondary w-full !py-3">もどる</button>
              <button onClick={() => logout()} className="btn-ghost w-full !py-3">ログアウト</button>
            </div>
          </div>
        </div>
      </div>

      {field === '生物' && (
        <div className="mb-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-100">生物ラボ</h2>
            <span className="text-xs text-slate-500">special mode</span>
          </div>
          <div className="grid gap-3">
            {(['organ-pairs'] as const).map(mode => {
              const meta = BIOLOGY_MODE_META[mode]
              return (
                <button
                  key={mode}
                  onClick={() => onSelectBiologyMode(mode)}
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
                          {meta.description && (
                            <div className="mt-1 text-sm leading-6 text-slate-300">{meta.description}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
            {CHEMISTRY_WORKBENCH_MODES.map(mode => {
              const meta = SCIENCE_WORKBENCH_MODE_META[mode]
              return (
                <button
                  key={mode}
                  onClick={() => onSelectWorkbenchMode(mode)}
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

      {field === '物理' && (
        <div className="mb-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-100">物理ラボ</h2>
            <span className="text-xs text-slate-500">special mode</span>
          </div>
          <div className="grid gap-3">
            {PHYSICS_WORKBENCH_MODES.map(mode => {
              const meta = SCIENCE_WORKBENCH_MODE_META[mode]
              return (
                <button
                  key={mode}
                  onClick={() => onSelectWorkbenchMode(mode)}
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

      {field === '地学' && (
        <div className="mb-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-100">地学ラボ</h2>
            <span className="text-xs text-slate-500">special modes</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(['link-pairs'] as const).map(mode => {
              const meta = EARTH_SCIENCE_MODE_META[mode]
              return (
                <button
                  key={mode}
                  onClick={() => onSelectEarthMode(mode)}
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
            {EARTH_WORKBENCH_MODES.map(mode => {
              const meta = SCIENCE_WORKBENCH_MODE_META[mode]
              return (
                <button
                  key={mode}
                  onClick={() => onSelectWorkbenchMode(mode)}
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

      {isGuest ? (
        <div
          className="card w-full anim-fade-up mb-4 text-left"
          style={{
            borderColor: 'rgba(148, 163, 184, 0.2)',
            background: 'linear-gradient(135deg, rgba(71, 85, 105, 0.26), rgba(15, 23, 42, 0.82))',
            animationDelay: '0.04s',
            opacity: 0.88,
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
                Ask Gemini
              </div>
              <div className="mt-2 font-display text-2xl text-slate-100">
                {field}について質問する
              </div>
              <div className="mt-2 text-slate-400 text-sm leading-6">
                ゲストモードでは Gemini などの質問機能は使えません。
              </div>
            </div>
            <div
              className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-400"
            >
              利用不可
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onOpenChat(field as ScienceChatField)}
          className="card w-full anim-fade-up mb-4 text-left"
          style={{
            borderColor: `${color}40`,
            background: `linear-gradient(135deg, ${color}18, rgba(15, 23, 42, 0.82))`,
            animationDelay: '0.04s',
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
              <div className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
                Ask Gemini
              </div>
              <div className="mt-2 font-display text-2xl text-white">
                {field}について質問する
              </div>
              <div className="mt-2 text-slate-300 text-sm leading-6">
                この分野だけに絞って、要点を3行以内でざっくり聞けます。
              </div>
            </div>
            <div
              className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-800/70 px-4 py-2 text-sm font-semibold text-slate-100"
            >
              Geminiに聞く →
            </div>
          </div>
        </button>
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

      <div
        className="card w-full anim-fade-up mb-4 text-left"
        style={{
          borderColor: `${color}35`,
          background: `linear-gradient(180deg, ${color}14, rgba(15, 23, 42, 0.82))`,
          animationDelay: '0.06s',
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
              Custom
            </div>
            <div className="mt-2 font-display text-2xl text-white">
              カスタム
            </div>
            <div className="mt-2 text-slate-300 text-sm leading-6">
              記述のみ、選択肢のみ、未回答、苦手だけなどに絞って出題できます。
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {getCustomQuizSummaryParts(customOptions).map(part => (
                <span
                  key={part}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold"
                  style={{ background: `${color}18`, color }}
                >
                  {part}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => setShowCustomPanel(current => !current)}
            className="btn-secondary whitespace-nowrap"
          >
            {showCustomPanel ? '閉じる' : '条件をえらぶ'}
          </button>
        </div>

        {showCustomPanel && (
          <div className="mt-5 rounded-[24px] border border-white/8 bg-slate-950/24 p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <label className="text-slate-400 text-xs mb-2 block">対象単元</label>
                <select
                  value={customOptions.unit}
                  onChange={event => setCustomOptions(current => ({ ...current, unit: event.target.value }))}
                  className="input-surface"
                >
                  <option value="all">全単元</option>
                  {units.map(unitItem => (
                    <option key={unitItem.unit} value={unitItem.unit}>
                      {unitItem.unit}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  単元だけで絞りたい時は、ここで選べます。
                </p>
              </div>

              <div className="grid gap-4">
                <div>
                  <div className="text-slate-400 text-xs mb-2">問題タイプ</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(['all', 'choice', 'text'] as const).map(questionType => {
                      const active = customOptions.questionType === questionType
                      return (
                        <button
                          key={questionType}
                          onClick={() => updateQuestionType(questionType)}
                          className="rounded-2xl border px-4 py-3 text-sm font-semibold transition-all"
                          style={{
                            borderColor: active ? `${color}70` : 'var(--surface-elevated-border)',
                            background: active ? `${color}18` : 'var(--surface-elevated)',
                            color: active ? color : 'var(--text)',
                          }}
                        >
                          {getCustomQuizQuestionTypeLabel(questionType)}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-xs mb-2">出題条件</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(['all', 'unanswered', 'weak'] as const).map(historyFilter => {
                      const active = customOptions.historyFilter === historyFilter
                      return (
                        <button
                          key={historyFilter}
                          onClick={() => updateHistoryFilter(historyFilter)}
                          className="rounded-2xl border px-4 py-3 text-sm font-semibold transition-all"
                          style={{
                            borderColor: active ? `${color}70` : 'var(--surface-elevated-border)',
                            background: active ? `${color}18` : 'var(--surface-elevated)',
                            color: active ? color : 'var(--text)',
                          }}
                        >
                          {getCustomQuizHistoryFilterLabel(historyFilter)}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-xs leading-6 text-slate-500">
                    未回答 = まだ解いていない問題 / 苦手だけ = これまでに1回でもまちがえた問題
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setCustomOptions(DEFAULT_CUSTOM_QUIZ_OPTIONS)}
                className="btn-ghost"
              >
                リセット
              </button>
              <button
                onClick={() => onStartCustomQuiz(customOptions)}
                className="btn-primary"
              >
                この条件で開始
              </button>
            </div>
          </div>
        )}
      </div>

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
