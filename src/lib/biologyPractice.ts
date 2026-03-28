export type BiologyPracticeMode = 'organ-pairs'

export interface BiologyPracticePair {
  id: string
  organ: string
  functionLabel: string
  clue: string
}

export interface BiologyPracticeCard {
  id: string
  pairId: string
  kind: 'organ' | 'function'
  label: string
}

export const BIOLOGY_MODE_META: Record<
  BiologyPracticeMode,
  {
    title: string
    badge: string
    icon: string
    accent: string
    description: string
    sessionUnit: string
  }
> = {
  'organ-pairs': {
    title: '器官・はたらきペア',
    badge: 'Biology Lab',
    icon: '🧬',
    accent: '#22c55e',
    description: '器官カードとはたらきカードをそろえて、生物の重要語句をくり返し覚えるミニゲームです。',
    sessionUnit: '器官とはたらきペア',
  },
}

const BIOLOGY_ORGAN_PAIR_DECK: BiologyPracticePair[] = [
  {
    id: 'chloroplast-photosynthesis',
    organ: '葉緑体',
    functionLabel: '光合成を行う',
    clue: '葉緑体は植物の細胞にあり、光のエネルギーを使ってデンプンなどの養分をつくります。',
  },
  {
    id: 'mitochondria-respiration',
    organ: 'ミトコンドリア',
    functionLabel: '呼吸でエネルギーを取り出す',
    clue: 'ミトコンドリアは細胞内で呼吸を行い、活動に必要なエネルギーを取り出します。',
  },
  {
    id: 'small-intestine-absorption',
    organ: '小腸',
    functionLabel: '養分を吸収する',
    clue: '小腸では消化された養分が体内へ吸収されます。柔毛があることもポイントです。',
  },
  {
    id: 'red-blood-cell-oxygen',
    organ: '赤血球',
    functionLabel: '酸素を運ぶ',
    clue: '赤血球はヘモグロビンをふくみ、肺で受け取った酸素を全身へ運びます。',
  },
  {
    id: 'root-hair-water',
    organ: '根毛',
    functionLabel: '水や養分を吸収する',
    clue: '根毛は根の表面積を広げ、土の中から水や水にとけた養分を吸収しやすくします。',
  },
]

export function getBiologyPairs(mode: BiologyPracticeMode) {
  if (mode === 'organ-pairs') return BIOLOGY_ORGAN_PAIR_DECK
  return BIOLOGY_ORGAN_PAIR_DECK
}

export function buildBiologyCards(mode: BiologyPracticeMode) {
  return getBiologyPairs(mode).flatMap(pair => ([
    {
      id: `${pair.id}-organ`,
      pairId: pair.id,
      kind: 'organ' as const,
      label: pair.organ,
    },
    {
      id: `${pair.id}-function`,
      pairId: pair.id,
      kind: 'function' as const,
      label: pair.functionLabel,
    },
  ]))
}
