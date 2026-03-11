'use client'
import { useEffect, useState, useMemo } from 'react'
import { Database, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { BADGE_DEFINITIONS, getBadgeRarityLabel } from '@/lib/badges'
import { getLevelInfo } from '@/lib/engagement'
import { format, subDays, startOfDay, eachDayOfInterval, differenceInCalendarDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ensureNoDuplicateQuestions } from '@/lib/questionDuplicates'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { loadEarnedBadgeRecords } from '@/lib/studyRewards'

const FIELD_COLORS: Record<string, string> = {
  '生物': '#22c55e', '化学': '#f97316', '物理': '#3b82f6', '地学': '#a855f7',
  '4分野総合': '#38bdf8',
}
const FIELD_EMOJI: Record<string, string> = {
  '生物': '🌿', '化学': '⚗️', '物理': '⚡', '地学': '🌏',
  '4分野総合': '🔬',
}
const FIELDS = ['生物', '化学', '物理', '地学']

interface Session {
  id: string; field: string; unit: string
  total_questions: number; correct_count: number; duration_seconds: number; created_at: string
}
interface AnswerLog {
  question_id: string; is_correct: boolean
  questions: { unit: string; field: string } | null
}
type QuestionRow = Database['public']['Tables']['questions']['Row']

interface CustomQuestionForm {
  field: string
  unit: string
  question: string
  type: 'choice' | 'text'
  choices: [string, string]
  answer: string
  keywords: string
  explanation: string
  grade: string
}

const INITIAL_CUSTOM_QUESTION_FORM: CustomQuestionForm = {
  field: '生物',
  unit: '',
  question: '',
  type: 'choice',
  choices: ['', ''],
  answer: '',
  keywords: '',
  explanation: '',
  grade: '中3',
}

function parseKeywordInput(input: string) {
  const keywords = input
    .split(/[,、\n]/)
    .map(keyword => keyword.trim())
    .filter(Boolean)

  return keywords.length > 0 ? keywords : null
}

function formatStudyTime(totalSeconds: number) {
  if (totalSeconds <= 0) return '0分'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}時間${minutes}分`
  if (minutes > 0) return `${minutes}分`
  return `${seconds}秒`
}

type Tab = 'overview' | 'history' | 'weak' | 'badges' | 'questions' | 'account'

export default function MyPage({
  onBack,
  onStartDrill,
}: {
  onBack: () => void
  onStartDrill: (field: string, unit: string) => void
}) {
  const { studentId, nickname, updateProfile, logout } = useAuth()
  const { theme, setTheme, ready: themeReady } = useTheme()
  const isGuest = isGuestStudentId(studentId)
  const [sessions, setSessions] = useState<Session[]>([])
  const [answerLogs, setAnswerLogs] = useState<AnswerLog[]>([])
  const [myQuestions, setMyQuestions] = useState<QuestionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [nicknameInput, setNicknameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState<'nickname' | 'password' | null>(null)
  const [questionForm, setQuestionForm] = useState<CustomQuestionForm>(INITIAL_CUSTOM_QUESTION_FORM)
  const [questionMsg, setQuestionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [studentXp, setStudentXp] = useState(0)
  const [earnedBadges, setEarnedBadges] = useState<Array<{ badge_key: string; earned_at: string }>>([])

  useEffect(() => {
    if (studentId === null) return
    const load = async () => {
      if (isGuest) {
        const store = loadGuestStudyStore()
        setSessions(store.sessions as Session[])
        setAnswerLogs(store.answerLogs.map(log => ({
          question_id: log.question_id,
          is_correct: log.is_correct,
          questions: { unit: log.unit, field: log.field },
        })))
        setStudentXp(store.xp)
        setEarnedBadges(store.badges)
        setMyQuestions([])
        setLoading(false)
        return
      }

      const shouldLoadMyQuestions = getCachedColumnSupport('created_by_student_id') !== false
      const [sessionsResponse, answerLogsResponse, questionResponse, studentResponse, badgeResponse] = await Promise.all([
        supabase.from('quiz_sessions').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
        supabase.from('answer_logs').select('question_id, is_correct, questions(unit, field)').eq('student_id', studentId),
        shouldLoadMyQuestions
          ? supabase.from('questions').select('*').eq('created_by_student_id', studentId).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase.from('students').select('student_xp').eq('id', studentId).single(),
        loadEarnedBadgeRecords(studentId),
      ])

      const sData = sessionsResponse.data
      const aData = answerLogsResponse.data
      let qData = questionResponse.data

      if (questionResponse.error && isMissingColumnError(questionResponse.error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        qData = []
      } else if (!questionResponse.error && shouldLoadMyQuestions) {
        markColumnSupported('created_by_student_id')
      }

      setSessions(sData || [])
      setAnswerLogs((aData as any) || [])
      setMyQuestions((qData as QuestionRow[]) || [])
      setStudentXp(studentResponse.data?.student_xp ?? 0)
      setEarnedBadges(badgeResponse)
      setLoading(false)
    }
    load()
  }, [isGuest, studentId])

  useEffect(() => {
    setNicknameInput(nickname || '')
  }, [nickname])

  const totalQ = sessions.reduce((a, s) => a + s.total_questions, 0)
  const totalC = sessions.reduce((a, s) => a + s.correct_count, 0)
  const totalStudySeconds = sessions.reduce((a, s) => a + (s.duration_seconds ?? 0), 0)
  const overallRate = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0
  const levelInfo = useMemo(() => getLevelInfo(studentXp), [studentXp])

  const byField = useMemo(() => {
    const m: Record<string, { total: number; correct: number }> = {}
    sessions.forEach(s => {
      if (!m[s.field]) m[s.field] = { total: 0, correct: 0 }
      m[s.field].total += s.total_questions
      m[s.field].correct += s.correct_count
    })
    return m
  }, [sessions])

  const weakUnits = useMemo(() => {
    const m: Record<string, { field: string; total: number; correct: number }> = {}
    answerLogs.forEach(log => {
      const unit = log.questions?.unit
      const field = log.questions?.field
      if (!unit || !field) return
      const key = `${field}::${unit}`
      if (!m[key]) m[key] = { field, total: 0, correct: 0 }
      m[key].total++
      if (log.is_correct) m[key].correct++
    })
    return Object.entries(m)
      .map(([key, v]) => ({ unit: key.split('::')[1], field: v.field, total: v.total, correct: v.correct, rate: Math.round((v.correct / v.total) * 100) }))
      .filter(u => u.total >= 3)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 8)
  }, [answerLogs])

  const dailyData = useMemo(() => {
    const today = startOfDay(new Date())
    const days = eachDayOfInterval({ start: subDays(today, 29), end: today })
    const map: Record<string, { count: number; correct: number }> = {}
    sessions.forEach(s => {
      const key = format(new Date(s.created_at), 'yyyy-MM-dd')
      if (!map[key]) map[key] = { count: 0, correct: 0 }
      map[key].count += s.total_questions
      map[key].correct += s.correct_count
    })
    return days.map(d => {
      const key = format(d, 'yyyy-MM-dd')
      return { date: d, key, ...(map[key] || { count: 0, correct: 0 }) }
    })
  }, [sessions])

  const streak = useMemo(() => {
    const activeDays = new Set(sessions.map(s => format(new Date(s.created_at), 'yyyy-MM-dd')))
    let count = 0
    let d = new Date()
    while (true) {
      const key = format(d, 'yyyy-MM-dd')
      if (!activeDays.has(key)) break
      count++
      d = subDays(d, 1)
    }
    return count
  }, [sessions])

  const maxStreak = useMemo(() => {
    const activeDays = Array.from(
      new Set(sessions.map(s => format(new Date(s.created_at), 'yyyy-MM-dd')))
    ).sort()
    let max = 0, cur = 0, prev: string | null = null
    for (const day of activeDays) {
      if (prev && differenceInCalendarDays(new Date(day), new Date(prev)) === 1) cur++
      else cur = 1
      if (cur > max) max = cur
      prev = day
    }
    return max
  }, [sessions])

  const heatColor = (count: number) => {
    if (count === 0) return 'var(--surface-elevated)'
    if (count < 10) return '#1d4ed8'
    if (count < 30) return '#3b82f6'
    if (count < 60) return '#60a5fa'
    return '#93c5fd'
  }

  const weekData = dailyData.slice(-7)
  const weekMax = Math.max(...weekData.map(d => d.count), 1)
  const tabs = isGuest
    ? ([['overview', '📊 概要'], ['history', '📅 履歴'], ['weak', '🎯 弱点'], ['badges', '🏅 バッジ'], ['account', '⚙️ 設定']] as const)
    : ([['overview', '📊 概要'], ['history', '📅 履歴'], ['weak', '🎯 弱点'], ['badges', '🏅 バッジ'], ['questions', '✍️ 問題作成'], ['account', '⚙️ 設定']] as const)

  const handleSaveNickname = async () => {
    setSaving('nickname')
    const result = await updateProfile({ nickname: nicknameInput })
    setSaving(null)
    setAccountMsg({ type: result.ok ? 'success' : 'error', text: result.message })
  }

  const handleSavePassword = async () => {
    if (passwordInput.trim() !== passwordConfirm.trim()) {
      setAccountMsg({ type: 'error', text: 'パスワードが一致していません。' })
      return
    }

    setSaving('password')
    const result = await updateProfile({ password: passwordInput })
    setSaving(null)
    setAccountMsg({ type: result.ok ? 'success' : 'error', text: result.message })

    if (result.ok) {
      setPasswordInput('')
      setPasswordConfirm('')
    }
  }

  const handleAddQuestion = async () => {
    if (!studentId) return
    if (!questionForm.unit.trim() || !questionForm.question.trim() || !questionForm.answer.trim()) {
      setQuestionMsg({ type: 'error', text: '分野・単元・問題・答えを入力してください。' })
      return
    }

    if (questionForm.type === 'choice') {
      const filledChoices = questionForm.choices.map(choice => choice.trim()).filter(Boolean)
      if (filledChoices.length !== 2) {
        setQuestionMsg({ type: 'error', text: '2択問題は選択肢を2つ入力してください。' })
        return
      }
      if (!filledChoices.includes(questionForm.answer.trim())) {
        setQuestionMsg({ type: 'error', text: '答えは選択肢AかBと同じ内容にしてください。' })
        return
      }
    }

    try {
      setSavingQuestion(true)
      setQuestionMsg(null)
      const payload = {
        created_by_student_id: studentId,
        field: questionForm.field,
        unit: questionForm.unit.trim(),
        question: questionForm.question.trim(),
        type: questionForm.type,
        choices: questionForm.type === 'choice' ? questionForm.choices.map(choice => choice.trim()) : null,
        answer: questionForm.answer.trim(),
        keywords: questionForm.type === 'text' ? parseKeywordInput(questionForm.keywords) : null,
        explanation: questionForm.explanation.trim() || null,
        grade: questionForm.grade,
      }

      await ensureNoDuplicateQuestions([{
        field: payload.field,
        unit: payload.unit,
        question: payload.question,
        type: payload.type,
        choices: payload.choices,
        answer: payload.answer,
      }])

      const { data, error } = await supabase
        .from('questions')
        .insert(payload)
        .select()
        .single()

      if (error && isMissingColumnError(error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        throw new Error('Supabase の questions テーブルに created_by_student_id 列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。')
      }

      if (error && isMissingColumnError(error, 'keywords')) {
        throw new Error('Supabase の questions テーブルに keywords 列がありません。最新の supabase_schema.sql を SQL Editor で実行してください。')
      }

      if (!error) {
        markColumnSupported('created_by_student_id')
      }

      if (error) throw new Error(error.message)

      if (data) {
        setMyQuestions(current => [data as QuestionRow, ...current])
      }
      setQuestionForm(INITIAL_CUSTOM_QUESTION_FORM)
      setQuestionMsg({ type: 'success', text: '自分用の問題を追加しました。' })
    } catch (error) {
      setQuestionMsg({
        type: 'error',
        text: error instanceof Error ? `問題の保存に失敗しました: ${error.message}` : '問題の保存に失敗しました。',
      })
    } finally {
      setSavingQuestion(false)
    }
  }

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="text-slate-400">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="page-shell page-shell-dashboard">
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 px-1 pt-2 pb-4 floating-header">
        <div className="flex items-center justify-between gap-3 mb-3">
          <button onClick={onBack} className="btn-secondary text-sm !px-4 !py-2.5">
            もどる
          </button>
          <button
            onClick={() => logout()}
            className="btn-ghost text-sm !px-4 !py-2.5"
          >
            ログアウト
          </button>
        </div>
        <div className="hero-card science-surface px-5 py-5 sm:px-6">
          <ScienceBackdrop />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2">My Page</div>
              <h1 className="font-display text-3xl text-white">マイページ</h1>
              <p className="text-slate-400 text-sm mt-1">
                {isGuest ? `${nickname}さんの当日成績` : `${nickname}さんの成績`}
              </p>
            </div>
            {streak > 0 && (
              <div className="flex w-fit items-center gap-2 rounded-[20px] px-4 py-3" style={{ background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.18)' }}>
                <span className="text-2xl">🔥</span>
                <span className="font-display text-2xl text-orange-300">{streak}</span>
                <span className="text-slate-400 text-xs">日連続</span>
              </div>
            )}
          </div>
          {isGuest && (
            <div
              className="mt-4 rounded-[20px] px-4 py-3 text-sm leading-6 text-sky-100"
              style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.2)' }}
            >
              ゲストモードでは、成績は当日分だけ保存されます。ニックネーム変更や自分用問題の作成は使えません。
            </div>
          )}
          <div className="segment-bar mt-5">
            {tabs.map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`segment-button ${tab === t ? 'is-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-1">

        {/* ===== 概要タブ ===== */}
        {tab === 'overview' && (
          <div className="space-y-4 anim-fade">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: '総問題数', display: `${totalQ}問`, color: '#3b82f6' },
                { label: '総合正答率', display: `${overallRate}%`, color: overallRate >= 70 ? '#22c55e' : overallRate >= 50 ? '#f59e0b' : '#ef4444' },
                { label: '総勉強時間', display: formatStudyTime(totalStudySeconds), color: '#38bdf8', compact: true },
                { label: '最高連続', display: `${maxStreak}日`, color: '#f97316' },
              ].map(item => (
                <div key={item.label} className="card text-center" style={{ padding: '16px 8px' }}>
                  <div className={`font-display ${item.compact ? 'text-xl' : 'text-2xl'}`} style={{ color: item.color }}>
                    {item.display}
                  </div>
                  <div className="text-slate-500 text-xs mt-1">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Level Progress</div>
                  <div className="mt-2 flex items-end gap-3">
                    <div className="font-display text-4xl text-white">Lv.{levelInfo.level}</div>
                    <div className="pb-1 text-sm font-semibold text-sky-200">{levelInfo.title}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">TOTAL XP</div>
                  <div className="mt-2 font-display text-3xl text-sky-300">{levelInfo.totalXp}</div>
                </div>
              </div>
              <div className="mt-5 soft-track" style={{ height: 10 }}>
                <div
                  style={{
                    width: `${levelInfo.progressRate}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #60a5fa, #38bdf8)',
                    borderRadius: 999,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>{levelInfo.progressXp} / {levelInfo.progressMax} XP</span>
                <span>次まで {Math.max(0, levelInfo.nextLevelXp - levelInfo.totalXp)} XP</span>
              </div>
            </div>

            {/* 分野別正答率バー */}
            <div className="card">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">分野別正答率</h3>
              <div className="space-y-3">
                {FIELDS.map(f => {
                  const s = byField[f]
                  const rate = s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : null
                  const color = FIELD_COLORS[f]
                  return (
                    <div key={f}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 16 }}>{FIELD_EMOJI[f]}</span>
                          <span className="text-sm font-bold" style={{ color }}>{f}</span>
                          {s && <span className="text-slate-600 text-xs">{s.total}問</span>}
                        </div>
                        <span className="font-bold text-sm" style={{
                          color: rate === null ? '#475569' : rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
                        }}>
                          {rate === null ? '—' : `${rate}%`}
                        </span>
                      </div>
                      <div className="soft-track" style={{ height: 8 }}>
                        <div style={{
                          width: `${rate ?? 0}%`, height: '100%',
                          background: `linear-gradient(90deg, ${color}, ${color}80)`,
                          borderRadius: 8, transition: 'width 1.2s ease',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 今週の棒グラフ */}
            <div className="card">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">今週の学習量（問題数）</h3>
              <div className="flex items-end justify-between gap-2" style={{ height: 96 }}>
                {weekData.map((d, i) => {
                  const h = d.count > 0 ? Math.max((d.count / weekMax) * 80, 8) : 0
                  const isToday = format(d.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-slate-500 text-xs" style={{ minHeight: 16 }}>
                        {d.count > 0 ? d.count : ''}
                      </div>
                      <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{
                          width: '100%', height: h,
                          background: isToday
                            ? 'linear-gradient(180deg, #60a5fa, #3b82f6)'
                            : d.count > 0 ? 'linear-gradient(180deg, #475569, #334155)' : 'var(--surface-elevated)',
                          borderRadius: '6px 6px 2px 2px',
                          transition: 'height 1s ease',
                        }} />
                      </div>
                      <div className="text-xs" style={{ color: isToday ? '#60a5fa' : '#475569' }}>
                        {format(d.date, 'E', { locale: ja })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 30日ヒートマップ */}
            <div className="card">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">30日間の学習記録</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                {dailyData.map((d, i) => (
                  <div
                    key={i}
                    title={`${format(d.date, 'M/d')} : ${d.count}問`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 5,
                      background: heatColor(d.count),
                      transition: 'transform 0.15s',
                      cursor: 'default',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.25)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = '' }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-slate-600 text-xs">0問</span>
                {['var(--surface-elevated)', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd'].map(c => (
                  <div key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c }} />
                ))}
                <span className="text-slate-600 text-xs">100問+</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== 履歴タブ ===== */}
        {tab === 'history' && (
          <div className="space-y-2 anim-fade">
            {sessions.length === 0 ? (
                <div className="card text-center text-slate-500 py-12">
                  まだ問題を解いていないよ！<br />さっそく挑戦してみよう 🚀
                </div>
              ) : sessions.slice(0, 50).map(s => {
              const rate = Math.round((s.correct_count / s.total_questions) * 100)
              const color = FIELD_COLORS[s.field] ?? '#38bdf8'
              const dateStr = format(new Date(s.created_at), 'M月d日(E) HH:mm', { locale: ja })
              return (
                <div key={s.id} className="subcard p-4">
                  <div className="flex items-start gap-3">
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{FIELD_EMOJI[s.field] ?? '🔬'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm" style={{ color }}>{s.field}</span>
                        <span className="text-slate-400 text-xs">{s.unit}</span>
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">{dateStr}</div>
                      <div className="mt-2 flex rounded-full overflow-hidden" style={{ height: 5 }}>
                        <div style={{ width: `${rate}%`, background: '#22c55e' }} />
                        <div style={{ width: `${100 - rate}%`, background: '#ef444440' }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold" style={{
                        color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444',
                        fontSize: 20,
                      }}>{s.correct_count}<span className="text-slate-500 text-sm">/{s.total_questions}</span></div>
                      <div className="text-xs" style={{
                        color: rate >= 70 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
                      }}>{rate}%</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ===== 弱点タブ ===== */}
        {tab === 'weak' && (
          <div className="anim-fade">
            <p className="text-slate-500 text-xs mb-4">3問以上解いた単元を正答率の低い順に表示</p>
            {weakUnits.length === 0 ? (
              <div className="card text-center text-slate-500 py-12">
                {totalQ < 10 ? 'もっと問題を解くと弱点が分かるよ！' : '弱点単元なし！全部得意だね 🎉'}
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {weakUnits.map((u, i) => {
                  const color = FIELD_COLORS[u.field]
                  const medal = i === 0 ? '🚨' : i === 1 ? '⚠️' : i === 2 ? '📌' : '📍'
                  return (
                    <div key={`${u.field}-${u.unit}`} className="subcard p-4"
                      style={{ borderColor: u.rate < 50 ? '#ef444430' : 'var(--surface-elevated-border)' }}>
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: 24 }}>{medal}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${color}20`, color }}>{u.field}</span>
                            <span className="font-bold text-white text-sm">{u.unit}</span>
                          </div>
                          <div className="soft-track" style={{ height: 6, borderRadius: 6 }}>
                            <div style={{
                              width: `${u.rate}%`, height: '100%',
                              background: u.rate < 50 ? '#ef4444' : '#f59e0b',
                              borderRadius: 6,
                            }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-lg" style={{
                            color: u.rate < 50 ? '#ef4444' : '#f59e0b'
                          }}>{u.rate}%</div>
                          <div className="text-slate-500 text-xs">{u.total}問</div>
                        </div>
                      </div>
                      <button
                        onClick={() => onStartDrill(u.field, u.unit)}
                        className="btn-secondary mt-3 w-full !py-2.5 text-sm"
                      >
                        復習する →
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'badges' && (
          <div className="anim-fade space-y-4">
            <div className="card">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-slate-300 font-bold">バッジコレクション</h3>
                  <p className="text-slate-500 text-xs mt-1">
                    取ったバッジはカラー表示、未取得はシルエット表示です。
                  </p>
                </div>
                <div className="rounded-full bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-200">
                  {earnedBadges.length} / {BADGE_DEFINITIONS.length}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {BADGE_DEFINITIONS.map(badge => {
                const earned = earnedBadges.find(item => item.badge_key === badge.key)
                const displayDescription = !earned && badge.rarity === 'legendary'
                  ? '???'
                  : badge.description

                return (
                  <div
                    key={badge.key}
                    className={`card ${earned ? '' : 'badge-card--locked'}`}
                    style={{
                      borderColor: earned
                        ? badge.rarity === 'legendary'
                          ? 'rgba(245, 158, 11, 0.34)'
                          : badge.rarity === 'rare'
                            ? 'rgba(56, 189, 248, 0.3)'
                            : 'rgba(34, 197, 94, 0.24)'
                        : 'var(--surface-elevated-border)',
                      background: earned
                        ? badge.rarity === 'legendary'
                          ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.16), rgba(15, 23, 42, 0.86))'
                          : badge.rarity === 'rare'
                            ? 'linear-gradient(180deg, rgba(56, 189, 248, 0.12), rgba(15, 23, 42, 0.86))'
                            : 'linear-gradient(180deg, rgba(34, 197, 94, 0.1), rgba(15, 23, 42, 0.86))'
                        : 'var(--card-bg)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`text-4xl ${earned ? '' : 'grayscale opacity-45'}`}>
                        {earned ? badge.iconEmoji : '🏷️'}
                      </div>
                      <div className="text-[10px] tracking-[0.18em] text-slate-500">
                        {getBadgeRarityLabel(badge.rarity)}
                      </div>
                    </div>
                    <div className="mt-4 font-bold text-white">{badge.name}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">{displayDescription}</div>
                    <div className="mt-4 text-xs text-slate-500">
                      {earned ? `獲得日: ${format(new Date(earned.earned_at), 'M月d日(E)', { locale: ja })}` : '未獲得'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'questions' && (
          <div className="space-y-4 anim-fade">
            <div className="card">
              <h3 className="text-slate-300 font-bold mb-1">自分の問題を追加</h3>
              <p className="text-slate-500 text-xs leading-6">
                ここで作った問題は、自分だけが解けます。先生は管理画面の問題一覧で確認できます。
              </p>
              <div className="grid grid-cols-1 gap-3 mt-4 sm:grid-cols-2">
                <select
                  value={questionForm.field}
                  onChange={e => setQuestionForm(current => ({ ...current, field: e.target.value as typeof FIELDS[number] }))}
                  className="input-surface"
                >
                  {FIELDS.map(field => <option key={field}>{field}</option>)}
                </select>
                <select
                  value={questionForm.type}
                  onChange={e => setQuestionForm(current => ({ ...current, type: e.target.value as 'choice' | 'text' }))}
                  className="input-surface"
                >
                  <option value="choice">2択</option>
                  <option value="text">記述</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={questionForm.unit}
                  onChange={e => setQuestionForm(current => ({ ...current, unit: e.target.value }))}
                  placeholder="単元"
                  className="input-surface"
                />
                <select
                  value={questionForm.grade}
                  onChange={e => setQuestionForm(current => ({ ...current, grade: e.target.value }))}
                  className="input-surface"
                >
                  {['中1', '中2', '中3', '高校'].map(grade => <option key={grade}>{grade}</option>)}
                </select>
              </div>
              <div className="space-y-3 mt-3">
                <textarea
                  value={questionForm.question}
                  onChange={e => setQuestionForm(current => ({ ...current, question: e.target.value }))}
                  placeholder="問題文"
                  rows={4}
                  className="input-surface resize-y"
                />
                {questionForm.type === 'choice' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={questionForm.choices[0]}
                      onChange={e => setQuestionForm(current => ({ ...current, choices: [e.target.value, current.choices[1]] as [string, string] }))}
                      placeholder="選択肢A"
                      className="input-surface"
                    />
                    <input
                      type="text"
                      value={questionForm.choices[1]}
                      onChange={e => setQuestionForm(current => ({ ...current, choices: [current.choices[0], e.target.value] as [string, string] }))}
                      placeholder="選択肢B"
                      className="input-surface"
                    />
                  </div>
                )}
                <input
                  type="text"
                  value={questionForm.answer}
                  onChange={e => setQuestionForm(current => ({ ...current, answer: e.target.value }))}
                  placeholder={questionForm.type === 'choice' ? '答え（AかBと同じ内容）' : '答え'}
                  className="input-surface"
                />
                {questionForm.type === 'text' && (
                  <div>
                    <input
                      type="text"
                      value={questionForm.keywords}
                      onChange={e => setQuestionForm(current => ({ ...current, keywords: e.target.value }))}
                      placeholder="キーワード（任意 / カンマ区切り）"
                      className="input-surface"
                    />
                    <p className="text-slate-500 text-xs mt-2">
                      回答文にこのどれか1つでも含まれていれば `▲` 判定にします。
                    </p>
                  </div>
                )}
                <textarea
                  value={questionForm.explanation}
                  onChange={e => setQuestionForm(current => ({ ...current, explanation: e.target.value }))}
                  placeholder="解説（任意）"
                  rows={3}
                  className="input-surface resize-y"
                />
              </div>
              <button
                onClick={handleAddQuestion}
                className="btn-primary w-full mt-3"
                disabled={savingQuestion}
                style={{ opacity: savingQuestion ? 0.7 : 1 }}
              >
                {savingQuestion ? '追加中...' : 'この問題を追加'}
              </button>
              {questionMsg && (
                <div
                  className="rounded-2xl px-4 py-3 text-sm mt-3"
                  style={{
                    background: questionMsg.type === 'success' ? '#052e16' : '#450a0a',
                    border: `1px solid ${questionMsg.type === 'success' ? '#166534' : '#991b1b'}`,
                    color: questionMsg.type === 'success' ? '#86efac' : '#fca5a5',
                  }}
                >
                  {questionMsg.text}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {myQuestions.length === 0 ? (
                <div className="card text-center text-slate-500 py-10">
                  まだ自分で作った問題はありません。
                </div>
              ) : (
                myQuestions.map(question => (
                  <div key={question.id} className="card">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="px-2 py-1 rounded-full text-xs font-bold"
                            style={{ background: `${FIELD_COLORS[question.field]}20`, color: FIELD_COLORS[question.field] }}
                          >
                            {question.field}
                          </span>
                          <span className="text-white font-bold">{question.unit}</span>
                        </div>
                        <div className="text-slate-500 text-xs mt-1">
                          {format(new Date(question.created_at), 'M月d日(E) HH:mm', { locale: ja })}
                        </div>
                      </div>
                      <span
                        className="px-2 py-1 rounded-full text-xs font-bold"
                        style={{ background: '#f59e0b20', color: '#fbbf24' }}
                      >
                        自分専用
                      </span>
                    </div>
                    <p className="text-white text-sm leading-7 mt-3 whitespace-pre-wrap">{question.question}</p>
                    <div className="text-slate-400 text-sm mt-3">答え: {question.answer}</div>
                    {question.explanation && (
                      <p className="text-slate-300 text-sm leading-7 mt-2 whitespace-pre-wrap">{question.explanation}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'account' && (
          <div className="space-y-4 anim-fade">
            <div className="card">
              <h3 className="text-slate-300 font-bold mb-1">アカウント設定</h3>
              <p className="text-slate-500 text-xs">
                {isGuest ? 'テーマ変更だけ使えます。ゲストの成績は毎日リセットされます。' : 'ニックネーム・パスワード・表示テーマを変更できます。'}
              </p>
              <div className="mt-3 text-slate-400 text-sm">ログインID: <span className="text-white font-bold">{studentId}</span></div>
            </div>

            <div className="card">
              <h3 className="text-slate-300 font-bold mb-4">表示テーマ</h3>
              <div
                className="inline-flex gap-2 rounded-[20px] p-1.5"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--theme-toggle-bg)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <button
                  onClick={() => setTheme('light')}
                  className={`theme-toggle-button ${themeReady && theme === 'light' ? 'is-active' : ''}`}
                >
                  ライト
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`theme-toggle-button ${themeReady && theme === 'dark' ? 'is-active' : ''}`}
                >
                  ダーク
                </button>
              </div>
            </div>

            {!isGuest && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card">
                  <h3 className="text-slate-300 font-bold mb-4">ニックネーム変更</h3>
                  <input
                    type="text"
                    value={nicknameInput}
                    onChange={e => setNicknameInput(e.target.value)}
                    placeholder="ニックネーム"
                    className="input-surface"
                  />
                  <button
                    onClick={handleSaveNickname}
                    className="btn-primary w-full mt-3"
                    disabled={saving === 'nickname'}
                    style={{ opacity: saving === 'nickname' ? 0.7 : 1 }}
                  >
                    {saving === 'nickname' ? '保存中...' : 'ニックネームを保存'}
                  </button>
                </div>

                <div className="card">
                  <h3 className="text-slate-300 font-bold mb-4">パスワード変更</h3>
                  <div className="space-y-3">
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      placeholder="新しいパスワード"
                      className="input-surface"
                    />
                    <input
                      type="password"
                      value={passwordConfirm}
                      onChange={e => setPasswordConfirm(e.target.value)}
                      placeholder="新しいパスワード（確認）"
                      className="input-surface"
                    />
                  </div>
                  <button
                    onClick={handleSavePassword}
                    className="btn-primary w-full mt-3"
                    disabled={saving === 'password'}
                    style={{ opacity: saving === 'password' ? 0.7 : 1 }}
                  >
                    {saving === 'password' ? '保存中...' : 'パスワードを変更'}
                  </button>
                </div>
              </div>
            )}

            {accountMsg && (
              <div
                className="rounded-2xl px-4 py-3 text-sm"
                style={{
                  background: accountMsg.type === 'success' ? '#052e16' : '#450a0a',
                  border: `1px solid ${accountMsg.type === 'success' ? '#166534' : '#991b1b'}`,
                  color: accountMsg.type === 'success' ? '#86efac' : '#fca5a5',
                }}
              >
                {accountMsg.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
