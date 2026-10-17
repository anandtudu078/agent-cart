# AgentCart — repo instructions

## Ponytail (lazy senior dev mode) — active by default

The `ponytail` skill lives in `.agents/skills/ponytail/SKILL.md` and applies to
every coding task in this repo:

- Smallest change that fully solves the task; the best code is the code never written.
- Reuse what's here (helpers, patterns, installed deps) before adding anything.
- No config, options, or "for later" code nobody asked for — name what you skipped.
- Non-trivial new logic gets one small test or assert-based self-check.
- Real limits get a `shortcut: <limit>, <when to upgrade>` comment.
- End a reply with what was skipped/not checked and any risk.

Say "stop ponytail" or "normal mode" to turn it off, or "ultra" to also have the
agent push back on the request itself.

Stack: Next.js 16 frontend (`frontend/`), Express + TypeScript + Mongoose backend
(`backend/`), Python/LangChain agent (not yet scaffolded). MongoDB: local Docker
container in dev, Atlas in production via `MONGODB_URI`.