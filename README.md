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
| Dashboard (`frontend/`) | ✅ dark Next.js 16 + Tailwind v4 UI — watchlist, history, real-time agent log (currently mock data) |
| API (`backend/`) | ✅ Express 5 + TypeScript, CORS, env config, `GET /api/health` with DB state |
| Data layer | ✅ Mongoose schemas (`watch_items`, `history_entries`, `activity_events` with TTL), retrying DB bootstrap, idempotent seed |
| Database | ✅ MongoDB Atlas M0 (prod-ready), local Docker Mongo for dev |
| Agent service | 🔜 Python/LangChain poller/scraping brain (not yet scaffolded) |
| Commerce | 🔜 PayPal checkout route (`@paypal/checkout-server-sdk` installed) |
| API surface | 🔜 CRUD routes for watch items, history, activity |

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
| `AGENT_SERVICE_URL` | `http://localhost:8000` | future Python agent |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | frontend → backend base URL |

## API

- `GET /api/health` — liveness + database state
- `GET /api/activity/stream` — SSE tail of activity events (replays last 15, then follows inserts)
- `POST /api/activity` — append a log line `{level: info|ok|warn|buy, message, source?}`

## Data model

- **watch_items** — product, retailer, current price vs `targetPrice`, status `watching | drop | paused`
- **history_entries** — decisions the agent made: `buy | alert | scan | info`
- **activity_events** — raw log lines (`info | ok | warn | buy`), auto-expire after 30 days

## License

Private / unlicensed. Generated in the open by its authors.
