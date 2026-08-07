import assert from "node:assert/strict"
import test from "node:test"

import { parseCryptographyMail } from "./src/adapters/cryptography-mailing-list.js"
import { CRYPTOGRAPHY_MAILING_LIST_SEEDS, HISTORICAL_DISCOVERY_PROVIDERS, WAYBACK_SEEDS, COMMON_CRAWL_SEEDS } from "./src/config.js"

const fixture = `
<html><body>
<h1>Bitcoin P2P e-cash paper</h1>
Satoshi Nakamoto satoshi at vistomail.com<br>
Fri Oct 31 14:10:00 EDT 2008
<pre>
&gt; quoted material must remain distinguishable
I've been working on a new electronic cash system that's fully peer-to-peer, with no trusted third party.
The paper is available at: http://www.bitcoin.org/bitcoin.pdf
Satoshi Nakamoto
---------------------------------------------------------------------
The Cryptography Mailing List
</pre>
<a href="http://www.bitcoin.org/bitcoin.pdf">paper</a>
</body></html>`

const realPipermailHeaderFixture = `
<html><head><title>Bitcoin P2P e-cash paper</title></head><body>
<h1>Bitcoin P2P e-cash paper</h1>
<b>Satoshi Nakamoto</b>
<a href="mailto:satoshi%20at%20vistomail.com">satoshi at vistomail.com</a><br>
<i>Fri Oct 31 14:10:00 EDT 2008</i>
<pre>
I've been working on a new electronic cash system that's fully peer-to-peer, with no trusted third party.
&gt; This quoted sentence belongs to another correspondent.
The paper is available at: http://www.bitcoin.org/bitcoin.pdf
</pre>
</body></html>`

test("cryptography mailing-list parser binds original archive metadata and separates quotes", () => {
  const message = parseCryptographyMail(fixture, "https://www.metzdowd.com/pipermail/cryptography/2008-October/014810.html")
  assert.equal(message.messageNumber, "014810")
  assert.equal(message.subject, "Bitcoin P2P e-cash paper")
  assert.equal(message.author, "Satoshi Nakamoto")
  assert.equal(message.email, "satoshi@vistomail.com")
  assert.match(message.body, /new electronic cash system/)
  assert.doesNotMatch(message.body, /quoted material/)
  assert.equal(message.quotedLines.length, 1)
  assert.ok(message.links.some((url) => url === "http://www.bitcoin.org/bitcoin.pdf"))
})

test("cryptography mailing-list parser handles real Pipermail bold-author plus obfuscated mailto markup", () => {
  const message = parseCryptographyMail(realPipermailHeaderFixture, "https://www.metzdowd.com/pipermail/cryptography/2008-October/014810.html")
  assert.equal(message.author, "Satoshi Nakamoto")
  assert.equal(message.email, "satoshi@vistomail.com")
  assert.equal(message.publishedAt, "2008-10-31T18:10:00.000Z")
  assert.match(message.body, /fully peer-to-peer/)
  assert.doesNotMatch(message.body, /belongs to another correspondent/)
  assert.equal(message.quotedLines.length, 1)
})

test("mailing-list corpus is original-first and independently archive-seeded", () => {
  assert.ok(CRYPTOGRAPHY_MAILING_LIST_SEEDS.length >= 14)
  assert.ok(CRYPTOGRAPHY_MAILING_LIST_SEEDS.every((seed) => seed.url.startsWith("https://www.metzdowd.com/pipermail/cryptography/")))
  assert.ok(CRYPTOGRAPHY_MAILING_LIST_SEEDS.some((seed) => seed.url.endsWith("2008-October/014810.html")))
  assert.ok(CRYPTOGRAPHY_MAILING_LIST_SEEDS.some((seed) => seed.url.endsWith("2009-January/014994.html")))
  assert.ok(WAYBACK_SEEDS.some((seed) => seed.includes("014810.html")))
  assert.ok(COMMON_CRAWL_SEEDS.includes("www.metzdowd.com/pipermail/cryptography/*"))
})

test("direct mailing-list provider remains outside base provider list because runtime extension gates it separately", () => {
  assert.equal(HISTORICAL_DISCOVERY_PROVIDERS.includes("mailinglist"), false)
})
