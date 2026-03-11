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

interface ScienceNewsFeedConfig {
  field: ScienceNewsField
  emoji: string
  color: string
  source: string
  link: string
  rssUrl: string
  fallbackTitle: string
  fallbackSummary: string
}

export const SCIENCE_NEWS_FEEDS: ScienceNewsFeedConfig[] = [
  {
    field: '生物',
    emoji: '🌿',
    color: '#22c55e',
    source: 'Nature',
    link: 'https://www.nature.com/subjects/biological-sciences',
    rssUrl: 'https://www.nature.com/subjects/biological-sciences.rss',
    fallbackTitle: '生物ニュースは準備中です',
    fallbackSummary: '細胞・遺伝・生き物まわりの話題をここにまとめます。',
  },
  {
    field: '化学',
    emoji: '⚗️',
    color: '#f97316',
    source: 'Nature',
    link: 'https://www.nature.com/subjects/chemistry',
    rssUrl: 'https://www.nature.com/subjects/chemistry.rss',
    fallbackTitle: '化学ニュースは準備中です',
    fallbackSummary: '原子・物質・反応の話題をここにまとめます。',
  },
  {
    field: '物理',
    emoji: '⚡',
    color: '#4da2ff',
    source: 'Nature',
    link: 'https://www.nature.com/subjects/physics',
    rssUrl: 'https://www.nature.com/subjects/physics.rss',
    fallbackTitle: '物理ニュースは準備中です',
    fallbackSummary: '力・電気・エネルギーまわりの話題をここにまとめます。',
  },
  {
    field: '地学',
    emoji: '🌏',
    color: '#8b7cff',
    source: 'Nature',
    link: 'https://www.nature.com/subjects/earth-and-environmental-sciences',
    rssUrl: 'https://www.nature.com/subjects/earth-and-environmental-sciences.rss',
    fallbackTitle: '地学ニュースは準備中です',
    fallbackSummary: '地球・気象・宇宙に関する話題をここにまとめます。',
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
  // Some feeds escape apostrophes with numeric entities.
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

function parseRssItems(xmlText: string) {
  return Array.from(xmlText.matchAll(/<item\b[\s\S]*?<\/item>/gi))
    .map(match => match[0])
    .map(block => ({
      title: cleanNewsText(readTag(block, 'title')),
      summary: cleanNewsText(readTag(block, 'description')),
      link: cleanNewsText(readTag(block, 'link')),
      publishedAt: cleanNewsText(readTag(block, 'pubDate'))
        || cleanNewsText(readTag(block, 'dc:date'))
        || new Date().toISOString(),
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

function createFallbackItem(config: ScienceNewsFeedConfig): ScienceNewsCategoryItem {
  return {
    field: config.field,
    emoji: config.emoji,
    color: config.color,
    title: config.fallbackTitle,
    summary: config.fallbackSummary,
    link: config.link,
    source: config.source,
    publishedAt: new Date().toISOString(),
  }
}

export const FALLBACK_SCIENCE_NEWS_RESPONSE: ScienceNewsResponse = {
  items: SCIENCE_NEWS_FEEDS.map(createFallbackItem),
}

export function buildScienceNewsItem(config: ScienceNewsFeedConfig, xmlText: string, dateKey = toTokyoDateKey()) {
  const items = parseRssItems(xmlText)
  if (items.length === 0) return createFallbackItem(config)

  const candidates = items.slice(0, Math.min(5, items.length))
  const picked = candidates[hashString(`${dateKey}:${config.field}`) % candidates.length]

  return {
    field: config.field,
    emoji: config.emoji,
    color: config.color,
    title: picked.title,
    summary: picked.summary || config.fallbackSummary,
    link: picked.link,
    source: config.source,
    publishedAt: picked.publishedAt,
  } satisfies ScienceNewsCategoryItem
}
