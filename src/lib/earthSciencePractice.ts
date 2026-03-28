export type EarthSciencePracticeMode = 'link-pairs'

export interface EarthSciencePair {
  id: string
  left: string
  right: string
  clue: string
}

export interface EarthScienceCard {
  id: string
  pairId: string
  kind: 'left' | 'right'
  label: string
}

export const EARTH_SCIENCE_MODE_META: Record<
  EarthSciencePracticeMode,
  {
    title: string
    badge: string
    icon: string
    accent: string
    description: string
    sessionUnit: string
  }
> = {
  'link-pairs': {
    title: '地学リンクペア',
    badge: 'Earth Link',
    icon: '🌋',
    accent: '#8b7cff',
    description: '関連する地学カードを2枚選んで、つながるペアを消していくミニゲームです。',
    sessionUnit: '地学リンクペア',
  },
}

const EARTH_LINK_PAIR_DECK: EarthSciencePair[] = [
  {
    id: 'lava-dome-showa-shinzan',
    left: '溶岩ドーム',
    right: '昭和新山',
    clue: '昭和新山は、ねばり気の強い溶岩が盛り上がってできた溶岩ドームの代表例です。',
  },
  {
    id: 'kilauea-shield',
    left: 'キラウエア',
    right: 'たて状火山',
    clue: 'キラウエア火山は、流れやすい溶岩が広く積み重なってできる たて状火山の代表例です。',
  },
  {
    id: 'fold-bent-strata',
    left: 'しゅう曲',
    right: '地層が曲がる',
    clue: 'しゅう曲は、地層が地下の力で押されて曲がった状態を表します。',
  },
  {
    id: 'fault-slipped-strata',
    left: '断層',
    right: '地層がずれる',
    clue: '断層は、地層や岩盤が力を受けて割れ、ずれてしまった境目やその動きのことです。',
  },
  {
    id: 'index-fossil-age',
    left: '示準化石',
    right: '年代の手がかり',
    clue: '示準化石は、地層ができた時代を調べる手がかりになる化石です。',
  },
]

export function getEarthSciencePairs(mode: EarthSciencePracticeMode) {
  if (mode === 'link-pairs') return EARTH_LINK_PAIR_DECK
  return EARTH_LINK_PAIR_DECK
}

export function buildEarthScienceCards(mode: EarthSciencePracticeMode) {
  return getEarthSciencePairs(mode).flatMap(pair => ([
    {
      id: `${pair.id}-left`,
      pairId: pair.id,
      kind: 'left' as const,
      label: pair.left,
    },
    {
      id: `${pair.id}-right`,
      pairId: pair.id,
      kind: 'right' as const,
      label: pair.right,
    },
  ]))
}
