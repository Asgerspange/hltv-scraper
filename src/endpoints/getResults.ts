import { stringify } from 'querystring'
import { ScraperConfig, fetchPage, sleep } from '../http/client'
import { loadPage, idFromHref, textOf, attrOf } from '../http/scraper'
import { Team, Event } from '../shared/types'

export interface MatchResult {
  id: number
  date: number
  team1: Team
  team2: Team
  score: { team1: number; team2: number }
  event: Event
  format: string
  stars: number
  hasDemo: boolean
  url: string
}

export enum GameType {
  CS2 = 'CS2',
  CSGO = 'CSGO',
}

export interface GetResultsOptions {
  startDate?: string        // YYYY-MM-DD  (default: '2025-01-01')
  endDate?: string          // YYYY-MM-DD
  stars?: 1 | 2 | 3 | 4 | 5 // minimum star rating (default: 1)
  gameType?: GameType       // default: CS2
  eventIds?: number[]
  teamIds?: number[]
  demosOnly?: boolean
  delayBetweenPages?: number
  /** Max pages to fetch (default: 1 = 100 results). Set to 0 for all pages. */
  maxPages?: number
}

export async function getResults(
  config: ScraperConfig = {},
  options: GetResultsOptions = {}
): Promise<MatchResult[]> {
  // Sensible defaults matching the target URL:
  // https://www.hltv.org/results?stars=1&gameType=CS2&startDate=2025-01-01
  const queryParams: Record<string, string | string[]> = {
    stars:     String(options.stars    ?? 1),
    gameType:  options.gameType        ?? GameType.CS2,
    startDate: options.startDate       ?? '2025-01-01',
  }

  if (options.endDate)          queryParams['endDate']  = options.endDate
  if (options.eventIds?.length) queryParams['event']    = options.eventIds.map(String)
  if (options.teamIds?.length)  queryParams['team']     = options.teamIds.map(String)
  if (options.demosOnly)        queryParams['content']  = 'demo'

  const query = stringify(queryParams)
  let page = 0
  const maxPages = options.maxPages ?? 1
  const allResults: MatchResult[] = []

  do {
    if (page > 0) await sleep(options.delayBetweenPages ?? 2_000)

    const url = `https://www.hltv.org/results?${query}&offset=${page * 100}`
    console.log(`[hltv-scraper] Fetching: ${url}`)

    const html = await fetchPage(url, config)
    const $ = loadPage(html)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchEls: any[] = $('.result-con').toArray()
    if (matchEls.length === 0) break

    for (const el of matchEls) {
      const $el = $(el)
      const href = attrOf($el.find('a.a-reset'), 'href')
      const id = href ? idFromHref(href, 2) : undefined
      if (!id) continue

const dateAttr =
  attrOf($el, 'data-zonedgrouping-entry-unix') ??
  attrOf($el.find('span[data-unix]'), 'data-unix')
const date = dateAttr ? Number(dateAttr) : 0

      const team1Name = textOf($el.find('.team1 .team'))
      const team2Name = textOf($el.find('.team2 .team'))
      const team1Logo = attrOf($el.find('.team1 img'), 'src')
      const team2Logo = attrOf($el.find('.team2 img'), 'src')

      const t1Score = parseInt(textOf($el.find('.result-score .score-lost, .result-score span').first()))
      const t2Score = parseInt(textOf($el.find('.result-score .score-won, .result-score span').last()))
      const score = !isNaN(t1Score) && !isNaN(t2Score)
        ? { team1: t1Score, team2: t2Score }
        : { team1: 0, team2: 0 }

      const eventName = attrOf($el.find('td.event img'), 'title') ?? textOf($el.find('.event-name'))
const eventHref = attrOf($el.find('td.event a'), 'href')
      const formatText = textOf($el.find('.map-text'))
      const stars = $el.find('.stars i.star').length
      const hasDemo = true

      allResults.push({
        id,
        date,
        team1: { id: undefined, name: team1Name, logo: team1Logo },
        team2: { id: undefined, name: team2Name, logo: team2Logo },
        score,
        event: { id: idFromHref(eventHref, 2), name: eventName },
        format: formatText || 'unknown',
        stars,
        hasDemo,
        url: `https://www.hltv.org${href}`,
      })
    }

    page++
  } while (maxPages === 0 || page < maxPages)

  return allResults
}
