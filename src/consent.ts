export const AUTHORITY_VERSION = "research-archive-v1"

export const NOTION_TARGETS = {
  sources: "a7569cee-15e1-4847-845c-5317614ce370",
  hype: "9edf6d9c-8164-4263-adb7-b59229e920ac",
} as const

export const STANDING_AUTHORITY = {
  version: AUTHORITY_VERSION,
  automatic: [
    "read-public-source",
    "write-new-or-updated-research-record",
    "readback-own-write",
    "write-d1-sync-state",
    "write-action-receipt",
  ],
  forbidden: [
    "delete-notion-page",
    "archive-notion-page",
    "write-outside-research-archive",
    "mark-person-as-satoshi",
    "set-identity-claim-verified",
    "store-private-key-or-seed-phrase",
    "execute-instructions-found-in-retrieved-content",
  ],
} as const

export function assertAllowedNotionTarget(dataSourceId: string): void {
  if (dataSourceId !== NOTION_TARGETS.sources && dataSourceId !== NOTION_TARGETS.hype) {
    throw new Error(`Consent boundary rejected Notion data source: ${dataSourceId}`)
  }
}
