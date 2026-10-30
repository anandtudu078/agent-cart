import { test } from "node:test";
import assert from "node:assert/strict";
import { bestCoupon, couponDiscount, findCoupon, listCoupons } from "./coupons.js";

test("bestCoupon: the code that saves the most wins", () => {
  // Amazon: SAVE10 (10% = $30) vs AMAZON15 (15% = $45) vs WELCOME5 ($5)
  assert.equal(bestCoupon("Amazon", 300)?.code, "AMAZON15");
});

test("bestCoupon: falls back to site-wide codes at an unknown retailer", () => {
  // Walmart has no retailer code — SAVE10 ($30) beats WELCOME5 ($5)
  assert.equal(bestCoupon("Walmart", 300)?.code, "SAVE10");
});

test("bestCoupon: a retailer-only code is never used elsewhere", () => {
  const codes = listCoupons("Best Buy").map((coupon) => coupon.code);
  assert.equal(codes.includes("KEYCHRON10"), false);
  assert.equal(findCoupon("KEYCHRON10", "Best Buy"), null);
});

test("bestCoupon: returns null when nothing beats zero", () => {
  // a $0 price makes every code worthless — applying one would be noise
  assert.equal(bestCoupon("Amazon", 0), null);
  assert.equal(bestCoupon("Walmart", 0), null);
});

test("bestCoupon: ties keep the first code seen", () => {
  // $50 → SAVE10 saves $5, WELCOME5 saves $5: the first one listed wins
  assert.equal(couponDiscount({ code: "SAVE10", retailer: null, kind: "percent", value: 10 }, 50), 5);
  assert.equal(bestCoupon("Walmart", 50)?.code, "SAVE10");
});
