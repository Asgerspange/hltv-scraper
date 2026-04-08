import HLTVScraper from './index'
import { GameType } from './endpoints/getResults'
import * as fs from 'fs'

async function main() {
  // Parse --limit flag: npm run dev -- --limit 200
  const limitArg = process.argv.find(a => a.startsWith('--limit=')) 
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 100

  const scraper = new HLTVScraper({
    useBrowser: true,
    requestDelay: 1_500,
  })

  try {
    console.log(`\n📊 Fetching CS2 results (limit: ${limit})...`)
    
    const maxPages = Math.ceil(limit / 100)
    const results = await scraper.getResults({
      gameType: GameType.CS2,
      startDate: '2025-01-01',
      stars: 1,
      maxPages,
    })

    const limited = results.slice(0, limit)
    console.log(`✅ Found ${limited.length} matches\n`)

    // Fetch demo links in parallel batches of 5
    const rows = ['name,team1,team2,event,demo_link,hltv_id,hltv_link,team1_score,team2_score']
    const batchSize = 3

    for (let i = 0; i < limited.length; i += batchSize) {
      const batch = limited.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async (r) => {
          const demos = await scraper.getMatchDemos(r.id)
          const demoLink = demos.length > 0 ? demos[0].link : ''
          console.log(`  [${i + batch.indexOf(r) + 1}/${limited.length}] ${r.team1.name} vs ${r.team2.name} — ${demoLink || 'no demo'}`)
          return { r, demoLink }
        })
      )

      for (const { r, demoLink } of batchResults) {
        rows.push([
          `${r.team1.name} vs ${r.team2.name}`,
          r.team1.name,
          r.team2.name,
          r.event.name,
          demoLink,
          r.id,
          r.url,
          r.score.team1,
          r.score.team2,
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      }

      // Small delay between batches
      if (i + batchSize < limited.length) {
        await new Promise(resolve => setTimeout(resolve, 2_000))
      }
    }

    fs.writeFileSync('matches.csv', rows.join('\n'), 'utf-8')
    console.log(`\n📁 Saved ${limited.length} matches to matches.csv`)

  } finally {
    await scraper.close()
  }
}

main().catch(console.error)