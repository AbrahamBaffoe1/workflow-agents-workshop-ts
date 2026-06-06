# Workflow Agents Workshop

| Pattern | Folder | Substrate | Render primitives |
| --- | --- | --- | --- |
| 1. Naive agent | [`packages/naive-agent`](packages/naive-agent) | one web service, in-process | Web Service + Postgres |
| 2. Worker agents | [`packages/worker-agents`](packages/worker-agents) | web + background worker + queue | + Background Worker + Valkey |
| 3. Workflow agents | [`packages/workflow-agents`](packages/workflow-agents) | Render Workflows | + Workflows (`task()`) |

## The agent

Defined once in [`shared/agent`](shared/agent) and imported unchanged by every
package. The review pipeline:

```
prepareDiff → filterDiff → [ security ‖ performance ‖ ux? ] → judge
```

- **`prepareDiff`** fetches per-file patches from a public GitHub PR (no auth).
- **`filterDiff`** drops noise (lock files, minified bundles, source maps).
  `breakGlass: true` (or a `break-glass` PR label) approves the PR.
- **security** and **performance** always run; **ux** runs only when the diff
  touches frontend files; **judge** consolidates findings into an
  `approve` / `request-changes` verdict with comments.

## Telemetry

All three patterns serve the same telemetry viewer ([`shared/ui`](shared/ui)) — a
reviews table with per-agent findings — backed by [`shared/db`](shared/db).
`shared/db` uses an in-memory backend when `DATABASE_URL` is unset and Postgres
when it is set, so Patterns 1 and 3 run with no database. Pattern 2 runs web and
worker as separate processes, so it requires Postgres plus Valkey/Redis.

## Layout

```
shared/        the constant core, imported by every pattern
  agent/       LLM loop, model client, agent defs, prepareDiff, filterDiff, runReview
  db/          telemetry store — reviews, findings, spans (Postgres or in-memory)
  ui/          telemetry table viewer
packages/      the three deployable apps (each has its own render.yaml)
docs/          step-by-step walkthrough for each pattern (00–04)
facilitator/   facilitator guide (run-of-show, talking points)
index.md       workshop proposal: objectives, sessions, rationale
```

## Quickstart

```sh
npm install                      # installs all workspaces

# Pattern 1 — no database, no API key required
npm run naive:dev                # http://localhost:3000

# Pattern 2 — needs local Postgres + Redis/Valkey
cp .env.example packages/worker-agents/.env   # set DATABASE_URL + REDIS_URL
npm run worker:web               # terminal A
npm run worker:worker            # terminal B (run more for scale-out)

# Pattern 3 — Render Workflows local dev
npm run dev --workspace @workshop/workflow-agents           # in-process
npm run dev:workflows --workspace @workshop/workflow-agents # full task isolation
```

No API key needed — the agent falls back to a mock model so the pipeline runs
offline. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` for real reviews. Per-pattern
setup is in each package's README and [`docs/00-setup.md`](docs/00-setup.md).

## Workshop materials

This repo is the basis for a two-session workshop. The proposal (objectives,
session outlines, rationale) is in [`index.md`](index.md); the facilitator
run-of-show and talking points are in [`facilitator/`](facilitator).
