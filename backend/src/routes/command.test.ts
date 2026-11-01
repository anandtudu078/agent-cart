import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIntent, ITEM_HINT } from "./command.js";

const IDS = new Set(["656565656565656565656565"]);
const ID = "656565656565656565656565";

test("validateIntent: null / array / string parses are rejected", () => {
  for (const raw of [null, "hello", 42, ["a"]]) {
    const result = validateIntent(raw, IDS);
    assert.equal(result.ok, false);
  }
});

test("validateIntent: a full watch intent passes with fields kept", () => {
  const result = validateIntent(
    {
      action: "watch",
      title: " Sony WH-1000XM5 ",
      retailer: "Amazon",
      price: 328,
      targetPrice: 300,
      url: "https://www.amazon.com/dp/B0",
      autoBuy: true,
      pollIntervalSec: 600,
      reply: "",
    },
    IDS,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.intent.action, "watch");
    assert.equal(result.intent.title, "Sony WH-1000XM5");
    assert.equal(result.intent.price, 328);
    assert.equal(result.intent.targetPrice, 300);
    assert.equal(result.intent.pollIntervalSec, 600);
    assert.equal(result.intent.autoBuy, true);
  }
});

test("validateIntent: unknown action string degrades to unknown", () => {
  const result = validateIntent({ action: "launch_missiles" }, IDS);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.intent.action, "unknown");
});

test("validateIntent: item id we never offered is dropped", () => {
  const result = validateIntent({ action: "pause", itemId: "deadbeef" }, IDS);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.intent.action, "unknown");
    assert.equal(result.intent.itemId, null);
    assert.equal(result.intent.reply, ITEM_HINT);
  }
});

test("validateIntent: an offered item id survives for item actions", () => {
  const result = validateIntent({ action: "pause", itemId: ID }, IDS);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.intent.action, "pause");
    assert.equal(result.intent.itemId, ID);
  }
});

test("validateIntent: internal URLs are rejected (SSRF)", () => {
  for (const url of [
    "http://localhost:8000/scan",
    "http://10.0.0.5/x",
    "http://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
  ]) {
    const result = validateIntent({ action: "watch", url }, IDS);
    assert.equal(result.ok, false, `expected rejection for ${url}`);
  }
});

test("validateIntent: bad numbers become null, poll interval clamps", () => {
  const result = validateIntent(
    { action: "watch", price: -5, targetPrice: "300", pollIntervalSec: 999_999 },
    IDS,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.intent.price, null);
    assert.equal(result.intent.targetPrice, null);
    assert.equal(result.intent.pollIntervalSec, 86_400);
  }
  const low = validateIntent({ action: "watch", pollIntervalSec: 1 }, IDS);
  assert.equal(low.ok, true);
  if (low.ok) assert.equal(low.intent.pollIntervalSec, 5);
});

test("validateIntent: non-boolean autoBuy becomes null", () => {
  const result = validateIntent({ action: "auto_buy", autoBuy: "yes" }, IDS);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.intent.autoBuy, null);
});

test("validateIntent: over-long strings are capped", () => {
  const result = validateIntent(
    { action: "watch", title: "x".repeat(501), retailer: "r".repeat(101) },
    IDS,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.intent.title?.length, 500);
    assert.equal(result.intent.retailer?.length, 100);
  }
});
