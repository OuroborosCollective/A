import { fetchWithRetry } from "./http-client.js"

export interface CommonCrawlCapture {
  collection: string
  url: string
  timestamp: string
  digest?: string
  status?: string
  mime?: string
  mimeDetected?: string
  filename?: string
  offset?: string
  length?: string
  languages?: string
}

interface CommonCrawlIndexRow {
  url?: string
  timestamp?: string
  digest?: string
  status?: string
  mime?: string
  "mime-detected"?: string
  filename?: string
  offset?: string
  length?: string
  languages?: string
}

export function parseCommonCrawlIndex(text: string, collection: string): CommonCrawlCapture[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed) return []
    try {
      const row = JSON.parse(trimmed) as CommonCrawlIndexRow
      if (!row.url || !row.timestamp) return []
      return [{
        collection,
        url: row.url,
        timestamp: row.timestamp,
        digest: row.digest,
        status: row.status,
        mime: row.mime,
        mimeDetected: row["mime-detected"],
        filename: row.filename,
        offset: row.offset,
        length: row.length,
        languages: row.languages,
      }]
    } catch {
      return []
    }
  })
}

export async function fetchCommonCrawlCaptures(
  urlPattern: string,
  collection: string,
  limit = 2
): Promise<CommonCrawlCapture[]> {
  const endpoint = new URL(`https://index.commoncrawl.org/${collection}-index`)
  endpoint.searchParams.set("url", urlPattern)
  endpoint.searchParams.set("output", "json")
  endpoint.searchParams.append("filter", "status:200")
  endpoint.searchParams.set("collapse", "digest")
  endpoint.searchParams.set("limit", String(Math.max(1, Math.min(5, Math.floor(limit)))))

  const response = await fetchWithRetry(endpoint, {
    headers: {
      "User-Agent": "OuroborosCollective-Satoshi-Research-Worker",
      "Accept": "application/x-ndjson,text/plain,application/json",
    },
  })
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`Common Crawl index request failed: ${response.status}`)
  return parseCommonCrawlIndex(await response.text(), collection)
}

export function commonCrawlTimestampToIso(timestamp: string): string | undefined {
  if (!/^\d{14}$/.test(timestamp)) return undefined
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`
}

export function commonCrawlWarcUrl(capture: CommonCrawlCapture): string | undefined {
  return capture.filename ? `https://data.commoncrawl.org/${capture.filename}` : undefined
}

export function commonCrawlIndexRecordUrl(capture: CommonCrawlCapture): string {
  const endpoint = new URL(`https://index.commoncrawl.org/${capture.collection}-index`)
  endpoint.searchParams.set("url", capture.url)
  endpoint.searchParams.set("output", "json")
  endpoint.searchParams.set("limit", "5")
  return endpoint.toString()
}
