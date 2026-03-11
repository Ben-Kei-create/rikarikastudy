import { NextResponse } from 'next/server'
import {
  buildScienceNewsItem,
  FALLBACK_SCIENCE_NEWS_RESPONSE,
  SCIENCE_NEWS_FEEDS,
} from '@/lib/scienceNews'

export async function GET() {
  try {
    const items = await Promise.all(
      SCIENCE_NEWS_FEEDS.map(async config => {
        try {
          const response = await fetch(config.rssUrl, {
            next: { revalidate: 60 * 60 },
            headers: {
              'user-agent': 'RikaQuiz/1.0 (+https://rikarikastudy.vercel.app)',
            },
          })

          if (!response.ok) return FALLBACK_SCIENCE_NEWS_RESPONSE.items.find(item => item.field === config.field)!

          const xmlText = await response.text()
          return buildScienceNewsItem(config, xmlText)
        } catch {
          return FALLBACK_SCIENCE_NEWS_RESPONSE.items.find(item => item.field === config.field)!
        }
      }),
    )

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json(FALLBACK_SCIENCE_NEWS_RESPONSE)
  }
}
