'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  mergeGlossaryEntries,
  SCIENCE_GLOSSARY,
  SCIENCE_GLOSSARY_FIELDS,
  type ScienceGlossaryEntry,
  type ScienceGlossaryField,
} from '@/lib/scienceGlossary'
import { getFieldColor } from '@/lib/formUtils'
import { supabase } from '@/lib/supabase'

interface Props {
  visible: boolean
}

export default function GlossaryFab({ visible }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [field, setField] = useState<ScienceGlossaryField | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [customEntries, setCustomEntries] = useState<ScienceGlossaryEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  // FAB が非表示になったらモーダルも閉じる
  useEffect(() => {
    if (!visible && open) setOpen(false)
  }, [visible, open])

  // カスタムエントリーを初回オープン時に取得
  useEffect(() => {
    if (!open || loaded) return
    setLoaded(true)
    supabase
      .from('science_glossary_entries')
      .select('*')
      .order('reading', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setCustomEntries(
            data.map(row => ({
              id: row.id,
              term: row.term,
              reading: row.reading,
              field: row.field as ScienceGlossaryField,
              shortDescription: row.short_description,
              description: row.description,
              related: Array.isArray(row.related) ? (row.related as string[]).filter(Boolean) : [],
              tags: Array.isArray(row.tags) ? (row.tags as string[]).filter(Boolean) : [],
            }))
          )
        }
      })
  }, [open, loaded])

  // モーダル中はスクロールロック
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const allEntries = useMemo(
    () => mergeGlossaryEntries(SCIENCE_GLOSSARY, customEntries),
    [customEntries],
  )

  const termMap = useMemo(
    () => new Map(allEntries.map(e => [e.term, e])),
    [allEntries],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allEntries.filter(e => {
      if (field !== 'all' && e.field !== field) return false
      if (!q) return true
      return [e.term, e.reading, e.shortDescription, ...e.related, ...e.tags]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [allEntries, field, query])

  const handleJump = (term: string) => {
    const target = termMap.get(term)
    if (!target) return
    setField(target.field)
    setQuery('')
    setExpandedId(target.id)
  }

  if (!visible) return null

  return (
    <>
      {/* ── FAB ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[100] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.92), rgba(59, 130, 246, 0.92))',
          boxShadow: '0 4px 20px rgba(14, 165, 233, 0.35)',
        }}
        aria-label="理科事典を開く"
      >
        <span className="text-lg leading-none">📖</span>
      </button>

      {/* ── Modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-[110] flex flex-col bg-slate-950/92 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-5 sm:px-6">
              <div>
                <div className="text-lg font-bold text-white">理科事典</div>
                <div className="mt-0.5 text-xs text-slate-400">{filtered.length}語</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            {/* Search + Filters */}
            <div className="space-y-2.5 px-4 pb-1 sm:px-6">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="用語を検索..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-sky-400/40 focus:bg-white/8"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5">
                {SCIENCE_GLOSSARY_FIELDS.map(f => {
                  const active = field === f
                  const label = f === 'all' ? 'すべて' : f
                  const color = f === 'all' ? '#38bdf8' : getFieldColor(f)
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => { setField(f); setExpandedId(null) }}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold transition-all"
                      style={{
                        background: active ? `${color}22` : 'transparent',
                        color: active ? color : '#64748b',
                        border: `1px solid ${active ? `${color}50` : 'transparent'}`,
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Term List */}
            <div className="mt-2 flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
                  条件に合う用語が見つかりません。
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map(entry => {
                    const isExpanded = expandedId === entry.id
                    const color = getFieldColor(entry.field)
                    return (
                      <div key={entry.id}>
                        {/* Term header */}
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                          className="w-full rounded-xl border px-3.5 py-2.5 text-left transition-all"
                          style={{
                            borderColor: isExpanded ? `${color}40` : 'rgba(255,255,255,0.06)',
                            background: isExpanded ? `${color}0a` : 'rgba(255,255,255,0.03)',
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white">{entry.term}</span>
                                <span className="text-[11px] text-slate-500">{entry.reading}</span>
                              </div>
                              {!isExpanded && (
                                <div className="mt-0.5 truncate text-xs text-slate-400">
                                  {entry.shortDescription}
                                </div>
                              )}
                            </div>
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{ background: `${color}18`, color }}
                            >
                              {entry.field}
                            </span>
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div
                            className="mx-1 rounded-b-xl border-x border-b px-3.5 pb-3.5 pt-2.5"
                            style={{
                              borderColor: `${color}30`,
                              background: `${color}06`,
                            }}
                          >
                            <div className="text-sm font-semibold leading-7 text-slate-200">
                              {entry.shortDescription}
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                              {entry.description}
                            </div>
                            {entry.related.length > 0 && (
                              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] text-slate-500">関連:</span>
                                {entry.related.map(r => {
                                  const linked = termMap.get(r)
                                  if (!linked) {
                                    return (
                                      <span
                                        key={r}
                                        className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-400"
                                      >
                                        {r}
                                      </span>
                                    )
                                  }
                                  return (
                                    <button
                                      key={r}
                                      type="button"
                                      onClick={() => handleJump(r)}
                                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors hover:brightness-125"
                                      style={{
                                        background: `${getFieldColor(linked.field)}18`,
                                        color: getFieldColor(linked.field),
                                      }}
                                    >
                                      {r}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
