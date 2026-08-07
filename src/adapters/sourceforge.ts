export interface SourceForgePage {
  url: string
  title: string
  publishedAt?: string
  text: string
  kind: "project" | "news" | "code" | "files"
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim()
}

function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
  if (og) return stripHtml(og)
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  if (heading) return stripHtml(heading)
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return stripHtml(title ?? "SourceForge Bitcoin record").replace(/\s*[-|/]\s*SourceForge(?:\.net)?\s*$/i, "")
}

function inferKind(url: string): SourceForgePage["kind"] {
  if (/\/news(?:\/|$)/i.test(url)) return "news"
  if (/\/code(?:\/|$)/i.test(url)) return "code"
  if (/\/files(?:\/|$)/i.test(url)) return "files"
  return "project"
}

function extractPublishedAt(text: string, html: string): string | undefined {
  const iso = html.match(/(?:datePublished|article:published_time)["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/content=["']([^"']+)["'][^>]+(?:datePublished|article:published_time)["']/i)?.[1]
  if (iso) {
    const date = new Date(iso)
    if (!Number.isNaN(date.valueOf())) return date.toISOString()
  }

  const posted = text.match(/Posted by\s+.{0,120}?\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/i)
    ?? text.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/)
  if (!posted) return undefined
  const [, year, month, day] = posted
  return `${year}-${month}-${day}T00:00:00.000Z`
}

export function parseSourceForgePage(html: string, url: string): SourceForgePage {
  const text = stripHtml(html)
  return {
    url,
    title: extractTitle(html),
    publishedAt: extractPublishedAt(text, html),
    text: text.slice(0, 5000),
    kind: inferKind(url),
  }
}

export async function fetchSourceForgePage(url: string): Promise<SourceForgePage> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "OuroborosCollective-Satoshi-Research-Worker",
      "Accept": "text/html,application/xhtml+xml",
    },
  })
  if (!response.ok) throw new Error(`SourceForge request failed: ${response.status}`)
  return parseSourceForgePage(await response.text(), url)
}
