import { NextResponse } from 'next/server'
import {
  buildScienceNewsResponse,
  FALLBACK_SCIENCE_NEWS_RESPONSE,
  parseRssItems,
  SCIENCE_NEWS_SOURCES,
} from '@/lib/scienceNews'

// Revalidate every hour so the daily news selection stays fresh
export const revalidate = 3600

export async function GET() {
  try {
    const sources = await Promise.all(
      SCIENCE_NEWS_SOURCES.map(async sourceConfig => {
        try {
          const response = await fetch(sourceConfig.rssUrl, {
            next: { revalidate: 3600 },
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

    const payload = buildScienceNewsResponse(candidates)
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
      },
    })
  } catch {
    return NextResponse.json(FALLBACK_SCIENCE_NEWS_RESPONSE)
  }
}
