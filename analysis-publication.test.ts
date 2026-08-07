import assert from "node:assert/strict"
import test from "node:test"

import { assertAllowedNotionTarget, NOTION_TARGETS } from "./src/consent.js"
import type { AnalysisTask } from "./src/domain/types.js"
import { analysisResultProperties, analysisTruthBoundary } from "./src/notion-analysis-results.js"

function task(kind: AnalysisTask["kind"], requiresHumanReview = false): AnalysisTask {
  return {
    taskId: `source:test:analysis:${kind}`,
    sourceCanonicalId: "cryptography-mail:0123456789abcdef0123456789abcdef",
    kind,
    executor: kind === "source-triangulation" || kind === "network-graph" ? "research" : "wolfram",
    status: "pending",
    requiresHumanReview,
    rationale: "test",
    inputSummary: "test input",
    sourceUrl: "https://example.test/source",
    createdAt: "2026-08-07T20:00:00.000Z",
  }
}

const result = {
  taskId: "source:test:analysis:temporal-analysis",
  executor: "wolfram" as const,
  status: "done" as const,
  resultSummary: "A reproducible interval was calculated.",
  method: "DateDifference over normalized UTC timestamps.",
  reproducibleInput: "a=2008-10-31T18:10:00Z;b=2009-01-03T18:15:05Z",
  evidenceRefs: ["metzdowd:014810", "bitcoin:block:0"],
  resultSha256: "e96649956b12f9826a6d1a1f9f03ca615b36261370686412d657aeed2309ee31",
  completedAt: "2026-08-07T20:23:59.716Z",
}

test("analysis-result Notion target is inside the standing consent boundary", () => {
  assert.equal(NOTION_TARGETS.analysisResults, "7a86f38f-aac0-43c5-a602-a6f5a4b28124")
  assert.doesNotThrow(() => assertAllowedNotionTarget(NOTION_TARGETS.analysisResults))
  assert.throws(() => assertAllowedNotionTarget("00000000-0000-0000-0000-000000000000"), /Consent boundary rejected/)
})

test("all runtime analysis kinds produce a bounded derived-result truth boundary", () => {
  const kinds: AnalysisTask["kind"][] = [
    "source-triangulation",
    "temporal-analysis",
    "cryptographic-statistics",
    "network-graph",
    "quantitative-analysis",
    "stylometry",
  ]
  for (const kind of kinds) {
    const text = analysisTruthBoundary(task(kind, kind === "stylometry"))
    assert.match(text, /keine Primärevidenz/i)
    assert.ok(text.length < 1000)
  }
  assert.match(analysisTruthBoundary(task("cryptographic-statistics")), /Keine Private-Key-Recovery/i)
  assert.match(analysisTruthBoundary(task("stylometry", true)), /menschliche Prüfung/i)
})

test("Notion publication properties preserve task, result hash and readback flag", () => {
  const properties = analysisResultProperties({ result, task: task("temporal-analysis") }, true) as any
  assert.equal(properties["Task-ID"].rich_text[0].text.content, result.taskId)
  assert.equal(properties["Result SHA-256"].rich_text[0].text.content, result.resultSha256)
  assert.equal(properties.Executor.select.name, "Wolfram")
  assert.equal(properties.Analysetyp.select.name, "temporal-analysis")
  assert.equal(properties.Status.select.name, "Done")
  assert.equal(properties["Readback geprüft"].checkbox, true)
  assert.equal(properties["Human Review nötig"].checkbox, false)
})
