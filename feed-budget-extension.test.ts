import assert from "node:assert/strict"
import test from "node:test"

import { FEED_BATCH_SIZE, FEED_VISIBLE_LIMIT, planFeedWindow } from "./src/runtime-feed-budget-extension.js"

test("feed lane stays comfortably below the free-worker batch ceiling", () => {
  assert.equal(FEED_BATCH_SIZE, 8)
  assert.equal(FEED_VISIBLE_LIMIT, 25)
})

test("feed batching advances by offset instead of dropping items 9 through 25", () => {
  const first = planFeedWindow({ feedIndex: 0, itemOffset: 0 }, 25, 3)
  assert.deepEqual({ start: first.start, end: first.end }, { start: 0, end: 8 })
  assert.deepEqual(first.nextState, { feedIndex: 0, itemOffset: 8 })
  assert.equal(first.hasMore, true)

  const second = planFeedWindow(first.nextState, 25, 3)
  assert.deepEqual({ start: second.start, end: second.end }, { start: 8, end: 16 })
  assert.deepEqual(second.nextState, { feedIndex: 0, itemOffset: 16 })

  const third = planFeedWindow(second.nextState, 25, 3)
  assert.deepEqual({ start: third.start, end: third.end }, { start: 16, end: 24 })
  assert.deepEqual(third.nextState, { feedIndex: 0, itemOffset: 24 })

  const fourth = planFeedWindow(third.nextState, 25, 3)
  assert.deepEqual({ start: fourth.start, end: fourth.end }, { start: 24, end: 25 })
  assert.deepEqual(fourth.nextState, { feedIndex: 1, itemOffset: 0 })
  assert.equal(fourth.hasMore, true)
})

test("finishing the last feed wraps cleanly and reports cycle completion", () => {
  const plan = planFeedWindow({ feedIndex: 2, itemOffset: 24 }, 25, 3)
  assert.deepEqual({ start: plan.start, end: plan.end }, { start: 24, end: 25 })
  assert.deepEqual(plan.nextState, { feedIndex: 0, itemOffset: 0 })
  assert.equal(plan.hasMore, false)
})

test("short or empty feeds advance without inventing records", () => {
  const short = planFeedWindow({ feedIndex: 0 }, 3, 2)
  assert.deepEqual({ start: short.start, end: short.end }, { start: 0, end: 3 })
  assert.deepEqual(short.nextState, { feedIndex: 1, itemOffset: 0 })

  const empty = planFeedWindow({ feedIndex: 1 }, 0, 2)
  assert.deepEqual({ start: empty.start, end: empty.end }, { start: 0, end: 0 })
  assert.deepEqual(empty.nextState, { feedIndex: 0, itemOffset: 0 })
  assert.equal(empty.hasMore, false)
})
