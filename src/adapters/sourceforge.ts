export interface SourceForgeSeed {
  apiUrl: string
  publicUrl: string
  kind: "project" | "news" | "code"
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
