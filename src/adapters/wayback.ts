import { fetchWithRetry } from "./http-client.js"

export interface WaybackCapture {
  timestamp: string
  original: string
  mimetype: string
  statuscode: string
  digest: string
}

export async function fetchWaybackCaptures(url: string): Promise<WaybackCapture[]> {
  const endpoint = new URL("https://web.archive.org/cdx/search/cdx")
  endpoint.searchParams.set("url", url)
  endpoint.searchParams.set("output", "json")
  endpoint.searchParams.set("fl", "timestamp,original,mimetype,statuscode,digest")
  endpoint.searchParams.append("filter", "statuscode:200")
  endpoint.searchParams.set("collapse", "digest")
  endpoint.searchParams.set("from", "2008")
  endpoint.searchParams.set("to", "2012")
  endpoint.searchParams.set("limit", "100")

  const response = await fetchWithRetry(endpoint, {
    headers: { "User-Agent": "OuroborosCollective-Satoshi-Research-Worker" },
  })
  if (!response.ok) throw new Error(`Wayback CDX request failed: ${response.status}`)
  const rows = (await response.json()) as string[][]
  return rows.slice(1).flatMap((row) => {
    const [timestamp, original, mimetype, statuscode, digest] = row
    if (!timestamp || !original || !mimetype || !statuscode || !digest) return []
    return [{ timestamp, original, mimetype, statuscode, digest }]
  })
}

export function waybackSnapshotUrl(capture: WaybackCapture): string {
  return `https://web.archive.org/web/${capture.timestamp}id_/${capture.original}`
}

export function waybackTimestampToIso(timestamp: string): string | undefined {
  if (!/^\d{14}$/.test(timestamp)) return undefined
  const year = timestamp.slice(0, 4)
  const month = timestamp.slice(4, 6)
  const day = timestamp.slice(6, 8)
  const hour = timestamp.slice(8, 10)
  const minute = timestamp.slice(10, 12)
  const second = timestamp.slice(12, 14)
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
}
