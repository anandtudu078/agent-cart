import { test } from "node:test";
import assert from "node:assert/strict";

import { trendFor } from "./trend.js";

test("trendFor: not enough usable history is insufficient", () => {
  assert.deepEqual(trendFor([]), { verdict: "insufficient", changePct: 0 });
  assert.equal(trendFor([10, 9, 8]).verdict, "insufficient");
  // unusable numbers don't count as history
  assert.equal(trendFor([10, Number.NaN, 9, 8]).verdict, "insufficient");
  // a free item has no direction to read
  assert.equal(trendFor([0, 0, 0, 0]).verdict, "insufficient");
});

test("trendFor: falling and rising series read their own direction", () => {
  const down = trendFor([100, 98, 99, 96, 94, 92, 93, 90]);
  assert.equal(down.verdict, "falling");
  assert.equal(down.changePct, -6.1);

  const up = trendFor([90, 93, 92, 94, 96, 99, 98, 100]);
  assert.equal(up.verdict, "rising");
  assert.equal(up.changePct, 6.5);
});

test("trendFor: inside the ±1% dead band it is flat", () => {
  assert.equal(trendFor([100, 101, 99, 100, 101, 100]).verdict, "flat");
  assert.equal(trendFor([100, 100, 100, 100]).verdict, "flat");
});

test("trendFor: one outlier spike cannot flip the verdict", () => {
  // newer half sits at 90 apart from a single bad scrape of 500
  const trend = trendFor([100, 100, 99, 100, 90, 500, 90, 90]);
  assert.equal(trend.verdict, "falling");
  assert.equal(trend.changePct, -10);
});
