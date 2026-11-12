import { test } from "node:test";
import assert from "node:assert/strict";
import { priceRangeFor } from "./range.js";

test("priceRangeFor: fewer than four points is not enough history", () => {
  assert.equal(priceRangeFor([100, 90, 95], 95), null);
  assert.equal(priceRangeFor([], 100), null);
});

test("priceRangeFor: flat series sits at its own low", () => {
  const range = priceRangeFor([100, 100, 100, 100], 100);
  assert.ok(range);
  assert.equal(range.low, 100);
  assert.equal(range.high, 100);
  assert.equal(range.aboveLowPct, 0);
  assert.equal(range.points, 4);
});

test("priceRangeFor: current above the low reports the gap", () => {
  const range = priceRangeFor([80, 90, 100, 100], 100);
  assert.ok(range);
  assert.equal(range.low, 80);
  assert.equal(range.high, 100);
  assert.equal(range.aboveLowPct, 25);
});

test("priceRangeFor: a live price below the series becomes the low", () => {
  const range = priceRangeFor([80, 90, 100, 100], 70);
  assert.ok(range);
  assert.equal(range.low, 70);
  assert.equal(range.high, 100);
  assert.equal(range.aboveLowPct, 0);
});

test("priceRangeFor: unusable points and prices are ignored", () => {
  assert.equal(priceRangeFor([Number.NaN, 0, -5, 100], 100), null);
  const range = priceRangeFor([Number.NaN, 50, 80, 90, 100], 100);
  assert.ok(range);
  assert.equal(range.low, 50);
  assert.equal(range.points, 4);
  assert.equal(priceRangeFor([50, 60, 70, 80], 0), null);
});
