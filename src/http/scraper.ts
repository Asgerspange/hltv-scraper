import { load } from 'cheerio'
import type { AnyNode } from 'domhandler'

export type CheerioAPI = ReturnType<typeof load>
// The return type of calling $('selector') is Cheerio<AnyNode>
export type CheerioEl = ReturnType<CheerioAPI>

export function loadPage(html: string): CheerioAPI {
  return load(html, { decodeEntities: true })
}

/** Extract numeric ID from an HLTV href at a given slash-index position */
export function idFromHref(href: string | undefined, pos: number): number | undefined {
  if (!href) return undefined
  const parts = href.split('/')
  const val = Number(parts[pos])
  return isNaN(val) ? undefined : val
}

export function textOf($el: CheerioEl): string {
  return ($el.text() as string).trim()
}

export function attrOf($el: CheerioEl, attr: string): string | undefined {
  return (($el.attr(attr) as string | undefined) ?? '').trim() || undefined
}
