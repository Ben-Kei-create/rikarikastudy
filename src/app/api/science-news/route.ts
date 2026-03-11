import { NextResponse } from 'next/server'
import {
  FALLBACK_SCIENCE_NEWS,
  parseJaxaRss,
} from '@/lib/scienceNews'

const JAXA_PRESS_RSS_URL = 'https://www.jaxa.jp/rss/press_j.rdf'

export async function GET() {
  try {
    const response = await fetch(JAXA_PRESS_RSS_URL, {
      next: { revalidate: 60 * 60 },
    })

    if (!response.ok) {
      return NextResponse.json(FALLBACK_SCIENCE_NEWS)
    }

    const xmlText = await response.text()
    const news = parseJaxaRss(xmlText)
    return NextResponse.json(news ?? FALLBACK_SCIENCE_NEWS)
  } catch {
    return NextResponse.json(FALLBACK_SCIENCE_NEWS)
  }
}
