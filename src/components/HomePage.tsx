'use client'
import { useAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import ScienceBackdrop from '@/components/ScienceBackdrop'

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
  onQuickStartAll,
  onMyPage,
}: {
  onSelectField: (field: string) => void
  onQuickStartAll: () => void
  onMyPage: () => void
}) {
  const { nickname, studentId, logout } = useAuth()
  const [stats, setStats] = useState<FieldStats>({})
  const learnedFields = FIELDS.filter(field => (stats[field.name]?.total ?? 0) > 0).length
  const totalQuestions = Object.values(stats).reduce((sum, field) => sum + field.total, 0)
  const totalCorrect = Object.values(stats).reduce((sum, field) => sum + field.correct, 0)
  const overallRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null

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
    <div className="page-shell page-shell-dashboard">
      <div className="hero-card science-surface p-5 sm:p-6 lg:p-8 mb-6 anim-fade-up">
        <ScienceBackdrop />
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-3">
              Home
            </div>
            <div className="font-display text-3xl text-white sm:text-4xl">こんにちは、{nickname}さん</div>
            <p className="text-slate-300 text-sm leading-7 mt-3 sm:text-base">
              今日の理科を、分野からすぐ始められます。背景には理科4分野の雰囲気だけを薄く重ねて、
              学習の邪魔にならないトップ画面にしています。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:max-w-md lg:ml-auto">
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">学習済み</div>
              <div className="mt-2 font-display text-2xl text-white">{learnedFields}<span className="text-base text-slate-400"> / 4</span></div>
              <div className="mt-1 text-xs text-slate-500">分野数</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">正答率</div>
              <div className="mt-2 font-display text-2xl text-white">{overallRate !== null ? `${overallRate}%` : 'START'}</div>
              <div className="mt-1 text-xs text-slate-500">{totalQuestions > 0 ? `${totalQuestions}問解答` : 'まだ未学習'}</div>
            </div>
            <button
              onClick={onMyPage}
              className="btn-secondary w-full"
            >
              マイページ
            </button>
            <button
              onClick={() => logout()}
              className="btn-ghost w-full"
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

      <button
        onClick={onQuickStartAll}
        className="card anim-fade-up mb-4 w-full text-left"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderColor: '#38bdf840',
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.14), rgba(34, 197, 94, 0.08) 32%, rgba(249, 115, 22, 0.08) 66%, rgba(168, 85, 247, 0.12))',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at top right, rgba(255,255,255,0.12), transparent 34%)',
            pointerEvents: 'none',
          }}
        />
        <div className="relative z-[1] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.2em] text-sky-200 uppercase">
              Quick Start
            </div>
            <div className="mt-2 font-display text-2xl text-white sm:text-[1.9rem]">
              4分野総合クイックスタート
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
              生物・化学・物理・地学をまとめて10問。各分野からバランスよく出題して、短時間で全体感をつかめます。
            </p>
          </div>
          <div className="inline-flex items-center justify-center rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-100">
            すぐ始める →
          </div>
        </div>
      </button>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <div className="relative z-[1] flex h-full items-center gap-4">
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
              {rate === null && (
                <div className="relative z-[1] mt-4 text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
                  First Challenge
                </div>
              )}
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
