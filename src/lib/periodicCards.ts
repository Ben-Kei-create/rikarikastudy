'use client'

export const PERIODIC_CARD_UNLOCK_LEVEL = 20

export type PeriodicCardCategory =
  | 'nonmetal'
  | 'noble-gas'
  | 'alkali-metal'
  | 'alkaline-earth-metal'
  | 'metalloid'
  | 'halogen'
  | 'post-transition-metal'
  | 'transition-metal'

export interface PeriodicElementCardDefinition {
  key: string
  atomicNumber: number
  symbol: string
  nameJa: string
  nameEn: string
  period: number
  group: number
  category: PeriodicCardCategory
  summary: string
  features: [string, string, string]
  trivia: string
}

export const PERIODIC_CATEGORY_META: Record<PeriodicCardCategory, {
  label: string
  accent: string
  border: string
  glow: string
}> = {
  nonmetal: { label: '非金属', accent: '#38bdf8', border: 'rgba(56, 189, 248, 0.36)', glow: 'rgba(56, 189, 248, 0.28)' },
  'noble-gas': { label: '希ガス', accent: '#a78bfa', border: 'rgba(167, 139, 250, 0.36)', glow: 'rgba(167, 139, 250, 0.28)' },
  'alkali-metal': { label: 'アルカリ金属', accent: '#f97316', border: 'rgba(249, 115, 22, 0.36)', glow: 'rgba(249, 115, 22, 0.28)' },
  'alkaline-earth-metal': { label: 'アルカリ土類金属', accent: '#f59e0b', border: 'rgba(245, 158, 11, 0.36)', glow: 'rgba(245, 158, 11, 0.28)' },
  metalloid: { label: '半金属', accent: '#14b8a6', border: 'rgba(20, 184, 166, 0.36)', glow: 'rgba(20, 184, 166, 0.28)' },
  halogen: { label: 'ハロゲン', accent: '#ec4899', border: 'rgba(236, 72, 153, 0.36)', glow: 'rgba(236, 72, 153, 0.28)' },
  'post-transition-metal': { label: '典型金属', accent: '#60a5fa', border: 'rgba(96, 165, 250, 0.36)', glow: 'rgba(96, 165, 250, 0.28)' },
  'transition-metal': { label: '遷移金属', accent: '#22c55e', border: 'rgba(34, 197, 94, 0.36)', glow: 'rgba(34, 197, 94, 0.28)' },
}

export const PERIODIC_ELEMENT_CARDS: PeriodicElementCardDefinition[] = [
  { key: 'H', atomicNumber: 1, symbol: 'H', nameJa: '水素', nameEn: 'Hydrogen', period: 1, group: 1, category: 'nonmetal', summary: '宇宙でいちばん多い、とても軽い元素。', features: ['もっとも軽い気体', '水の材料になる', '燃えると水ができる'], trivia: '太陽のエネルギーは、水素どうしが結びつく核融合から生まれています。' },
  { key: 'He', atomicNumber: 2, symbol: 'He', nameJa: 'ヘリウム', nameEn: 'Helium', period: 1, group: 18, category: 'noble-gas', summary: '風船をふわっと浮かせる、反応しにくい気体。', features: ['空気より軽い', '燃えにくい', '希ガスの仲間'], trivia: '声が高く聞こえるのは、ヘリウム中で音が速く伝わるからです。' },
  { key: 'Li', atomicNumber: 3, symbol: 'Li', nameJa: 'リチウム', nameEn: 'Lithium', period: 2, group: 1, category: 'alkali-metal', summary: '電池材料でよく知られる、軽い金属。', features: ['アルカリ金属', '水と激しく反応', '電池に使われる'], trivia: 'リチウムイオン電池は、スマホやノートPCで大活躍しています。' },
  { key: 'Be', atomicNumber: 4, symbol: 'Be', nameJa: 'ベリリウム', nameEn: 'Beryllium', period: 2, group: 2, category: 'alkaline-earth-metal', summary: '軽くてかたい、特別な金属。', features: ['アルカリ土類金属', '軽くて丈夫', 'X線を通しやすい'], trivia: '人工衛星や航空機の部品にも使われることがあります。' },
  { key: 'B', atomicNumber: 5, symbol: 'B', nameJa: 'ホウ素', nameEn: 'Boron', period: 2, group: 13, category: 'metalloid', summary: 'ガラスや洗剤にも関わる半金属。', features: ['半金属の仲間', 'ほう砂の成分', '耐熱ガラスに使う'], trivia: '理科室で見るホウ砂は、ホウ素をふくむ化合物です。' },
  { key: 'C', atomicNumber: 6, symbol: 'C', nameJa: '炭素', nameEn: 'Carbon', period: 2, group: 14, category: 'nonmetal', summary: '生物の体や燃料に広くふくまれる大事な元素。', features: ['有機物の中心', 'ダイヤも炭も炭素', '二酸化炭素の材料'], trivia: '同じ炭素でも、並び方の違いでダイヤモンドにも黒鉛にもなります。' },
  { key: 'N', atomicNumber: 7, symbol: 'N', nameJa: '窒素', nameEn: 'Nitrogen', period: 2, group: 15, category: 'nonmetal', summary: '空気の大部分をしめる、落ち着いた気体。', features: ['空気の約8割', '燃えにくい', '液体窒素で有名'], trivia: '液体窒素はとても低温で、実験で物を一気に冷やすときに使います。' },
  { key: 'O', atomicNumber: 8, symbol: 'O', nameJa: '酸素', nameEn: 'Oxygen', period: 2, group: 16, category: 'nonmetal', summary: '呼吸や燃焼に欠かせない気体。', features: ['呼吸に必要', 'ものが燃えるのを助ける', '水にも入っている'], trivia: '海の中の生き物も、水に溶けた酸素を使って呼吸しています。' },
  { key: 'F', atomicNumber: 9, symbol: 'F', nameJa: 'フッ素', nameEn: 'Fluorine', period: 2, group: 17, category: 'halogen', summary: '反応しやすさが非常に大きい元素。', features: ['ハロゲンの仲間', '反応性がとても強い', '歯みがき粉でも有名'], trivia: 'フッ化物は、むし歯予防で耳にすることがある成分です。' },
  { key: 'Ne', atomicNumber: 10, symbol: 'Ne', nameJa: 'ネオン', nameEn: 'Neon', period: 2, group: 18, category: 'noble-gas', summary: 'ネオンサインで光る、反応しにくい気体。', features: ['希ガス', '放電で赤く光る', '化学変化しにくい'], trivia: '「ネオンカラー」という言葉は、この元素の光り方から広まりました。' },
  { key: 'Na', atomicNumber: 11, symbol: 'Na', nameJa: 'ナトリウム', nameEn: 'Sodium', period: 3, group: 1, category: 'alkali-metal', summary: '食塩にもふくまれる、反応しやすい金属。', features: ['アルカリ金属', '水と激しく反応', '食塩の成分の一部'], trivia: 'ナトリウム単体は危険ですが、塩化ナトリウムになると身近な食塩になります。' },
  { key: 'Mg', atomicNumber: 12, symbol: 'Mg', nameJa: 'マグネシウム', nameEn: 'Magnesium', period: 3, group: 2, category: 'alkaline-earth-metal', summary: '白くまぶしく燃える金属。', features: ['軽い金属', '燃えると強い白色光', '葉緑体にも関わる'], trivia: '花火や昔のフラッシュ写真に使われたのは、マグネシウムの明るい光です。' },
  { key: 'Al', atomicNumber: 13, symbol: 'Al', nameJa: 'アルミニウム', nameEn: 'Aluminium', period: 3, group: 13, category: 'post-transition-metal', summary: '軽くてさびにくい、身近な金属。', features: ['軽量', '表面に保護膜ができる', '缶やホイルに使う'], trivia: 'アルミ缶が軽いのに丈夫なのは、アルミニウムの性質のおかげです。' },
  { key: 'Si', atomicNumber: 14, symbol: 'Si', nameJa: 'ケイ素', nameEn: 'Silicon', period: 3, group: 14, category: 'metalloid', summary: '砂や半導体の材料として重要な元素。', features: ['半金属', '二酸化ケイ素は砂の主成分', '半導体に使う'], trivia: 'コンピュータのチップは、ケイ素から作られることが多いです。' },
  { key: 'P', atomicNumber: 15, symbol: 'P', nameJa: 'リン', nameEn: 'Phosphorus', period: 3, group: 15, category: 'nonmetal', summary: '骨や肥料にも関わる元素。', features: ['生物に必要', '骨や歯に関わる', '肥料に使われる'], trivia: 'マッチの材料として使われた赤リンは、白リンより安全です。' },
  { key: 'S', atomicNumber: 16, symbol: 'S', nameJa: '硫黄', nameEn: 'Sulfur', period: 3, group: 16, category: 'nonmetal', summary: '火山地帯で見られる黄色い元素。', features: ['黄色い固体', '火山ガスと関係', '硫酸の材料'], trivia: '温泉のにおいの元として知られる硫化水素にも、硫黄が入っています。' },
  { key: 'Cl', atomicNumber: 17, symbol: 'Cl', nameJa: '塩素', nameEn: 'Chlorine', period: 3, group: 17, category: 'halogen', summary: '消毒や漂白でも使われる気体。', features: ['ハロゲン', '刺激のある気体', '水の消毒に使う'], trivia: 'プールの消毒で耳にする塩素は、細菌を減らすのに役立っています。' },
  { key: 'Ar', atomicNumber: 18, symbol: 'Ar', nameJa: 'アルゴン', nameEn: 'Argon', period: 3, group: 18, category: 'noble-gas', summary: '空気中にもある、反応しにくい気体。', features: ['希ガス', '空気中に少しある', '溶接や電球に使う'], trivia: '電球の中にアルゴンを入れると、フィラメントが長持ちしやすくなります。' },
  { key: 'K', atomicNumber: 19, symbol: 'K', nameJa: 'カリウム', nameEn: 'Potassium', period: 4, group: 1, category: 'alkali-metal', summary: '体にも必要な、反応しやすい金属。', features: ['アルカリ金属', '神経や筋肉に重要', '水と激しく反応'], trivia: 'バナナにカリウムが多いとよく言われます。' },
  { key: 'Ca', atomicNumber: 20, symbol: 'Ca', nameJa: 'カルシウム', nameEn: 'Calcium', period: 4, group: 2, category: 'alkaline-earth-metal', summary: '骨や歯をつくる材料として有名。', features: ['アルカリ土類金属', '骨や歯に多い', '石灰石にもふくまれる'], trivia: 'チョークの材料の炭酸カルシウムにも、カルシウムが入っています。' },
  { key: 'Fe', atomicNumber: 26, symbol: 'Fe', nameJa: '鉄', nameEn: 'Iron', period: 4, group: 8, category: 'transition-metal', summary: '建物や道具に広く使われる代表的な金属。', features: ['丈夫で加工しやすい', '磁石につく', '赤さびができる'], trivia: '血液の赤血球にも鉄がふくまれ、酸素を運ぶ働きに関わります。' },
  { key: 'Cu', atomicNumber: 29, symbol: 'Cu', nameJa: '銅', nameEn: 'Copper', period: 4, group: 11, category: 'transition-metal', summary: '電気を通しやすい赤色の金属。', features: ['電気を通しやすい', '熱も伝えやすい', '10円玉で有名'], trivia: '電線の多くに銅が使われるのは、電気の流れがよいからです。' },
  { key: 'Zn', atomicNumber: 30, symbol: 'Zn', nameJa: '亜鉛', nameEn: 'Zinc', period: 4, group: 12, category: 'transition-metal', summary: '化学電池やメッキでおなじみの金属。', features: ['化学電池で使う', '鉄を守るメッキに使う', '酸で水素を発生'], trivia: 'トタン板は、鉄を亜鉛でおおってさびにくくしたものです。' },
  { key: 'Br', atomicNumber: 35, symbol: 'Br', nameJa: '臭素', nameEn: 'Bromine', period: 4, group: 17, category: 'halogen', summary: '常温で液体のめずらしい非金属元素。', features: ['ハロゲン', '赤褐色の液体', '刺激が強い'], trivia: '常温で液体なのは、元素の中でもかなりめずらしい性質です。' },
  { key: 'Ag', atomicNumber: 47, symbol: 'Ag', nameJa: '銀', nameEn: 'Silver', period: 5, group: 11, category: 'transition-metal', summary: '金属の中でも特に電気を通しやすい元素。', features: ['白く美しい金属', '電気伝導が高い', '鏡やアクセサリーに使う'], trivia: '銀は金属の中で最も電気を通しやすいことで知られます。' },
  { key: 'I', atomicNumber: 53, symbol: 'I', nameJa: 'ヨウ素', nameEn: 'Iodine', period: 5, group: 17, category: 'halogen', summary: 'うがい薬やデンプン反応で有名な元素。', features: ['ハロゲン', '紫色の気体になりやすい', 'デンプンで青紫色'], trivia: '理科の実験で見るヨウ素液の変色は、デンプンがある証拠です。' },
  { key: 'Au', atomicNumber: 79, symbol: 'Au', nameJa: '金', nameEn: 'Gold', period: 6, group: 11, category: 'transition-metal', summary: 'さびにくく、美しい黄色の金属。', features: ['とても安定', 'やわらかくのばしやすい', '装飾品で有名'], trivia: '金箔はとても薄くのばせるので、工芸や食品装飾にも使われます。' },
  { key: 'Hg', atomicNumber: 80, symbol: 'Hg', nameJa: '水銀', nameEn: 'Mercury', period: 6, group: 12, category: 'transition-metal', summary: '常温で液体の金属として知られる元素。', features: ['常温で液体', '重い金属', '温度計に使われた'], trivia: '昔の体温計に入っていた銀色の液体は、水銀でした。' },
] satisfies PeriodicElementCardDefinition[]

export function isPeriodicCardUnlockedAtLevel(level: number) {
  return Math.max(1, level) >= PERIODIC_CARD_UNLOCK_LEVEL
}

export function getPeriodicCardByKey(key: string) {
  return PERIODIC_ELEMENT_CARDS.find(card => card.key === key) ?? null
}

export function getPeriodicCategoryMeta(category: PeriodicCardCategory) {
  return PERIODIC_CATEGORY_META[category]
}

export function getPeriodicCardUnlockText() {
  return `Lv.${PERIODIC_CARD_UNLOCK_LEVEL}で解放`
}
