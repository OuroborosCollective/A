import { fetchWithRetry } from "./http-client.js"

export interface WikipediaSeed {
  language: string
  title: string
}

export interface WikipediaReferencePage {
  language: string
  title: string
  pageId: number
  revisionId: number
  revisionTimestamp?: string
  url: string
  permanentUrl: string
  externalLinks: string[]
  languageLinks: Array<{ language: string; title: string; url?: string }>
}

interface MediaWikiQueryResponse {
  query?: {
    pages?: Array<{
      pageid?: number
      title?: string
      missing?: boolean
      revisions?: Array<{ revid?: number; timestamp?: string }>
      extlinks?: Array<{ url?: string }>
      langlinks?: Array<{ lang?: string; title?: string; url?: string }>
    }>
  }
}

export function parseWikipediaQuery(payload: MediaWikiQueryResponse, seed: WikipediaSeed): WikipediaReferencePage {
  const page = payload.query?.pages?.[0]
  if (!page || page.missing || !page.pageid || !page.title) throw new Error(`Wikipedia page not found: ${seed.language}:${seed.title}`)
  const revision = page.revisions?.[0]
  if (!revision?.revid) throw new Error(`Wikipedia revision missing: ${seed.language}:${seed.title}`)
  const articleTitle = page.title.replace(/ /g, "_")
  const url = `https://${seed.language}.wikipedia.org/wiki/${encodeURIComponent(articleTitle).replace(/%2F/g, "/")}`
  return {
    language: seed.language,
    title: page.title,
    pageId: page.pageid,
    revisionId: revision.revid,
    revisionTimestamp: revision.timestamp,
    url,
    permanentUrl: `${url}?oldid=${revision.revid}`,
    externalLinks: [...new Set((page.extlinks ?? []).flatMap((item) => item.url ? [item.url] : []))].slice(0, 30),
    languageLinks: (page.langlinks ?? []).flatMap((item) => item.lang && item.title ? [{ language: item.lang, title: item.title, url: item.url }] : []).slice(0, 30),
  }
}

export async function fetchWikipediaReferencePage(seed: WikipediaSeed): Promise<WikipediaReferencePage> {
  const endpoint = new URL(`https://${seed.language}.wikipedia.org/w/api.php`)
  endpoint.searchParams.set("action", "query")
  endpoint.searchParams.set("format", "json")
  endpoint.searchParams.set("formatversion", "2")
  endpoint.searchParams.set("redirects", "1")
  endpoint.searchParams.set("prop", "revisions|extlinks|langlinks")
  endpoint.searchParams.set("titles", seed.title)
  endpoint.searchParams.set("rvprop", "ids|timestamp")
  endpoint.searchParams.set("rvlimit", "1")
  endpoint.searchParams.set("ellimit", "30")
  endpoint.searchParams.set("lllimit", "30")
  endpoint.searchParams.set("llprop", "url|langname")
  endpoint.searchParams.set("origin", "*")

  const response = await fetchWithRetry(endpoint, {
    headers: {
      "User-Agent": "OuroborosCollective-Satoshi-Research-Worker/0.3 (public research; contact via GitHub OuroborosCollective/A)",
      "Accept": "application/json",
    },
  })
  if (!response.ok) throw new Error(`Wikipedia API request failed: ${response.status}`)
  return parseWikipediaQuery(await response.json() as MediaWikiQueryResponse, seed)
}
