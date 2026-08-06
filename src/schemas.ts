import { notionIcon, type SyncChangeUpsert } from "@notionhq/workers"
import * as Builder from "@notionhq/workers/builder"
import * as Schema from "@notionhq/workers/schema"

import type { HypeSignal, ResearchSource } from "./domain/types.js"

export const SOURCE_PRIMARY_KEY = "Canonical ID"
export const SIGNAL_PRIMARY_KEY = "Signal ID"

export const sourceSchema = {
  databaseIcon: notionIcon("document"),
  properties: {
    Quelle: Schema.title(),
    "Canonical ID": Schema.richText(),
    Lane: Schema.select([]),
    "Quellentyp": Schema.select([]),
    "Evidenzstufe": Schema.select([
      { name: "Primär belegt", color: "green" },
      { name: "Unabhängig archiviert", color: "blue" },
      { name: "Unabhängig bestätigt", color: "green" },
      { name: "Zeitgenössisch berichtet", color: "yellow" },
      { name: "Behauptet", color: "orange" },
      { name: "Spekulativ", color: "red" },
      { name: "Widerlegt", color: "red" },
      { name: "Unprüfbar", color: "gray" },
    ]),
    "Original URL": Schema.url(),
    "Archiv URL": Schema.url(),
    "Veröffentlicht": Schema.date(),
    "Abgerufen": Schema.date(),
    "Upstream ID": Schema.richText(),
    "Upstream Digest": Schema.richText(),
    "Record SHA-256": Schema.richText(),
    "Content-Hash verifiziert": Schema.checkbox(),
    Adapter: Schema.select([]),
    Status: Schema.select([
      { name: "Erfasst", color: "blue" },
      { name: "In Prüfung", color: "yellow" },
      { name: "Blockiert", color: "red" },
    ]),
    Themen: Schema.multiSelect([]),
    Zusammenfassung: Schema.richText(),
    Primärquelle: Schema.checkbox(),
    "Unabhängige Bestätigungen": Schema.number(),
  },
} satisfies Schema.Schema<typeof SOURCE_PRIMARY_KEY>

export const signalSchema = {
  databaseIcon: notionIcon("star"),
  properties: {
    Signal: Schema.title(),
    "Signal ID": Schema.richText(),
    Quelle: Schema.richText(),
    "Quellen-URL": Schema.url(),
    "Veröffentlicht": Schema.date(),
    "Abgerufen": Schema.date(),
    Zusammenfassung: Schema.richText(),
    Schlüsselwörter: Schema.multiSelect([]),
    "Hype Score": Schema.number(),
    "Primärevidenz-Anzahl": Schema.number(),
    "Hype-Evidence-Gap": Schema.checkbox(),
    "Record SHA-256": Schema.richText(),
    Adapter: Schema.select([]),
  },
} satisfies Schema.Schema<typeof SIGNAL_PRIMARY_KEY>

export function sourceToChange(
  source: ResearchSource
): SyncChangeUpsert<typeof SOURCE_PRIMARY_KEY, typeof sourceSchema.properties> {
  return {
    type: "upsert",
    key: source.canonicalId,
    upstreamUpdatedAt: source.publishedAt ?? source.retrievedAt,
    properties: {
      Quelle: Builder.title(source.title),
      "Canonical ID": Builder.richText(source.canonicalId),
      Lane: Builder.select(source.lane),
      "Quellentyp": Builder.select(source.sourceType),
      "Evidenzstufe": Builder.select(source.evidenceTier),
      "Original URL": Builder.url(source.originalUrl),
      "Archiv URL": source.archiveUrl ? Builder.url(source.archiveUrl) : [],
      "Veröffentlicht": source.publishedAt ? Builder.dateTime(source.publishedAt) : [],
      "Abgerufen": Builder.dateTime(source.retrievedAt),
      "Upstream ID": Builder.richText(source.upstreamId),
      "Upstream Digest": source.upstreamDigest ? Builder.richText(source.upstreamDigest) : [],
      "Record SHA-256": Builder.richText(source.recordSha256),
      "Content-Hash verifiziert": Builder.checkbox(source.contentHashVerified),
      Adapter: Builder.select(source.adapter),
      Status: Builder.select(source.status),
      Themen: source.subjects.length ? Builder.multiSelect(...source.subjects) : [],
      Zusammenfassung: source.summary ? Builder.richText(source.summary.slice(0, 1900)) : [],
      Primärquelle: Builder.checkbox(source.primarySource),
      "Unabhängige Bestätigungen": Builder.number(source.independentConfirmations),
    },
    pageContentMarkdown: sourcePageContent(source),
  }
}

export function signalToChange(
  signal: HypeSignal
): SyncChangeUpsert<typeof SIGNAL_PRIMARY_KEY, typeof signalSchema.properties> {
  return {
    type: "upsert",
    key: signal.signalId,
    upstreamUpdatedAt: signal.publishedAt ?? signal.retrievedAt,
    properties: {
      Signal: Builder.title(signal.title),
      "Signal ID": Builder.richText(signal.signalId),
      Quelle: Builder.richText(signal.source),
      "Quellen-URL": Builder.url(signal.sourceUrl),
      "Veröffentlicht": signal.publishedAt ? Builder.dateTime(signal.publishedAt) : [],
      "Abgerufen": Builder.dateTime(signal.retrievedAt),
      Zusammenfassung: signal.summary ? Builder.richText(signal.summary.slice(0, 1900)) : [],
      Schlüsselwörter: signal.keywords.length ? Builder.multiSelect(...signal.keywords) : [],
      "Hype Score": Builder.number(signal.hypeScore),
      "Primärevidenz-Anzahl": Builder.number(signal.primaryEvidenceCount),
      "Hype-Evidence-Gap": Builder.checkbox(signal.evidenceGap),
      "Record SHA-256": Builder.richText(signal.recordSha256),
      Adapter: Builder.select(signal.adapter),
    },
  }
}

function sourcePageContent(source: ResearchSource): string {
  return [
    "## Provenienz",
    `- Adapter: ${source.adapter}`,
    `- Upstream-ID: ${source.upstreamId}`,
    `- Original: ${source.originalUrl}`,
    source.archiveUrl ? `- Archiv: ${source.archiveUrl}` : "- Archiv: nicht erfasst",
    `- Record SHA-256: \`${source.recordSha256}\``,
    `- Inhalts-Hash verifiziert: ${source.contentHashVerified ? "ja" : "nein"}`,
    "",
    "## Zusammenfassung",
    source.summary || "Keine Zusammenfassung verfügbar.",
    "",
    "> Der Record-Hash belegt den normalisierten Metadatensatz. Er ist nur dann ein Inhalts-Hash, wenn „Content-Hash verifiziert“ ausdrücklich auf ja steht.",
  ].join("\n")
}
