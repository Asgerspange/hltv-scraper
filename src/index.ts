export { ScraperConfig, closeBrowser, sleep } from './http/client'
export * from './shared/types'

export { getMatches, GetMatchesOptions, MatchPreview } from './endpoints/getMatches'
export { getResults, GetResultsOptions, MatchResult, GameType } from './endpoints/getResults'
export { getMatch, getMatchDemos, FullMatch, MapResult } from './endpoints/getMatch'

import { ScraperConfig, closeBrowser } from './http/client'
import { getMatches, GetMatchesOptions } from './endpoints/getMatches'
import { getResults, GetResultsOptions, GameType } from './endpoints/getResults'
import { getMatch, getMatchDemos } from './endpoints/getMatch'

export class HLTVScraper {
  constructor(private readonly config: ScraperConfig = {}) {}

  /** Fetch upcoming + live matches from hltv.org/matches */
  getMatches(options: GetMatchesOptions = {}) {
    return getMatches(this.config, options)
  }

  /**
   * Fetch finished match results.
   * Defaults to: CS2 matches, stars ≥ 1, from 2025-01-01
   * Mirrors: https://www.hltv.org/results?stars=1&gameType=CS2&startDate=2025-01-01
   */
  getResults(options: GetResultsOptions = {}) {
    return getResults(this.config, options)
  }

  /** Fetch full match details including all demo download links */
  getMatch(id: number) {
    return getMatch(id, this.config)
  }

  /**
   * Fetch only the demo download links for a match.
   * Demo URLs look like: https://www.hltv.org/download/demo/<id>
   */
  getMatchDemos(id: number) {
    return getMatchDemos(id, this.config)
  }

  /**
   * Fetch results and resolve demo links for each match in one call.
   * Uses demosOnly: true by default so only matches with demos are returned.
   */
  async getResultsWithDemos(options: GetResultsOptions = {}) {
    const results = await getResults(this.config, { demosOnly: true, ...options })
    const enriched = await Promise.all(
      results.map(async (r) => {
        const demos = await getMatchDemos(r.id, this.config)
        return { ...r, demos }
      })
    )
    return enriched
  }

  /** Release the Playwright browser (call when done if useBrowser: true) */
  close() {
    return closeBrowser()
  }
}

export default HLTVScraper
