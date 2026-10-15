// node --experimental-strip-types --test tests/user-intent.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { createIntentGate, USER_INTENT_MS } from "../src/views/room-page/tools/user-intent.ts"

const gate = () => {
  let t = 1000
  const g = createIntentGate(() => t)
  return { ...g, tick: (ms: number) => { t += ms } }
}

test("blocks: system pause with no user action is not broadcast", () => {
  assert.equal(gate().take(), false)
})

test("allows: user click then its player event is broadcast", () => {
  const g = gate()
  g.mark()
  g.tick(2000)   // 缓冲后才触发 playing
  assert.equal(g.take(), true)
})

test("blocks: second event after one click (seek -> buffering playing echo)", () => {
  const g = gate()
  g.mark()
  assert.equal(g.take(), true)
  assert.equal(g.take(), false)
})

test("blocks: stale click older than the intent window", () => {
  const g = gate()
  g.mark()
  g.tick(USER_INTENT_MS)
  assert.equal(g.take(), false)
})
