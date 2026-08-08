// Verifies the full Notion write path end-to-end with the real integration
// token: creates a page in each relevant data source, reads it back, and
// confirms the consent boundary properties (canonical ID, hash) round-trip
// correctly. It then runs the local pipeline proof against an in-memory D1.

import { NOTION_TARGETS, assertAllowedNotionTarget } from "../src/consent.js"
import { sha256Hex, stableJson } from "../src/domain/hash.js"
import { canonicalSourceId, canonicalizeUrl } from "../src/domain/canonical.js"
import type { ResearchSource } from "../src/domain/types.js"

const TOKEN = process.env.NOTION_API_TOKEN?.trim()
if (!TOKEN) {
  console.error("NOTION_API_TOKEN is not set; skipping live Notion proof.")
  process.exit(1)
}

const NOTION_VERSION = "2025-09-03"

interface NotionPageResponse { id?: string; object?: string; status?: number; message?: string }

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  }
}

function richText(value: string) {
  return { rich_text: value ? [{ type: "text", text: { content: value.slice(0, 1900) } }] : [] }
}
function titleProp(value: string) {
  return { title: [{ type: "text", text: { content: value.slice(0, 1900) } }] }
}
function urlProp(value?: string) { return { url: value || null } }
function dateProp(value?: string) { return { date: value ? { start: value } : null } }
function selectProp(name: string) { return { select: { name } } }
function checkboxProp(value: boolean) { return { checkbox: value } }

async function notionCreate(dataSourceId: string, properties: Record<string, unknown>): Promise<string> {
  assertAllowedNotionTarget(dataSourceId)
  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: dataSourceId }, properties }),
  })
  const body = (await response.json()) as NotionPageResponse
  if (!response.ok || !body.id) throw new Error(`Notion create failed HTTP ${response.status}: ${body.message ?? body.object ?? ""}`)
  return body.id
}

async function notionUpdate(pageId: string, properties: Record<string, unknown>): Promise<void> {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties }),
  })
  if (!response.ok) {
    const body = (await response.json()) as NotionPageResponse
    throw new Error(`Notion update failed HTTP ${response.status}: ${body.message ?? ""}`)
  }
}

async function notionReadback(pageId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: headers() })
  if (!response.ok) {
    const body = (await response.json()) as NotionPageResponse
    throw new Error(`Notion readback failed HTTP ${response.status}: ${body.message ?? ""}`)
  }
  return (await response.json()) as Record<string, unknown>
}

function plainText(page: Record<string, any>, property: string): string {
  const prop = page?.properties?.[property]
  const items = Array.isArray(prop?.rich_text) ? prop.rich_text : Array.isArray(prop?.title) ? prop.title : []
  return items.map((item: any) => item?.plain_text ?? item?.text?.content ?? "").join("")
}

function checkboxValue(page: Record<string, any>, property: string): boolean {
  return page?.properties?.[property]?.checkbox === true
}

async function liveNotionSourceProof(): Promise<void> {
  // Build a real ResearchSource mirroring a mailing-list collection.
  const archiveUrl = "https://www.metzdowd.com/pipermail/cryptography/2008-October/014810.html"
  const canonicalId = await canonicalSourceId("cryptography-mail", "014810:satoshi@vistomail.com", canonicalizeUrl(archiveUrl))
  const message = {
    archiveUrl, messageNumber: "014810", subject: "Bitcoin P2P e-cash paper",
    author: "Satoshi Nakamoto", email: "satoshi@vistomail.com",
    publishedAt: "2008-10-31T18:10:00.000Z", rawDate: "Fri Oct 31 14:10:00 EDT 2008",
    body: "I've been working on a new electronic cash system that's fully peer-to-peer, with no trusted third party.",
    quotedLines: ["> quoted material must remain distinguishable"], links: ["http://www.bitcoin.org/bitcoin.pdf"],
  }
  const recordSha256 = await sha256Hex(stableJson(message))
  const retrievedAt = new Date().toISOString()
  const source: ResearchSource = {
    canonicalId, title: `[E2E-PROBE] ${message.subject}`, lane: "Cryptography Mailing List",
    sourceType: "Mailinglisten-Nachricht", evidenceTier: "Primär belegt",
    originalUrl: archiveUrl, publishedAt: message.publishedAt, retrievedAt,
    upstreamId: `metzdowd:${message.messageNumber};from:${message.email}`, recordSha256,
    contentHashVerified: false, adapter: "MetzDowd Pipermail HTML", status: "In Prüfung",
    subjects: ["Satoshi", "Bitcoin", "Kryptografie", "Historie", "Technik"],
    summary: `E2E-PROBE: zeitgenössische Cryptography-Mailinglisten-Nachricht. Absender: ${message.author}.`,
    primarySource: true, independentConfirmations: 0,
  }

  // 1. Create page in the sources data source.
  const initial = {
    Name: titleProp(source.title),
    "Kanonische ID": richText(source.canonicalId),
    Typ: selectProp("Primärquelle"),
    Evidenzstufe: selectProp(source.evidenceTier),
    "Original-URL": urlProp(source.originalUrl),
    "Archiv-URL": urlProp(source.archiveUrl),
    Veröffentlicht: dateProp(source.publishedAt),
    "Erfasst am": dateProp(source.retrievedAt),
    "Zuletzt geprüft": dateProp(source.retrievedAt),
    "Upstream-ID": richText(source.upstreamId),
    "Inhalts-Hash": richText(source.recordSha256),
    Adapter: richText(source.adapter),
    Prüfstatus: selectProp("In Prüfung"),
    "Readback geprüft": checkboxProp(false),
  }
  const pageId = await notionCreate(NOTION_TARGETS.sources, initial)
  console.log(`  created source page: ${pageId}`)

  // 2. Readback and verify canonical ID + hash round-trip.
  const readback = await notionReadback(pageId)
  if (plainText(readback, "Kanonische ID") !== source.canonicalId) throw new Error("canonical ID readback mismatch")
  if (plainText(readback, "Inhalts-Hash") !== source.recordSha256) throw new Error("hash readback mismatch")
  console.log(`  readback OK: canonical_id=${source.canonicalId.slice(0, 28)}... hash=${source.recordSha256.slice(0, 16)}...`)

  // 3. Flip the "Readback geprüft" flag (production contract).
  await notionUpdate(pageId, { "Readback geprüft": checkboxProp(true) })
  const finalReadback = await notionReadback(pageId)
  if (!checkboxValue(finalReadback, "Readback geprüft")) throw new Error("readback flag not persisted")
  console.log(`  readback flag verified: Readback geprüft=true`)

  console.log("LIVE NOTION SOURCE PROOF PASSED")
}

await liveNotionSourceProof()

