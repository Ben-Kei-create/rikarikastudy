export type ScienceNewsField = '生物' | '化学' | '物理' | '地学'

export interface ScienceNewsItem {
  title: string
  summary: string
  link: string
  source: string
  publishedAt: string
}

export interface ScienceNewsCategoryItem extends ScienceNewsItem {
  field: ScienceNewsField
  emoji: string
  color: string
}

export interface ScienceNewsResponse {
  items: ScienceNewsCategoryItem[]
}

interface ScienceNewsSourceConfig {
  key: 'scienceportal' | 'jaxa'
  source: string
  link: string
  rssUrl: string
}

interface ScienceNewsFieldConfig {
  field: ScienceNewsField
  emoji: string
  color: string
  fallbackTitle: string
  fallbackSummary: string
  keywords: string[]
  preferredSource?: ScienceNewsSourceConfig['key']
}

interface ParsedNewsCandidate extends ScienceNewsItem {
  sourceKey: ScienceNewsSourceConfig['key']
}

export const SCIENCE_NEWS_SOURCES: ScienceNewsSourceConfig[] = [
  {
    key: 'scienceportal',
    source: 'サイエンスポータル',
    link: 'https://scienceportal.jst.go.jp/',
    rssUrl: 'https://scienceportal.jst.go.jp/feed/rss.xml',
  },
  {
    key: 'jaxa',
    source: 'JAXA',
    link: 'https://www.jaxa.jp/',
    rssUrl: 'https://www.jaxa.jp/rss/press_j.rdf',
  },
]

export const SCIENCE_NEWS_FIELDS: ScienceNewsFieldConfig[] = [
  {
    field: '生物',
    emoji: '🌿',
    color: '#22c55e',
    fallbackTitle: '生物ニュースは準備中です',
    fallbackSummary: '生き物、細胞、遺伝、からだのしくみに近い日本語ニュースをここに出します。',
    keywords: ['生物', '細胞', '遺伝', 'DNA', 'RNA', '植物', '動物', '生態', '免疫', '微生物', '花粉', '乳がん', 'たんぱく質', '脳', '神経', '進化', '新種'],
    preferredSource: 'scienceportal',
  },
  {
    field: '化学',
    emoji: '⚗️',
    color: '#f97316',
    fallbackTitle: '化学ニュースは準備中です',
    fallbackSummary: '原子、分子、化合物、反応、材料に近い日本語ニュースをここに出します。',
    keywords: ['化学', '分子', '原子', 'イオン', '高分子', '物質', '化合物', '触媒', '反応', '電池', '材料', '溶液', '合成', '元素', '結晶', '有機', '無機'],
    preferredSource: 'scienceportal',
  },
  {
    field: '物理',
    emoji: '⚡',
    color: '#4da2ff',
    fallbackTitle: '物理ニュースは準備中です',
    fallbackSummary: '光、電気、力、エネルギーに近い日本語ニュースをここに出します。',
    keywords: ['物理', '量子', '光', '音', '力', '電流', '電圧', '磁気', 'レーザー', '核融合', '重力', 'エネルギー', '超伝導', 'X線', 'ビーム', '加速器', '半導体'],
    preferredSource: 'scienceportal',
  },
  {
    field: '地学',
    emoji: '🌏',
    color: '#8b7cff',
    fallbackTitle: '地学ニュースは準備中です',
    fallbackSummary: '地球、気象、宇宙に近い日本語ニュースをここに出します。',
    keywords: ['地球', '地学', '地震', '火山', '気象', '気候', '温暖化', '大雪', '台風', '海洋', '宇宙', '惑星', '月', '太陽', '小惑星', '衛星', 'JAXA', '地層', '化石'],
    preferredSource: 'jaxa',
  },
]

function toTokyoDateKey(dateLike?: string | Date) {
  const raw = dateLike instanceof Date ? dateLike : new Date(dateLike ?? Date.now())
  const shifted = new Date(raw.getTime() + 9 * 60 * 60 * 1000)
  const year = shifted.getUTCFullYear()
  const month = `${shifted.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${shifted.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&emsp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/gi, "'")
}

function stripTags(input: string) {
  return input.replace(/<[^>]+>/g, ' ')
}

export function cleanNewsText(input: string) {
  return decodeHtmlEntities(stripTags(input))
    .replace(/\s+/g, ' ')
    .trim()
}

function readTag(block: string, tagName: string) {
  const cdataMatch = block.match(new RegExp(`<${tagName}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`, 'i'))
  return cdataMatch?.[1]?.trim() ?? ''
}

export function parseRssItems(xmlText: string, sourceConfig: ScienceNewsSourceConfig) {
  return Array.from(xmlText.matchAll(/<item\b[\s\S]*?<\/item>/gi))
    .map(match => match[0])
    .map(block => ({
      title: cleanNewsText(readTag(block, 'title')),
      summary: cleanNewsText(readTag(block, 'description')),
      link: cleanNewsText(readTag(block, 'link')),
      publishedAt: cleanNewsText(readTag(block, 'pubDate'))
        || cleanNewsText(readTag(block, 'dc:date'))
        || new Date().toISOString(),
      source: sourceConfig.source,
      sourceKey: sourceConfig.key,
    }))
    .filter(item => item.title && /^https?:\/\//.test(item.link))
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function parsePublishedAt(value: string) {
  const parsed = new Date(value)
  const time = parsed.getTime()
  return Number.isNaN(time) ? 0 : time
}

function countMatches(text: string, keywords: string[]) {
  let score = 0
  for (const keyword of keywords) {
    if (text.includes(keyword)) score += 1
  }
  return score
}

function scoreCandidate(fieldConfig: ScienceNewsFieldConfig, candidate: ParsedNewsCandidate) {
  const title = candidate.title.toLowerCase()
  const summary = candidate.summary.toLowerCase()
  const keywords = fieldConfig.keywords.map(keyword => keyword.toLowerCase())

  const titleScore = countMatches(title, keywords) * 3
  const summaryScore = countMatches(summary, keywords)
  const sourceBonus = candidate.sourceKey === fieldConfig.preferredSource ? 2 : 0

  return titleScore + summaryScore + sourceBonus
}

function createFallbackItem(fieldConfig: ScienceNewsFieldConfig): ScienceNewsCategoryItem {
  const source = SCIENCE_NEWS_SOURCES.find(item => item.key === fieldConfig.preferredSource) ?? SCIENCE_NEWS_SOURCES[0]
  return {
    field: fieldConfig.field,
    emoji: fieldConfig.emoji,
    color: fieldConfig.color,
    title: fieldConfig.fallbackTitle,
    summary: fieldConfig.fallbackSummary,
    link: source.link,
    source: source.source,
    publishedAt: new Date().toISOString(),
  }
}

export const FALLBACK_SCIENCE_NEWS_RESPONSE: ScienceNewsResponse = {
  items: SCIENCE_NEWS_FIELDS.map(createFallbackItem),
}

export function buildScienceNewsResponse(
  candidates: ParsedNewsCandidate[],
  dateKey = toTokyoDateKey(),
) {
  const items = SCIENCE_NEWS_FIELDS.map(fieldConfig => {
    const scored = candidates
      .map(candidate => ({
        candidate,
        score: scoreCandidate(fieldConfig, candidate),
      }))
      .filter(row => row.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        return parsePublishedAt(right.candidate.publishedAt) - parsePublishedAt(left.candidate.publishedAt)
      })

    if (scored.length === 0) return createFallbackItem(fieldConfig)

    const topCandidates = scored.slice(0, Math.min(3, scored.length))
    const picked = topCandidates[hashString(`${dateKey}:${fieldConfig.field}`) % topCandidates.length].candidate

    return {
      field: fieldConfig.field,
      emoji: fieldConfig.emoji,
      color: fieldConfig.color,
      title: picked.title,
      summary: picked.summary || fieldConfig.fallbackSummary,
      link: picked.link,
      source: picked.source,
      publishedAt: picked.publishedAt,
    } satisfies ScienceNewsCategoryItem
  })

  return { items } satisfies ScienceNewsResponse
}
