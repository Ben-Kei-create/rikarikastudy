import { NextResponse } from 'next/server'
import {
  buildScienceNewsResponse,
  FALLBACK_SCIENCE_NEWS_RESPONSE,
  parseRssItems,
  SCIENCE_NEWS_SOURCES,
} from '@/lib/scienceNews'

export async function GET() {
  try {
    const sources = await Promise.all(
      SCIENCE_NEWS_SOURCES.map(async sourceConfig => {
        try {
          const response = await fetch(sourceConfig.rssUrl, {
            next: { revalidate: 60 * 60 },
            headers: {
              'user-agent': 'RikaQuiz/1.0 (+https://rikarikastudy.vercel.app)',
            },
          })

          if (!response.ok) return []

          const xmlText = await response.text()
          return parseRssItems(xmlText, sourceConfig)
        } catch {
          return []
        }
      }),
    )

    const candidates = sources.flat()
    if (candidates.length === 0) {
      return NextResponse.json(FALLBACK_SCIENCE_NEWS_RESPONSE)
    }

    return NextResponse.json(buildScienceNewsResponse(candidates))
  } catch {
    return NextResponse.json(FALLBACK_SCIENCE_NEWS_RESPONSE)
  }
}
