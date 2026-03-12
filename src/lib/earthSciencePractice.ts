export type EarthSciencePracticeMode = 'rock-pairs'

export interface EarthSciencePair {
  id: string
  rock: string
  mineral: string
  clue: string
}

export interface EarthScienceCard {
  id: string
  pairId: string
  kind: 'rock' | 'mineral'
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
  'rock-pairs': {
    title: '岩石・鉱物ペア',
    badge: 'Earth Memory',
    icon: '🪨',
    accent: '#8b7cff',
    description: '岩石カードと鉱物カードをめくって、正しい組み合わせをそろえる地学ミニゲームです。',
    sessionUnit: '岩石と鉱物ペア',
  },
}

const EARTH_ROCK_PAIR_DECK: EarthSciencePair[] = [
  {
    id: 'granite-quartz',
    rock: '花こう岩',
    mineral: '石英',
    clue: '花こう岩には石英・長石・黒雲母などが見られ、石英は透明感のある代表的な鉱物です。',
  },
  {
    id: 'diorite-hornblende',
    rock: '閃緑岩',
    mineral: '角閃石',
    clue: '閃緑岩では、黒っぽい角閃石が目立つことがあります。',
  },
  {
    id: 'gabbro-pyroxene',
    rock: '斑れい岩',
    mineral: '輝石',
    clue: '斑れい岩は黒っぽい深成岩で、輝石がよく含まれます。',
  },
  {
    id: 'peridotite-olivine',
    rock: 'かんらん岩',
    mineral: 'かんらん石',
    clue: 'かんらん岩には、緑色っぽいかんらん石が多く含まれます。',
  },
  {
    id: 'marble-calcite',
    rock: '大理石',
    mineral: '方解石',
    clue: '大理石は石灰岩が変成してできた岩石で、主成分は方解石です。',
  },
]

export function getEarthSciencePairs(mode: EarthSciencePracticeMode) {
  if (mode === 'rock-pairs') return EARTH_ROCK_PAIR_DECK
  return EARTH_ROCK_PAIR_DECK
}

export function buildEarthScienceCards(mode: EarthSciencePracticeMode) {
  return getEarthSciencePairs(mode).flatMap(pair => ([
    {
      id: `${pair.id}-rock`,
      pairId: pair.id,
      kind: 'rock' as const,
      label: pair.rock,
    },
    {
      id: `${pair.id}-mineral`,
      pairId: pair.id,
      kind: 'mineral' as const,
      label: pair.mineral,
    },
  ]))
}
