'use client'

import { SessionMode } from '@/lib/engagement'

export type ScienceWorkbenchMode =
  | 'chem-density'
  | 'chem-concentration'
  | 'chem-battery'
  | 'earth-humidity'
  | 'earth-column'
  | 'physics-motion-graph'

export interface ScienceWorkbenchMeta {
  field: '化学' | '地学' | '物理'
  title: string
  badge: string
  icon: string
  accent: string
  description: string
  sessionUnit: string
  sessionMode: SessionMode
}

export interface DensityWorkbenchRound {
  id: string
  kind: 'chem-density'
  prompt: string
  supportText: string
  targetDensity: number
  startMass: number
  startVolume: number
  hint: string
  explanation: string
}

export interface ConcentrationWorkbenchRound {
  id: string
  kind: 'chem-concentration'
  prompt: string
  supportText: string
  targetPercent: number
  startSoluteMass: number
  startWaterMass: number
  hint: string
  explanation: string
}

export type BatteryElectrode = 'zinc' | 'copper'
export type BatteryDirection = 'zinc-to-copper' | 'copper-to-zinc'
export type BatteryPlateChange = 'dissolve' | 'attach'

export interface BatteryWorkbenchRound {
  id: string
  kind: 'chem-battery'
  prompt: string
  supportText: string
  targetNegativeElectrode: BatteryElectrode | null
  targetElectronDirection: BatteryDirection | null
  targetCurrentDirection: BatteryDirection | null
  targetZincChange: BatteryPlateChange | null
  targetCopperChange: BatteryPlateChange | null
  hint: string
  explanation: string
}

export interface HumidityWorkbenchRound {
  id: string
  kind: 'earth-humidity'
  prompt: string
  supportText: string
  vaporAmount: number
  startVaporAmount: number
  startTemperature: number
  targetTemperature: number
  hint: string
  explanation: string
}

export type ColumnLayerPattern = 'pebbles' | 'sand' | 'lines' | 'bands' | 'ash'

export interface ColumnLayerOption {
  key: string
  label: string
  detail: string
  color: string
  pattern: ColumnLayerPattern
}

export interface ColumnWorkbenchRound {
  id: string
  kind: 'earth-column'
  prompt: string
  supportText: string
  options: ColumnLayerOption[]
  targetOrder: [string, string, string]
  hint: string
  explanation: string
}

export interface MotionWorkbenchRound {
  id: string
  kind: 'physics-motion-graph'
  prompt: string
  supportText: string
  targetAcceleration: number
  initialVelocity: number
  startAcceleration: number
  hint: string
  explanation: string
}

export type ScienceWorkbenchRound =
  | DensityWorkbenchRound
  | ConcentrationWorkbenchRound
  | BatteryWorkbenchRound
  | HumidityWorkbenchRound
  | ColumnWorkbenchRound
  | MotionWorkbenchRound

export const SCIENCE_WORKBENCH_MODE_META: Record<ScienceWorkbenchMode, ScienceWorkbenchMeta> = {
  'chem-density': {
    field: '化学',
    title: '密度ラボ',
    badge: 'Density Lab',
    icon: '⚖️',
    accent: '#f97316',
    description: '質量と体積を自由に変えて、密度がどう変わるか体感するラボ。',
    sessionUnit: '密度ラボ',
    sessionMode: 'chemistry_density_lab',
  },
  'chem-concentration': {
    field: '化学',
    title: '濃度ラボ',
    badge: 'Solution Lab',
    icon: '🧂',
    accent: '#fb7185',
    description: '溶質と水の量を自由に変えて、濃度の変化を目で見るラボ。',
    sessionUnit: '質量パーセント濃度ラボ',
    sessionMode: 'chemistry_concentration_lab',
  },
  'chem-battery': {
    field: '化学',
    title: '化学電池ラボ',
    badge: 'Battery Lab',
    icon: '🔋',
    accent: '#fbbf24',
    description: '電極・電子・電流の組み合わせを切り替えて、化学電池のしくみを探るラボ。',
    sessionUnit: '化学電池ラボ',
    sessionMode: 'chemistry_battery_lab',
  },
  'earth-humidity': {
    field: '化学',
    title: '飽和水蒸気量ラボ',
    badge: 'Humidity Lab',
    icon: '☁️',
    accent: '#8b7cff',
    description: '温度と水蒸気量を動かして、飽和・露点・雲の関係を体感するラボ。',
    sessionUnit: '飽和水蒸気量ラボ',
    sessionMode: 'chemistry_humidity_lab',
  },
  'earth-column': {
    field: '地学',
    title: '柱状図ラボ',
    badge: 'Strata Lab',
    icon: '🪨',
    accent: '#2dd4bf',
    description: '地層の種類を自由に並べて、柱状図のしくみを探るラボ。',
    sessionUnit: '柱状図ラボ',
    sessionMode: 'earth_column_lab',
  },
  'physics-motion-graph': {
    field: '物理',
    title: '運動グラフラボ',
    badge: 'Motion Graph',
    icon: '📈',
    accent: '#4da2ff',
    description: '加速度と初速を変えて、台車の動きとグラフの形を自由に試すラボ。',
    sessionUnit: '運動グラフラボ',
    sessionMode: 'physics_motion_graph_lab',
  },
}

export const CHEMISTRY_WORKBENCH_MODES: ScienceWorkbenchMode[] = ['chem-density', 'chem-concentration', 'chem-battery', 'earth-humidity']
export const EARTH_WORKBENCH_MODES: ScienceWorkbenchMode[] = ['earth-column']
export const PHYSICS_WORKBENCH_MODES: ScienceWorkbenchMode[] = ['physics-motion-graph']

export const COLUMN_LAYER_OPTIONS: ColumnLayerOption[] = [
  { key: 'mudstone', label: '泥岩', detail: '細かい泥がしずんでできる / 深く静かな海', color: '#64748b', pattern: 'lines' },
  { key: 'sandstone', label: '砂岩', detail: '砂粒が多い / 海岸に近い場所', color: '#d97706', pattern: 'sand' },
  { key: 'conglomerate', label: 'れき岩', detail: '丸いれきが多い / 流れが強い場所', color: '#78716c', pattern: 'pebbles' },
  { key: 'ash', label: '火山灰層', detail: '噴火で広く積もる / かぎ層になりやすい', color: '#cbd5e1', pattern: 'ash' },
  { key: 'limestone', label: '石灰岩', detail: 'サンゴや貝が多い / 浅い海', color: '#f1f5f9', pattern: 'bands' },
  { key: 'coal', label: '石炭層', detail: '植物が多くたまった湿地', color: '#1f2937', pattern: 'bands' },
]

export const SATURATED_VAPOR_TABLE = [
  { temperature: 0, amount: 4.8 },
  { temperature: 10, amount: 9.4 },
  { temperature: 20, amount: 17.3 },
  { temperature: 30, amount: 30.4 },
  { temperature: 40, amount: 51.1 },
] as const

const DENSITY_ROUNDS: DensityWorkbenchRound[] = [
  {
    id: 'density-1',
    kind: 'chem-density',
    prompt: '密度 2.0 g/cm3 の物体を作ろう',
    supportText: '質量 ÷ 体積 が 2.0 になれば成功です。',
    targetDensity: 2.0,
    startMass: 30,
    startVolume: 25,
    hint: '体積を半分にしたり、質量を倍にしたりすると密度は大きくなります。',
    explanation: '密度は 質量 ÷ 体積 です。たとえば 40g ÷ 20cm3 なら 2.0 g/cm3 になります。',
  },
  {
    id: 'density-2',
    kind: 'chem-density',
    prompt: '密度 1.5 g/cm3 の物体を作ろう',
    supportText: '体積 20cm3 なら、質量はいくつ必要かも考えてみよう。',
    targetDensity: 1.5,
    startMass: 50,
    startVolume: 20,
    hint: '1.5 = 30 ÷ 20 や 45 ÷ 30 のように、いくつかの組み合わせで作れます。',
    explanation: '密度 1.5 は、質量が体積の 1.5 倍になっている状態です。',
  },
  {
    id: 'density-3',
    kind: 'chem-density',
    prompt: '密度 3.0 g/cm3 の重い物体を作ろう',
    supportText: '体積のわりに質量が大きいほど密度は上がります。',
    targetDensity: 3.0,
    startMass: 40,
    startVolume: 25,
    hint: '60g ÷ 20cm3 や 90g ÷ 30cm3 なら 3.0 です。',
    explanation: '密度が 3.0 g/cm3 だと、同じ大きさでもかなり重い物体になります。',
  },
  {
    id: 'density-4',
    kind: 'chem-density',
    prompt: '密度 0.5 g/cm3 の軽い物体を作ろう',
    supportText: '質量を小さくするか、体積を大きくすると密度は下がります。',
    targetDensity: 0.5,
    startMass: 20,
    startVolume: 20,
    hint: '10g ÷ 20cm3 や 20g ÷ 40cm3 で 0.5 になります。',
    explanation: '密度が小さいほど、同じ体積でも軽い物体になります。',
  },
]

const CONCENTRATION_ROUNDS: ConcentrationWorkbenchRound[] = [
  {
    id: 'concentration-1',
    kind: 'chem-concentration',
    prompt: '10% の食塩水を作ろう',
    supportText: '濃度 = 溶質の質量 ÷ 溶液の質量 × 100 です。',
    targetPercent: 10,
    startSoluteMass: 15,
    startWaterMass: 45,
    hint: '溶液全体が 100g なら、溶質 10g で 10% になります。',
    explanation: '10% は、溶液 100g の中に溶質が 10g 含まれている状態です。',
  },
  {
    id: 'concentration-2',
    kind: 'chem-concentration',
    prompt: '20% の食塩水を作ろう',
    supportText: '溶質を増やすと濃くなり、水を増やすとうすくなります。',
    targetPercent: 20,
    startSoluteMass: 10,
    startWaterMass: 60,
    hint: '溶質 20g、水 80g なら 20% です。',
    explanation: '20% は、溶液 100g あたり溶質 20g の割合です。',
  },
  {
    id: 'concentration-3',
    kind: 'chem-concentration',
    prompt: '25% の食塩水を作ろう',
    supportText: '分母は 溶質 + 水 の全体量です。',
    targetPercent: 25,
    startSoluteMass: 15,
    startWaterMass: 35,
    hint: '溶質 25g、水 75g で 25% になります。',
    explanation: '質量パーセント濃度では、溶液全体の質量を分母にします。',
  },
  {
    id: 'concentration-4',
    kind: 'chem-concentration',
    prompt: '5% のうすい食塩水を作ろう',
    supportText: 'うすい食塩水では、水の割合がかなり大きくなります。',
    targetPercent: 5,
    startSoluteMass: 20,
    startWaterMass: 60,
    hint: '溶質 5g、水 95g なら 5% です。',
    explanation: '5% は、溶液 100g 中に溶質が 5g だけ入っている状態です。',
  },
]

const BATTERY_ROUNDS: BatteryWorkbenchRound[] = [
  {
    id: 'battery-1',
    kind: 'chem-battery',
    prompt: '－極と電子の流れる向きを合わせよう。',
    supportText: '亜鉛板が －極になり、電子は外部回路を通って銅板へ向かいます。',
    targetNegativeElectrode: 'zinc',
    targetElectronDirection: 'zinc-to-copper',
    targetCurrentDirection: null,
    targetZincChange: null,
    targetCopperChange: null,
    hint: '化学電池では、電子を出すのは亜鉛板です。',
    explanation: '亜鉛板が －極で、電子は 亜鉛 → 銅 に流れます。',
  },
  {
    id: 'battery-2',
    kind: 'chem-battery',
    prompt: '電流の向きまでそろえて、豆電球がつく流れを確認しよう。',
    supportText: '電流の向きは電子の向きと逆です。',
    targetNegativeElectrode: 'zinc',
    targetElectronDirection: 'zinc-to-copper',
    targetCurrentDirection: 'copper-to-zinc',
    targetZincChange: null,
    targetCopperChange: null,
    hint: '電子が 亜鉛 → 銅 なら、電流はその逆向きです。',
    explanation: '電子の流れと電流の向きは反対なので、電流は 銅 → 亜鉛 と考えます。',
  },
  {
    id: 'battery-3',
    kind: 'chem-battery',
    prompt: '亜鉛板と銅板で起きる変化を合わせよう。',
    supportText: '亜鉛はとけてイオンになり、銅は表面に付着していきます。',
    targetNegativeElectrode: null,
    targetElectronDirection: null,
    targetCurrentDirection: null,
    targetZincChange: 'dissolve',
    targetCopperChange: 'attach',
    hint: '亜鉛は Zn2+ になって溶液へ出ていき、銅は析出します。',
    explanation: '亜鉛板では金属亜鉛がイオンになって溶け、銅板では銅が表面に付きます。',
  },
  {
    id: 'battery-4',
    kind: 'chem-battery',
    prompt: '化学電池のしくみを全部そろえよう。',
    supportText: '－極、電子、電流、電極の変化をまとめて確認します。',
    targetNegativeElectrode: 'zinc',
    targetElectronDirection: 'zinc-to-copper',
    targetCurrentDirection: 'copper-to-zinc',
    targetZincChange: 'dissolve',
    targetCopperChange: 'attach',
    hint: '亜鉛が電子を出し、銅が受け取る全体像をひとつずつ確認しよう。',
    explanation: '亜鉛板が －極、電子は亜鉛から銅へ、電流はその逆で、亜鉛は溶け、銅は付着します。',
  },
]

const HUMIDITY_ROUNDS: HumidityWorkbenchRound[] = [
  {
    id: 'humidity-1',
    kind: 'earth-humidity',
    prompt: '空気 1m3 に 9.4g の水蒸気があります。くもり始める温度に合わせよう。',
    supportText: '温度と水蒸気量の交点が飽和曲線に重なると、くもり始める露点になります。',
    vaporAmount: 9.4,
    startVaporAmount: 17.3,
    startTemperature: 30,
    targetTemperature: 10,
    hint: '表で 9.4g に対応する温度を見つけると露点がわかります。',
    explanation: '1m3 中の水蒸気が 9.4g なら、飽和水蒸気量が 9.4g になる 10℃ で露点に達します。',
  },
  {
    id: 'humidity-2',
    kind: 'earth-humidity',
    prompt: '空気 1m3 に 17.3g の水蒸気があります。露点に合わせよう。',
    supportText: '温度を下げるほど、空気中に入れておける水蒸気の限界は小さくなります。',
    vaporAmount: 17.3,
    startVaporAmount: 9.4,
    startTemperature: 40,
    targetTemperature: 20,
    hint: '17.3g にぴったり重なる温度をグラフで探そう。',
    explanation: '20℃ の飽和水蒸気量が 17.3g なので、この空気は 20℃ でくもり始めます。',
  },
  {
    id: 'humidity-3',
    kind: 'earth-humidity',
    prompt: '空気 1m3 に 30.4g の水蒸気があります。露点に合わせよう。',
    supportText: '水蒸気量が多いほど、交点はグラフの上側へ動きます。',
    vaporAmount: 30.4,
    startVaporAmount: 17.3,
    startTemperature: 20,
    targetTemperature: 30,
    hint: '30℃ では飽和水蒸気量が 30.4g あります。',
    explanation: '30.4g は 30℃ の飽和水蒸気量です。30℃ に下がると飽和して雲ができ始めます。',
  },
  {
    id: 'humidity-4',
    kind: 'earth-humidity',
    prompt: '空気 1m3 に 4.8g の水蒸気があります。露点に合わせよう。',
    supportText: '冷たい空気は、水蒸気をあまり多くふくめません。',
    vaporAmount: 4.8,
    startVaporAmount: 9.4,
    startTemperature: 20,
    targetTemperature: 0,
    hint: '0℃ の飽和水蒸気量は 4.8g です。',
    explanation: '0℃ まで下がると飽和水蒸気量が 4.8g になり、露点に達します。',
  },
]

const COLUMN_ROUNDS: ColumnWorkbenchRound[] = [
  {
    id: 'column-1',
    kind: 'earth-column',
    prompt: '海がだんだん深くなった場所です。柱状図を上から下へ並べよう。',
    supportText: '上ほど新しく、深い海ほど細かい泥がたまりやすくなります。',
    options: [
      { key: 'mudstone', label: '泥岩', detail: '細かい泥がしずんでできる / 深く静かな海', color: '#64748b', pattern: 'lines' },
      { key: 'sandstone', label: '砂岩', detail: '砂粒が多い / 海岸に近い場所', color: '#d97706', pattern: 'sand' },
      { key: 'conglomerate', label: 'れき岩', detail: '丸いれきが多い / 流れが強い場所', color: '#78716c', pattern: 'pebbles' },
    ],
    targetOrder: ['mudstone', 'sandstone', 'conglomerate'],
    hint: '流れが強い場所ほど大きなれきがたまり、静かな深い海ほど細かい泥がたまります。',
    explanation: '上ほど新しいので、深い海の泥岩が上、海岸に近い砂岩が中、流れの強いれき岩が下になります。',
  },
  {
    id: 'column-2',
    kind: 'earth-column',
    prompt: '植物がたまった地層の上に火山灰が積もり、そのあと静かな湖の泥が積もりました。上から下へ並べよう。',
    supportText: '火山灰層は広く同時に積もるので、順序を考える手がかりになります。',
    options: [
      { key: 'mudstone', label: '泥岩', detail: '細かい泥 / 湖や深い海でできやすい', color: '#64748b', pattern: 'lines' },
      { key: 'ash', label: '火山灰層', detail: '広い範囲に一度に積もる / かぎ層になりやすい', color: '#cbd5e1', pattern: 'ash' },
      { key: 'coal', label: '石炭層', detail: '植物が多くたまった湿地の地層', color: '#1f2937', pattern: 'bands' },
    ],
    targetOrder: ['mudstone', 'ash', 'coal'],
    hint: '植物の地層がいちばん古く、その上に火山灰、そのさらに上に湖の泥が積もっています。',
    explanation: '古い順に 石炭層 → 火山灰層 → 泥岩 なので、柱状図では上から 泥岩 → 火山灰層 → 石炭層 になります。',
  },
  {
    id: 'column-3',
    kind: 'earth-column',
    prompt: '川の近くの地層がだんだん落ち着き、最後に火山灰がおおいました。柱状図を上から下へ並べよう。',
    supportText: 'れき → 砂 → 火山灰 のように、環境の変化を上の新しい地層ほど後の出来事として考えます。',
    options: [
      { key: 'ash', label: '火山灰層', detail: '噴火で広く積もる白っぽい地層', color: '#cbd5e1', pattern: 'ash' },
      { key: 'sandstone', label: '砂岩', detail: '中くらいの粒 / やや流れのある環境', color: '#d97706', pattern: 'sand' },
      { key: 'conglomerate', label: 'れき岩', detail: '大きなれき / 流れが強い川の近く', color: '#78716c', pattern: 'pebbles' },
    ],
    targetOrder: ['ash', 'sandstone', 'conglomerate'],
    hint: 'いちばん流れが強かった時代のれき岩が下、そのあと砂岩、最後に火山灰が一番上です。',
    explanation: '新しい地層ほど上にくるので、噴火で積もった火山灰層が最上部になります。',
  },
  {
    id: 'column-4',
    kind: 'earth-column',
    prompt: 'アンモナイトのある海の泥の上に、サンゴが広がる浅い海の地層ができ、その後に火山灰がおおいました。上から下へ並べよう。',
    supportText: '化石が見つかる環境も、柱状図の順番を考えるヒントになります。',
    options: [
      { key: 'ash', label: '火山灰層', detail: '噴火のあとに広く積もる / かぎ層', color: '#cbd5e1', pattern: 'ash' },
      { key: 'limestone', label: '石灰岩', detail: 'サンゴや貝が多い / 浅い海でできやすい', color: '#f1f5f9', pattern: 'bands' },
      { key: 'mudstone', label: '泥岩', detail: 'アンモナイト化石がある / 静かな海底', color: '#64748b', pattern: 'lines' },
    ],
    targetOrder: ['ash', 'limestone', 'mudstone'],
    hint: 'アンモナイトの泥岩が古く、その上に浅い海の石灰岩、最後に火山灰です。',
    explanation: '海の環境変化と噴火の順序を追うと、上から 火山灰層 → 石灰岩 → 泥岩 になります。',
  },
]

const MOTION_ROUNDS: MotionWorkbenchRound[] = [
  {
    id: 'motion-1',
    kind: 'physics-motion-graph',
    prompt: '等速直線運動になるように加速度を合わせよう。',
    supportText: 'x-t グラフは直線、v-t グラフは水平になります。',
    targetAcceleration: 0,
    initialVelocity: 4,
    startAcceleration: 1,
    hint: '加速度 0 のとき、速さは変わりません。',
    explanation: '等速直線運動では加速度が 0 なので、位置は一定の割合で増え、速さは一定です。',
  },
  {
    id: 'motion-2',
    kind: 'physics-motion-graph',
    prompt: '毎秒 1 m/s ずつ速くなる運動を作ろう。',
    supportText: 'v-t グラフは右上がり、x-t グラフは上に反る形になります。',
    targetAcceleration: 1,
    initialVelocity: 3,
    startAcceleration: 0,
    hint: '加速度が正なら、時間がたつほど速くなります。',
    explanation: '正の加速度では速さが増え続けるので、v-t グラフは右上がりになります。',
  },
  {
    id: 'motion-3',
    kind: 'physics-motion-graph',
    prompt: '毎秒 1 m/s ずつおそくなる運動を作ろう。',
    supportText: 'v-t グラフは右下がり、x-t グラフはだんだん寝ていきます。',
    targetAcceleration: -1,
    initialVelocity: 5,
    startAcceleration: 1,
    hint: '加速度が負だと、速さは少しずつ小さくなります。',
    explanation: '負の加速度では速さが減るので、v-t グラフは右下がりになります。',
  },
  {
    id: 'motion-4',
    kind: 'physics-motion-graph',
    prompt: '毎秒 2 m/s ずつ速くなる強い加速を作ろう。',
    supportText: '同じ時間でも、加速度が大きいほど v-t グラフの傾きは急になります。',
    targetAcceleration: 2,
    initialVelocity: 2,
    startAcceleration: -1,
    hint: '加速度 2 は、1秒ごとに速さが 2 ずつ増える状態です。',
    explanation: '加速度が 2 m/s2 なら、速さは 1 秒ごとに 2 m/s ずつ増えます。',
  },
]

export function getScienceWorkbenchRounds(mode: ScienceWorkbenchMode): ScienceWorkbenchRound[] {
  switch (mode) {
    case 'chem-density':
      return DENSITY_ROUNDS
    case 'chem-concentration':
      return CONCENTRATION_ROUNDS
    case 'chem-battery':
      return BATTERY_ROUNDS
    case 'earth-humidity':
      return HUMIDITY_ROUNDS
    case 'earth-column':
      return COLUMN_ROUNDS
    case 'physics-motion-graph':
      return MOTION_ROUNDS
    default:
      return DENSITY_ROUNDS
  }
}
