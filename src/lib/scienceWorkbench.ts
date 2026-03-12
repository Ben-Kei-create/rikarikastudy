import { SessionMode } from '@/lib/engagement'

export type ScienceWorkbenchMode =
  | 'chem-density'
  | 'chem-concentration'
  | 'earth-humidity'
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

export interface HumidityWorkbenchRound {
  id: string
  kind: 'earth-humidity'
  prompt: string
  supportText: string
  vaporAmount: number
  startTemperature: number
  targetTemperature: number
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
  | HumidityWorkbenchRound
  | MotionWorkbenchRound

export const SCIENCE_WORKBENCH_MODE_META: Record<ScienceWorkbenchMode, ScienceWorkbenchMeta> = {
  'chem-density': {
    field: '化学',
    title: '密度ラボ',
    badge: 'Density Lab',
    icon: '⚖️',
    accent: '#f97316',
    description: '質量と体積を動かして、密度の感覚を手元でつかむラボです。',
    sessionUnit: '密度ラボ',
    sessionMode: 'chemistry_density_lab',
  },
  'chem-concentration': {
    field: '化学',
    title: '濃度ラボ',
    badge: 'Solution Lab',
    icon: '🧂',
    accent: '#fb7185',
    description: '溶質と水の量を調整して、質量パーセント濃度を作るラボです。',
    sessionUnit: '質量パーセント濃度ラボ',
    sessionMode: 'chemistry_concentration_lab',
  },
  'earth-humidity': {
    field: '地学',
    title: '飽和水蒸気量ラボ',
    badge: 'Humidity Lab',
    icon: '☁️',
    accent: '#8b7cff',
    description: '温度を動かしながら、飽和水蒸気量と露点の関係をつかむラボです。',
    sessionUnit: '飽和水蒸気量ラボ',
    sessionMode: 'earth_humidity_lab',
  },
  'physics-motion-graph': {
    field: '物理',
    title: '運動グラフラボ',
    badge: 'Motion Graph',
    icon: '📈',
    accent: '#4da2ff',
    description: '等速直線運動と加速度の違いを、台車の動きとグラフで見るラボです。',
    sessionUnit: '運動グラフラボ',
    sessionMode: 'physics_motion_graph_lab',
  },
}

export const CHEMISTRY_WORKBENCH_MODES: ScienceWorkbenchMode[] = ['chem-density', 'chem-concentration']
export const EARTH_WORKBENCH_MODES: ScienceWorkbenchMode[] = ['earth-humidity']
export const PHYSICS_WORKBENCH_MODES: ScienceWorkbenchMode[] = ['physics-motion-graph']

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

const HUMIDITY_ROUNDS: HumidityWorkbenchRound[] = [
  {
    id: 'humidity-1',
    kind: 'earth-humidity',
    prompt: '空気 1m3 に 9.4g の水蒸気があります。くもり始める温度に合わせよう。',
    supportText: '温度を下げると飽和水蒸気量は小さくなります。',
    vaporAmount: 9.4,
    startTemperature: 30,
    targetTemperature: 10,
    hint: '表で 9.4g に対応する温度を見つけると露点がわかります。',
    explanation: '1m3 中の水蒸気が 9.4g なら、飽和水蒸気量が 9.4g になる 10℃ で露点に達します。',
  },
  {
    id: 'humidity-2',
    kind: 'earth-humidity',
    prompt: '空気 1m3 に 17.3g の水蒸気があります。露点に合わせよう。',
    supportText: '飽和水蒸気量と同じになる温度が露点です。',
    vaporAmount: 17.3,
    startTemperature: 40,
    targetTemperature: 20,
    hint: '17.3g にぴったり重なる温度をグラフで探そう。',
    explanation: '20℃ の飽和水蒸気量が 17.3g なので、この空気は 20℃ でくもり始めます。',
  },
  {
    id: 'humidity-3',
    kind: 'earth-humidity',
    prompt: '空気 1m3 に 30.4g の水蒸気があります。露点に合わせよう。',
    supportText: '高温ほど空気中に多くの水蒸気を含めます。',
    vaporAmount: 30.4,
    startTemperature: 20,
    targetTemperature: 30,
    hint: '30℃ では飽和水蒸気量が 30.4g あります。',
    explanation: '30.4g は 30℃ の飽和水蒸気量です。30℃ に下がると飽和して雲ができ始めます。',
  },
  {
    id: 'humidity-4',
    kind: 'earth-humidity',
    prompt: '空気 1m3 に 4.8g の水蒸気があります。露点に合わせよう。',
    supportText: '寒い空気ほど、入れておける水蒸気の量が少なくなります。',
    vaporAmount: 4.8,
    startTemperature: 20,
    targetTemperature: 0,
    hint: '0℃ の飽和水蒸気量は 4.8g です。',
    explanation: '0℃ まで下がると飽和水蒸気量が 4.8g になり、露点に達します。',
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
    case 'earth-humidity':
      return HUMIDITY_ROUNDS
    case 'physics-motion-graph':
      return MOTION_ROUNDS
    default:
      return DENSITY_ROUNDS
  }
}
