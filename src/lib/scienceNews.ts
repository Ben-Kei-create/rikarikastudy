export interface ScienceNewsItem {
  title: string
  summary: string
  link: string
  source: string
  publishedAt: string
}

export const FALLBACK_SCIENCE_NEWS: ScienceNewsItem = {
  title: '本日の科学ニュースは準備中です',
  summary: 'いまは試験表示です。最新ニュースが取れない時は、この枠を軽い告知カードとして使えます。',
  link: 'https://www.jaxa.jp/',
  source: 'JAXA',
  publishedAt: new Date().toISOString(),
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

export function parseJaxaRss(xmlText: string) {
  const items = Array.from(xmlText.matchAll(/<item\b[\s\S]*?<\/item>/gi))
    .map(match => match[0])
    .map(block => ({
      title: cleanNewsText(readTag(block, 'title')),
      summary: cleanNewsText(readTag(block, 'description')),
      link: cleanNewsText(readTag(block, 'link')),
      publishedAt: cleanNewsText(readTag(block, 'dc:date')),
    }))
    .filter(item => item.title && item.link.startsWith('https://www.jaxa.jp/press/'))

  const first = items[0]
  if (!first) return null

  return {
    ...first,
    source: 'JAXA',
  } satisfies ScienceNewsItem
}
