import { sha256Hex } from "./hash.js"

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
])

export function canonicalizeUrl(input: string): string {
  const url = new URL(input)
  url.hash = ""
  url.hostname = url.hostname.toLowerCase()
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = ""
  }

  const retained = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_PARAMETERS.has(key.toLowerCase()))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    )

  url.search = ""
  for (const [key, value] of retained) url.searchParams.append(key, value)

  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "")
  return url.toString()
}

export async function canonicalSourceId(
  adapter: string,
  upstreamId: string,
  url: string
): Promise<string> {
  const canonicalUrl = canonicalizeUrl(url)
  const digest = await sha256Hex(`${adapter}\n${upstreamId}\n${canonicalUrl}`)
  return `${adapter.toLowerCase()}:${digest}`
}
