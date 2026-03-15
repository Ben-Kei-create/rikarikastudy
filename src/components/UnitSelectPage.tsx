'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { BIOLOGY_MODE_META, BiologyPracticeMode } from '@/lib/biologyPractice'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import LabModeCard from '@/components/LabModeCard'
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
  CUSTOM_QUIZ_GRADE_OPTIONS,
  CustomQuizGradeFilter,
  CustomQuizHistoryFilter,
  CustomQuizOptions,
  CustomQuizQuestionType,
  DEFAULT_CUSTOM_QUIZ_OPTIONS,
  getCustomQuizGradeFilterLabel,
  getCustomQuizHistoryFilterLabel,
  getCustomQuizQuestionTypeLabel,
  getCustomQuizSummaryParts,
} from '@/lib/customQuiz'
import { QUESTION_TYPES } from '@/lib/questionTypes'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'
import { FIELD_COLORS, FIELD_EMOJI } from '@/lib/constants'
import { getLevelInfo } from '@/lib/engagement'
import { QuizQuestionCount } from '@/lib/questionPicker'

interface UnitStat {
  unit: string
  questionCount: number
}

const QUESTION_COUNT_OPTIONS: QuizQuestionCount[] = [5, 10, 15, 'all']

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
  onSelect: (unit: string, questionCount: QuizQuestionCount) => void
  onStartCustomQuiz: (options: CustomQuizOptions, questionCount: QuizQuestionCount) => void
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
  const [availableGrades, setAvailableGrades] = useState<CustomQuizGradeFilter[]>(['中1', '中2', '中3'])
  const [questionCount, setQuestionCount] = useState<QuizQuestionCount>(10)
  const [currentXp, setCurrentXp] = useState(0)
  const color = FIELD_COLORS[field as keyof typeof FIELD_COLORS] ?? '#38bdf8'
  const totalQuestionCount = units.reduce((sum, item) => sum + item.questionCount, 0)
  const isGuest = isGuestStudentId(studentId)
  const customGradeOptions = CUSTOM_QUIZ_GRADE_OPTIONS.filter(grade => (
    grade === 'all' || availableGrades.includes(grade)
  ))
  const levelInfo = getLevelInfo(currentXp)

  useEffect(() => {
    setShowCustomPanel(false)
    setCustomOptions(DEFAULT_CUSTOM_QUIZ_OPTIONS)
  }, [field])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      let query = supabase
        .from('questions')
        .select('unit, grade')
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
          .select('unit, grade')
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
      const gradeSet = new Set<CustomQuizGradeFilter>()
      qData?.forEach(question => {
        unitCounts[question.unit] = (unitCounts[question.unit] || 0) + 1
        if (question.grade === '中1' || question.grade === '中2' || question.grade === '中3') {
          gradeSet.add(question.grade)
        }
      })

      const unitList = Object.keys(unitCounts).map(unitName => ({
        unit: unitName,
        questionCount: unitCounts[unitName],
      })).sort((left, right) => left.unit.localeCompare(right.unit, 'ja'))

      setUnits(unitList)
      setAvailableGrades(gradeSet.size > 0 ? Array.from(gradeSet) : ['中1', '中2', '中3'])
      setLoading(false)
    }
    load()
  }, [field, studentId])

  useEffect(() => {
    let active = true

    const loadXp = async () => {
      if (studentId === null) {
        if (active) setCurrentXp(0)
        return
      }

      if (isGuest) {
        const store = loadGuestStudyStore()
        if (active) setCurrentXp(store.xp)
        return
      }

      const { data, error } = await supabase
        .from('students')
        .select('student_xp')
        .eq('id', studentId)
        .single()

      if (!active) return

      if (error) {
        console.error('[unit-select] failed to load xp', error)
        setCurrentXp(0)
        return
      }

      setCurrentXp(data?.student_xp ?? 0)
    }

    void loadXp()

    return () => {
      active = false
    }
  }, [isGuest, studentId])

  const updateGrade = (grade: CustomQuizGradeFilter) => {
    setCustomOptions(current => ({ ...current, grade }))
  }

  const updateQuestionType = (questionType: CustomQuizQuestionType) => {
    setCustomOptions(current => ({ ...current, questionType }))
  }

  const updateHistoryFilter = (historyFilter: CustomQuizHistoryFilter) => {
    setCustomOptions(current => ({ ...current, historyFilter }))
  }

  return (
    <div className="page-shell page-shell-dashboard">
      <div className="hero-card science-surface mb-4 anim-fade-up px-3.5 py-3.5 sm:px-5 sm:py-5">
        <ScienceBackdrop />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] text-[1.45rem] sm:h-14 sm:w-14 sm:rounded-[20px] sm:text-[1.7rem]"
              style={{ background: `${color}18`, border: `1px solid ${color}26` }}
            >
              {FIELD_EMOJI[field as keyof typeof FIELD_EMOJI] ?? '🔬'}
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                Unit Select
              </div>
              <div className="font-display text-[1.65rem] leading-none sm:text-[2.35rem]" style={{ color }}>{field}</div>
              <p className="mt-1 text-[13px] leading-5 text-slate-400 sm:text-sm sm:leading-6">全単元ランダムか、カスタム条件でしぼって解けます。</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:min-w-[284px] lg:items-end">
            <div className="grid w-full grid-cols-2 gap-2 lg:w-auto">
              <div className="subcard mobile-mini-card px-4 py-3">
                <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">登録単元</div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="font-display text-[1.6rem] leading-none text-white sm:text-[1.9rem]">{units.length}</div>
                  <div className="pb-0.5 text-[11px] text-slate-500">units</div>
                </div>
              </div>
              <div className="subcard mobile-mini-card px-4 py-3">
                <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">問題数</div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="font-display text-[1.6rem] leading-none text-white sm:text-[1.9rem]">{totalQuestionCount}</div>
                  <div className="pb-0.5 text-[11px] text-slate-500">questions</div>
                </div>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 lg:w-[284px]">
              <button onClick={onBack} className="btn-secondary w-full !py-2.5 sm:!py-3">もどる</button>
              <button onClick={() => logout()} className="btn-ghost w-full !py-2.5 sm:!py-3">ログアウト</button>
            </div>
          </div>
        </div>
      </div>

      {isGuest ? (
        <div
          className="card mobile-action-card w-full anim-fade-up mb-4 text-left"
          style={{
            borderColor: 'rgba(148, 163, 184, 0.2)',
            background: 'linear-gradient(135deg, rgba(71, 85, 105, 0.26), var(--card-gradient-base-mid))',
            animationDelay: '0.04s',
            opacity: 0.88,
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
                Ask Gemini
              </div>
              <div className="mt-2 font-display text-xl text-slate-100 sm:text-2xl">
                {field}について質問する
              </div>
              <div className="mt-2 text-[13px] leading-5 text-slate-400 sm:text-sm sm:leading-6">
                ゲストは使えません
              </div>
            </div>
            <div
              className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-400 sm:px-4 sm:py-2 sm:text-sm"
            >
              利用不可
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onOpenChat(field as ScienceChatField)}
          className="card mobile-action-card w-full anim-fade-up mb-4 text-left"
          style={{
            borderColor: `${color}40`,
            background: `linear-gradient(135deg, ${color}18, var(--card-gradient-base-mid))`,
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
              <div className="mt-2 font-display text-xl text-white sm:text-2xl">
                {field}について質問する
              </div>
              <div className="mt-2 text-[13px] leading-5 text-slate-300 sm:text-sm sm:leading-6">
                すぐ聞ける
              </div>
            </div>
            <div
              className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 sm:px-4 sm:py-2 sm:text-sm"
            >
              Geminiに聞く →
            </div>
          </div>
        </button>
      )}

      <button
        onClick={() => onSelect('all', questionCount)}
        className="card mobile-action-card w-full anim-fade-up mb-4 text-left"
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
              <div className="font-semibold text-base sm:text-lg" style={{ color }}>全単元ランダム</div>
              <div className="mt-1 text-[13px] leading-5 text-slate-400 sm:text-sm sm:leading-6">まとめて解く</div>
            </div>
          <div
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] sm:px-3 sm:text-xs"
            style={{ background: `${color}18`, color }}
          >
            quick start
          </div>
        </div>
      </button>

      <div className="card mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">出題数</div>
            <div className="mt-1 text-sm text-slate-300">5 / 10 / 15 / 全問</div>
          </div>
          <div className="segment-bar sm:w-auto">
            {QUESTION_COUNT_OPTIONS.map(option => {
              const active = questionCount === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setQuestionCount(option)}
                  className={`segment-button ${active ? 'is-active' : ''}`}
                >
                  {option === 'all' ? '全問' : option}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div
        className="card mobile-action-card w-full anim-fade-up mb-4 text-left"
        style={{
          borderColor: `${color}35`,
          background: `linear-gradient(180deg, ${color}14, var(--card-gradient-base-mid))`,
          animationDelay: '0.06s',
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
              Custom
            </div>
            <div className="mt-2 font-display text-xl text-white sm:text-2xl">
              カスタム
            </div>
            <div className="mt-2 text-[13px] leading-5 text-slate-300 sm:text-sm sm:leading-6">
              しぼって出す
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
            {showCustomPanel ? '閉じる' : '条件'}
          </button>
        </div>

        {showCustomPanel && (
            <div className="mt-4 rounded-[22px] border border-white/8 bg-slate-950/24 p-3.5 sm:mt-5 sm:rounded-[24px] sm:p-5">
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
                      {unitItem.unit} ({unitItem.questionCount}問)
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  単元を指定したいときは、ここから選べます。
                </p>
              </div>

              <div className="grid gap-4">
                {([
                  { label: '学年', gridClass: 'sm:grid-cols-4', options: customGradeOptions, selected: customOptions.grade, onSelect: updateGrade, getLabel: getCustomQuizGradeFilterLabel, hint: '中1・中2・中3でまとめてしぼれます。' as string | undefined },
                  { label: '問題タイプ', gridClass: 'sm:grid-cols-3 lg:grid-cols-5', options: ['all', ...QUESTION_TYPES] as const, selected: customOptions.questionType, onSelect: updateQuestionType, getLabel: getCustomQuizQuestionTypeLabel, hint: undefined as string | undefined },
                  { label: '出題条件', gridClass: 'sm:grid-cols-3', options: ['all', 'unanswered', 'weak'] as const, selected: customOptions.historyFilter, onSelect: updateHistoryFilter, getLabel: getCustomQuizHistoryFilterLabel, hint: '未回答 = まだ解いていない問題 / 苦手だけ = これまでに1回でもまちがえた問題' as string | undefined },
                ] as const).map(group => (
                  <div key={group.label}>
                    <div className="text-slate-400 text-xs mb-2">{group.label}</div>
                    <div className={`grid gap-2 ${group.gridClass}`}>
                      {group.options.map(option => {
                        const active = group.selected === option
                        return (
                          <button
                            key={option}
                            onClick={() => (group.onSelect as (v: typeof option) => void)(option)}
                            className="rounded-2xl border px-4 py-3 text-sm font-semibold transition-all"
                            style={{
                              borderColor: active ? `${color}70` : 'var(--surface-elevated-border)',
                              background: active ? `${color}18` : 'var(--surface-elevated)',
                              color: active ? color : 'var(--text)',
                            }}
                          >
                            {(group.getLabel as (v: typeof option) => string)(option)}
                          </button>
                        )
                      })}
                    </div>
                    {group.hint && <p className="mt-2 text-xs leading-6 text-slate-500">{group.hint}</p>}
                  </div>
                ))}
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
                onClick={() => onStartCustomQuiz(customOptions, questionCount)}
                className="btn-primary"
              >
                この条件で開始
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 rounded-[24px] border border-white/8 bg-slate-950/22 px-4 py-3 text-sm text-slate-400">
        {loading
          ? '単元データを読み込み中...'
          : '単元ごとの開始ボタンはカスタムにまとめました。単元をしぼりたいときは「条件」から選べます。'}
      </div>

      {/* Lab mode sections — data-driven rendering */}
      {(() => {
        const labSections: Array<{
          field: string
          label: string
          gridClass: string
          modes: Array<{ key: string; meta: { accent: string; badge: string; icon: string; title: string; description?: string }; onClick: () => void }>
        }> = []

        if (field === '生物') {
          labSections.push({
            field: '生物', label: '生物ラボ', gridClass: 'grid gap-3',
            modes: (['organ-pairs'] as const).map(m => ({ key: m, meta: BIOLOGY_MODE_META[m], onClick: () => onSelectBiologyMode(m) })),
          })
        }

        if (field === '化学') {
          labSections.push({
            field: '化学', label: '化学ラボ', gridClass: 'grid gap-3 md:grid-cols-2',
            modes: [
              ...(['flash', 'equation'] as const).map(m => ({ key: m, meta: CHEMISTRY_MODE_META[m], onClick: () => onSelectSpecialMode(m) })),
              ...CHEMISTRY_WORKBENCH_MODES.map(m => ({ key: m, meta: SCIENCE_WORKBENCH_MODE_META[m], onClick: () => onSelectWorkbenchMode(m) })),
            ],
          })
        }

        if (field === '物理') {
          labSections.push({
            field: '物理', label: '物理ラボ', gridClass: 'grid gap-3',
            modes: PHYSICS_WORKBENCH_MODES.map(m => ({ key: m, meta: SCIENCE_WORKBENCH_MODE_META[m], onClick: () => onSelectWorkbenchMode(m) })),
          })
        }

        if (field === '地学') {
          labSections.push({
            field: '地学', label: '地学ラボ', gridClass: 'grid gap-3 md:grid-cols-2',
            modes: [
              ...(['link-pairs'] as const).map(m => ({ key: m, meta: EARTH_SCIENCE_MODE_META[m], onClick: () => onSelectEarthMode(m) })),
              ...EARTH_WORKBENCH_MODES.map(m => ({ key: m, meta: SCIENCE_WORKBENCH_MODE_META[m], onClick: () => onSelectWorkbenchMode(m) })),
            ],
          })
        }

        return labSections.map(section => (
          <div key={section.field} className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-100">{section.label}</h2>
              <span className="text-xs text-slate-500">{section.modes.length > 1 ? 'special modes' : 'special mode'}</span>
            </div>
            <div className={section.gridClass}>
              {section.modes.map(({ key, meta, onClick }) => (
                <LabModeCard key={key} meta={meta} onClick={onClick} />
              ))}
            </div>
          </div>
        ))
      })()}
    </div>
  )
}
