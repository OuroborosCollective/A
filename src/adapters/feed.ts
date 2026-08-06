export interface FeedItem {
  id: string
  title: string
  link: string
  publishedAt?: string
  summary: string
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const response = await fetch(url, {
    headers: { "User-Agent": "OuroborosCollective-Satoshi-Research-Worker" },
  })
  if (!response.ok) throw new Error(`Feed request failed (${response.status}): ${url}`)
  return parseFeed(await response.text())
}

export function parseFeed(xml: string): FeedItem[] {
  const rssBlocks = extractBlocks(xml, "item")
  if (rssBlocks.length > 0) return rssBlocks.flatMap(parseRssItem)
  return extractBlocks(xml, "entry").flatMap(parseAtomEntry)
}

function parseRssItem(block: string): FeedItem[] {
  const title = tagText(block, "title")
  const link = tagText(block, "link")
  if (!title || !link) return []
  return [{
    id: tagText(block, "guid") || link,
    title,
    link,
    publishedAt: normalizeDate(tagText(block, "pubDate") || tagText(block, "dc:date")),
    summary: stripMarkup(tagText(block, "description") || tagText(block, "content:encoded")),
  }]
}

function parseAtomEntry(block: string): FeedItem[] {
  const title = tagText(block, "title")
  const link = atomLink(block)
  if (!title || !link) return []
  return [{
    id: tagText(block, "id") || link,
    title,
    link,
    publishedAt: normalizeDate(tagText(block, "published") || tagText(block, "updated")),
    summary: stripMarkup(tagText(block, "summary") || tagText(block, "content")),
  }]
}

function extractBlocks(xml: string, tag: string): string[] {
  const escaped = escapeRegex(tag)
  const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi")
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "")
}

function tagText(block: string, tag: string): string {
  const escaped = escapeRegex(tag)
  const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i")
  const value = pattern.exec(block)?.[1] ?? ""
  return decodeXml(stripCdata(value)).trim()
}

function atomLink(block: string): string {
  const candidates = [...block.matchAll(/<link\b([^>]*)\/?\s*>/gi)]
  for (const candidate of candidates) {
    const attributes = candidate[1] ?? ""
    const rel = attribute(attributes, "rel")
    const href = attribute(attributes, "href")
    if (href && (!rel || rel === "alternate")) return decodeXml(href)
  }
  return tagText(block, "link")
}

function attribute(attributes: string, name: string): string {
  const escaped = escapeRegex(name)
  const pattern = new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, "i")
  return pattern.exec(attributes)?.[1]?.trim() ?? ""
}

function stripCdata(value: string): string {
  return value.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/i, "$1")
}

function normalizeDate(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

function stripMarkup(value: string): string {
  return decodeXml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
}

function decodeXml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
