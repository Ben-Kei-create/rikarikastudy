'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  mergeGlossaryEntries,
  getGlossaryIndexKey,
  SCIENCE_GLOSSARY,
  SCIENCE_GLOSSARY_FIELDS,
  ScienceGlossaryEntry,
  ScienceGlossaryField,
} from '@/lib/scienceGlossary'
import { getFieldColor } from '@/lib/formUtils'
import ScienceBackdrop from '@/components/ScienceBackdrop'

interface Props {
  customGlossaryEntries: ScienceGlossaryEntry[]
}

export default function MyPageGlossaryTab({ customGlossaryEntries }: Props) {
  const [glossaryQuery, setGlossaryQuery] = useState('')
  const [glossaryField, setGlossaryField] = useState<ScienceGlossaryField | 'all'>('all')
  const [glossaryIndex, setGlossaryIndex] = useState<string>('all')
  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(SCIENCE_GLOSSARY[0]?.id ?? null)
  const [glossaryModalOpen, setGlossaryModalOpen] = useState(false)

  const allGlossaryEntries = useMemo(
    () => mergeGlossaryEntries(SCIENCE_GLOSSARY, customGlossaryEntries),
    [customGlossaryEntries],
  )
  const glossaryTermMap = useMemo(
    () => new Map(allGlossaryEntries.map(entry => [entry.term, entry])),
    [allGlossaryEntries],
  )

  const normalizedGlossaryQuery = glossaryQuery.trim().toLowerCase()
  const glossaryBaseEntries = useMemo(() => {
    return allGlossaryEntries.filter(entry => {
      if (glossaryField !== 'all' && entry.field !== glossaryField) return false
      if (!normalizedGlossaryQuery) return true

      const target = [
        entry.term,
        entry.reading,
        entry.shortDescription,
        entry.description,
        ...entry.related,
        ...entry.tags,
      ]
        .join(' ')
        .toLowerCase()

      return target.includes(normalizedGlossaryQuery)
    })
  }, [allGlossaryEntries, glossaryField, normalizedGlossaryQuery])

  const glossaryIndexes = useMemo(() => {
    const keys = Array.from(new Set(glossaryBaseEntries.map(entry => getGlossaryIndexKey(entry.reading)))).sort()
    return ['all', ...keys]
  }, [glossaryBaseEntries])

  const glossaryEntries = useMemo(() => {
    return glossaryBaseEntries.filter(entry => glossaryIndex === 'all' || getGlossaryIndexKey(entry.reading) === glossaryIndex)
  }, [glossaryBaseEntries, glossaryIndex])

  const selectedGlossaryEntry = useMemo(() => {
    if (glossaryEntries.length === 0) return null
    return glossaryEntries.find(entry => entry.id === selectedGlossaryId) ?? glossaryEntries[0]
  }, [glossaryEntries, selectedGlossaryId])

  useEffect(() => {
    if (glossaryIndexes.includes(glossaryIndex)) return
    setGlossaryIndex('all')
  }, [glossaryIndex, glossaryIndexes])

  useEffect(() => {
    if (glossaryEntries.length === 0) {
      if (selectedGlossaryId !== null) setSelectedGlossaryId(null)
      if (glossaryModalOpen) setGlossaryModalOpen(false)
      return
    }

    const exists = glossaryEntries.some(entry => entry.id === selectedGlossaryId)
    if (!exists) setSelectedGlossaryId(glossaryEntries[0].id)
  }, [glossaryEntries, glossaryModalOpen, selectedGlossaryId])

  useEffect(() => {
    if (!glossaryModalOpen || !selectedGlossaryEntry || typeof window === 'undefined') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGlossaryModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [glossaryModalOpen, selectedGlossaryEntry])

  const handleGlossaryJump = (term: string) => {
    const target = glossaryTermMap.get(term)
    if (!target) return

    setGlossaryQuery('')
    setGlossaryField(target.field)
    setGlossaryIndex('all')
    setSelectedGlossaryId(target.id)
    setGlossaryModalOpen(true)
  }

  const handleOpenGlossaryEntry = (entryId: string) => {
    setSelectedGlossaryId(entryId)
    setGlossaryModalOpen(true)
  }

  const handleCloseGlossaryModal = () => {
    setGlossaryModalOpen(false)
  }

  return (
    <>
      <div className="anim-fade space-y-4">
        <div className="card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-slate-300 font-bold">理科用語ミニ辞典</h3>
              <p className="text-slate-500 text-xs mt-1 leading-6">
                固定の理科用語集です。検索や索引から用語を選ぶと、分かりやすい説明を読めます。
              </p>
            </div>
            <div className="rounded-full bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-200">
              {glossaryEntries.length}語ヒット
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <label className="text-slate-400 text-xs mb-2 block">用語検索</label>
              <input
                value={glossaryQuery}
                onChange={event => setGlossaryQuery(event.target.value)}
                placeholder="例: 光合成 / 電流 / プレート"
                className="input-surface"
              />
            </div>
            <div>
              <div className="text-slate-400 text-xs mb-2">分野フィルタ</div>
              <div className="flex flex-wrap gap-2">
                {SCIENCE_GLOSSARY_FIELDS.map(fieldOption => {
                  const active = glossaryField === fieldOption
                  const label = fieldOption === 'all' ? 'すべて' : fieldOption
                  const color = fieldOption === 'all' ? 'var(--color-info)' : getFieldColor(fieldOption)
                  return (
                    <button
                      key={fieldOption}
                      onClick={() => setGlossaryField(fieldOption)}
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

          <div className="mt-4">
            <div className="text-slate-400 text-xs mb-2">索引</div>
            <div className="flex flex-wrap gap-2">
              {glossaryIndexes.map(indexKey => {
                const active = glossaryIndex === indexKey
                return (
                  <button
                    key={indexKey}
                    onClick={() => setGlossaryIndex(indexKey)}
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-all"
                    style={{
                      borderColor: active ? 'rgba(56, 189, 248, 0.45)' : 'var(--surface-elevated-border)',
                      background: active ? 'var(--color-info-soft-bg)' : 'var(--surface-elevated)',
                      color: active ? 'var(--color-info-muted)' : 'var(--text-muted)',
                    }}
                  >
                    {indexKey === 'all' ? '全部' : indexKey}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">用語一覧</div>
            <div className="text-xs text-slate-500">用語を押すとポップアップで詳細を開きます。</div>
          </div>
          {glossaryEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400">
              条件に合う用語が見つかりません。
            </div>
          ) : (
            <div className="space-y-2">
              {glossaryEntries.map(entry => {
                const active = selectedGlossaryEntry?.id === entry.id
                const color = getFieldColor(entry.field)
                return (
                  <button
                    key={entry.id}
                    onClick={() => handleOpenGlossaryEntry(entry.id)}
                    className="w-full rounded-[22px] border px-4 py-3 text-left transition-all"
                    style={{
                      borderColor: active ? `${color}60` : 'var(--surface-elevated-border)',
                      background: active ? `${color}14` : 'var(--surface-elevated)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{entry.term}</div>
                        <div className="text-xs text-slate-500 mt-1">{entry.reading}</div>
                      </div>
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ background: `${color}18`, color }}
                      >
                        {entry.field}
                      </span>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-400 line-clamp-2">
                      {entry.shortDescription}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {glossaryModalOpen && selectedGlossaryEntry && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/76 px-3 py-6 sm:px-5"
          onClick={handleCloseGlossaryModal}
        >
          <div
            className="hero-card science-surface relative w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-[30px] border border-white/10"
            onClick={event => event.stopPropagation()}
          >
            <ScienceBackdrop />
            <div className="relative z-[1] flex max-h-[88vh] flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6 sm:py-5">
                <div>
                  <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2">
                    Science Word
                  </div>
                  <h3 className="font-display text-[2rem] leading-none text-white sm:text-4xl">{selectedGlossaryEntry.term}</h3>
                  <div className="mt-2 text-sm text-slate-500">{selectedGlossaryEntry.reading}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="rounded-full px-3 py-1.5 text-sm font-semibold"
                    style={{
                      background: `${getFieldColor(selectedGlossaryEntry.field)}18`,
                      color: getFieldColor(selectedGlossaryEntry.field),
                    }}
                  >
                    {selectedGlossaryEntry.field}
                  </span>
                  <button
                    type="button"
                    onClick={handleCloseGlossaryModal}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 text-lg text-slate-300 transition-colors hover:bg-slate-900/70 hover:text-white"
                    aria-label="辞典ポップアップを閉じる"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                <div className="rounded-[22px] border border-white/8 bg-slate-950/24 p-4">
                  <div className="text-slate-300 font-semibold">ひとことで</div>
                  <p className="mt-2 text-sm leading-7 text-slate-200">
                    {selectedGlossaryEntry.shortDescription}
                  </p>
                </div>

                <div className="mt-5">
                  <div className="text-slate-300 font-semibold">説明</div>
                  <p className="mt-2 text-sm leading-8 text-slate-300 whitespace-pre-wrap">
                    {selectedGlossaryEntry.description}
                  </p>
                </div>

                <div className="mt-6">
                  <div className="text-slate-400 text-xs mb-2">関連語</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedGlossaryEntry.related.length > 0 ? selectedGlossaryEntry.related.map(item => {
                      const linkedEntry = glossaryTermMap.get(item)

                      if (!linkedEntry) {
                        return (
                          <span
                            key={item}
                            className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300"
                          >
                            {item}
                          </span>
                        )
                      }

                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleGlossaryJump(item)}
                          className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-all hover:-translate-y-0.5"
                          style={{
                            borderColor: `${getFieldColor(linkedEntry.field)}55`,
                            background: `${getFieldColor(linkedEntry.field)}18`,
                            color: getFieldColor(linkedEntry.field),
                          }}
                        >
                          {item}
                        </button>
                      )
                    }) : (
                      <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300">
                        関連語はまだありません
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
