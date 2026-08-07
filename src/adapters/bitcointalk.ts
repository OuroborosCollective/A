import { BITCOINTALK } from "../config.js"

export interface BitcointalkPost {
  messageId: string
  topicId: string
  title: string
  author: string
  authorId?: string
  url: string
  publishedAt?: string
  forumTimestampRaw?: string
  body: string
  isSatoshiAccount: boolean
}

export interface BitcointalkPage {
  posts: BitcointalkPost[]
  hasMore: boolean
  nextStart: number
}

const MONTH_DATE = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)/i

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
}

function stripQuotedBlocks(html: string): string {
  let text = html
  for (let i = 0; i < 4; i += 1) {
    text = text
      .replace(/<div\b[^>]*class=["'][^"']*\bquoteheader\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
      .replace(/<div\b[^>]*class=["'][^"']*\bquote\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
      .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, " ")
  }
  return text
}

function textFromHtml(html: string): string {
  return decodeHtml(
    stripQuotedBlocks(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|table)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function rowSegments(html: string): string[] {
  const starts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bwindowbg2?\b[^"']*["'][^>]*>/gi)]
  if (!starts.length) return [html]
  return starts.map((match, index) => {
    const from = match.index ?? 0
    const to = starts[index + 1]?.index ?? html.length
    return html.slice(from, to)
  })
}

function parseForumDate(raw?: string): string | undefined {
  if (!raw) return undefined
  const parsed = Date.parse(`${raw} UTC`)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}

function absoluteForumUrl(raw: string): string {
  return new URL(decodeHtml(raw), BITCOINTALK.baseUrl).toString()
}

function bodySegment(row: string): string {
  const marker = row.search(/<div\b[^>]*class=["'][^"']*\bpost\b[^"']*["'][^>]*>/i)
  if (marker < 0) return ""
  const openingEnd = row.indexOf(">", marker)
  if (openingEnd < 0) return ""
  const tail = row.slice(openingEnd + 1)
  const endings = [
    /<div\b[^>]*class=["'][^"']*\bmoderatorbar\b/i,
    /<div\b[^>]*class=["'][^"']*\bsignature\b/i,
    /<div\b[^>]*class=["'][^"']*\bpost_footer\b/i,
  ]
  let end = tail.length
  for (const pattern of endings) {
    const found = tail.search(pattern)
    if (found >= 0) end = Math.min(end, found)
  }
  return tail.slice(0, end)
}

function parseLegacyShowPosts(
  html: string,
  fallbackAuthor?: { author: string; authorId?: string }
): BitcointalkPost[] {
  const posts: BitcointalkPost[] = []
  const pairPattern = /<tr\b[^>]*class=["'][^"']*\bcatbg\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>\s*<tr\b[^>]*class=["'][^"']*\bwindowbg[23]?\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi

  for (const match of html.matchAll(pairPattern)) {
    const header = match[1] ?? ""
    const row = match[2] ?? ""
    const messageId = row.match(/\bid=["']msg(\d+)["']/i)?.[1]
      ?? row.match(/insertQuoteFast\((\d+)\)/i)?.[1]
    if (!messageId) continue

    const body = textFromHtml(bodySegment(row))
    if (!body) continue

    const topicLink = [...`${header}${row}`.matchAll(/<a\b[^>]*href=["']([^"']*[?;&]topic=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((item) => ({ href: decodeHtml(item[1] ?? ""), topicId: item[2] ?? "", text: textFromHtml(item[3] ?? "") }))
      .find((item) => item.topicId)
    const authorLink = header.match(/action=profile(?:;|&amp;|&)u=(\d+)[^"']*["'][^>]*>([^<]+)<\/a>/i)
    const postedBy = textFromHtml(header).match(/Posted by:\s*([^\n]+)/i)?.[1]?.trim()
    const authorId = authorLink?.[1] ?? fallbackAuthor?.authorId
    const author = decodeHtml(authorLink?.[2]?.trim() ?? postedBy ?? fallbackAuthor?.author ?? "unknown")
    const rawDate = header.match(MONTH_DATE)?.[0]
    const topicId = topicLink?.topicId || "unknown"
    const url = topicLink?.href
      ? absoluteForumUrl(topicLink.href)
      : `${BITCOINTALK.baseUrl}index.php?msg=${messageId}`

    posts.push({
      messageId,
      topicId,
      title: topicLink?.text || `Bitcointalk message ${messageId}`,
      author,
      authorId,
      url,
      publishedAt: parseForumDate(rawDate),
      forumTimestampRaw: rawDate,
      body,
      isSatoshiAccount: authorId === BITCOINTALK.satoshiUserId,
    })
  }

  return posts
}

export function parseBitcointalkPosts(
  html: string,
  fallbackAuthor?: { author: string; authorId?: string }
): BitcointalkPost[] {
  const posts: BitcointalkPost[] = []
  const seen = new Set<string>()

  for (const legacy of parseLegacyShowPosts(html, fallbackAuthor)) {
    if (!seen.has(legacy.messageId)) {
      seen.add(legacy.messageId)
      posts.push(legacy)
    }
  }

  for (const row of rowSegments(html)) {
    const hrefs = [...row.matchAll(/<a\b[^>]*href=["']([^"']*topic=\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    let selected: { href: string; messageId: string; topicId: string; title: string } | undefined
    for (const match of hrefs) {
      const href = decodeHtml(match[1] ?? "")
      const topic = href.match(/[?;&]topic=(\d+)/i)
      const message = href.match(/#msg(\d+)/i) ?? href.match(/[?;&]msg=(\d+)/i)
      const anchorText = textFromHtml(match[2] ?? "")
      if (!topic || !message) continue
      const title = anchorText && !/^#?\d+$/.test(anchorText) ? anchorText : ""
      if (!selected || title.length > selected.title.length) {
        selected = { href, topicId: topic[1]!, messageId: message[1]!, title }
      }
    }
    if (!selected || seen.has(selected.messageId)) continue

    const authorMatch = row.match(/action=profile(?:;|&amp;|&)u=(\d+)[^"']*["'][^>]*>([^<]+)<\/a>/i)
    const authorId = authorMatch?.[1] ?? fallbackAuthor?.authorId
    const author = decodeHtml(authorMatch?.[2]?.trim() ?? fallbackAuthor?.author ?? "unknown")
    const rawDate = row.match(MONTH_DATE)?.[0]
    const body = textFromHtml(bodySegment(row))
    if (!body) continue

    seen.add(selected.messageId)
    posts.push({
      messageId: selected.messageId,
      topicId: selected.topicId,
      title: selected.title || `Bitcointalk message ${selected.messageId}`,
      author,
      authorId,
      url: absoluteForumUrl(selected.href),
      publishedAt: parseForumDate(rawDate),
      forumTimestampRaw: rawDate,
      body,
      isSatoshiAccount: authorId === BITCOINTALK.satoshiUserId,
    })
  }

  return posts
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "OuroborosCollective-SatoshiResearch/0.2 (+public historical research; low-rate collector)",
    },
  })
  if (!response.ok) throw new Error(`Bitcointalk HTTP ${response.status}: ${url}`)
  const html = await response.text()
  if (/action=\.xml is disabled|too many requests|temporarily unavailable/i.test(html)) {
    throw new Error(`Bitcointalk returned a rate/availability page: ${url}`)
  }
  return html
}

export async function fetchSatoshiForumPosts(start = 0, limit = 10): Promise<BitcointalkPage> {
  const url = `${BITCOINTALK.satoshiPostsUrl};start=${Math.max(0, Math.floor(start))}`
  const html = await fetchHtml(url)
  const boundedLimit = Math.max(1, Math.min(limit, 10))
  const parsed = parseBitcointalkPosts(html, { author: "satoshi", authorId: BITCOINTALK.satoshiUserId })
    .filter((post) => post.isSatoshiAccount)
  const posts = parsed.slice(0, boundedLimit)
  const hasNextLink = new RegExp(`sa=showPosts(?:;|&amp;|&)start=${Math.max(0, Math.floor(start)) + boundedLimit}(?:["';&]|$)`, "i").test(html)
  return {
    posts,
    hasMore: hasNextLink || posts.length >= boundedLimit,
    nextStart: start + posts.length,
  }
}

export async function fetchRecentSatoshiClaims(limit = 10): Promise<BitcointalkPost[]> {
  const html = await fetchHtml(BITCOINTALK.recentPostsUrl)
  const posts = parseBitcointalkPosts(html)
  return posts
    .filter((post) => !post.isSatoshiAccount)
    .filter((post) => {
      const haystack = `${post.title}\n${post.body}`.toLowerCase()
      return BITCOINTALK.claimKeywords.some((keyword) => haystack.includes(keyword))
    })
    .slice(0, Math.max(1, Math.min(limit, 10)))
}
