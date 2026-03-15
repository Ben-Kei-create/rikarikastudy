'use client'

import { createCardHoverHandlers } from '@/lib/uiUtils'

interface LabModeMeta {
  accent: string
  badge: string
  icon: string
  title: string
  description?: string
}

export default function LabModeCard({
  meta,
  onClick,
}: {
  meta: LabModeMeta
  onClick: () => void
}) {
  const hover = createCardHoverHandlers(meta.accent, `${meta.accent}3a`)

  return (
    <button
      onClick={onClick}
      className="card mobile-mini-card text-left"
      style={{
        borderColor: `${meta.accent}3a`,
        background: `linear-gradient(180deg, ${meta.accent}14, rgba(15, 23, 42, 0.78))`,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
      }}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
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
}
