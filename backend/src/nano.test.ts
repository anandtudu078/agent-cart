import { test } from "node:test";
import assert from "node:assert/strict";

// env.ts reads process.env at import time, so the seller address has to be in
// place before nano.ts (and its config) loads — hence the dynamic import.
const ADDRESS = `nano_3${"a".repeat(59)}`;
const DESTINATION = `nano_1${"b".repeat(59)}`;
const HASH = "a".repeat(64);
process.env.NANO_ADDRESS = ADDRESS;

const { isNanoAddress, isBlockHash, formatXno, quoteXno, verifySendBlock } =
  await import("./nano.js");

const ONE_XNO = 10n ** 30n;

test("isNanoAddress: accepts the account shape and nothing else", () => {
  assert.equal(isNanoAddress(ADDRESS), true);
  assert.equal(isNanoAddress(`  ${ADDRESS}  `), true); // trimmed
  assert.equal(isNanoAddress(`xrb_3${"a".repeat(59)}`), true);
  assert.equal(isNanoAddress("nano_3aaa"), false); // too short
  assert.equal(isNanoAddress(`nano_3${"A".repeat(59)}`), false); // uppercase
  assert.equal(isNanoAddress("https://example.com"), false);
  assert.equal(isNanoAddress(undefined), false);
});

test("isBlockHash: 64 hex characters, any case", () => {
  assert.equal(isBlockHash(HASH), true);
  assert.equal(isBlockHash(HASH.toUpperCase()), true);
  assert.equal(isBlockHash("a".repeat(63)), false);
  assert.equal(isBlockHash(`${HASH}a`), false);
  assert.equal(isBlockHash("z".repeat(64)), false);
  assert.equal(isBlockHash(null), false);
});

test("formatXno: renders 8 decimals from raw unit counts", () => {
  assert.equal(formatXno(200n * 10n ** 8n), "200.00000000");
  assert.equal(formatXno(1n), "0.00000001");
  assert.equal(formatXno(33333333n), "0.33333333");
});

test("quoteXno: USD total → exact XNO amount and raw", () => {
  const quote = quoteXno(300, 1.5);
  assert.equal(quote?.xno, "200.00000000");
  assert.equal(quote?.raw, 200n * ONE_XNO);

  // floored, not rounded: 1 / 3 = 0.33333333…
  const floor = quoteXno(1, 3);
  assert.equal(floor?.xno, "0.33333333");
  assert.equal(floor?.raw, 33333333n * 10n ** 22n);
});

test("quoteXno: refuses inputs it could not honour", () => {
  assert.equal(quoteXno(0, 1.5), null);
  assert.equal(quoteXno(-10, 1.5), null);
  assert.equal(quoteXno(Number.NaN, 1.5), null);
  assert.equal(quoteXno(100, 0), null);
  // floors to zero units — too small to quote
  assert.equal(quoteXno(0.00000001, 1_000_000_000), null);
});

/** Replace fetch for one test; always restore it. */
async function withLedger(
  payload: unknown,
  run: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

function sendBlock(overrides: Record<string, unknown> = {}) {
  return {
    blocks: {
      [HASH]: {
        amount: (100n * ONE_XNO).toString(),
        subtype: "send",
        confirmed: true,
        block: { link_as_account: ADDRESS },
        ...overrides,
      },
    },
  };
}

test("verifySendBlock: accepts a settled send of the quoted amount", async () => {
  await withLedger(sendBlock(), async () => {
    const result = await verifySendBlock(HASH, {
      address: ADDRESS,
      amountRaw: 100n * ONE_XNO,
    });
    assert.deepEqual(result, { ok: true, amountRaw: 100n * ONE_XNO });
  });
});

test("verifySendBlock: an overpayment settles too", async () => {
  await withLedger(sendBlock(), async () => {
    const result = await verifySendBlock(HASH, {
      address: ADDRESS,
      amountRaw: 99n * ONE_XNO,
    });
    assert.equal(result.ok, true);
  });
});

test("verifySendBlock: rejects a well-formed hash that is not our payment", async () => {
  const cases: [unknown, RegExp][] = [
    [sendBlock({ subtype: "receive" }), /not send/],
    [sendBlock({ block: { link_as_account: DESTINATION } }), /different address/],
    [sendBlock({ amount: (1n * ONE_XNO).toString() }), /less than the quoted/],
    [sendBlock({ confirmed: false }), /not confirmed/],
    [{ blocks: {} }, /not found/],
  ];
  for (const [payload, expected] of cases) {
    await withLedger(payload, async () => {
      const result = await verifySendBlock(HASH, {
        address: ADDRESS,
        amountRaw: 100n * ONE_XNO,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, expected);
    });
  }
});

test("verifySendBlock: malformed hash and RPC failures are reported, not thrown", async () => {
  const bad = await verifySendBlock("nope", { address: ADDRESS, amountRaw: 1n });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /64 hex/);

  await withLedger({ error: "Bad block hash" }, async () => {
    const result = await verifySendBlock(HASH, {
      address: ADDRESS,
      amountRaw: 1n,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Bad block hash/);
  });

  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    const result = await verifySendBlock(HASH, {
      address: ADDRESS,
      amountRaw: 1n,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /unreachable/);
  } finally {
    globalThis.fetch = original;
  }
});
