'use client'

import ScienceBackdrop from '@/components/ScienceBackdrop'

interface PlazaGame {
  id: string
  title: string
  description: string
  available: boolean
  accentColor: string
  label: string
  onPlay?: () => void
}

export default function OnlinePlazaPage({
  onBack,
  onOpenTerritory,
  onOpenLab,
  onOpenScienceTower,
}: {
  onBack: () => void
  onOpenTerritory: () => void
  onOpenLab?: () => void
  onOpenScienceTower?: () => void
}) {
  const games: PlazaGame[] = [
    {
      id: 'territory',
      title: 'オンライン陣取り',
      description: 'オンラインの相手とクイズに答えながら盤面を取り合うターン制バトル',
      available: true,
      accentColor: '#3b82f6',
      label: 'Online Battle',
      onPlay: onOpenTerritory,
    },
    {
      id: 'science-tower',
      title: 'サイエンスタワー',
      description: '2〜5人で協力してタワーを建て、押し寄せる敵の波を防ごう',
      available: false,
      accentColor: '#10b981',
      label: 'Co-op Tower',
      onPlay: onOpenScienceTower,
    },
  ]

  return (
    <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="w-full max-w-2xl px-4">
        <div className="hero-card science-surface p-6 sm:p-8 anim-fade-up">
          <ScienceBackdrop />
          <div className="text-center">
            <div className="text-xs font-semibold tracking-[0.18em] uppercase text-sky-200">Online Plaza</div>
            <h1 className="mt-2 font-display text-2xl text-white sm:text-3xl">オンラインの広場</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              遊びたいコンテンツを選んでください
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {games.map(game => (
              <div
                key={game.id}
                className="subcard p-5 flex flex-col gap-3"
                style={{
                  borderColor: game.available ? `${game.accentColor}30` : 'rgba(100,100,120,0.2)',
                  opacity: game.available ? 1 : 0.6,
                }}
              >
                <div>
                  <div
                    className="text-xs font-semibold tracking-[0.18em] uppercase"
                    style={{ color: game.available ? game.accentColor : '#6b7280' }}
                  >
                    {game.available ? game.label : '実装予定'}
                  </div>
                  <div className="mt-1 text-lg font-display text-white">{game.title}</div>
                  <p className="mt-1 text-xs leading-6 text-slate-400">{game.description}</p>
                </div>
                <div className="mt-auto">
                  {game.available && game.onPlay ? (
                    <button
                      onClick={game.onPlay}
                      className="btn-primary w-full"
                      style={{ background: `linear-gradient(135deg, ${game.accentColor}cc, ${game.accentColor}88)` }}
                    >
                      あそぶ
                    </button>
                  ) : (
                    <div className="text-center text-xs text-slate-500 py-2">近日公開予定</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {onOpenLab && (
              <button onClick={onOpenLab} className="btn-ghost w-full">
                実験ラボへ
              </button>
            )}
            <button onClick={onBack} className="btn-secondary w-full">
              ホームへもどる
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
