'use client'

export type ScienceGlossaryField = '生物' | '化学' | '物理' | '地学'

export interface ScienceGlossaryEntry {
  id: string
  term: string
  reading: string
  field: ScienceGlossaryField
  shortDescription: string
  description: string
  related: string[]
  tags: string[]
}

export const SCIENCE_GLOSSARY: ScienceGlossaryEntry[] = [
  {
    id: 'cell',
    term: '細胞',
    reading: 'さいぼう',
    field: '生物',
    shortDescription: '生物の体をつくる基本の小さな単位。',
    description: '細胞は、生物の体をつくるもっとも基本的な単位です。植物の細胞には細胞壁や葉緑体があり、動物の細胞にはありません。',
    related: ['核', '葉緑体', '細胞膜'],
    tags: ['生物', '体のつくり', '植物', '動物'],
  },
  {
    id: 'photosynthesis',
    term: '光合成',
    reading: 'こうごうせい',
    field: '生物',
    shortDescription: '植物が光のエネルギーを使って養分をつくるはたらき。',
    description: '光合成は、植物が日光を利用して二酸化炭素と水から養分をつくり、酸素を出すはたらきです。主に葉の葉緑体で行われます。',
    related: ['葉緑体', '二酸化炭素', '酸素'],
    tags: ['植物', '葉', '養分', '呼吸'],
  },
  {
    id: 'respiration',
    term: '呼吸',
    reading: 'こきゅう',
    field: '生物',
    shortDescription: '生物が養分を使ってエネルギーを取り出すはたらき。',
    description: '呼吸は、生物が養分と酸素を使ってエネルギーを取り出し、二酸化炭素と水を生じるはたらきです。昼も夜も行われます。',
    related: ['光合成', '酸素', '二酸化炭素'],
    tags: ['生物', 'エネルギー', '細胞'],
  },
  {
    id: 'food-chain',
    term: '食物連鎖',
    reading: 'しょくもつれんさ',
    field: '生物',
    shortDescription: '生き物どうしの食べる・食べられる関係のつながり。',
    description: '食物連鎖は、草食動物や肉食動物などが食べる・食べられる関係でつながっているようすです。生態系のバランスを考える時の基本になります。',
    related: ['生態系', '生産者', '消費者'],
    tags: ['自然', '生態系', '動物', '植物'],
  },
  {
    id: 'chromosome',
    term: '染色体',
    reading: 'せんしょくたい',
    field: '生物',
    shortDescription: '遺伝の情報をまとめて持っているつくり。',
    description: '染色体は、細胞の核の中にあり、形質を決める遺伝子が並んでいます。生物が親から子へ特徴を伝えるしくみを学ぶ時に重要です。',
    related: ['遺伝子', '核', '細胞分裂'],
    tags: ['遺伝', '核', 'DNA'],
  },
  {
    id: 'atom',
    term: '原子',
    reading: 'げんし',
    field: '化学',
    shortDescription: '物質をつくるもとになる、とても小さな粒。',
    description: '原子は、物質をつくっている基本の粒です。種類ごとに性質が決まっていて、元素記号で表します。',
    related: ['元素', '分子', 'イオン'],
    tags: ['化学', '粒子', '元素記号'],
  },
  {
    id: 'molecule',
    term: '分子',
    reading: 'ぶんし',
    field: '化学',
    shortDescription: '原子がいくつか結びついてできた粒。',
    description: '分子は、原子が結びついてできた粒で、その物質としての性質を示す最小の単位です。水は H2O、酸素は O2 で表します。',
    related: ['原子', '化学式', '化学反応式'],
    tags: ['化学', '粒子', '水', '酸素'],
  },
  {
    id: 'ion',
    term: 'イオン',
    reading: 'いおん',
    field: '化学',
    shortDescription: '電気を帯びた原子や原子の集まり。',
    description: 'イオンは、原子が電子を失ったり受け取ったりして電気を帯びたものです。陽イオンはプラス、陰イオンはマイナスの電気を帯びています。',
    related: ['電子', '陽イオン', '陰イオン'],
    tags: ['電気', '粒子', '化学変化'],
  },
  {
    id: 'neutralization',
    term: '中和',
    reading: 'ちゅうわ',
    field: '化学',
    shortDescription: '酸性とアルカリ性がたがいの性質を打ち消し合う反応。',
    description: '中和は、酸性の水溶液とアルカリ性の水溶液を混ぜた時に、それぞれの性質が弱まり、塩と水ができる反応です。',
    related: ['酸性', 'アルカリ性', '塩'],
    tags: ['水溶液', 'BTB溶液', '反応'],
  },
  {
    id: 'mass-conservation',
    term: '質量保存の法則',
    reading: 'しつりょうほぞんのほうそく',
    field: '化学',
    shortDescription: '化学変化の前後で全体の質量は変わらないという法則。',
    description: '質量保存の法則は、化学変化が起きても、反応に関わる物質全体の質量は変わらないという考え方です。密閉した容器で確かめます。',
    related: ['化学変化', '化学反応式', '密閉容器'],
    tags: ['法則', '実験', '反応'],
  },
  {
    id: 'force',
    term: '力',
    reading: 'ちから',
    field: '物理',
    shortDescription: '物体を押したり引いたりして、動きや形を変えるはたらき。',
    description: '力は、物体を押したり引いたりするはたらきです。力の大きさだけでなく、向きやはたらく点も考えて表します。',
    related: ['重力', 'ばね', '圧力'],
    tags: ['運動', '物体', 'ニュートン'],
  },
  {
    id: 'inertia',
    term: '慣性',
    reading: 'かんせい',
    field: '物理',
    shortDescription: '物体が今の運動のようすをそのまま保とうとする性質。',
    description: '慣性は、止まっている物体は止まり続け、動いている物体は同じ速さで動き続けようとする性質です。急ブレーキで体が前に出るのもその例です。',
    related: ['力', '運動', '速さ'],
    tags: ['運動', '車', '法則'],
  },
  {
    id: 'current',
    term: '電流',
    reading: 'でんりゅう',
    field: '物理',
    shortDescription: '電気の流れを表す量。',
    description: '電流は、導線の中を流れる電気の流れの大きさを表します。単位はアンペア A です。',
    related: ['電圧', '抵抗', '回路'],
    tags: ['電気', '回路', 'アンペア'],
  },
  {
    id: 'voltage',
    term: '電圧',
    reading: 'でんあつ',
    field: '物理',
    shortDescription: '電流を流そうとするはたらきの大きさ。',
    description: '電圧は、電流を流そうとするはたらきの強さです。単位はボルト V で、電池の数やつなぎ方によって変わります。',
    related: ['電流', '抵抗', '直列回路'],
    tags: ['電気', 'ボルト', '回路'],
  },
  {
    id: 'refraction',
    term: '屈折',
    reading: 'くっせつ',
    field: '物理',
    shortDescription: '光が別の物質へ進む時、進む向きが変わること。',
    description: '屈折は、光が空気から水やガラスへ進む時などに、境界で向きが変わる現象です。入射角と屈折角の関係を調べます。',
    related: ['反射', '入射角', '屈折角'],
    tags: ['光', 'レンズ', '水'],
  },
  {
    id: 'stratum',
    term: '地層',
    reading: 'ちそう',
    field: '地学',
    shortDescription: 'たい積した土や砂などが積み重なってできた層。',
    description: '地層は、川や海などでたい積したれき・砂・泥などが長い時間をかけて積み重なってできたものです。下の地層ほど古いのが基本です。',
    related: ['たい積', '化石', '火山灰'],
    tags: ['地面', '歴史', '岩石'],
  },
  {
    id: 'weather-front',
    term: '前線',
    reading: 'ぜんせん',
    field: '地学',
    shortDescription: '性質のちがう空気のかたまりの境目。',
    description: '前線は、暖かい空気と冷たい空気のように、性質のちがう空気のかたまりが接しているところです。天気の変化と強く関係します。',
    related: ['気団', '低気圧', '天気図'],
    tags: ['天気', '雲', '雨'],
  },
  {
    id: 'plate',
    term: 'プレート',
    reading: 'ぷれーと',
    field: '地学',
    shortDescription: '地球の表面をおおう岩盤の大きな板。',
    description: 'プレートは、地球の表面をおおう岩盤の大きな板です。プレートどうしがぶつかったり離れたりすることで、地震や火山活動が起こります。',
    related: ['地震', '火山', 'マグマ'],
    tags: ['地球', '地震', '火山'],
  },
  {
    id: 'moon-phase',
    term: '月の満ち欠け',
    reading: 'つきのみちかけ',
    field: '地学',
    shortDescription: '月と地球と太陽の位置関係で見え方が変わること。',
    description: '月の満ち欠けは、月が自分で光っているのではなく、太陽の光を反射しているために起こります。位置関係によって新月や満月に見えます。',
    related: ['新月', '満月', '公転'],
    tags: ['宇宙', '月', '太陽'],
  },
  {
    id: 'solar-radiation',
    term: '日射',
    reading: 'にっしゃ',
    field: '地学',
    shortDescription: '太陽から地球へ届く光や熱のエネルギー。',
    description: '日射は、太陽から届く光や熱のエネルギーです。地面や海面の温まり方のちがいは、風や天気の変化にもつながります。',
    related: ['気温', '風', '海陸風'],
    tags: ['天気', '太陽', '熱'],
  },
]

export const SCIENCE_GLOSSARY_FIELDS: Array<ScienceGlossaryField | 'all'> = ['all', '生物', '化学', '物理', '地学']

export function getGlossaryIndexKey(reading: string) {
  return reading.trim().charAt(0) || '#'
}

export function getGlossaryEntryKey(field: ScienceGlossaryField, term: string) {
  return `${field}::${term.trim().toLowerCase()}`
}

export function buildGlossaryEntryId(field: ScienceGlossaryField, term: string) {
  return `glossary-${encodeURIComponent(field)}-${encodeURIComponent(term.trim())}`.toLowerCase()
}

export function sortGlossaryEntries(a: ScienceGlossaryEntry, b: ScienceGlossaryEntry) {
  return a.reading.localeCompare(b.reading, 'ja')
    || a.term.localeCompare(b.term, 'ja')
    || a.id.localeCompare(b.id)
}

export function mergeGlossaryEntries(
  baseEntries: ScienceGlossaryEntry[],
  extraEntries: ScienceGlossaryEntry[],
) {
  const merged = new Map<string, ScienceGlossaryEntry>()

  for (const entry of baseEntries) {
    merged.set(getGlossaryEntryKey(entry.field, entry.term), entry)
  }

  for (const entry of extraEntries) {
    merged.set(getGlossaryEntryKey(entry.field, entry.term), entry)
  }

  return Array.from(merged.values()).sort(sortGlossaryEntries)
}
