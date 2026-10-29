# AgentCart

Autonomous agentic commerce and price-watch shopping assistant.

## Aim

Replace the manual routine of checking prices across retailers with an agent
that does it end to end:

- **Watch** — point the agent at products; it polls retailer pages on an interval.
- **Detect** — compare live price against your target, surface drops the moment they happen.
- **Act** — hold items in cart, apply coupons, and check out (PayPal) when a deal hits target.
- **Explain** — every decision lands in a human-readable history and a live activity feed, so the agent never acts invisibly.

## Status

Built today:

| Piece | State |
|---|---|
| Dashboard (`frontend/`) | ✅ dark Next.js 16 + Tailwind v4 UI — watchlist, history, stat cards, sidebar, real-time agent log — all live API data |
| API (`backend/`) | ✅ Express 5 + TypeScript, CORS, env config, `GET /api/health` with DB state |
| Data layer | ✅ Mongoose schemas (`watch_items`, `history_entries`, `activity_events` with TTL), retrying DB bootstrap, idempotent seed |
| Database | ✅ MongoDB Atlas M0 (prod-ready), local Docker Mongo for dev |
| Agent service | ✅ Python/LangChain service (`agent-service/`, FastAPI on :8000) — LLM price reasoning when `OPENAI_API_KEY` is set, deterministic fallback otherwise; the Node scan cycle delegates to it and degrades to local jitter when it is down |
| Commerce | ✅ cart hold/release + PayPal checkout/capture routes (`@paypal/checkout-server-sdk`, sandbox by default) |
| API surface | ✅ watch-item CRUD + history routes |
| Live prices | ✅ scan cycle fetches the product URL (JSON-LD / price meta) and marks each row `ok · stale · error · simulated` — a failed fetch keeps the last real price instead of inventing one |
| Price history | ✅ `price_points` collection written once per observed price (90-day TTL) → `GET /api/watch-items/:id/series` feeds the chart |
| Out-of-app alerts | ✅ optional webhook (Discord/Slack/generic JSON) POSTed on every target hit — set it in Settings; internal/localhost targets are rejected |
| Settlement | ✅ two legs beside each other — PayPal order/capture, and a Nano (XNO) leg that quotes the amount at the live rate and settles only once the ledger confirms the buyer's signed send block. No keys in the app: the buyer pays from their own wallet, the agent only reads the chain ([#17](https://github.com/anandtudu078/agent-cart/issues/17)) |
| Multi-retailer comparison | ✅ one product, up to 5 retailers (`offers[]`) — the agent polls each offer url and the cheapest one becomes the row's price/retailer, with a `Cheapest offer changed` entry in history when the winner swaps |

## Architecture

```
agent-cart/
├── frontend/          Next.js 16 (App Router, Tailwind v4, TypeScript)
│   └── src/app        dashboard: watchlist · history · live activity
├── backend/           Express 5 (TypeScript, ESM, tsx)
│   ├── src/config     env + Mongoose bootstrap (retry, dev fallback)
│   ├── src/models     WatchItem · HistoryEntry · ActivityEvent
│   ├── src/routes     /api/health
│   └── src/seed.ts    idempotent demo data (--reset to wipe)
├── agent-service/     Python price-decision service (FastAPI + LangChain, :8000)
│   ├── main.py        GET /health · POST /scan {items} → price updates
│   ├── scanner.py     LLM path (OpenAI-compatible) + ±3% fallback
│   └── tests/         pytest self-checks
├── AGENTS.md          agent instructions — ponytail mode on by default
└── .agents/skills/    ponytail coding skill
```

## Quickstart

**Backend**

```bash
cd backend
cp .env.example .env    # set MONGODB_URI — Atlas SRV, or your local Mongo
npm install
npm run seed            # demo data; safe to re-run, use npm run seed:reset to wipe
npm run dev             # API on http://localhost:4000  → /api/health
```

No Atlas yet? Run MongoDB locally in one line:

```bash
docker run -d --name agentcart-mongo -p 27017:27017 mongo:7
```

**Agent service (optional but recommended)**

```bash
cd agent-service
python -m venv .venv && .venv/bin/pip install -r requirements.txt   # Windows: .venv\Scripts\pip
uvicorn main:app --port 8000          # or: .venv/bin/uvicorn …
# optional — enables LLM pricing (any OpenAI-compatible endpoint):
#   set OPENAI_API_KEY (and optionally OPENAI_BASE_URL / AGENT_MODEL)
```

Without it (or without a key) the scan cycle keeps working on its built-in
jitter — the activity log shows which price source each cycle used.

**Frontend**

```bash
cd frontend
npm install
npm run dev             # dashboard on http://localhost:3000
```

## Environment

| Var | Default | Notes |
|---|---|---|
| `PORT` | `4000` | API port |
| `NODE_ENV` | `development` | `production` requires `MONGODB_URI` (hard fail otherwise) |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated |
| `MONGODB_URI` | local `mongodb://127.0.0.1:27017/agentcart` | Atlas `mongodb+srv://…` or standard string |
| `PAYPAL_MODE` / `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | — | sandbox by default |
| `NANO_ADDRESS` | — | seller's `nano_…` receive address; empty disables the Nano settle leg (its routes answer 501) |
| `NANO_RPC_URL` | `https://nanorpc.cc` | public ledger node used to read send blocks — no key needed |
| `XNO_USD_RATE` | — | rate used when the CoinGecko price feed is unreachable |
| `AGENT_SERVICE_URL` | `http://localhost:8000` | Python agent service; scan cycles fall back to local jitter when unreachable |
| `AGENT_INTERVAL_SEC` | `30` | seconds between scan cycles (min 5) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | frontend → backend base URL |

## API

All routes below (except `/api/health` and `/api/auth/*`) require a session
cookie from `POST /api/auth/login` or `/api/auth/signup`; everything else
returns 401.

- `GET /api/health` — liveness + database state
- `GET /api/activity/stream` — SSE tail of activity events (replays last 15, then follows inserts)
- `POST /api/activity` — append a log line `{level: info|ok|warn|buy, message, source?}`
- `GET /api/watch-items` — full watchlist, newest first; each row carries a `trend` verdict (`rising | falling | flat | insufficient`) computed from its own price history — the buy-now-or-wait signal behind the badge in the Status column
- `POST /api/watch-items` — start watching `{title, retailer, price, targetPrice, emoji?, url?, pollIntervalSec?, offers?}` — with a `url`, the agent fetches that page for the live price; without one it simulates. Each item is only re-checked when its own `pollIntervalSec` interval elapses (default 30s, min 5s); items not yet due are skipped for the cycle. `offers` is an optional array of `{retailer, price, url?}` (max 5) for the same product: the agent polls every offer and the headline `retailer`/`price`/`url` always mirror the cheapest one, so the chart, cart and webhook need no extra input
- `GET /api/watch-items/:id/series` — price points for the chart, oldest first (`?limit=1..500`)
- `PATCH /api/watch-items/:id` — update `price`, `targetPrice`, `deltaPct`, `status`, `autoBuy`, `pollIntervalSec`, or replace `offers` (which re-picks the cheapest headline)
- `DELETE /api/watch-items/:id` — stop watching
- `GET /api/agent/status` — scan-loop state: running flag, interval, last cycle summary
- `POST /api/agent/scan` — run one scan cycle now (409 if one is already running)
- `GET /api/cart` — reserved cart items + `subtotal`, `discount`, `total`
- `GET /api/coupons` — coupon codes the agent knows (`?retailer=` narrows to one retailer)
- `POST /api/cart/:id/coupon` — apply `{code}` to a reserved entry (404 when invalid for that retailer)
- `DELETE /api/cart/:id/coupon` — remove the applied code
- `POST /api/cart` — reserve a watch item `{watchItemId}` (409 if already reserved)
- `DELETE /api/cart/:id` — release a reserved item
- `POST /api/cart/:id/checkout` — create a PayPal order, returns `{orderId, approvalUrl}` (501 when PayPal creds are unset)
- `POST /api/cart/:id/capture` — capture an approved PayPal order
- `POST /api/cart/:id/nano-quote` — freeze the XNO amount for a reserved entry: returns `{address, amountXno, amountRaw, rate, totalUsd, expiresAt}`, quoted at the live rate (CoinGecko, 60s cache, `XNO_USD_RATE` fallback) and floored to 8 decimals so the amount displayed is the amount demanded. 501 without `NANO_ADDRESS`, 409 for a non-USD total, 400 when the total floors to zero units
- `POST /api/cart/:id/nano-verify` — `{blockHash}` → the agent reads the block from `NANO_RPC_URL` and checks subtype `send`, destination = `NANO_ADDRESS`, amount ≥ quote, and cemented. 422 when the block is real but not our payment, 409 when the quote is missing or expired. On success the entry flips to `checked_out` — no keys and no wallet ever touch this app, the buyer signs in their own wallet
- `GET /api/history` — recent agent decisions, newest first (`?limit=1..100`, `?kind=buy|alert|scan|info`, `?item=<watchItemId>`)
- `POST /api/history` — record a decision `{itemTitle, action, detail, kind}`

Agent service (Python, port 8000, no auth — keep it on localhost):

- `GET /health` — liveness + whether the LLM is configured
- `POST /scan` — `{items: [{id, title, retailer, price, targetPrice}]}` → `{source: llm|fallback, updates: [{id, price, reason}]}` (every price clamped to ±3%)

## Data model

- **watch_items** — product, retailer, current price vs `targetPrice`, status `watching | drop | paused`, and an `autoBuy` flag (scan cycle reserves it into the cart the moment it hits target). Also carries the last fetch outcome: `fetchStatus ok | stale | error | simulated` plus `lastFetchError` / `fetchedAt`, and the last availability verdict `inStock` — `false` when the page reported it sold out, which holds off `autoBuy` until it is back. `offers[]` holds the other retailers for the same product (`retailer`, `url`, `price` with its own fetch outcome); the headline fields above are re-pointed at the cheapest offer every cycle — empty `offers` = the classic single-retailer row
- **price_points** — one row per observed price (`item`, `price`, `at`, `source live | agent-service | simulated`), auto-expire after 90 days; the chart reads these
- **history_entries** — decisions the agent made: `buy | alert | scan | info`
- **activity_events** — raw log lines (`info | ok | warn | buy`), auto-expire after 30 days
- **cart_entries** — watch items held in the cart (`reserved | checked_out`) with the PayPal order id, plus any applied `couponCode` / `couponDiscount`. The Nano settle leg freezes its own quote on the row (`nanoAddress`, `nanoQuotedXno`, `nanoAmountRaw`, `nanoRate`, `nanoQuoteExpiresAt`) and records the confirmed `nanoBlockHash` once the ledger verifies it

## Security

- Session cookie (`httpOnly`, `SameSite=Lax`, `Secure` in production) guards
  every data route; watch items, cart entries, **history decisions and
  activity lines** are scoped per owner — a signed-in user only sees their own
  rows plus ownerless system/seeded demo rows (previously the two feeds were
  global and leaked every account's activity to every other account).
- Login/signup are rate-limited (10 / 15 min / IP, and only those two routes
  — throttling `GET /api/auth/me` would lock users out of their own account);
  write endpoints are capped at 60 req/min / IP.
- The SSE activity tail caps concurrent connections at 100 (503 beyond) so
  one client can't hold unbounded server resources.
- `helmet` security headers on the API, `X-Powered-By` disabled on API and
  dashboard; Mongo credentials are redacted from logs.
- Product URLs the agent fetches and webhook URLs it POSTs to are validated
  as public `http(s)` hosts (`backend/src/agent/url-guard.ts`) — no
  `localhost`, RFC1918, link-local/metadata addresses, or non-http schemes,
  checked both when saved and again before every request.
- In development the JWT secret is random per boot (logging out on restart);
  production requires `JWT_SECRET`.
- **Operational note:** if the Atlas password was ever printed to a dev log
  (fixed in this release), rotate it in the Atlas console.

## License

Private / unlicensed. Generated in the open by its authors.
