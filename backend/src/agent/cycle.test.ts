import { test } from "node:test";
import assert from "node:assert/strict";
import { bestOffer, isDue, shouldAutoBuy } from "./cycle.js";

const NOW = new Date("2026-01-01T00:00:00Z");

test("isDue: never-checked items are due immediately", () => {
  assert.equal(isDue(undefined, 30, NOW), true);
  assert.equal(isDue(null, 30, NOW), true);
});

test("isDue: not due while the interval has not elapsed", () => {
  const checkedAt = new Date(NOW.getTime()); // checked just now
  assert.equal(isDue(checkedAt, 30, NOW), false); // just checked -> not due
  assert.equal(
    isDue(checkedAt, 30, new Date(NOW.getTime() + 29_999)),
    false,
  );
  // the exact boundary (lastCheckedAt + interval == now) is due (<=)
  assert.equal(
    isDue(checkedAt, 30, new Date(NOW.getTime() + 30_000)),
    true,
  );
});

test("isDue: respects a longer poll interval than the global cycle", () => {
  // checked 31s ago: a 30s item is due, a 600s item is not
  const checkedAt = new Date(NOW.getTime() - 31_000);
  assert.equal(isDue(checkedAt, 30, NOW), true);
  assert.equal(isDue(checkedAt, 600, NOW), false);
});

test("isDue: item due once its interval has fully elapsed", () => {
  const checkedAt = new Date(NOW.getTime() - 31_000);
  assert.equal(isDue(checkedAt, 30, NOW), true);
});

test("bestOffer: the cheapest offer wins", () => {
  const best = bestOffer([
    { retailer: "Amazon", price: 328 },
    { retailer: "BestBuy", price: 319 },
    { retailer: "Walmart", price: 341 },
  ]);
  assert.equal(best?.retailer, "BestBuy");
  assert.equal(best?.price, 319);
});

test("bestOffer: ties keep the first offer seen", () => {
  const best = bestOffer([
    { retailer: "Amazon", price: 300 },
    { retailer: "Walmart", price: 300 },
  ]);
  assert.equal(best?.retailer, "Amazon");
});

test("shouldAutoBuy: fresh drop at target buys when in stock", () => {
  assert.equal(
    shouldAutoBuy({
      autoBuy: true,
      hitTarget: true,
      freshDrop: true,
      restocked: false,
      inStock: true,
    }),
    true,
  );
});

test("shouldAutoBuy: sold out at target holds off", () => {
  assert.equal(
    shouldAutoBuy({
      autoBuy: true,
      hitTarget: true,
      freshDrop: true,
      restocked: false,
      inStock: false,
    }),
    false,
  );
});

test("shouldAutoBuy: restock while still at target retries the missed buy", () => {
  // the item sold out at target: status stays `drop`, so `freshDrop` is false
  // on every later cycle — without the restock leg the buy never happens
  assert.equal(
    shouldAutoBuy({
      autoBuy: true,
      hitTarget: true,
      freshDrop: false,
      restocked: true,
      inStock: true,
    }),
    true,
  );
});

test("shouldAutoBuy: no buy without autoBuy, target, or stock", () => {
  const base = {
    hitTarget: true,
    freshDrop: false,
    restocked: true,
    inStock: true,
  };
  assert.equal(shouldAutoBuy({ ...base, autoBuy: false }), false);
  assert.equal(
    shouldAutoBuy({ ...base, autoBuy: true, hitTarget: false }),
    false,
  );
  assert.equal(shouldAutoBuy({ ...base, autoBuy: true, inStock: false }), false);
  // still above target after the restock: report it, but buy nothing
  assert.equal(
    shouldAutoBuy({ ...base, autoBuy: true, restocked: true, hitTarget: false }),
    false,
  );
  // in stock again but not at target and not a fresh drop → nothing
  assert.equal(
    shouldAutoBuy({
      ...base,
      autoBuy: true,
      restocked: false,
      freshDrop: false,
    }),
    false,
  );
});

test("bestOffer: unusable prices are skipped, never invented", () => {
  assert.equal(bestOffer([]), null);
  assert.equal(bestOffer([{ retailer: "Amazon", price: 0 }]), null);
  assert.equal(bestOffer([{ retailer: "Amazon", price: Number.NaN }]), null);
  // a bad price does not hide a real one behind it
  assert.equal(
    bestOffer([
      { retailer: "Amazon", price: 0 },
      { retailer: "Walmart", price: 250 },
    ])?.retailer,
    "Walmart",
  );
});
