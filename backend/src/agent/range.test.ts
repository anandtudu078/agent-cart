import { test } from "node:test";
import assert from "node:assert/strict";
import { priceRangeFrom } from "./range.js";

test("priceRangeFrom: fewer than four points is not enough history", () => {
  assert.equal(priceRangeFrom({ low: 90, high: 100, points: 3 }, 95), null);
  assert.equal(priceRangeFrom({ low: 0, high: 0, points: 0 }, 100), null);
});

test("priceRangeFrom: flat history sits at its own low", () => {
  const range = priceRangeFrom({ low: 100, high: 100, points: 40 }, 100);
  assert.ok(range);
  assert.equal(range.low, 100);
  assert.equal(range.high, 100);
  assert.equal(range.aboveLowPct, 0);
  assert.equal(range.points, 40);
});

test("priceRangeFrom: current above the low reports the gap", () => {
  const range = priceRangeFrom({ low: 80, high: 120, points: 60 }, 100);
  assert.ok(range);
  assert.equal(range.low, 80);
  assert.equal(range.high, 120);
  assert.equal(range.aboveLowPct, 25);
});

test("priceRangeFrom: a live price below the observed low becomes the low", () => {
  const range = priceRangeFrom({ low: 80, high: 100, points: 60 }, 70);
  assert.ok(range);
  assert.equal(range.low, 70);
  assert.equal(range.high, 100);
  assert.equal(range.aboveLowPct, 0);
  // point count stays the observed count, not observed + current
  assert.equal(range.points, 60);
});

test("priceRangeFrom: unusable inputs are rejected, never guessed", () => {
  assert.equal(priceRangeFrom({ low: 0, high: 100, points: 10 }, 100), null);
  assert.equal(priceRangeFrom({ low: 50, high: 0, points: 10 }, 100), null);
  assert.equal(
    priceRangeFrom({ low: 50, high: 100, points: Number.NaN }, 100),
    null,
  );
  assert.equal(priceRangeFrom({ low: 50, high: 100, points: 10 }, 0), null);
});
