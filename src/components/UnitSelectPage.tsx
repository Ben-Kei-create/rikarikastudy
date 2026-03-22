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
  const [showSupportTools, setShowSupportTools] = useState(false)
  const [customOptions, setCustomOptions] = useState<CustomQuizOptions>(DEFAULT_CUSTOM_QUIZ_OPTIONS)
  const [availableGrades, setAvailableGrades] = useState<CustomQuizGradeFilter[]>(['中1', '中2', '中3'])
  const [questionCount, setQuestionCount] = useState<QuizQuestionCount>(10)
  const [currentXp, setCurrentXp] = useState(0)
  const color = FIELD_COLORS[field as keyof typeof FIELD_COLORS] ?? 'var(--color-info)'
  const totalQuestionCount = units.reduce((sum, item) => sum + item.questionCount, 0)
  const isGuest = isGuestStudentId(studentId)
  const customGradeOptions = CUSTOM_QUIZ_GRADE_OPTIONS.filter(grade => (
    grade === 'all' || availableGrades.includes(grade)
  ))
  const levelInfo = getLevelInfo(currentXp)

  useEffect(() => {
    setShowCustomPanel(false)
    setShowSupportTools(false)
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 lg:justify-end">
              <span>登録単元 {units.length}</span>
              <span>問題数 {totalQuestionCount}</span>
              <span>現在 Lv.{levelInfo.level}</span>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 md:w-[284px]">
              <button onClick={onBack} className="text-left text-sm font-semibold text-slate-200 transition-colors hover:text-white">もどる</button>
              <button onClick={() => logout()} className="text-right text-sm text-slate-400 transition-colors hover:text-slate-200">ログアウト</button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="card mobile-action-card w-full anim-fade-up mb-4 text-left"
        style={{
          borderColor: `${color}40`,
          background: `linear-gradient(180deg, ${color}18, var(--surface-elevated))`,
          animationDelay: '0.05s',
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-base sm:text-lg" style={{ color }}>全単元ランダム</div>
            <div className="mt-1 text-[13px] leading-5 text-slate-400 sm:text-sm sm:leading-6">迷ったらここから。分野の中をまとめて解きます。</div>
          </div>
          <button
            type="button"
            onClick={() => onSelect('all', questionCount)}
            className="text-sm font-semibold transition-colors hover:text-white"
            style={{ color }}
          >
            すぐ開始
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">出題数</div>
            <div className="mt-1 text-sm text-slate-300">5 / 10 / 15 / 全問</div>
          </div>
          <select
            value={String(questionCount)}
            onChange={event => setQuestionCount(event.target.value === 'all' ? 'all' : Number(event.target.value) as QuizQuestionCount)}
            className="input-surface sm:w-[168px]"
          >
            {QUESTION_COUNT_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option === 'all' ? '全問' : `${option}問`}
              </option>
            ))}
          </select>
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
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {getCustomQuizSummaryParts(customOptions).map(part => (
                <span
                  key={part}
                  className="text-[11px] font-semibold"
                  style={{ color }}
                >
                  {part}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => setShowCustomPanel(current => !current)}
            className="text-sm font-semibold text-slate-200 transition-colors hover:text-white"
          >
            {showCustomPanel ? '閉じる' : '条件をひらく'}
          </button>
        </div>

        {showCustomPanel && (
          <div className="mt-4 rounded-[22px] border border-white/8 bg-slate-950/18 p-3.5 sm:mt-5 sm:rounded-[24px] sm:p-5">
            <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
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
                <div>
                  <label className="text-slate-400 text-xs mb-2 block">学年</label>
                  <select
                    value={customOptions.grade}
                    onChange={event => updateGrade(event.target.value as CustomQuizGradeFilter)}
                    className="input-surface"
                  >
                    {customGradeOptions.map(option => (
                      <option key={option} value={option}>
                        {getCustomQuizGradeFilterLabel(option)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-6 text-slate-500">中1・中2・中3でまとめてしぼれます。</p>
                </div>

                <div>
                  <label className="text-slate-400 text-xs mb-2 block">問題タイプ</label>
                  <select
                    value={customOptions.questionType}
                    onChange={event => updateQuestionType(event.target.value as CustomQuizQuestionType)}
                    className="input-surface"
                  >
                    {(['all', ...QUESTION_TYPES] as const).map(option => (
                      <option key={option} value={option}>
                        {getCustomQuizQuestionTypeLabel(option)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 text-xs mb-2 block">出題条件</label>
                  <select
                    value={customOptions.historyFilter}
                    onChange={event => updateHistoryFilter(event.target.value as CustomQuizHistoryFilter)}
                    className="input-surface"
                  >
                    {(['all', 'unanswered', 'weak'] as const).map(option => (
                      <option key={option} value={option}>
                        {getCustomQuizHistoryFilterLabel(option)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-6 text-slate-500">未回答 = まだ解いていない問題 / 苦手だけ = これまでに1回でもまちがえた問題</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setCustomOptions(DEFAULT_CUSTOM_QUIZ_OPTIONS)}
                className="text-sm text-slate-400 transition-colors hover:text-slate-200"
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

      <p className="mb-4 px-1 text-xs text-slate-500">
        {loading
          ? '単元データを読み込み中...'
          : '単元をしぼりたいときは「条件」から選べます。'}
      </p>

      <div className="card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Support Tools</div>
            <div className="mt-1 text-sm text-slate-300">Gemini とラボは、必要なときだけここから開けます。</div>
          </div>
          <button
            type="button"
            onClick={() => setShowSupportTools(current => !current)}
            className="text-sm font-semibold text-slate-200 transition-colors hover:text-white"
          >
            {showSupportTools ? '閉じる' : 'サポートを開く'}
          </button>
        </div>

        {showSupportTools && (
          <div className="mt-4 space-y-6">
            {isGuest ? (
              <div className="flex items-center justify-between gap-4 border-t border-white/8 pt-4">
                <div>
                  <div className="text-sm font-semibold text-slate-100">{field}について質問する</div>
                  <div className="mt-1 text-xs leading-6 text-slate-400">ゲストは使えません</div>
                </div>
                <div className="text-xs font-semibold text-slate-500 sm:text-sm">
                  利用不可
                </div>
              </div>
            ) : (
              <button
                onClick={() => onOpenChat(field as ScienceChatField)}
                className="flex w-full items-center justify-between gap-4 border-t border-white/8 pt-4 text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{field}について質問する</div>
                  <div className="mt-1 text-xs leading-6 text-slate-300">分からない点を先に整理できます</div>
                </div>
                <div className="text-sm font-semibold text-sky-200 transition-colors hover:text-white">
                  Geminiに聞く
                </div>
              </button>
            )}

            {/* Lab mode sections — data-driven rendering */}
            {(() => {
              const labSections: Array<{
                field: string
                label: string
                modes: Array<{ key: string; meta: { accent: string; badge: string; icon: string; title: string; description?: string }; onClick: () => void }>
              }> = []

              if (field === '生物') {
                labSections.push({
                  field: '生物', label: '生物ラボ',
                  modes: (['organ-pairs'] as const).map(m => ({ key: m, meta: BIOLOGY_MODE_META[m], onClick: () => onSelectBiologyMode(m) })),
                })
              }

              if (field === '化学') {
                labSections.push({
                  field: '化学', label: '化学ラボ',
                  modes: [
                    ...(['flash', 'equation'] as const).map(m => ({ key: m, meta: CHEMISTRY_MODE_META[m], onClick: () => onSelectSpecialMode(m) })),
                    ...CHEMISTRY_WORKBENCH_MODES.map(m => ({ key: m, meta: SCIENCE_WORKBENCH_MODE_META[m], onClick: () => onSelectWorkbenchMode(m) })),
                  ],
                })
              }

              if (field === '物理') {
                labSections.push({
                  field: '物理', label: '物理ラボ',
                  modes: PHYSICS_WORKBENCH_MODES.map(m => ({ key: m, meta: SCIENCE_WORKBENCH_MODE_META[m], onClick: () => onSelectWorkbenchMode(m) })),
                })
              }

              if (field === '地学') {
                labSections.push({
                  field: '地学', label: '地学ラボ',
                  modes: [
                    ...(['link-pairs'] as const).map(m => ({ key: m, meta: EARTH_SCIENCE_MODE_META[m], onClick: () => onSelectEarthMode(m) })),
                    ...EARTH_WORKBENCH_MODES.map(m => ({ key: m, meta: SCIENCE_WORKBENCH_MODE_META[m], onClick: () => onSelectWorkbenchMode(m) })),
                  ],
                })
              }

              return labSections.map(section => (
                <div key={section.field}>
                  <div className="mb-3 flex items-center justify-between gap-3 border-t border-white/8 pt-4">
                    <h2 className="text-base font-semibold text-slate-100">{section.label}</h2>
                    <span className="text-xs text-slate-500">{section.modes.length > 1 ? 'special modes' : 'special mode'}</span>
                  </div>
                  <div className="space-y-2">
                    {section.modes.map(({ key, meta, onClick }) => (
                      <button
                        key={key}
                        onClick={onClick}
                        className="flex w-full items-start justify-between gap-4 rounded-[16px] border border-white/8 px-3.5 py-3 text-left transition-colors hover:border-white/16"
                        style={{ background: `linear-gradient(180deg, ${meta.accent}10, rgba(2, 6, 23, 0.22))` }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-lg" aria-hidden="true">{meta.icon}</span>
                            <span className="font-semibold text-white">{meta.title}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: meta.accent }}>
                              {meta.badge}
                            </span>
                          </div>
                          {meta.description && (
                            <div className="mt-1 text-xs leading-6 text-slate-400">{meta.description}</div>
                          )}
                        </div>
                        <span className="shrink-0 text-xs font-semibold" style={{ color: meta.accent }}>
                          開く
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
