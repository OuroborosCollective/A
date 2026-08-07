import assert from "node:assert/strict"
import test from "node:test"

import { parseFeed } from "./src/adapters/feed.js"
import { parseBitcointalkPosts } from "./src/adapters/bitcointalk.js"
import { canonicalSourceId, canonicalizeUrl } from "./src/domain/canonical.js"
import { sha256Hex, stableJson } from "./src/domain/hash.js"
import {
  assessEvidence,
  calculateHype,
  deriveAnalysisTasks,
  deriveFollowUpPlan,
  deriveResearchPaths,
  extractClaimCandidates,
} from "./src/domain/research.js"
import type { ResearchSource } from "./src/domain/types.js"
import { waybackTimestampToIso } from "./src/adapters/wayback.js"
import { assertAllowedNotionTarget, NOTION_TARGETS, STANDING_AUTHORITY } from "./src/consent.js"
import { laneForCron } from "./src/runtime.js"
import { FORUM_HISTORICAL_BATCH, FORUM_MAX_RECORDS_PER_RUN, FORUM_RECENT_CLAIM_BATCH } from "./src/sync.js"

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

test("Bitcointalk parser attributes u=3 post without quoted text", () => {
  const html = `
  <div id="bodyarea">
    <div class="windowbg">
      <div class="poster_info"><b><a href="https://bitcointalk.org/index.php?action=profile;u=3">satoshi</a></b></div>
      <div class="td_headerandpost"><table><tr><td class="smalltext">December 13, 2010, 04:45:41 PM</td></tr></table>
        <a href="https://bitcointalk.org/index.php?topic=2228.msg29479#msg29479">Re: Wikileaks</a>
        <div class="post"><div class="quoteheader">Quote from somebody</div><div class="quote">This must not be attributed.</div>I make this appeal to Wikileaks not to try to use Bitcoin. Bitcoin is a small beta community in its infancy.</div>
        <div class="signature">signature</div>
      </div>
    </div>
  </div>`
  const posts = parseBitcointalkPosts(html)
  assert.equal(posts.length, 1)
  assert.equal(posts[0]?.authorId, "3")
  assert.equal(posts[0]?.isSatoshiAccount, true)
  assert.equal(posts[0]?.messageId, "29479")
  assert.match(posts[0]?.body ?? "", /small beta community/)
  assert.doesNotMatch(posts[0]?.body ?? "", /must not be attributed/)
})

test("Bitcointalk parser accepts legacy showPosts table rows", () => {
  const html = `
    <table>
      <tr class="catbg">
        <td colspan="2" align="left" class="smalltext">
          <div style="float: right;">Posted on: July 25, 2010, 10:06:57 PM</div>
          Posted by: satoshi
        </td>
      </tr>
      <tr class="windowbg2">
        <td class="smalltext" id="msg12345">
          <div align="right" onclick="return insertQuoteFast(12345);">Insert Quote</div>
          <div class="post">For future reference, here is my public key. Check the fingerprint and signatures independently.</div>
        </td>
      </tr>
    </table>
    <a href="https://bitcointalk.org/index.php?action=profile;u=3;sa=showPosts;start=10">next</a>
  `
  const posts = parseBitcointalkPosts(html, { author: "satoshi", authorId: "3" })
  assert.equal(posts.length, 1)
  assert.equal(posts[0]?.messageId, "12345")
  assert.equal(posts[0]?.authorId, "3")
  assert.equal(posts[0]?.isSatoshiAccount, true)
  assert.match(posts[0]?.body ?? "", /public key/)
  assert.match(posts[0]?.url ?? "", /\?msg=12345$/)
})

test("Bitcointalk parser binds deeply nested showPosts cells by nearest msg id", () => {
  const html = `
    <div id="bodyarea"><table><tr><td><table><tr><td><table>
      <tr><td>Topic: <a href="index.php?topic=48.0">Re: Transaction volume</a></td></tr>
      <tr><td>Posted on: February 14, 2010, 11:15:12 PM</td></tr>
      <tr><td id="msg329"><span onclick="return insertQuoteFast(329);">quote</span>
        <div class="post">I'm sure that in 20 years there will either be very large transaction volume or no volume.</div>
      </td></tr>
      <tr><td>separator unrelated to the post</td></tr>
    </table></td></tr></table></td></tr></table></div>
  `
  const posts = parseBitcointalkPosts(html, { author: "satoshi", authorId: "3" })
  const post = posts.find((item) => item.messageId === "329")
  assert.ok(post)
  assert.equal(post?.topicId, "48")
  assert.equal(post?.isSatoshiAccount, true)
  assert.match(post?.body ?? "", /transaction volume/)
  assert.match(post?.url ?? "", /topic=48/)
})

function forumSource(summary: string): ResearchSource {
  return {
    canonicalId: "bitcointalk-message:0123456789abcdef",
    title: "Forum statement",
    lane: "Satoshi Forum",
    sourceType: "Forum-Post",
    evidenceTier: "Primär belegt",
    originalUrl: "https://bitcointalk.org/index.php?topic=1.0#msg1",
    publishedAt: "2010-12-13T16:45:41.000Z",
    retrievedAt: "2026-08-07T14:00:00.000Z",
    upstreamId: "msg:1;topic:1;user:3",
    recordSha256: "abc",
    contentHashVerified: false,
    adapter: "Bitcointalk HTML",
    status: "In Prüfung",
    subjects: ["Satoshi", "Bitcoin", "Kryptografie", "Identität"],
    summary,
    primarySource: true,
    independentConfirmations: 0,
  }
}

test("forum claims stay open and identity analysis requires human review", () => {
  const source = forumSource("Autor-Konto: satoshi. Inhalt: The public key signature and timestamp should be checked before anyone claims that Alice is Satoshi Nakamoto.")
  const claims = extractClaimCandidates(source)
  assert.equal(claims.length, 1)
  assert.equal(claims[0]?.evidenceTier, "Behauptet")
  const tasks = deriveAnalysisTasks(source, claims)
  assert.ok(tasks.some((task) => task.kind === "cryptographic-statistics" && task.executor === "wolfram"))
  assert.ok(tasks.some((task) => task.kind === "stylometry" && task.requiresHumanReview))
  const plan = deriveFollowUpPlan(source, claims, tasks)
  assert.equal(plan?.status, "Offen")
  assert.equal(plan?.paths.length, 6)
})

test("forum lane stays at two records per invocation for free-worker subrequest safety", () => {
  assert.equal(FORUM_HISTORICAL_BATCH, 1)
  assert.equal(FORUM_RECENT_CLAIM_BATCH, 1)
  assert.equal(FORUM_MAX_RECORDS_PER_RUN, 2)
})

test("standing authority permits only four bounded research data sources", () => {
  assert.doesNotThrow(() => assertAllowedNotionTarget(NOTION_TARGETS.sources))
  assert.doesNotThrow(() => assertAllowedNotionTarget(NOTION_TARGETS.hype))
  assert.doesNotThrow(() => assertAllowedNotionTarget(NOTION_TARGETS.claims))
  assert.doesNotThrow(() => assertAllowedNotionTarget(NOTION_TARGETS.followups))
  assert.throws(() => assertAllowedNotionTarget("00000000-0000-0000-0000-000000000000"), /Consent boundary rejected/)
  assert.ok(STANDING_AUTHORITY.forbidden.includes("set-identity-claim-verified"))
  assert.ok(STANDING_AUTHORITY.forbidden.includes("attempt-private-key-recovery"))
})

test("cron triggers map deterministically to bounded lanes", () => {
  assert.equal(laneForCron("*/15 * * * *"), "commits")
  assert.equal(laneForCron("7 * * * *"), "releases")
  assert.equal(laneForCron("17 */6 * * *"), "wayback")
  assert.equal(laneForCron("*/30 * * * *"), "feeds")
  assert.equal(laneForCron("23 */2 * * *"), "forum")
  assert.equal(laneForCron("* * * * *"), null)
})
