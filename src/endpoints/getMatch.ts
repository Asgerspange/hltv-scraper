import { ScraperConfig, fetchPage } from '../http/client'
import { loadPage, idFromHref, textOf, attrOf, CheerioAPI } from '../http/scraper'
import { Team, Event, Demo, MatchStatus, MatchFormat } from '../shared/types'

export interface MapResult {
  name: string
  score?: { team1: number; team2: number }
  statsId?: number
}

export interface FullMatch {
  id: number
  date: number | undefined
  status: MatchStatus
  format: MatchFormat
  team1: Team | undefined
  team2: Team | undefined
  winner: Team | undefined
  event: Event
  maps: MapResult[]
  /**
   * Demo download links. URLs are:
   *   https://www.hltv.org/download/demo/<id>
   * which redirects to the actual .dem.rar on HLTV's CDN.
   */
  demos: Demo[]
  url: string
}

function parseMatchStatus($: CheerioAPI): MatchStatus {
  const countdown = textOf($('.countdown'))
  if (countdown === 'LIVE') return MatchStatus.Live
  if (countdown.toLowerCase().includes('postponed')) return MatchStatus.Postponed
  if (countdown.toLowerCase().includes('deleted')) return MatchStatus.Deleted
  if ($('.score-box').length > 0 || $('.results-team-score').length > 0)
    return MatchStatus.Over
  return MatchStatus.Scheduled
}

function parseFormat($: CheerioAPI): MatchFormat {
  const text = textOf($('.preformatted-text, .bestof, .format')).toLowerCase()
  if (text.includes('best of 5') || text.includes('bo5')) return MatchFormat.Bo5
  if (text.includes('best of 3') || text.includes('bo3')) return MatchFormat.Bo3
  if (text.includes('best of 2') || text.includes('bo2')) return MatchFormat.Bo2
  if (text.includes('best of 1') || text.includes('bo1')) return MatchFormat.Bo1
  return MatchFormat.Unknown
}

function parseMaps($: CheerioAPI): MapResult[] {
  const maps: MapResult[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;($('.mapholder').toArray() as any[]).forEach((el) => {
    const $el = $(el)
    const name = textOf($el.find('.mapname'))
    if (!name) return
    const t1Score = parseInt(textOf($el.find('.results-team-score').first()))
    const t2Score = parseInt(textOf($el.find('.results-team-score').last()))
    const statsHref = attrOf($el.find('.results-stats'), 'href')
    maps.push({
      name,
      score: !isNaN(t1Score) && !isNaN(t2Score) ? { team1: t1Score, team2: t2Score } : undefined,
      statsId: statsHref ? idFromHref(statsHref, 4) : undefined,
    })
  })
  return maps
}

/**
 * Parse demo links from the .streams section.
 *
 * Based on actual HLTV HTML, the demo link appears in two places:
 *
 * 1. The clickable button:
 *    <a class="stream-box" data-demo-link-button="" data-demo-link="/download/demo/106956">
 *
 * 2. The hidden manual fallback link inside the popup:
 *    <a href="/download/demo/106956" class="hidden" data-manuel-download="">
 *
 * Both point to the same /download/demo/<id> URL.
 */
function parseDemos($: CheerioAPI): Demo[] {
  const demos: Demo[] = []
  const seen = new Set<string>()

  function add(name: string, link: string) {
    const full = link.startsWith('http') ? link : `https://www.hltv.org${link}`
    if (!seen.has(full)) {
      seen.add(full)
      demos.push({ name, link: full })
    }
  }

  // Strategy 1 (primary): <a data-demo-link-button data-demo-link="/download/demo/...">
  // This is the main "Demo sponsored by Bitskins" button
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;($('a[data-demo-link-button]').toArray() as any[]).forEach((el) => {
    const $el = $(el)
    const link = attrOf($el, 'data-demo-link')
    if (link) {
      const label = textOf($el).trim() || 'Demo'
      add(label, link)
    }
  })

  // Strategy 2: any element with data-demo-link attribute (catches other variants)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;($('[data-demo-link]').toArray() as any[]).forEach((el) => {
    const $el = $(el)
    const link = attrOf($el, 'data-demo-link')
    if (link) add(textOf($el).trim() || 'Demo', link)
  })

  // Strategy 3: fallback manual download link inside the popup
  // <a href="/download/demo/..." data-manuel-download="">
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;($('a[data-manuel-download]').toArray() as any[]).forEach((el) => {
    const $el = $(el)
    const href = attrOf($el, 'href')
    if (href) add('Demo (direct)', href)
  })

  // Strategy 4: any direct /download/demo/ href as final fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;($('a[href*="/download/demo/"]').toArray() as any[]).forEach((el) => {
    const $el = $(el)
    const href = attrOf($el, 'href')
    if (href) add(textOf($el).trim() || 'Demo', href)
  })

  return demos
}

export async function getMatch(id: number, config: ScraperConfig = {}): Promise<FullMatch> {
  const url = `https://www.hltv.org/matches/${id}/match-${id}`
  const html = await fetchPage(url, config)
  const $ = loadPage(html)

  const status = parseMatchStatus($)
  const format = parseFormat($)
  const maps = parseMaps($)
  const demos = parseDemos($)

  const team1Name = textOf($('.team1-gradient .teamName'))
  const team2Name = textOf($('.team2-gradient .teamName'))
  const team1Href = attrOf($('.team1-gradient a'), 'href')
  const team2Href = attrOf($('.team2-gradient a'), 'href')
  const team1Logo = attrOf($('.team1-gradient img'), 'src')
  const team2Logo = attrOf($('.team2-gradient img'), 'src')

  const team1: Team | undefined = team1Name
    ? { id: idFromHref(team1Href, 3), name: team1Name, logo: team1Logo }
    : undefined
  const team2: Team | undefined = team2Name
    ? { id: idFromHref(team2Href, 3), name: team2Name, logo: team2Logo }
    : undefined

  let winner: Team | undefined
  if (status === MatchStatus.Over) {
    if ($('.team1-gradient.won').length) winner = team1
    else if ($('.team2-gradient.won').length) winner = team2
  }

  const dateAttr =
    attrOf($('.timeAndEvent .date'), 'data-unix') ??
    attrOf($('span[data-time-format]'), 'data-unix')

  const eventName = textOf($('.timeAndEvent .event a, .event-name-and-logo a'))
  const eventHref = attrOf($('.timeAndEvent .event a, .event-name-and-logo a'), 'href')
  const event: Event = {
    id: idFromHref(eventHref, 2),
    name: eventName || 'Unknown Event',
  }

  return {
    id,
    date: dateAttr ? Number(dateAttr) : undefined,
    status,
    format,
    team1,
    team2,
    winner,
    event,
    maps,
    demos,
    url,
  }
}

export async function getMatchDemos(id: number, config: ScraperConfig = {}): Promise<Demo[]> {
  const match = await getMatch(id, config)
  return match.demos
}
