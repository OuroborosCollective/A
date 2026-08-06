import assert from "node:assert/strict"
import test from "node:test"

import { parseFeed } from "./src/adapters/feed.js"
import { canonicalSourceId, canonicalizeUrl } from "./src/domain/canonical.js"
import { sha256Hex, stableJson } from "./src/domain/hash.js"
import { assessEvidence, calculateHype, deriveResearchPaths } from "./src/domain/research.js"
import { waybackTimestampToIso } from "./src/adapters/wayback.js"

test("canonicalizeUrl removes tracking data and sorts retained parameters", () => {
  assert.equal(
    canonicalizeUrl("HTTPS://Example.COM:443/path/?utm_source=x&b=2&a=1#fragment"),
    "https://example.com/path?a=1&b=2"
  )
})

test("canonicalSourceId is stable", async () => {
  const first = await canonicalSourceId("feed", "abc", "https://example.com/x?utm_source=a")
  const second = await canonicalSourceId("feed", "abc", "https://EXAMPLE.com/x")
  assert.equal(first, second)
})

test("sha256Hex matches the known SHA-256 vector", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  )
})

test("stableJson sorts nested object keys", () => {
  assert.equal(stableJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}')
})

test("assessEvidence never promotes an archived mirror to primary evidence", () => {
  assert.equal(
    assessEvidence({
      sourceType: "Webarchiv",
      hasOriginal: false,
      hasArchive: true,
      recordHashVerified: true,
      signatureVerified: false,
      independentConfirmations: 0,
      contradictedByPrimaryEvidence: false,
    }).tier,
    "Unabhängig archiviert"
  )
})

test("primary contradiction wins over secondary confirmations", () => {
  assert.equal(
    assessEvidence({
      sourceType: "Medienbericht",
      hasOriginal: false,
      hasArchive: true,
      recordHashVerified: true,
      signatureVerified: false,
      independentConfirmations: 5,
      contradictedByPrimaryEvidence: true,
    }).tier,
    "Widerlegt"
  )
})

test("deriveResearchPaths returns six explicit paths", () => {
  const paths = deriveResearchPaths({
    title: "Bitcoin whitepaper",
    sourceType: "PDF",
    url: "https://bitcoin.org/bitcoin.pdf",
  })
  assert.equal(paths.length, 6)
  assert.match(paths[0] ?? "", /früheste Version/)
})

test("calculateHype marks attention without primary evidence", () => {
  const result = calculateHype({
    mentionCount: 100,
    independentPublishers: 20,
    searchTrend: 100,
    priceVolatility: 20,
    primaryEvidenceCount: 0,
  })
  assert.equal(result.score, 95)
  assert.equal(result.evidenceGap, true)
})

test("parseFeed accepts RSS and Atom", () => {
  const rss = parseFeed(`<?xml version="1.0"?><rss><channel><item><title>BTC story</title><link>https://example.com/a</link><guid>a</guid><pubDate>Wed, 01 Jan 2025 00:00:00 GMT</pubDate><description><![CDATA[<p>Summary</p>]]></description></item></channel></rss>`)
  assert.equal(rss[0]?.title, "BTC story")
  assert.equal(rss[0]?.summary, "Summary")

  const atom = parseFeed(`<?xml version="1.0"?><feed><entry><id>x</id><title>Core release</title><link rel="alternate" href="https://example.com/b"/><updated>2025-01-01T00:00:00Z</updated><summary>Details</summary></entry></feed>`)
  assert.equal(atom[0]?.link, "https://example.com/b")
})

test("Wayback timestamp becomes ISO UTC", () => {
  assert.equal(waybackTimestampToIso("20090103184505"), "2009-01-03T18:45:05Z")
})
