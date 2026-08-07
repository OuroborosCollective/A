import assert from "node:assert/strict"
import test from "node:test"

import { containsSecretMaterial, validateCompletionInput } from "./src/runtime-analysis-extension.js"

const base = {
  taskId: "cryptography-mail:test:analysis:temporal-analysis",
  leaseId: "lease-test",
  executor: "wolfram" as const,
  status: "done" as const,
  resultSummary: "The event interval is 64 days, 5 minutes and 5 seconds.",
  method: "DateDifference over two UTC DateObject values.",
  reproducibleInput: "mail=2008-10-31T18:10:00Z; genesis=2009-01-03T18:15:05Z",
  evidenceRefs: ["metzdowd:014810", "bitcoin:block:0"],
}

test("normal reproducible Wolfram completion is accepted", () => {
  const result = validateCompletionInput(base)
  assert.equal(result.executor, "wolfram")
  assert.equal(result.status, "done")
  assert.equal(result.evidenceRefs.length, 2)
})

test("human-review tasks cannot be auto-finalized as done", () => {
  assert.throws(() => validateCompletionInput(base, true), /cannot be auto-finalized as done/)
  const blocked = validateCompletionInput({ ...base, status: "blocked", resultSummary: "Human review required before any identity conclusion." }, true)
  assert.equal(blocked.status, "blocked")
})

test("obvious private-key and seed material is rejected", () => {
  assert.equal(containsSecretMaterial("-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----"), true)
  assert.equal(containsSecretMaterial("xprv9s21ZrQH143K3mZp9Yd7Vx5Qw2Nn8Bc4Fj6Hs3Ke7Rt1Ua5"), true)
  assert.equal(containsSecretMaterial("ordinary public evidence and hashes only"), false)
  assert.throws(() => validateCompletionInput({ ...base, reproducibleInput: "private key: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }), /forbidden/)
})

test("completion payloads remain bounded", () => {
  assert.throws(() => validateCompletionInput({ ...base, evidenceRefs: Array.from({ length: 21 }, (_, i) => `ref-${i}`) }), /at most 20/)
  assert.throws(() => validateCompletionInput({ ...base, resultSummary: "x".repeat(8001) }), /exceeds 8000/)
})
