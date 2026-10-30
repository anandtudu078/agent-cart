import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWatchInput } from "./watch-items.js";

test("parseWatchInput: valid minimal body passes", () => {
  const result = parseWatchInput({
    title: "Keychron K2",
    retailer: "Amazon",
    price: 99,
    targetPrice: 79,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.title, "Keychron K2");
    assert.equal(result.value.retailer, "Amazon");
    assert.equal(result.value.price, 99);
    assert.equal(result.value.targetPrice, 79);
    assert.equal(result.value.emoji, undefined);
    assert.equal(result.value.url, undefined);
    assert.equal(result.value.pollIntervalSec, undefined);
  }
});

test("parseWatchInput: retailer and price are optional (offers case)", () => {
  const result = parseWatchInput({
    title: "Keychron K2",
    targetPrice: 79,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.retailer, undefined);
    assert.equal(result.value.price, undefined);
  }
});

test("parseWatchInput: valid full body with optional fields", () => {
  const result = parseWatchInput({
    title: "  Keychron K2  ",
    retailer: "  Amazon  ",
    price: 99,
    targetPrice: 79,
    emoji: "⌨️",
    url: "https://www.amazon.com/dp/B07",
    pollIntervalSec: 60,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.title, "Keychron K2");
    assert.equal(result.value.retailer, "Amazon");
    assert.equal(result.value.emoji, "⌨️");
    assert.equal(result.value.url, "https://www.amazon.com/dp/B07");
    assert.equal(result.value.pollIntervalSec, 60);
  }
});

test("parseWatchInput: missing title is rejected", () => {
  assert.equal(parseWatchInput({ retailer: "Amazon", price: 99, targetPrice: 79 }).ok, false);
  assert.equal(parseWatchInput({ title: "", retailer: "Amazon", price: 99, targetPrice: 79 }).ok, false);
  assert.equal(parseWatchInput({ title: "   ", retailer: "Amazon", price: 99, targetPrice: 79 }).ok, false);
});

test("parseWatchInput: title as object is rejected (operator payload)", () => {
  const result = parseWatchInput({ title: { $ne: "" }, retailer: "Amazon", price: 99, targetPrice: 79 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "title is required");
  }
});

test("parseWatchInput: title over the length cap is rejected", () => {
  const result = parseWatchInput({
    title: "x".repeat(501),
    retailer: "Amazon",
    price: 99,
    targetPrice: 79,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes("title must be at most 500"));
  }
});

test("parseWatchInput: missing targetPrice is rejected", () => {
  const result = parseWatchInput({ title: "K2", retailer: "Amazon", price: 99 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes("targetPrice"));
  }
});

test("parseWatchInput: targetPrice as string is rejected", () => {
  const result = parseWatchInput({ title: "K2", retailer: "Amazon", price: 99, targetPrice: "79" });
  assert.equal(result.ok, false);
});

test("parseWatchInput: price as object is rejected (operator payload)", () => {
  const result = parseWatchInput({ title: "K2", retailer: "Amazon", price: { $ne: 1 }, targetPrice: 79 });
  assert.equal(result.ok, false);
});

test("parseWatchInput: NaN and Infinity prices are rejected", () => {
  assert.equal(
    parseWatchInput({ title: "K2", retailer: "Amazon", price: NaN, targetPrice: 79 }).ok,
    false,
  );
  assert.equal(
    parseWatchInput({ title: "K2", retailer: "Amazon", price: Infinity, targetPrice: 79 }).ok,
    false,
  );
});

test("parseWatchInput: internal URLs are rejected (SSRF)", () => {
  const cases = [
    "http://localhost:8000/scan",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/hook",
    "http://192.168.1.1/hook",
    "file:///etc/passwd",
    "ftp://example.com/x",
    "not-a-url",
  ];
  for (const url of cases) {
    const result = parseWatchInput({ title: "K2", retailer: "Amazon", price: 99, targetPrice: 79, url });
    assert.equal(result.ok, false, `expected rejection for ${url}`);
    if (!result.ok) {
      assert.equal(result.error, "url must be a public http(s) URL");
    }
  }
});

test("parseWatchInput: public URLs are accepted", () => {
  const result = parseWatchInput({
    title: "K2",
    retailer: "Amazon",
    price: 99,
    targetPrice: 79,
    url: "https://www.amazon.com/dp/B07",
  });
  assert.equal(result.ok, true);
});

test("parseWatchInput: empty url is treated as absent", () => {
  const result = parseWatchInput({
    title: "K2",
    retailer: "Amazon",
    price: 99,
    targetPrice: 79,
    url: "   ",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.url, undefined);
  }
});

test("parseWatchInput: emoji over the length cap is rejected", () => {
  const result = parseWatchInput({
    title: "K2",
    retailer: "Amazon",
    price: 99,
    targetPrice: 79,
    emoji: "🔥".repeat(17),
  });
  assert.equal(result.ok, false);
});

test("parseWatchInput: pollIntervalSec is clamped to 5..86400", () => {
  assert.equal(
    parseWatchInput({ title: "K2", retailer: "Amazon", price: 99, targetPrice: 79, pollIntervalSec: 3 }).ok,
    true,
  );
  assert.equal(
    parseWatchInput({ title: "K2", retailer: "Amazon", price: 99, targetPrice: 79, pollIntervalSec: 999999 }).ok,
    true,
  );
  const decimal = parseWatchInput({ title: "K2", retailer: "Amazon", price: 99, targetPrice: 79, pollIntervalSec: 30.9 });
  assert.equal(decimal.ok, true);
  if (decimal.ok) {
    assert.equal(decimal.value.pollIntervalSec, 30);
  }
});

test("parseWatchInput: null body does not crash", () => {
  const result = parseWatchInput(null);
  assert.equal(result.ok, false);
  assert.equal(result.error, "title is required");
});

test("parseWatchInput: retailer over the length cap is rejected", () => {
  const result = parseWatchInput({
    title: "K2",
    retailer: "R".repeat(101),
    price: 99,
    targetPrice: 79,
  });
  assert.equal(result.ok, false);
});

test("parseWatchInput: pollIntervalSec as non-number is rejected", () => {
  const result = parseWatchInput({
    title: "K2",
    retailer: "Amazon",
    price: 99,
    targetPrice: 79,
    pollIntervalSec: "30",
  });
  assert.equal(result.ok, false);
});
