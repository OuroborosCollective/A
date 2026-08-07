import type { SourceForgeSeed } from "./adapters/sourceforge.js"
import type { WikipediaSeed } from "./adapters/wikipedia.js"

export interface FeedDefinition {
  id: string
  title: string
  url: string
  sourceClass: "technical" | "media"
  weight: number
}

export const BITCOINTALK = {
  baseUrl: "https://bitcointalk.org/",
  satoshiUserId: "3",
  satoshiProfileUrl: "https://bitcointalk.org/index.php?action=profile;u=3",
  satoshiPostsUrl: "https://bitcointalk.org/index.php?action=profile;u=3;sa=showPosts",
  recentPostsUrl: "https://bitcointalk.org/index.php?action=recent;start=0",
  historicalProfileUrl: "http://www.bitcoin.org/smf/index.php?action=profile;u=3",
  historicalPostsUrl: "http://www.bitcoin.org/smf/index.php?action=profile;u=3;sa=showPosts",
  claimKeywords: [
    "satoshi",
    "nakamoto",
    "bitcoin creator",
    "creator of bitcoin",
    "genesis block",
    "patoshi",
    "pgp",
    "gpg",
    "identity",
    "real satoshi",
  ],
} as const

export const WAYBACK_SEEDS = [
  "https://bitcoin.org/bitcoin.pdf",
  "http://www.bitcoin.org/bitcoin.pdf",
  "http://www.bitcoin.org/",
  "http://bitcoin.sourceforge.net/",
  "https://sourceforge.net/projects/bitcoin/",
  "https://sourceforge.net/p/bitcoin/news/",
  "https://sourceforge.net/p/bitcoin/news/2009/01/bitcoin-v01-released---p2p-e-cash/",
  "https://sourceforge.net/p/bitcoin/code/HEAD/tree/",
  "https://sourceforge.net/projects/bitcoin/files/",
  BITCOINTALK.historicalProfileUrl,
  BITCOINTALK.historicalPostsUrl,
] as const

// Direct SourceForge collection is intentionally preserved as a protected/manual
// lane for alternate runners. Repeated Cloudflare Free runtime previews returned
// 1101 before source persistence, so production historical discovery reaches the
// same SourceForge URLs through Wayback and Common Crawl instead of failing cron.
export const SOURCEFORGE_SEEDS: SourceForgeSeed[] = [
  {
    apiUrl: "https://sourceforge.net/rest/p/bitcoin/news/2009/01/bitcoin-v01-released---p2p-e-cash/",
    publicUrl: "https://sourceforge.net/p/bitcoin/news/2009/01/bitcoin-v01-released---p2p-e-cash/",
    kind: "news",
    title: "Bitcoin v0.1 released - P2P e-cash",
  },
  {
    apiUrl: "https://sourceforge.net/rest/p/bitcoin/news/2011/01/development-process/",
    publicUrl: "https://sourceforge.net/p/bitcoin/news/2011/01/development-process/",
    kind: "news",
    title: "Development process",
  },
]

export const WIKIPEDIA_SEEDS: WikipediaSeed[] = [
  { language: "en", title: "Bitcoin" },
  { language: "en", title: "Satoshi Nakamoto" },
  { language: "de", title: "Bitcoin" },
  { language: "de", title: "Satoshi Nakamoto" },
]

export const COMMON_CRAWL_COLLECTIONS = [
  "CC-MAIN-2008-2009",
  "CC-MAIN-2009-2010",
  "CC-MAIN-2012",
] as const

export const COMMON_CRAWL_SEEDS = [
  "bitcoin.org/*",
  "www.bitcoin.org/*",
  "bitcoin.sourceforge.net/*",
  "sourceforge.net/p/bitcoin/*",
  "sourceforge.net/projects/bitcoin/*",
] as const

// Kept as a runtime-extensible string list because protected/manual provider lanes
// still exist, while the automatic free-tier rotation intentionally contains only
// providers that have passed Cloudflare runtime preview evidence.
export const HISTORICAL_DISCOVERY_PROVIDERS: readonly string[] = [
  "wayback",
  "wikipedia",
  "commoncrawl",
]

export const FEEDS: FeedDefinition[] = [
  {
    id: "bitcoin-core-releases",
    title: "Bitcoin Core releases",
    url: "https://github.com/bitcoin/bitcoin/releases.atom",
    sourceClass: "technical",
    weight: 0.35,
  },
  {
    id: "bitcoin-optech",
    title: "Bitcoin Optech",
    url: "https://bitcoinops.org/feed.xml",
    sourceClass: "technical",
    weight: 0.45,
  },
  {
    id: "coindesk-bitcoin",
    title: "CoinDesk RSS",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    sourceClass: "media",
    weight: 0.8,
  },
  {
    id: "cointelegraph-bitcoin",
    title: "Cointelegraph RSS",
    url: "https://cointelegraph.com/rss",
    sourceClass: "media",
    weight: 0.75,
  },
]
