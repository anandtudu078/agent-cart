import { test } from "node:test";
import assert from "node:assert/strict";
import { inQuietHours } from "./quiet.js";

const at = (time: string) => new Date(`2026-01-01T${time}:00Z`);

test("inQuietHours: disabled always sends", () => {
  assert.equal(
    inQuietHours(at("03:00"), { enabled: false, start: 22, end: 7 }),
    false,
  );
});

test("inQuietHours: daytime window excludes the end hour", () => {
  const quiet = { enabled: true, start: 9, end: 17 };
  assert.equal(inQuietHours(at("08:59"), quiet), false);
  assert.equal(inQuietHours(at("09:00"), quiet), true);
  assert.equal(inQuietHours(at("16:59"), quiet), true);
  assert.equal(inQuietHours(at("17:00"), quiet), false);
});

test("inQuietHours: overnight window wraps past midnight", () => {
  const quiet = { enabled: true, start: 22, end: 7 };
  assert.equal(inQuietHours(at("21:59"), quiet), false);
  assert.equal(inQuietHours(at("22:00"), quiet), true);
  assert.equal(inQuietHours(at("00:00"), quiet), true);
  assert.equal(inQuietHours(at("06:59"), quiet), true);
  assert.equal(inQuietHours(at("07:00"), quiet), false);
});

test("inQuietHours: equal or invalid hours never silence alerts", () => {
  assert.equal(
    inQuietHours(at("12:00"), { enabled: true, start: 9, end: 9 }),
    false,
  );
  assert.equal(
    inQuietHours(at("12:00"), { enabled: true, start: -1, end: 7 }),
    false,
  );
  assert.equal(
    inQuietHours(at("12:00"), { enabled: true, start: 22, end: 24 }),
    false,
  );
  assert.equal(
    inQuietHours(at("12:00"), { enabled: true, start: 9.5, end: 17 }),
    false,
  );
});
