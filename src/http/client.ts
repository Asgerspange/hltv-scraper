import axios, { AxiosInstance } from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import UserAgent from 'user-agents'
import * as fs from 'fs'
import * as path from 'path'
export interface ScraperConfig {
  /**
   * Optional proxy URL. Supports http/https/socks5 proxies.
   * Format: http://user:pass@host:port  or  socks5://host:port
   */
  proxyUrl?: string

  /**
   * Delay between requests in milliseconds (default: 2000).
   */
  requestDelay?: number

  /**
   * Custom headers to merge with defaults.
   */
  extraHeaders?: Record<string, string>

  /**
   * Max retries on failure (default: 3)
   */
  maxRetries?: number

  /**
   * Use Playwright browser for JS-rendered pages (slower; use when a page needs JavaScript).
   * Requires: npx playwright install chromium
   */
  useBrowser?: boolean

  /**
   * Timeout in ms (default: 30000)
   */
  timeout?: number
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Axios-based client ───────────────────────────────────────────────────────

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const ua = new UserAgent({ deviceCategory: 'desktop' })
  return {
    'User-Agent': ua.toString(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive',
    ...extra,
  }
}

export function createAxiosClient(config: ScraperConfig = {}): AxiosInstance {
  const axiosConfig: Parameters<typeof axios.create>[0] = {
    timeout: config.timeout ?? 30_000,
    headers: buildHeaders(config.extraHeaders),
    withCredentials: true,
    maxRedirects: 5,
  }

  if (config.proxyUrl) {
    axiosConfig.httpsAgent = new HttpsProxyAgent(config.proxyUrl)
    axiosConfig.httpAgent = new HttpsProxyAgent(config.proxyUrl)
  }

  return axios.create(axiosConfig)
}

// ─── Playwright-based fetcher ─────────────────────────────────────────────────

let _browserPromise: Promise<import('playwright').Browser> | null = null

async function getBrowser(): Promise<import('playwright').Browser> {
  if (!_browserPromise) {
    const { chromium } = await import('playwright-extra')
    const StealthPlugin = require('puppeteer-extra-plugin-stealth')
    chromium.use(StealthPlugin())

    _browserPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1366,768',
      ],
    }) as Promise<import('playwright').Browser>
  }
  return _browserPromise
}
export async function closeBrowser(): Promise<void> {
  if (_browserPromise) {
    const browser = await _browserPromise
    await browser.close()
    _browserPromise = null
  }
}
export async function fetchWithCookies(url: string, config: ScraperConfig = {}): Promise<string> {
  const cookiePath = path.join(process.cwd(), 'cookies.json')
  let cookieHeader = ''

  if (fs.existsSync(cookiePath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'))
    cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ')
  }

  const client = createAxiosClient(config)
  client.defaults.headers['Cookie'] = cookieHeader
  client.defaults.headers['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
  client.defaults.headers['Referer'] = 'https://www.hltv.org/'

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await client.get<string>(url)
      return res.data as string
    } catch (err: any) {
      if (err?.response?.status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after'] ?? '60')
        console.warn(`[hltv-scraper] ⏳ Rate limited, waiting ${retryAfter}s... (attempt ${attempt}/5)`)
        await sleep((retryAfter + 2) * 1000)
      } else {
        throw err
      }
    }
  }

  throw new Error(`Failed to fetch ${url} after 5 attempts`)
}
export async function fetchWithBrowser(url: string, config: ScraperConfig = {}): Promise<string> {
  const browser = await getBrowser()
  const ua = new UserAgent({ deviceCategory: 'desktop' })

  const contextOptions: Parameters<typeof browser.newContext>[0] = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36', // paste your exact UA here
  locale: 'en-US',
  viewport: { width: 1366, height: 768 },
  extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
}

  if (config.proxyUrl) {
    contextOptions.proxy = { server: config.proxyUrl }
  }

  const context = await browser.newContext(contextOptions)
const cookiePath = path.join(process.cwd(), 'cookies.json')
if (fs.existsSync(cookiePath)) {
  const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'))
  await context.addCookies(cookies.map((c: any) => ({
    name: c.name,
    value: c.value,
    domain: '.hltv.org',   // force this — CF requires leading dot
    path: c.path ?? '/',
    expires: c.expirationDate ?? -1,
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? true,
    sameSite: 'None' as const,  // CF cookies require None not Lax
  })))
  
  console.log(`[hltv-scraper] 🍪 Loaded ${cookies.length} cookies`)
  // Log if cf_clearance is present
  const hasCF = cookies.some((c: any) => c.name === 'cf_clearance')
  console.log(`[hltv-scraper] CF clearance cookie present: ${hasCF}`)
}
  await context.addInitScript(`
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  `)

  const page = await context.newPage()

  try {
    console.log(`[hltv-scraper] 🌐 Browser fetching: ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout ?? 30_000 })

    // Wait for Cloudflare challenge to pass (polls up to 15s)
    await page.waitForFunction(
      () => document.querySelector('.result-con, .results-holder, .team1-gradient, .upcomingMatch') !== null,
      { timeout: 20_000 }
    ).catch(() => {
      console.warn('[hltv-scraper] ⚠️  Timed out waiting for content')
    })
const title = await page.title()
const bodySnippet = await page.evaluate(() => document.body?.innerText?.slice(0, 500) ?? 'no body')
console.log('[hltv-scraper] Page title:', title)
console.log('[hltv-scraper] Body snippet:', bodySnippet)

    return await page.content()
  } finally {
    await context.close()
  }
}

// ─── Smart fetcher: browser if configured, else axios ────────────────────────

export async function fetchPage(url: string, config: ScraperConfig = {}): Promise<string> {
  const delay = config.requestDelay ?? 2_000
  const maxRetries = config.maxRetries ?? 3

  if (config.useBrowser) {
  return fetchWithCookies(url, config)
}

  // Axios mode
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = createAxiosClient(config)
      const res = await client.get<string>(url)

      if (
        typeof res.data === 'string' && (
          res.data.includes('cf-browser-verification') ||
          res.data.includes('challenge-form') ||
          res.data.includes('Just a moment...')
        )
      ) {
        throw new Error(
          'Cloudflare challenge detected.\n' +
          '→ Switch to useBrowser: true in your ScraperConfig and run:\n' +
          '  npx playwright install chromium'
        )
      }

      return res.data as string
    } catch (err: unknown) {
      const isLast = attempt === maxRetries
      if (isLast) throw err
      const backoff = delay * attempt
      console.warn(`[hltv-scraper] Attempt ${attempt} failed for ${url}. Retrying in ${backoff}ms…`)
      await sleep(backoff)
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} attempts`)
}
