export type ChemistryPracticeMode = 'flash' | 'equation'

export type ChemistryTemplatePart =
  | { kind: 'text'; value: string }
  | { kind: 'blank' }

export interface ChemistryPracticeQuestion {
  id: string
  mode: ChemistryPracticeMode
  unit: string
  prompt: string
  supportText: string
  template: ChemistryTemplatePart[]
  answerTokens: string[]
  choices: string[]
  explanation: string
}

export const CHEMISTRY_MODE_META: Record<
  ChemistryPracticeMode,
  {
    title: string
    badge: string
    icon: string
    accent: string
    description: string
    sessionUnit: string
  }
> = {
  flash: {
    title: '化学式フラッシュ',
    badge: 'Chem Formula',
    icon: '🧪',
    accent: '#f97316',
    description: '物質名を見て、元素記号や数字をタップして化学式を完成させます。',
    sessionUnit: '化学式フラッシュ',
  },
  equation: {
    title: '反応式モード',
    badge: 'Reaction Lab',
    icon: '⚗️',
    accent: '#4da2ff',
    description: 'Duolingo 風に、語群をタップして反応式の空欄を順番に埋めます。',
    sessionUnit: '反応式モード',
  },
}

const CHEMISTRY_FORMULA_DECK: ChemistryPracticeQuestion[] = [
  {
    id: 'formula-water',
    mode: 'flash',
    unit: '原子と分子',
    prompt: '水',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['H', '2', 'O'],
    choices: ['H', '2', 'O', 'Na', 'Cl'],
    explanation: '水は水素原子2個と酸素原子1個からできているので H2O です。',
  },
  {
    id: 'formula-carbon-dioxide',
    mode: 'flash',
    unit: '原子と分子',
    prompt: '二酸化炭素',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['C', 'O', '2'],
    choices: ['C', 'O', '2', 'H', 'Na'],
    explanation: '二酸化炭素は炭素1個と酸素2個からできるので CO2 です。',
  },
  {
    id: 'formula-sodium-chloride',
    mode: 'flash',
    unit: 'イオン',
    prompt: '塩化ナトリウム',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['Na', 'Cl'],
    choices: ['Na', 'Cl', 'O', 'K'],
    explanation: '塩化ナトリウムはナトリウム Na と塩素 Cl が 1:1 で結びついた NaCl です。',
  },
  {
    id: 'formula-magnesium-oxide',
    mode: 'flash',
    unit: '化学変化',
    prompt: '酸化マグネシウム',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['Mg', 'O'],
    choices: ['Mg', 'O', 'Fe', 'S'],
    explanation: '酸化マグネシウムは MgO です。マグネシウムと酸素が結びついてできます。',
  },
  {
    id: 'formula-sodium-hydroxide',
    mode: 'flash',
    unit: 'イオン',
    prompt: '水酸化ナトリウム',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['Na', 'OH'],
    choices: ['Na', 'OH', 'Cl', 'H'],
    explanation: '水酸化ナトリウムは NaOH です。Na+ と OH- からなる代表的なアルカリです。',
  },
  {
    id: 'formula-hydrochloric-acid',
    mode: 'flash',
    unit: 'イオン',
    prompt: '塩酸',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['H', 'Cl'],
    choices: ['H', 'Cl', 'O', 'Na'],
    explanation: '塩酸の化学式は HCl です。水に溶けると H+ と Cl- に電離します。',
  },
  {
    id: 'formula-ammonia',
    mode: 'flash',
    unit: '原子と分子',
    prompt: 'アンモニア',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['N', 'H', '3'],
    choices: ['N', 'H', '3', 'O', '2'],
    explanation: 'アンモニアは窒素1個と水素3個からできているので NH3 です。',
  },
  {
    id: 'formula-calcium-carbonate',
    mode: 'flash',
    unit: '化学変化',
    prompt: '炭酸カルシウム',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['Ca', 'CO3'],
    choices: ['Ca', 'CO3', 'O2', 'Na'],
    explanation: '炭酸カルシウムは CaCO3 です。石灰石や貝殻の主成分です。',
  },
  {
    id: 'formula-copper-oxide',
    mode: 'flash',
    unit: '酸化と還元',
    prompt: '酸化銅',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['Cu', 'O'],
    choices: ['Cu', 'O', 'Fe', 'Cl'],
    explanation: '酸化銅は CuO です。銅を加熱すると黒色の酸化銅になります。',
  },
  {
    id: 'formula-sulfur-dioxide',
    mode: 'flash',
    unit: '化学変化',
    prompt: '二酸化硫黄',
    supportText: '化学式を完成させよう',
    template: [{ kind: 'blank' }, { kind: 'blank' }, { kind: 'blank' }],
    answerTokens: ['S', 'O', '2'],
    choices: ['S', 'O', '2', 'H', 'Cl'],
    explanation: '二酸化硫黄は SO2 です。硫黄1個と酸素2個からなる気体です。',
  },
]

const CHEMISTRY_REACTION_DECK: ChemistryPracticeQuestion[] = [
  {
    id: 'equation-water-electrolysis',
    mode: 'equation',
    unit: '化学変化',
    prompt: '水の分解',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: '2H2O → ' },
      { kind: 'blank' },
      { kind: 'blank' },
      { kind: 'text', value: ' + ' },
      { kind: 'blank' },
    ],
    answerTokens: ['2', 'H2', 'O2'],
    choices: ['2', 'H2', 'O2', 'H2O', 'CO2'],
    explanation: '水が分解すると水素と酸素ができます。係数も含めると 2H2O → 2H2 + O2 です。',
  },
  {
    id: 'equation-copper-oxidation',
    mode: 'equation',
    unit: '酸化と還元',
    prompt: '銅の酸化',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: '2Cu + O2 → ' },
      { kind: 'blank' },
      { kind: 'blank' },
    ],
    answerTokens: ['2', 'CuO'],
    choices: ['2', 'CuO', 'Cu2O', 'O2'],
    explanation: '銅を加熱すると酸素と結びつき、2Cu + O2 → 2CuO になります。',
  },
  {
    id: 'equation-magnesium-oxidation',
    mode: 'equation',
    unit: '化学変化',
    prompt: 'マグネシウムの燃焼',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: '2Mg + O2 → ' },
      { kind: 'blank' },
      { kind: 'blank' },
    ],
    answerTokens: ['2', 'MgO'],
    choices: ['2', 'MgO', 'Mg', 'O'],
    explanation: 'マグネシウムは酸素と反応して酸化マグネシウムになります。式は 2Mg + O2 → 2MgO です。',
  },
  {
    id: 'equation-iron-sulfur',
    mode: 'equation',
    unit: '化学変化',
    prompt: '鉄と硫黄の化合',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: 'Fe + S → ' },
      { kind: 'blank' },
    ],
    answerTokens: ['FeS'],
    choices: ['FeS', 'Fe2S3', 'S', 'O2'],
    explanation: '鉄と硫黄を加熱すると硫化鉄ができます。反応式は Fe + S → FeS です。',
  },
  {
    id: 'equation-neutralization',
    mode: 'equation',
    unit: 'イオン',
    prompt: '塩酸と水酸化ナトリウムの中和',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: 'HCl + NaOH → ' },
      { kind: 'blank' },
      { kind: 'text', value: ' + ' },
      { kind: 'blank' },
    ],
    answerTokens: ['NaCl', 'H2O'],
    choices: ['NaCl', 'H2O', 'NaOH', 'Cl2'],
    explanation: '中和では塩と水ができます。HCl + NaOH → NaCl + H2O です。',
  },
  {
    id: 'equation-calcium-carbonate',
    mode: 'equation',
    unit: '化学変化',
    prompt: '炭酸カルシウムの熱分解',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: 'CaCO3 → ' },
      { kind: 'blank' },
      { kind: 'text', value: ' + ' },
      { kind: 'blank' },
    ],
    answerTokens: ['CaO', 'CO2'],
    choices: ['CaO', 'CO2', 'O2', 'Ca'],
    explanation: '炭酸カルシウムは加熱すると酸化カルシウムと二酸化炭素に分かれます。',
  },
  {
    id: 'equation-zinc-hydrochloric-acid',
    mode: 'equation',
    unit: 'イオン',
    prompt: '亜鉛と塩酸の反応',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: 'Zn + 2HCl → ' },
      { kind: 'blank' },
      { kind: 'text', value: ' + ' },
      { kind: 'blank' },
    ],
    answerTokens: ['ZnCl2', 'H2'],
    choices: ['ZnCl2', 'H2', 'Cl2', 'HCl'],
    explanation: '亜鉛は塩酸と反応して塩化亜鉛と水素を生じます。Zn + 2HCl → ZnCl2 + H2 です。',
  },
  {
    id: 'equation-sodium-chlorine',
    mode: 'equation',
    unit: '化学変化',
    prompt: 'ナトリウムと塩素の反応',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: '2Na + Cl2 → ' },
      { kind: 'blank' },
      { kind: 'blank' },
    ],
    answerTokens: ['2', 'NaCl'],
    choices: ['2', 'NaCl', 'Na2Cl', 'Cl'],
    explanation: 'ナトリウムと塩素は反応して塩化ナトリウムになります。2Na + Cl2 → 2NaCl です。',
  },
  {
    id: 'equation-copper-oxide-reduction',
    mode: 'equation',
    unit: '酸化と還元',
    prompt: '酸化銅と水素の反応',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: 'CuO + H2 → ' },
      { kind: 'blank' },
      { kind: 'text', value: ' + ' },
      { kind: 'blank' },
    ],
    answerTokens: ['Cu', 'H2O'],
    choices: ['Cu', 'H2O', 'O2', 'CuO'],
    explanation: '酸化銅は水素によって還元され、銅と水ができます。CuO + H2 → Cu + H2O です。',
  },
  {
    id: 'equation-hydrogen-combustion',
    mode: 'equation',
    unit: '化学変化',
    prompt: '水素の燃焼',
    supportText: '語群をタップして反応式を完成させよう',
    template: [
      { kind: 'text', value: '2H2 + O2 → ' },
      { kind: 'blank' },
      { kind: 'blank' },
    ],
    answerTokens: ['2', 'H2O'],
    choices: ['2', 'H2O', 'H2', 'O2'],
    explanation: '水素が燃えると水ができます。係数まで合わせると 2H2 + O2 → 2H2O です。',
  },
]

export function getChemistryPracticeDeck(mode: ChemistryPracticeMode) {
  return mode === 'flash' ? CHEMISTRY_FORMULA_DECK : CHEMISTRY_REACTION_DECK
}

