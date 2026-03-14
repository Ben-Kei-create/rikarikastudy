'use client'

import { CSSProperties, useMemo, useRef, useState } from 'react'
import {
  getPeriodicCardByKey,
  getPeriodicCategoryMeta,
} from '@/lib/periodicCards'
import {
  getPeriodicCardRewardSourceLabel,
  PeriodicCardCollectionEntry,
  PeriodicCardReward,
} from '@/lib/periodicCardCollection'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

type PeriodicCardSize = 'regular' | 'compact' | 'showcase'

function buildCardStyle(
  accent: string,
  border: string,
  glow: string,
  size: PeriodicCardSize,
): CSSProperties {
  const compactLike = size === 'compact'
  return {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: compactLike ? 24 : size === 'showcase' ? 26 : 30,
    border: `1px solid ${border}`,
    background: `linear-gradient(155deg, ${accent}1f 0%, rgba(15, 23, 42, 0.92) 48%, rgba(2, 6, 23, 0.98) 100%)`,
    boxShadow: `0 22px 48px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
  }
}

export function PeriodicCardSurface({
  cardKey,
  entry,
  compact = false,
  style,
  className = '',
}: {
  cardKey: string
  entry?: PeriodicCardCollectionEntry | null
  compact?: boolean
  size?: PeriodicCardSize
  style?: CSSProperties
  className?: string
}) {
  const card = getPeriodicCardByKey(cardKey)
  if (!card) return null

  const categoryMeta = getPeriodicCategoryMeta(card.category)
  const resolvedSize = compact ? 'compact' : size ?? 'regular'
  const compactLike = resolvedSize === 'compact'
  const showcase = resolvedSize === 'showcase'
  const chromeSize = compactLike ? 180 : showcase ? 210 : 240
  const symbolSize = compactLike ? 'text-[2.85rem]' : showcase ? 'text-[4.2rem]' : 'text-5xl'
  const headingSize = compactLike ? 'text-xl' : showcase ? 'text-[1.65rem]' : 'text-2xl'
  const bodyText = compactLike ? 'text-[13px] leading-6' : showcase ? 'text-[13px] leading-6' : 'text-sm leading-7'
  const chipText = compactLike ? 'text-[10px]' : 'text-[11px]'
  const sectionPadding = compactLike ? 18 : showcase ? 20 : 24

  return (
    <div
      className={className}
      style={{
        ...buildCardStyle(categoryMeta.accent, categoryMeta.border, categoryMeta.glow, resolvedSize),
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.22), transparent 28%, transparent 72%, rgba(255,255,255,0.08))',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -90,
          right: -60,
          width: chromeSize,
          height: chromeSize,
          borderRadius: '999px',
          background: `radial-gradient(circle, ${categoryMeta.accent}33 0%, transparent 72%)`,
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, padding: sectionPadding }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`${chipText} font-semibold tracking-[0.2em] text-slate-400`}>No.{card.atomicNumber}</div>
            <div className={`mt-2 font-display ${symbolSize} text-white`} style={{ lineHeight: 1 }}>{card.symbol}</div>
          </div>
          <div
            className={`rounded-full px-3 py-1 ${chipText} font-semibold`}
            style={{ background: `${categoryMeta.accent}1f`, color: categoryMeta.accent }}
          >
            {categoryMeta.label}
          </div>
        </div>

        <div className="mt-4">
          <div className={`${headingSize} font-bold text-white`}>{card.nameJa}</div>
          <div className={`mt-1 ${compactLike ? 'text-xs' : 'text-sm'} tracking-[0.14em] text-slate-400 uppercase`}>{card.nameEn}</div>
          <div className={`mt-2 text-slate-200 ${bodyText}`}>{card.summary}</div>
        </div>

        <div className="mt-4 grid gap-2">
          {card.features.map(feature => (
            <div
              key={feature}
              className={`rounded-[16px] border px-3 py-2 text-slate-100 ${compactLike ? 'text-[13px]' : 'text-sm'}`}
              style={{
                borderColor: 'rgba(255,255,255,0.08)',
                background: 'rgba(15, 23, 42, 0.42)',
              }}
            >
              {feature}
            </div>
          ))}
        </div>

        {!compactLike && (
          <div
            className="mt-4 rounded-[20px] border px-4 py-3"
            style={{
              borderColor: 'rgba(255,255,255,0.08)',
              background: 'rgba(2, 6, 23, 0.5)',
            }}
          >
            <div className={`${chipText} font-semibold tracking-[0.18em] text-slate-400`}>TRIVIA</div>
            <div className={`mt-2 text-slate-200 ${showcase ? 'text-[13px] leading-6' : 'text-sm leading-7'}`}>{card.trivia}</div>
          </div>
        )}

        <div className={`mt-4 flex items-center justify-between gap-3 text-slate-400 ${compactLike ? 'text-[11px]' : 'text-xs'}`}>
          <span>{card.period}周期 / {card.group}族</span>
          {entry ? <span>{entry.obtainCount}枚所持</span> : <span>未収集</span>}
        </div>
      </div>
    </div>
  )
}

export function PeriodicCardViewer({
  cardKey,
  entry,
  className = '',
  size = 'regular',
  onSwipeLeft,
  onSwipeRight,
}: {
  cardKey: string
  entry?: PeriodicCardCollectionEntry | null
  className?: string
  size?: Exclude<PeriodicCardSize, 'compact'>
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0, tx: 0, ty: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  const transform = useMemo(
    () => `perspective(1400px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translate3d(${tilt.tx}px, ${tilt.ty}px, ${dragging ? 18 : 0}px) scale(${dragging ? 1.01 : 1})`,
    [dragging, tilt],
  )

  const updateTilt = (clientX: number, clientY: number) => {
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const ratioX = (clientX - rect.left) / rect.width
    const ratioY = (clientY - rect.top) / rect.height
    const rotateY = clamp((ratioX - 0.5) * 28, -14, 14)
    const rotateX = clamp((0.5 - ratioY) * 24, -12, 12)
    const translateX = clamp((ratioX - 0.5) * 18, -9, 9)
    const translateY = clamp((ratioY - 0.5) * 18, -9, 9)
    setTilt({ x: rotateX, y: rotateY, tx: translateX, ty: translateY })
  }

  return (
    <div
      ref={frameRef}
      className={className}
      style={{ touchAction: 'none' }}
      onPointerDown={event => {
        setDragging(true)
        dragStartRef.current = { x: event.clientX, y: event.clientY }
        updateTilt(event.clientX, event.clientY)
      }}
      onPointerMove={event => {
        if (!dragging) return
        updateTilt(event.clientX, event.clientY)
      }}
      onPointerUp={event => {
        const dragStart = dragStartRef.current
        if (dragStart) {
          const deltaX = event.clientX - dragStart.x
          const deltaY = event.clientY - dragStart.y
          if (Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) + 10) {
            if (deltaX < 0) onSwipeLeft?.()
            if (deltaX > 0) onSwipeRight?.()
          }
        }
        dragStartRef.current = null
        setDragging(false)
        setTilt({ x: 0, y: 0, tx: 0, ty: 0 })
      }}
      onPointerLeave={() => {
        dragStartRef.current = null
        setDragging(false)
        setTilt({ x: 0, y: 0, tx: 0, ty: 0 })
      }}
      onPointerCancel={() => {
        dragStartRef.current = null
        setDragging(false)
        setTilt({ x: 0, y: 0, tx: 0, ty: 0 })
      }}
    >
      <PeriodicCardSurface
        cardKey={cardKey}
        entry={entry}
        size={size}
        style={{
          transform,
          transformStyle: 'preserve-3d',
          transition: dragging ? 'transform 80ms ease-out' : 'transform 280ms cubic-bezier(.22,1,.36,1)',
        }}
      />
    </div>
  )
}

export function PeriodicCardRewardPanel({
  reward,
  entry,
}: {
  reward: PeriodicCardReward
  entry?: PeriodicCardCollectionEntry | null
}) {
  const card = getPeriodicCardByKey(reward.cardKey)
  if (!card) return null
  const displayEntry = entry ?? {
    cardKey: reward.cardKey,
    obtainCount: reward.obtainCount,
    firstObtainedAt: reward.obtainedAt,
    lastObtainedAt: reward.obtainedAt,
    lastSource: reward.source,
  }

  return (
    <div
      className="mt-5 rounded-[26px] border px-4 py-4"
      style={{
        borderColor: 'rgba(245, 158, 11, 0.24)',
        background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.12))',
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold tracking-[0.2em] text-amber-200">CARD REWARD</div>
          <div className="mt-2 font-semibold text-white">
            {reward.isNew ? '新しい周期表カードを手に入れた！' : '周期表カードをもう1枚獲得！'}
          </div>
          <div className="mt-1 text-xs leading-6 text-slate-300">
            {getPeriodicCardRewardSourceLabel(reward.source)}で {card.nameJa} カードを獲得しました。
          </div>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: 'rgba(245, 158, 11, 0.16)', color: '#fde68a' }}
        >
          {reward.isNew ? 'NEW' : `${reward.obtainCount}枚目`}
        </span>
      </div>

      <div className="mt-4 max-w-sm">
        <PeriodicCardSurface cardKey={reward.cardKey} entry={displayEntry} compact />
      </div>
    </div>
  )
}

export function PeriodicCardRewardModal({
  reward,
  entry,
  onClose,
}: {
  reward: PeriodicCardReward
  entry?: PeriodicCardCollectionEntry | null
  onClose: () => void
}) {
  const card = getPeriodicCardByKey(reward.cardKey)
  if (!card) return null
  const displayEntry = entry ?? {
    cardKey: reward.cardKey,
    obtainCount: reward.obtainCount,
    firstObtainedAt: reward.obtainedAt,
    lastObtainedAt: reward.obtainedAt,
    lastSource: reward.source,
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(2, 6, 23, 0.72)', backdropFilter: 'blur(14px)' }}
    >
      <div
        className="w-full max-w-xl rounded-[30px] border px-5 py-6 anim-fade-up"
        style={{
          borderColor: 'rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.98))',
          boxShadow: '0 36px 80px rgba(2, 6, 23, 0.5)',
        }}
      >
        <div className="text-center">
          <div className="text-xs font-semibold tracking-[0.22em] text-amber-200">LOGIN REWARD</div>
          <div className="mt-3 font-display text-3xl text-white">
            {reward.isNew ? '周期表カードを手に入れた！' : '今日の周期表カード'}
          </div>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            {getPeriodicCardRewardSourceLabel(reward.source)}で <span className="font-semibold text-white">{card.nameJa}</span> を獲得しました。
          </p>
          <p className="mt-1 text-xs leading-6 text-slate-400">
            マイページの元素カードタブから、集めたカードをいつでも確認できます。
          </p>
        </div>

        <div className="mt-6">
          <PeriodicCardViewer cardKey={reward.cardKey} entry={displayEntry} />
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 flex-wrap text-xs text-slate-400">
          <span>{reward.isNew ? '新しいカードをコレクションに追加しました。' : `${reward.obtainCount}枚目として記録しました。`}</span>
          <span>カードを指で動かして眺められます。</span>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="btn-primary !px-6">
            とじる
          </button>
        </div>
      </div>
    </div>
  )
}
