import type { SourceForgeSeed } from "./adapters/sourceforge.js"
import type { WikipediaSeed } from "./adapters/wikipedia.js"
import type { CryptographyMailSeed } from "./adapters/cryptography-mailing-list.js"

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
  claimKeywords: ["satoshi","nakamoto","bitcoin creator","creator of bitcoin","genesis block","patoshi","pgp","gpg","identity","real satoshi"],
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
  "https://www.metzdowd.com/pipermail/cryptography/2008-October/014810.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014815.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014818.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014823.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014831.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014842.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014843.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014849.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014858.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014860.html",
  "https://www.metzdowd.com/pipermail/cryptography/2008-November/014863.html",
  "https://www.metzdowd.com/pipermail/cryptography/2009-January/014994.html",
  "https://www.metzdowd.com/pipermail/cryptography/2009-January/015014.html",
  "https://www.metzdowd.com/pipermail/cryptography/2009-January/015041.html",
  BITCOINTALK.historicalProfileUrl,
  BITCOINTALK.historicalPostsUrl,
] as const

export const SOURCEFORGE_SEEDS: SourceForgeSeed[] = [
  { apiUrl: "https://sourceforge.net/rest/p/bitcoin/news/2009/01/bitcoin-v01-released---p2p-e-cash/", publicUrl: "https://sourceforge.net/p/bitcoin/news/2009/01/bitcoin-v01-released---p2p-e-cash/", kind: "news", title: "Bitcoin v0.1 released - P2P e-cash" },
  { apiUrl: "https://sourceforge.net/rest/p/bitcoin/news/2011/01/development-process/", publicUrl: "https://sourceforge.net/p/bitcoin/news/2011/01/development-process/", kind: "news", title: "Development process" },
]

export const WIKIPEDIA_SEEDS: WikipediaSeed[] = [
  { language: "en", title: "Bitcoin" },
  { language: "en", title: "Satoshi Nakamoto" },
  { language: "de", title: "Bitcoin" },
  { language: "de", title: "Satoshi Nakamoto" },
]

export const CRYPTOGRAPHY_MAILING_LIST_SEEDS: CryptographyMailSeed[] = [
  ["2008-October/014810", "Bitcoin P2P e-cash paper"],
  ["2008-November/014815", "SPV and scaling reply"],
  ["2008-November/014818", "CPU majority and zombie-farm reply"],
  ["2008-November/014823", "P2P resilience reply"],
  ["2008-November/014831", "Difficulty and monetary supply reply"],
  ["2008-November/014842", "Transaction-fee incentive reply"],
  ["2008-November/014843", "Double-spend and confirmation reply"],
  ["2008-November/014849", "Byzantine Generals proof-of-work reply"],
  ["2008-November/014858", "Signatures, fees and source-code reply"],
  ["2008-November/014860", "ECC keys and pseudonymity reply"],
  ["2008-November/014863", "Inventory broadcast and source-code reply"],
  ["2009-January/014994", "Bitcoin v0.1 released"],
  ["2009-January/015014", "Electronic-currency applications reply"],
  ["2009-January/015041", "Proof-of-work and spam economics reply"],
].map(([path, label]) => ({
  url: `https://www.metzdowd.com/pipermail/cryptography/${path}.html`,
  expectedAuthor: "Satoshi Nakamoto",
  expectedEmail: "satoshi@vistomail.com",
  label,
}))

export const COMMON_CRAWL_COLLECTIONS = ["CC-MAIN-2008-2009", "CC-MAIN-2009-2010", "CC-MAIN-2012"] as const
export const COMMON_CRAWL_SEEDS = [
  "bitcoin.org/*",
  "www.bitcoin.org/*",
  "bitcoin.sourceforge.net/*",
  "sourceforge.net/p/bitcoin/*",
  "sourceforge.net/projects/bitcoin/*",
  "metzdowd.com/pipermail/cryptography/*",
  "www.metzdowd.com/pipermail/cryptography/*",
] as const

// The direct mailing-list adapter is staged and tested first. Until its own runtime
// lane is wired and previewed, production historical discovery remains on providers
// already proven on Cloudflare Free. Mailing-list URLs are still automatically
// archived through Wayback and Common Crawl in this phase.
export const HISTORICAL_DISCOVERY_PROVIDERS: readonly string[] = ["wayback", "wikipedia", "commoncrawl"]

export const FEEDS: FeedDefinition[] = [
  { id: "bitcoin-core-releases", title: "Bitcoin Core releases", url: "https://github.com/bitcoin/bitcoin/releases.atom", sourceClass: "technical", weight: 0.35 },
  { id: "bitcoin-optech", title: "Bitcoin Optech", url: "https://bitcoinops.org/feed.xml", sourceClass: "technical", weight: 0.45 },
  { id: "coindesk-bitcoin", title: "CoinDesk RSS", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", sourceClass: "media", weight: 0.8 },
  { id: "cointelegraph-bitcoin", title: "Cointelegraph RSS", url: "https://cointelegraph.com/rss", sourceClass: "media", weight: 0.75 },
]
