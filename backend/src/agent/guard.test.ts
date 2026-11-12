import { test } from "node:test";
import assert from "node:assert/strict";
import { autoBuyHoldReason, heldBuyExpiresAt, HELD_BUY_TTL_MS } from "./guard.js";

const base = {
  confirmBeforeBuy: false,
  dailyCapUsd: 0,
  spentTodayUsd: 0,
  price: 100,
  discount: 0,
};

test("heldBuyExpiresAt: a hold lasts exactly one day", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(HELD_BUY_TTL_MS, 24 * 60 * 60 * 1_000);
  assert.equal(
    heldBuyExpiresAt(now).toISOString(),
    "2026-01-02T00:00:00.000Z",
  );
});

test("autoBuyHoldReason: no guardrails set → allowed", () => {
  assert.equal(autoBuyHoldReason(base), null);
});

test("autoBuyHoldReason: confirm-before-buy holds every reserve", () => {
  const reason = autoBuyHoldReason({ ...base, confirmBeforeBuy: true });
  assert.ok(reason?.includes("confirm-before-buy"));
});

test("autoBuyHoldReason: cap 0 means unlimited", () => {
  assert.equal(
    autoBuyHoldReason({ ...base, dailyCapUsd: 0, spentTodayUsd: 9_999 }),
    null,
  );
});

test("autoBuyHoldReason: within the cap is allowed", () => {
  assert.equal(
    autoBuyHoldReason({ ...base, dailyCapUsd: 200, spentTodayUsd: 99 }),
    null,
  );
});

test("autoBuyHoldReason: exceeding the cap is held with the numbers in the reason", () => {
  const reason = autoBuyHoldReason({
    ...base,
    dailyCapUsd: 150,
    spentTodayUsd: 75,
    price: 100,
    discount: 10,
  });
  // 75 + 90 = 165 > 150 → held; the coupon discount lowers the total
  assert.ok(reason?.includes("$150.00"));
  assert.ok(reason?.includes("$75.00"));
});

test("autoBuyHoldReason: exact fit at the cap is allowed", () => {
  assert.equal(
    autoBuyHoldReason({ ...base, dailyCapUsd: 100, spentTodayUsd: 0, price: 100 }),
    null,
  );
});

test("autoBuyHoldReason: coupon discount counts toward the cap", () => {
  assert.equal(
    autoBuyHoldReason({
      ...base,
      dailyCapUsd: 100,
      spentTodayUsd: 0,
      price: 100,
      discount: 20,
    }),
    null,
  );
});
