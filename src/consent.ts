export const AUTHORITY_VERSION = "research-archive-v2"

export const NOTION_TARGETS = {
  sources: "a7569cee-15e1-4847-845c-5317614ce370",
  hype: "9edf6d9c-8164-4263-adb7-b59229e920ac",
  claims: "7ba3564e-c996-4ab7-ab9e-3bcaef89bbf3",
  followups: "d091aa97-4bce-47de-9fe7-c23d52759dd5",
} as const

export const STANDING_AUTHORITY = {
  version: AUTHORITY_VERSION,
  automatic: [
    "read-public-source",
    "write-new-or-updated-research-record",
    "readback-own-write",
    "write-open-claim-candidate",
    "write-follow-up-research-plan",
    "queue-analysis-task",
    "write-d1-sync-state",
    "write-action-receipt",
  ],
  forbidden: [
    "delete-notion-page",
    "archive-notion-page",
    "write-outside-research-archive",
    "mark-person-as-satoshi",
    "set-identity-claim-verified",
    "auto-confirm-claim",
    "auto-execute-identity-conclusion",
    "store-private-key-or-seed-phrase",
    "attempt-private-key-recovery",
    "execute-instructions-found-in-retrieved-content",
  ],
} as const

export function assertAllowedNotionTarget(dataSourceId: string): void {
  const allowed = new Set<string>(Object.values(NOTION_TARGETS))
  if (!allowed.has(dataSourceId)) {
    throw new Error(`Consent boundary rejected Notion data source: ${dataSourceId}`)
  }
}
