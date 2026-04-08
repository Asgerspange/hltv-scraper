# hltv-scraper

A TypeScript HLTV scraper focused on **fetching matches and demo download links**, with built-in Cloudflare bypass strategies.

## Features

- 🚀 **Lightweight axios mode** — fast requests with rotating user agents & realistic browser fingerprints
- 🛡️ **Browser mode** — Playwright-powered headless Chrome that defeats JS challenge pages
- 🔄 **Auto-retry** with exponential backoff
- 🌐 **Proxy support** — HTTP, HTTPS, SOCKS5
- 🎬 **Demo link extraction** — multiple parsing strategies to find `.dem` download URLs
- 📦 **TypeScript-first** — full type definitions

---

## Installation

```bash
npm install
```

If you plan to use **browser mode**:
```bash
npx playwright install chromium
```

---

## Quick Start

```typescript
import HLTVScraper from './src'

const scraper = new HLTVScraper({
  requestDelay: 2000,   // ms between requests (be polite)
  maxRetries: 3,
})

// Upcoming + live matches
const matches = await scraper.getMatches()
console.log(matches)

// Completed results that have demos
const results = await scraper.getResults({ demosOnly: true })
console.log(results)

// Full match details + all demo links
const match = await scraper.getMatch(2374410)
console.log(match.demos)
// [{ name: 'GOTV Demo', link: 'https://www.hltv.org/download/demo/12345' }]

// Just the demo links
const demos = await scraper.getMatchDemos(2374410)
```

---

## Cloudflare Bypass Strategies

HLTV uses Cloudflare. This scraper handles it in two ways:

### 1. Axios mode (default, fast)
Rotates realistic browser fingerprints (User-Agent, `sec-ch-ua`, accept headers, etc.) and uses `user-agents` for per-request UA rotation. Works most of the time.

**Use a proxy to avoid IP bans:**
```typescript
const scraper = new HLTVScraper({
  proxyUrl: 'http://user:pass@proxy.example.com:8080',
  // or socks5: 'socks5://proxy.example.com:1080'
})
```

### 2. Browser mode (heavier, defeats JS challenges)
Uses Playwright with stealth patches. Automatically waits for CF challenge pages to pass.

```typescript
const scraper = new HLTVScraper({
  useBrowser: true,
  requestDelay: 3000,
})

// Must close the browser when done
await scraper.close()
```

**One-time setup:**
```bash
npx playwright install chromium
```

---

## API

### `new HLTVScraper(config?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `requestDelay` | `number` | `2000` | Delay between requests (ms) |
| `maxRetries` | `number` | `3` | Retry attempts on failure |
| `proxyUrl` | `string` | — | Proxy URL (`http://`, `socks5://`) |
| `useBrowser` | `boolean` | `false` | Use Playwright instead of axios |
| `timeout` | `number` | `15000` | Request timeout (ms) |
| `extraHeaders` | `object` | — | Additional HTTP headers |

---

### `scraper.getMatches(options?)`

Fetches live and upcoming matches from `hltv.org/matches`.

```typescript
const matches = await scraper.getMatches({
  eventIds: [7148],   // filter by event
  liveOnly: false,
})
```

Returns `MatchPreview[]`:
```typescript
{
  id: number
  date: number | undefined      // Unix ms
  status: MatchStatus           // 'Live' | 'Scheduled' | ...
  format: MatchFormat           // 'bo3' | 'bo1' | ...
  team1: Team | undefined
  team2: Team | undefined
  event: Event | undefined
  stars: number                 // 0–5
  liveScore?: { team1: number; team2: number }
  url: string
}
```

---

### `scraper.getResults(options?)`

Fetches completed results from `hltv.org/results`.

```typescript
const results = await scraper.getResults({
  demosOnly: true,              // only matches with demos
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  eventIds: [7148],
  teamIds: [4608],
  maxPages: 2,                  // 100 results/page; 0 = all pages
})
```

---

### `scraper.getMatch(id)`

Full match data including all demo download links.

```typescript
const match = await scraper.getMatch(2374410)
// match.demos → Demo[]
// match.maps  → MapResult[]
```

---

### `scraper.getMatchDemos(id)`

Shorthand — returns only the `Demo[]` array for a match.

```typescript
const demos = await scraper.getMatchDemos(2374410)
// [{ name: 'GOTV Demo', link: 'https://www.hltv.org/download/demo/12345' }]
```

---

### `scraper.getResultsWithDemos(options?)`

Combines `getResults` and `getMatchDemos` — fetches recent results with demos and enriches each entry with the actual download links in one call.

```typescript
const resultsWithDemos = await scraper.getResultsWithDemos({
  maxPages: 1,
})
// Each entry has: ...MatchResult, demos: Demo[]
```

---

## Running

```bash
# Dev mode (ts-node)
npm run dev

# Build
npm run build
node dist/index.js
```

---

## Notes

- Demo links on HLTV point to `https://www.hltv.org/download/demo/<id>` which redirects to the actual `.dem.rar` file hosted on HLTV's CDN. You can download these directly with any HTTP client.
- Rate-limit yourself. Using `requestDelay: 2000` or higher and a proxy pool is strongly recommended for bulk scraping.
