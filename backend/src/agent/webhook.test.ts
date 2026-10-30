import { test } from "node:test";
import assert from "node:assert/strict";
import { dropAlertMessage, type DropAlert } from "./webhook.js";

const ALERT: DropAlert = {
  itemId: "1",
  title: "Keychron K3",
  retailer: "Amazon",
  emoji: "⌨️",
  oldPrice: 99,
  newPrice: 79,
  targetPrice: 80,
  currency: "USD",
  autoBuy: true,
};

test("dropAlertMessage: carries the approval link for a one-tap checkout", () => {
  const text = dropAlertMessage({ ...ALERT, approvalUrl: "https://paypal.example/approve/1" });
  assert.match(text, /approve in one tap: https:\/\/paypal\.example\/approve\/1/);
  assert.match(text, /held in cart/);
});

test("dropAlertMessage: no link when no order was pre-created", () => {
  const text = dropAlertMessage(ALERT);
  assert.doesNotMatch(text, /approve in one tap/);
  assert.match(text, /hit target at Amazon/);
});

test("dropAlertMessage: a non-auto-buy drop never advertises checkout", () => {
  const text = dropAlertMessage({ ...ALERT, autoBuy: false });
  assert.doesNotMatch(text, /held in cart/);
  assert.doesNotMatch(text, /approve/);
});
