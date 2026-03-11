export interface ScienceNewsItem {
  title: string
  summary: string
  link: string
  source: string
  publishedAt: string
}

export interface ScienceNewsResponse {
  item: ScienceNewsItem
}

interface ScienceNewsSourceConfig {
  key: 'scienceportal' | 'jaxa'
  source: string
  link: string
  rssUrl: string
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

export const FALLBACK_SCIENCE_NEWS: ScienceNewsItem = {
  title: '本日の科学ニュースは準備中です',
  summary: '日本語の科学ニュースを1日1本だけ、コンパクトに表示します。',
  link: 'https://scienceportal.jst.go.jp/',
  source: 'サイエンスポータル',
  publishedAt: new Date().toISOString(),
}

export const FALLBACK_SCIENCE_NEWS_RESPONSE: ScienceNewsResponse = {
  item: FALLBACK_SCIENCE_NEWS,
}

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

function parsePublishedAt(value: string) {
  const parsed = new Date(value)
  const time = parsed.getTime()
  return Number.isNaN(time) ? 0 : time
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function buildScienceNewsResponse(
  candidates: ParsedNewsCandidate[],
  dateKey = toTokyoDateKey(),
) {
  if (candidates.length === 0) return FALLBACK_SCIENCE_NEWS_RESPONSE

  const sorted = [...candidates].sort((left, right) => parsePublishedAt(right.publishedAt) - parsePublishedAt(left.publishedAt))
  const topCandidates = sorted.slice(0, Math.min(6, sorted.length))
  const picked = topCandidates[hashString(dateKey) % topCandidates.length]

  return {
    item: {
      title: picked.title,
      summary: picked.summary || FALLBACK_SCIENCE_NEWS.summary,
      link: picked.link,
      source: picked.source,
      publishedAt: picked.publishedAt,
    },
  } satisfies ScienceNewsResponse
}
