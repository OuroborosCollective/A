export interface SourceForgeSeed {
  apiUrl: string
  publicUrl: string
  kind: "project" | "news" | "code" | "files"
  title?: string
}

export interface SourceForgePage {
  url: string
  apiUrl: string
  title: string
  publishedAt?: string
  text: string
  kind: SourceForgeSeed["kind"]
}

function compact(value: unknown, max = 5000): string {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, max)
}

function dateFrom(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString()
}

function dateFromUrl(url: string): string | undefined {
  const match = url.match(/\/news\/(19\d{2}|20\d{2})\/(\d{2})(?:\/|$)/)
  if (!match) return undefined
  return `${match[1]}-${match[2]}-01T00:00:00.000Z`
}

function titleFrom(payload: Record<string, unknown>, seed: SourceForgeSeed): string {
  for (const key of ["title", "name", "shortname", "mount_label"]) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) return compact(value, 300)
  }
  return seed.title ?? "SourceForge Bitcoin record"
}

function publishedFrom(payload: Record<string, unknown>, seed: SourceForgeSeed): string | undefined {
  for (const key of ["mod_date", "created_at", "date", "last_updated", "update_date"]) {
    const parsed = dateFrom(payload[key])
    if (parsed) return parsed
  }
  return dateFromUrl(seed.publicUrl)
}

function boundedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const allow = [
    "_id", "title", "name", "shortname", "summary", "short_description", "description",
    "text", "author", "mod_date", "created_at", "date", "last_updated", "state", "labels",
    "url", "api_url", "mount_label", "mount_point", "commit_count", "clone_url_https_anon",
    "clone_url_ro", "repository_url", "external_homepage", "homepage", "license", "categories",
  ]
  const result: Record<string, unknown> = {}
  for (const key of allow) {
    const value = payload[key]
    if (value !== undefined && value !== null) result[key] = value
  }
  return result
}

export function parseSourceForgeRest(payload: unknown, seed: SourceForgeSeed): SourceForgePage {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Unexpected SourceForge REST payload for ${seed.apiUrl}`)
  }
  const record = payload as Record<string, unknown>
  return {
    url: seed.publicUrl,
    apiUrl: seed.apiUrl,
    title: titleFrom(record, seed),
    publishedAt: publishedFrom(record, seed),
    text: compact(boundedPayload(record)),
    kind: seed.kind,
  }
}

export async function fetchSourceForgePage(seed: SourceForgeSeed): Promise<SourceForgePage> {
  const response = await fetch(seed.apiUrl, {
    headers: {
      "User-Agent": "OuroborosCollective-Satoshi-Research-Worker/0.3",
      "Accept": "application/json",
    },
  })
  if (!response.ok) throw new Error(`SourceForge REST request failed: ${response.status}`)
  const lengthHeader = Number(response.headers.get("content-length") ?? "0")
  if (Number.isFinite(lengthHeader) && lengthHeader > 1_000_000) {
    throw new Error(`SourceForge REST payload too large: ${lengthHeader}`)
  }
  return parseSourceForgeRest(await response.json(), seed)
}

// Legacy/test-only HTML parser. The production collector above never calls this path.
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

export function parseSourceForgePage(html: string, url: string): SourceForgePage {
  const text = stripHtml(html)
  const title = stripHtml(
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
      ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?? "SourceForge Bitcoin record"
  ).replace(/\s*[-|/]\s*SourceForge(?:\.net)?\s*$/i, "")
  const date = text.match(/Posted by\s+.{0,120}?\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/i)
    ?? text.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/)
  const kind: SourceForgeSeed["kind"] = /\/news(?:\/|$)/i.test(url)
    ? "news"
    : /\/code(?:\/|$)/i.test(url)
      ? "code"
      : /\/files(?:\/|$)/i.test(url)
        ? "files"
        : "project"
  return {
    url,
    apiUrl: "legacy-html-test-only",
    title,
    publishedAt: date ? `${date[1]}-${date[2]}-${date[3]}T00:00:00.000Z` : undefined,
    text: text.slice(0, 5000),
    kind,
  }
}
