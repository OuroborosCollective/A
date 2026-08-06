export interface FeedDefinition {
  id: string
  title: string
  url: string
  sourceClass: "technical" | "media"
  weight: number
}

export const WAYBACK_SEEDS = [
  "https://bitcoin.org/bitcoin.pdf",
  "http://www.bitcoin.org/bitcoin.pdf",
  "http://www.bitcoin.org/",
  "http://bitcoin.sourceforge.net/",
] as const

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
