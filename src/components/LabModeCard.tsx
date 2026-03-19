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
        background: `linear-gradient(180deg, ${meta.accent}14, var(--card-gradient-base))`,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
      }}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: meta.accent }}
          >
            {meta.badge}
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
