import { test } from "node:test";
import assert from "node:assert/strict";
import { digestBody } from "./digest.js";

const AT = new Date("2026-11-01T09:00:00Z");

test("digestBody: counts and lists every entry", () => {
  const { subject, text } = digestBody([
    { itemTitle: "Sony WH-1000XM5", action: "Price drop detected", occurredAt: AT },
    { itemTitle: "Keychron K2", action: "Back in stock", occurredAt: AT },
  ]);
  assert.ok(subject.includes("2 alerts"));
  assert.ok(text.includes("Price drop detected: Sony WH-1000XM5"));
  assert.ok(text.includes("Back in stock: Keychron K2"));
  assert.ok(text.includes("AgentCart"));
});

test("digestBody: singular wording for one entry", () => {
  const { subject } = digestBody([
    { itemTitle: "K2", action: "Price drop detected", occurredAt: AT },
  ]);
  assert.ok(subject.includes("1 alert in"));
});
