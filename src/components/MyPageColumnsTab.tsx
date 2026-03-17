'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getViewedColumnIds } from '@/lib/questionColumns'
import { getFieldColor } from '@/lib/formUtils'
import { FIELDS } from '@/lib/constants'
import ScienceBackdrop from '@/components/ScienceBackdrop'

interface ColumnEntry {
  questionId: string
  field: string
  unit: string
  columnTitle: string
  columnBody: string
}

interface Props {
  studentId: number | null
}

export default function MyPageColumnsTab({ studentId }: Props) {
  const [columns, setColumns] = useState<ColumnEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [fieldFilter, setFieldFilter] = useState<string>('all')

  useEffect(() => {
    if (!studentId) {
      setLoading(false)
      return
    }

    const viewedIds = getViewedColumnIds(studentId)
    if (viewedIds.size === 0) {
      setColumns([])
      setLoading(false)
      return
    }

    const load = async () => {
      setLoading(true)
      const ids = Array.from(viewedIds)
      const { data } = await supabase
        .from('questions')
        .select('id, field, unit, column_title, column_body')
        .in('id', ids)

      if (data) {
        const entries: ColumnEntry[] = data
          .filter((row: Record<string, unknown>) => row.column_title && row.column_body)
          .map((row: Record<string, unknown>) => ({
            questionId: row.id as string,
            field: row.field as string,
            unit: row.unit as string,
            columnTitle: row.column_title as string,
            columnBody: row.column_body as string,
          }))
        setColumns(entries)
      }
      setLoading(false)
    }

    load()
  }, [studentId])

  const filteredColumns = useMemo(() => {
    if (fieldFilter === 'all') return columns
    return columns.filter(c => c.field === fieldFilter)
  }, [columns, fieldFilter])

  const selectedColumn = useMemo(() => {
    if (!selectedId) return null
    return columns.find(c => c.questionId === selectedId) ?? null
  }, [columns, selectedId])

  useEffect(() => {
    if (!modalOpen || !selectedColumn || typeof window === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', handleKey)
    }
  }, [modalOpen, selectedColumn])

  const handleOpen = (id: string) => {
    setSelectedId(id)
    setModalOpen(true)
  }

  if (loading) {
    return (
      <div className="card anim-fade">
        <div className="text-center text-slate-400 py-8">読み込み中...</div>
      </div>
    )
  }

  return (
    <>
      <div className="anim-fade space-y-4">
        <div className="card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-slate-300 font-bold">コラムコレクション</h3>
              <p className="text-slate-500 text-xs mt-1 leading-6">
                3回以上正解した問題で解放されたコラムです。よもやま話や雑学をいつでも振り返れます。
              </p>
            </div>
            <div className="rounded-full bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-200">
              {columns.length}件
            </div>
          </div>

          <div className="mt-4">
            <div className="text-slate-400 text-xs mb-2">分野フィルタ</div>
            <div className="flex flex-wrap gap-2">
              {(['all', ...FIELDS] as const).map(f => {
                const active = fieldFilter === f
                const label = f === 'all' ? 'すべて' : f
                const color = f === 'all' ? 'var(--color-info)' : getFieldColor(f)
                return (
                  <button
                    key={f}
                    onClick={() => setFieldFilter(f)}
                    className="rounded-full border px-3 py-2 text-xs font-semibold transition-all"
                    style={{
                      borderColor: active ? `${color}70` : 'var(--surface-elevated-border)',
                      background: active ? `${color}18` : 'var(--surface-elevated)',
                      color: active ? color : 'var(--text-muted)',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">コラム一覧</div>
            <div className="text-xs text-slate-500">タップするとポップアップで詳細を読めます。</div>
          </div>
          {filteredColumns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400 text-center">
              {columns.length === 0
                ? '問題を3回以上正解してコラムを解放しよう！'
                : '条件に合うコラムがありません。'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredColumns.map(entry => {
                const color = getFieldColor(entry.field)
                return (
                  <button
                    key={entry.questionId}
                    onClick={() => handleOpen(entry.questionId)}
                    className="w-full rounded-[22px] border px-4 py-3 text-left transition-all hover:-translate-y-0.5"
                    style={{
                      borderColor: 'var(--surface-elevated-border)',
                      background: 'var(--surface-elevated)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base">📖</span>
                          <span className="font-semibold text-white">{entry.columnTitle}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{entry.unit}</div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ background: `${color}18`, color }}
                      >
                        {entry.field}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {modalOpen && selectedColumn && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/76 px-3 py-6 sm:px-5"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="hero-card science-surface relative w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-[30px] border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            <ScienceBackdrop />
            <div className="relative z-[1] flex max-h-[88vh] flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6 sm:py-5">
                <div>
                  <div className="text-amber-300/60 text-xs font-semibold tracking-[0.18em] uppercase mb-2">
                    Column
                  </div>
                  <h3 className="font-display text-xl leading-tight text-white sm:text-2xl">
                    📖 {selectedColumn.columnTitle}
                  </h3>
                  <div className="mt-2 text-sm text-slate-500">
                    {selectedColumn.field} / {selectedColumn.unit}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 text-lg text-slate-300 transition-colors hover:bg-slate-900/70 hover:text-white"
                  aria-label="コラムポップアップを閉じる"
                >
                  ×
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                <p className="text-sm leading-8 text-slate-300 whitespace-pre-wrap">
                  {selectedColumn.columnBody}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
