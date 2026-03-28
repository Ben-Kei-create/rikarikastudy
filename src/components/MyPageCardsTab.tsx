'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  getPeriodicCardByKey,
  getPeriodicCardUnlockText,
  isPeriodicCardUnlockedAtLevel,
  PERIODIC_ELEMENT_CARDS,
} from '@/lib/periodicCards'
import { PeriodicCardCollectionEntry } from '@/lib/periodicCardCollection'
import { PeriodicCardViewer } from '@/components/PeriodicCard'

interface Props {
  periodicCards: PeriodicCardCollectionEntry[]
  periodicCardsLoading: boolean
  periodicCardsSchemaMessage: string | null
  level: number
}

export default function MyPageCardsTab({
  periodicCards,
  periodicCardsLoading,
  periodicCardsSchemaMessage,
  level,
}: Props) {
  const periodicUnlocked = isPeriodicCardUnlockedAtLevel(level)
  const periodicTotalCount = PERIODIC_ELEMENT_CARDS.length

  const ownedPeriodicCards = useMemo(
    () => periodicCards
      .map(entry => {
        const definition = getPeriodicCardByKey(entry.cardKey)
        if (!definition) return null
        return { entry, definition }
      })
      .filter((item): item is { entry: PeriodicCardCollectionEntry; definition: NonNullable<ReturnType<typeof getPeriodicCardByKey>> } => item !== null)
      .sort((left, right) => left.definition.atomicNumber - right.definition.atomicNumber),
    [periodicCards],
  )
  const periodicOwnedCount = ownedPeriodicCards.length

  const [selectedPeriodicCardKey, setSelectedPeriodicCardKey] = useState<string | null>(null)

  const selectedPeriodicCardIndex = useMemo(
    () => ownedPeriodicCards.findIndex(item => item.definition.key === selectedPeriodicCardKey),
    [ownedPeriodicCards, selectedPeriodicCardKey],
  )
  const selectedPeriodicCard = selectedPeriodicCardIndex >= 0 ? ownedPeriodicCards[selectedPeriodicCardIndex] : null

  useEffect(() => {
    if (!periodicUnlocked) {
      if (selectedPeriodicCardKey !== null) setSelectedPeriodicCardKey(null)
      return
    }

    if (ownedPeriodicCards.length === 0) {
      if (selectedPeriodicCardKey !== null) setSelectedPeriodicCardKey(null)
      return
    }

    const exists = ownedPeriodicCards.some(card => card.definition.key === selectedPeriodicCardKey)
    if (!exists) setSelectedPeriodicCardKey(ownedPeriodicCards[0].definition.key)
  }, [ownedPeriodicCards, periodicUnlocked, selectedPeriodicCardKey])

  const showPreviousPeriodicCard = () => {
    if (ownedPeriodicCards.length <= 1) return
    const currentIndex = selectedPeriodicCardIndex >= 0 ? selectedPeriodicCardIndex : 0
    const nextIndex = (currentIndex - 1 + ownedPeriodicCards.length) % ownedPeriodicCards.length
    setSelectedPeriodicCardKey(ownedPeriodicCards[nextIndex].definition.key)
  }

  const showNextPeriodicCard = () => {
    if (ownedPeriodicCards.length <= 1) return
    const currentIndex = selectedPeriodicCardIndex >= 0 ? selectedPeriodicCardIndex : 0
    const nextIndex = (currentIndex + 1) % ownedPeriodicCards.length
    setSelectedPeriodicCardKey(ownedPeriodicCards[nextIndex].definition.key)
  }

  return (
    <div className="anim-fade space-y-4">
      {periodicCardsLoading && (
        <div className="text-center py-8 text-slate-400 text-sm">元素カードを読み込み中...</div>
      )}
      <div className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-slate-300 font-bold">元素カード</h3>
            <p className="text-slate-500 text-xs mt-1 leading-6">
              ログインボーナスやパーフェクト報酬で集めたカードだけを、元素番号順にスワイプして見返せます。
            </p>
          </div>
          <div className="rounded-full bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-200">
            {periodicOwnedCount} / {periodicTotalCount}
          </div>
        </div>
      </div>

      {!periodicUnlocked ? (
        <div className="card">
          <div className="rounded-[24px] border px-5 py-6 text-center" style={{
            borderColor: 'rgba(148, 163, 184, 0.16)',
            background: 'var(--inset-bg)',
          }}>
            <div className="text-4xl">🧪</div>
            <div className="mt-3 font-semibold text-white">{getPeriodicCardUnlockText()}</div>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              Lv.20 になると元素カードが解放され、ログインボーナスやパーフェクト報酬で集められるようになります。
            </p>
          </div>
        </div>
      ) : periodicCardsSchemaMessage ? (
        <div className="card">
          <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-5 py-5 text-sm leading-7 text-amber-100">
            {periodicCardsSchemaMessage}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
          <div className="card">
            {periodicCardsLoading ? (
              <div className="rounded-[24px] border border-dashed border-slate-700 px-4 py-8 text-sm text-slate-400">
                カードを読み込み中...
              </div>
            ) : selectedPeriodicCard && selectedPeriodicCardKey ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Swipe Viewer</div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">
                      左右にスワイプ、または矢印ボタンで次のカードへ進めます。
                    </div>
                  </div>
                  <div className="rounded-full bg-sky-300/10 px-3 py-1.5 text-xs font-semibold text-sky-100">
                    {selectedPeriodicCardIndex + 1} / {ownedPeriodicCards.length}
                  </div>
                </div>

                <div className="mx-auto w-full max-w-[24rem]">
                  <PeriodicCardViewer
                    cardKey={selectedPeriodicCardKey}
                    entry={selectedPeriodicCard.entry}
                    size="showcase"
                    onSwipeLeft={showNextPeriodicCard}
                    onSwipeRight={showPreviousPeriodicCard}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={showPreviousPeriodicCard}
                    disabled={ownedPeriodicCards.length <= 1}
                    className="btn-secondary w-full disabled:opacity-60"
                  >
                    ← 前のカード
                  </button>
                  <button
                    onClick={showNextPeriodicCard}
                    disabled={ownedPeriodicCards.length <= 1}
                    className="btn-secondary w-full disabled:opacity-60"
                  >
                    次のカード →
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-700 px-4 py-8 text-sm text-slate-400">
                まだカードがありません。ログインボーナスやパーフェクト報酬でカードを集めてみよう。
              </div>
            )}
          </div>

          <div className="space-y-4">
            {selectedPeriodicCard ? (
              <div className="card">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">コレクション情報</div>
                <div className="mt-3 grid gap-2 text-sm text-slate-300">
                  <div>元素番号: <span className="font-semibold text-white">No.{selectedPeriodicCard.definition.atomicNumber}</span></div>
                  <div>所持枚数: <span className="font-semibold text-white">{selectedPeriodicCard.entry.obtainCount}枚</span></div>
                  <div>初回入手: <span className="font-semibold text-white">{format(new Date(selectedPeriodicCard.entry.firstObtainedAt), 'M月d日', { locale: ja })}</span></div>
                  <div>最近の入手: <span className="font-semibold text-white">{format(new Date(selectedPeriodicCard.entry.lastObtainedAt), 'M月d日 HH:mm', { locale: ja })}</span></div>
                </div>
              </div>
            ) : null}

            <div className="card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Owned Cards</div>
                  <div className="mt-1 text-sm text-slate-400">入手したカードだけを元素番号順に表示</div>
                </div>
                <div className="text-xs text-slate-500">{ownedPeriodicCards.length}枚</div>
              </div>

              {ownedPeriodicCards.length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {ownedPeriodicCards.map(item => {
                    const selected = item.definition.key === selectedPeriodicCardKey
                    return (
                      <button
                        key={item.definition.key}
                        onClick={() => setSelectedPeriodicCardKey(item.definition.key)}
                        className="rounded-[18px] border px-3 py-3 text-left transition-all"
                        style={{
                          borderColor: selected ? 'rgba(125, 211, 252, 0.45)' : 'var(--border)',
                          background: selected
                            ? 'linear-gradient(180deg, rgba(56, 189, 248, 0.14), var(--card-gradient-base-mid))'
                            : 'var(--inset-bg)',
                          boxShadow: selected ? '0 16px 28px rgba(56, 189, 248, 0.16)' : 'none',
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-500">No.{item.definition.atomicNumber}</div>
                            <div className="mt-1 font-display text-xl text-white">{item.definition.symbol}</div>
                            <div className="mt-1 text-xs text-slate-300">{item.definition.nameJa}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-sky-100">{item.entry.obtainCount}枚</div>
                            <div className="mt-1 text-[10px] text-slate-500">{selected ? '表示中' : '表示する'}</div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-[20px] border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400">
                  まだカードがありません。
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
