import { ScraperConfig, fetchPage } from '../http/client'
import { loadPage, idFromHref, textOf, attrOf, CheerioAPI } from '../http/scraper'
import { Team, Event, MatchStatus, MatchFormat } from '../shared/types'

export interface MatchPreview {
  id: number
  date: number | undefined
  team1: Team | undefined
  team2: Team | undefined
  event: Event | undefined
  status: MatchStatus
  format: MatchFormat
  stars: number
  liveScore?: { team1: number; team2: number }
  url: string
}

export interface GetMatchesOptions {
  eventIds?: number[]
  liveOnly?: boolean
}

function parseFormat(text: string): MatchFormat {
  const t = text.toLowerCase()
  if (t.includes('bo5')) return MatchFormat.Bo5
  if (t.includes('bo3')) return MatchFormat.Bo3
  if (t.includes('bo2')) return MatchFormat.Bo2
  if (t.includes('bo1') || t.includes('best of 1')) return MatchFormat.Bo1
  return MatchFormat.Unknown
}

function parseLiveMatches($: CheerioAPI, results: MatchPreview[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $('.liveMatch-container').each((_i: number, el: any) => {
    const $el = $(el)
    const href = attrOf($el.find('a.match'), 'href')
    const id = href ? idFromHref(href, 2) : undefined
    if (!id) return

    const team1Name = textOf($el.find('.matchTeam.team1 .matchTeamName'))
    const team2Name = textOf($el.find('.matchTeam.team2 .matchTeamName'))

    const scoreText = textOf($el.find('.matchScore'))
    const scoreParts = scoreText.split('-').map((s) => parseInt(s.trim()))
    const liveScore =
      scoreParts.length === 2 && !isNaN(scoreParts[0]) && !isNaN(scoreParts[1])
        ? { team1: scoreParts[0], team2: scoreParts[1] }
        : undefined

    const eventName = textOf($el.find('.matchEvent .matchEventName'))
    const eventHref = attrOf($el.find('.matchEvent'), 'href')
    const formatText = textOf($el.find('.matchMeta'))

    results.push({
      id,
      date: undefined,
      team1: team1Name ? { id: undefined, name: team1Name } : undefined,
      team2: team2Name ? { id: undefined, name: team2Name } : undefined,
      event: eventName ? { id: idFromHref(eventHref, 2), name: eventName } : undefined,
      status: MatchStatus.Live,
      format: parseFormat(formatText),
      stars: 0,
      liveScore,
      url: `https://www.hltv.org${href}`,
    })
  })
}

function parseUpcomingMatches($: CheerioAPI, results: MatchPreview[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $('.upcomingMatch').each((_i: number, el: any) => {
    const $el = $(el)
    const href = attrOf($el.find('a'), 'href')
    const id = href ? idFromHref(href, 2) : undefined
    if (!id) return

    const unixAttr = attrOf($el.find('.matchTime'), 'data-unix')
    const date = unixAttr ? Number(unixAttr) : undefined

    const team1Name = textOf($el.find('.matchTeam.team1 .matchTeamName'))
    const team2Name = textOf($el.find('.matchTeam.team2 .matchTeamName'))
    const team1Logo = attrOf($el.find('.matchTeam.team1 img'), 'src')
    const team2Logo = attrOf($el.find('.matchTeam.team2 img'), 'src')

    const eventName = textOf($el.find('.matchEvent .matchEventName'))
    const eventHref = attrOf($el.find('.matchEvent'), 'href')
    const formatText = textOf($el.find('.matchMeta'))

    const fadedStars = $el.find('i.faded-star').length
    const stars = fadedStars > 0 ? 5 - fadedStars : $el.find('i.star').length

    results.push({
      id,
      date,
      team1: team1Name ? { id: undefined, name: team1Name, logo: team1Logo } : undefined,
      team2: team2Name ? { id: undefined, name: team2Name, logo: team2Logo } : undefined,
      event: eventName ? { id: idFromHref(eventHref, 2), name: eventName } : undefined,
      status: MatchStatus.Scheduled,
      format: parseFormat(formatText),
      stars,
      url: `https://www.hltv.org${href}`,
    })
  })
}

export async function getMatches(
  config: ScraperConfig = {},
  options: GetMatchesOptions = {}
): Promise<MatchPreview[]> {
  let url = 'https://www.hltv.org/matches'
  if (options.eventIds?.length) {
    url += `?${options.eventIds.map((id) => `event=${id}`).join('&')}`
  }

  const html = await fetchPage(url, config)
  const $ = loadPage(html)
  const results: MatchPreview[] = []

  parseLiveMatches($, results)
  if (!options.liveOnly) parseUpcomingMatches($, results)

  return results
}
