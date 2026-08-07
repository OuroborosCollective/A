import fs from "node:fs/promises"

import { sha256Hex, stableJson } from "./domain/hash.js"

interface AnalysisFixture {
  fixtureVersion: "analysis-evidence-v1"
  taskId: string
  executor: "research" | "wolfram"
  status: "done" | "blocked"
  resultSummary: string
  method: string
  reproducibleInput: string
  evidenceRefs: string[]
  expected?: Record<string, string>
  truthBoundary?: string
}

interface AnalysisClaimResponse {
  taskId: string
  leaseId: string
  executor: "research" | "wolfram"
  claimedAt: string
  expiresAt: string
}

interface AnalysisResultResponse {
  taskId: string
  executor: "research" | "wolfram"
  status: "done" | "blocked"
  resultSummary: string
  method: string
  reproducibleInput: string
  evidenceRefs: string[]
  resultSha256: string
  completedAt: string
}

interface AnalysisPublicationResponse {
  taskId: string
  resultSha256: string
  notionPageId: string
  notionReadbackAt: string
  reused: boolean
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function validateFixturePath(value: string | undefined): string {
  if (!value || !/^\.deploy\/analysis-fixtures\/[A-Za-z0-9._-]+\.json$/.test(value)) {
    throw new Error("analysis fixture must match .deploy/analysis-fixtures/<safe-name>.json")
  }
  return value
}

function boundedString(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new Error(`${name} exceeds ${max} characters`)
  return trimmed
}

function parseFixture(raw: unknown): AnalysisFixture {
  if (!raw || typeof raw !== "object") throw new Error("analysis fixture must be an object")
  const value = raw as Record<string, unknown>
  if (value.fixtureVersion !== "analysis-evidence-v1") throw new Error("unsupported analysis fixture version")
  if (value.executor !== "research" && value.executor !== "wolfram") throw new Error("fixture executor must be research or wolfram")
  if (value.status !== "done" && value.status !== "blocked") throw new Error("fixture status must be done or blocked")
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length === 0 || value.evidenceRefs.length > 20) {
    throw new Error("fixture evidenceRefs must contain 1..20 entries")
  }
  return {
    fixtureVersion: "analysis-evidence-v1",
    taskId: boundedString(value.taskId, "taskId", 500),
    executor: value.executor,
    status: value.status,
    resultSummary: boundedString(value.resultSummary, "resultSummary", 8000),
    method: boundedString(value.method, "method", 4000),
    reproducibleInput: boundedString(value.reproducibleInput, "reproducibleInput", 8000),
    evidenceRefs: value.evidenceRefs.map((ref, index) => boundedString(ref, `evidenceRefs[${index}]`, 1000)),
    expected: value.expected && typeof value.expected === "object" ? value.expected as Record<string, string> : undefined,
    truthBoundary: typeof value.truthBoundary === "string" ? value.truthBoundary : undefined,
  }
}

async function expectedResultSha256(fixture: AnalysisFixture): Promise<string> {
  return sha256Hex(stableJson({
    taskId: fixture.taskId,
    executor: fixture.executor,
    status: fixture.status,
    resultSummary: fixture.resultSummary,
    method: fixture.method,
    reproducibleInput: fixture.reproducibleInput,
    evidenceRefs: fixture.evidenceRefs,
  }))
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`non-JSON response status=${response.status} body=${text.slice(0, 500)}`)
  }
}

async function getResult(workerUrl: string, token: string, taskId: string): Promise<AnalysisResultResponse | null> {
  const response = await fetch(`${workerUrl}/analysis/result?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 404) return null
  const body = await responseJson(response)
  if (!response.ok) throw new Error(`analysis result read failed status=${response.status} error=${String(body.error ?? "unknown")}`)
  return body as unknown as AnalysisResultResponse
}

async function postJson(workerUrl: string, token: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${workerUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const payload = await responseJson(response)
  if (!response.ok) throw new Error(`${path} failed status=${response.status} error=${String(payload.error ?? "unknown")}`)
  return payload
}

async function verifyResult(fixture: AnalysisFixture, result: AnalysisResultResponse): Promise<string> {
  const expectedSha = await expectedResultSha256(fixture)
  const comparisons: Array<[string, unknown, unknown]> = [
    ["taskId", result.taskId, fixture.taskId],
    ["executor", result.executor, fixture.executor],
    ["status", result.status, fixture.status],
    ["resultSummary", result.resultSummary, fixture.resultSummary],
    ["method", result.method, fixture.method],
    ["reproducibleInput", result.reproducibleInput, fixture.reproducibleInput],
    ["evidenceRefs", stableJson(result.evidenceRefs), stableJson(fixture.evidenceRefs)],
    ["resultSha256", result.resultSha256, expectedSha],
  ]
  for (const [name, actual, expected] of comparisons) {
    if (actual !== expected) throw new Error(`analysis result ${name} mismatch`)
  }
  if (!/^[0-9a-f]{64}$/.test(result.resultSha256)) throw new Error("analysis result SHA-256 format invalid")
  if (!result.completedAt) throw new Error("analysis result completedAt missing")
  return expectedSha
}

async function publishAndVerify(workerUrl: string, token: string, fixture: AnalysisFixture, expectedSha: string): Promise<AnalysisPublicationResponse> {
  const publication = await postJson(workerUrl, token, "/analysis/publish", { taskId: fixture.taskId }) as unknown as AnalysisPublicationResponse
  if (publication.taskId !== fixture.taskId) throw new Error("analysis publication taskId mismatch")
  if (publication.resultSha256 !== expectedSha) throw new Error("analysis publication SHA-256 mismatch")
  if (!publication.notionPageId) throw new Error("analysis publication notionPageId missing")
  if (!publication.notionReadbackAt) throw new Error("analysis publication notionReadbackAt missing")
  return publication
}

export async function runAnalysisEvidence(fixturePath: string): Promise<void> {
  const workerUrl = requiredEnv("WORKER_URL").replace(/\/$/, "")
  const token = requiredEnv("ADMIN_TOKEN")
  const raw = JSON.parse(await fs.readFile(validateFixturePath(fixturePath), "utf8")) as unknown
  const fixture = parseFixture(raw)

  const existing = await getResult(workerUrl, token, fixture.taskId)
  if (existing) {
    const sha = await verifyResult(fixture, existing)
    const publication = await publishAndVerify(workerUrl, token, fixture, sha)
    console.log(`analysis evidence reused task=${fixture.taskId} status=${fixture.status} sha256=${sha} notion_page=${publication.notionPageId} publication_reused=${publication.reused}`)
    return
  }

  let claim: AnalysisClaimResponse | null = null
  try {
    claim = await postJson(workerUrl, token, "/analysis/claim", {
      taskId: fixture.taskId,
      executor: fixture.executor,
      leaseMinutes: 15,
    }) as unknown as AnalysisClaimResponse
    if (!claim.leaseId || claim.taskId !== fixture.taskId || claim.executor !== fixture.executor) {
      throw new Error("analysis claim readback mismatch")
    }

    const completion = await postJson(workerUrl, token, "/analysis/complete", {
      taskId: fixture.taskId,
      leaseId: claim.leaseId,
      executor: fixture.executor,
      status: fixture.status,
      resultSummary: fixture.resultSummary,
      method: fixture.method,
      reproducibleInput: fixture.reproducibleInput,
      evidenceRefs: fixture.evidenceRefs,
    }) as unknown as AnalysisResultResponse
    await verifyResult(fixture, completion)

    const readback = await getResult(workerUrl, token, fixture.taskId)
    if (!readback) throw new Error("analysis result missing after completion")
    const sha = await verifyResult(fixture, readback)
    const publication = await publishAndVerify(workerUrl, token, fixture, sha)
    console.log(`analysis evidence completed task=${fixture.taskId} status=${fixture.status} sha256=${sha} notion_page=${publication.notionPageId} publication_reused=${publication.reused}`)
    claim = null
  } catch (error) {
    if (claim?.leaseId) {
      try {
        await postJson(workerUrl, token, "/analysis/release", { taskId: fixture.taskId, leaseId: claim.leaseId })
      } catch (releaseError) {
        console.error(`analysis lease release also failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`)
      }
    }
    throw error
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runAnalysisEvidence(process.argv[2] ?? "").catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
