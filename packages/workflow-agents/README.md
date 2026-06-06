# @workshop/workflow-agents

Pattern 3 — the shared code-review agent run on [Render Workflows](https://render.com/docs/workflows). The agent code is unchanged from Patterns 1 and 2 (it comes from [`@workshop/agent`](../../shared/agent)); the only difference is that each agent runs as its own Render `task()` — with per-agent isolation, retries, timeouts, and traces handled by the platform.

## Architecture

Two processes, defined in [`render.yaml`](render.yaml):

| Process | Source | Role |
|---------|--------|------|
| **Gateway** (web service) | `src/server.ts` | Hono server: receives PR submissions / GitHub webhooks, dispatches workflow runs, serves the telemetry viewer. |
| **Workflow service** | `src/workflow.ts` | Registers and executes the task graph; each workflow and agent runs as a Render task in its own container. |

Within a run, a workflow is a tree of Render tasks:

```
code-review (Render task)
├── prepareDiff   (plain function, in-process)
├── filterDiff    (plain function, in-process)
├── security      (Render task, isolated container) ┐
├── performance   (Render task, isolated container) ├─ Promise.all fan-out
├── ux            (Render task, isolated container) ┘  (ux only if frontend files)
└── judge         (Render task, isolated container)
```

`src/agentTask.ts` is the entire bridge: it wraps a shared `Agent` as a Render `task()`. Everything else is plain TypeScript shared with the other patterns.

## Agents and workflows

- **Agents** are plain TypeScript, defined once in `@workshop/agent` (`securityReviewer`, `performanceReviewer`, `uxReviewer`, `judge`) and wrapped as tasks via `agentTask()`.
- **Workflows** are auto-discovered from `src/workflows/` — each subfolder with an `index.ts` exporting a `task()` is registered; the folder name is the route.

| Workflow | Description |
|----------|-------------|
| `code-review` | Multi-agent PR review: `prepareDiff → filterDiff → [security ‖ performance ‖ ux?] → judge`. Persists results to the shared telemetry store. |
| `quick-review` | The author-a-task starter for the hands-on finale (see [`docs/04-author-a-task.md`](../../docs/04-author-a-task.md)). |

## Telemetry

The gateway serves the **shared telemetry viewer** ([`@workshop/ui`](../../shared/ui)) at `/` — the same reviews table as Patterns 1 & 2, backed by [`@workshop/db`](../../shared/db), now including per-agent spans. Deep traces (isolation, retries, timeouts) also live in the **Render Dashboard**.

`@workshop/db` uses an in-memory backend when `DATABASE_URL` is unset and Postgres when it is set, so local dev needs no database.

## Local development

```sh
npm install                        # from the repo root

# In-process: workflows run as direct function calls (RENDER_USE_LOCAL_DEV)
npm run dev --workspace @workshop/workflow-agents          # http://localhost:3000

# Full fidelity: each task in its own container, real retries/fan-out
npm run dev:workflows --workspace @workshop/workflow-agents
```

No API key required — agents fall back to a mock model. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` for real reviews.

Trigger a code review (any of these):

```sh
# Via the shared viewer's submit path
curl -s -X POST http://localhost:3000/api/reviews \
  -H 'content-type: application/json' -d '{"prUrl":"https://github.com/<owner>/<repo>/pull/<n>"}'

# Via the raw workflow route
curl -s -X POST http://localhost:3000/workflows/code-review \
  -H 'content-type: application/json' -d '{"url":"https://github.com/<owner>/<repo>/pull/<n>","labels":[]}'
```

Then open `http://localhost:3000/` for the reviews table. GitHub webhook setup is in [`docs/code-review-setup.md`](docs/code-review-setup.md).

## Deploying to Render

Deploy the Blueprint ([`render.yaml`](render.yaml)) — a web service + managed Postgres. Create the Workflow service separately in the Render Dashboard (see [`docs/03-workflow-agents.md`](../../docs/03-workflow-agents.md)). In production, `RENDER_USE_LOCAL_DEV=false` makes the gateway dispatch real Render Workflow tasks.

## Layout

```
src/
  server.ts          gateway entry (Hono web host)
  workflow.ts        workflow service entry (task registration only)
  agentTask.ts       wrap a shared Agent as a Render task()
  github.ts          GitHub webhook verify + match
  workflows/
    loader.ts        auto-discovery
    code-review/      the multi-agent review workflow
    quick-review/     author-a-task starter (the finale)
```

## API

| Route | Description |
|-------|-------------|
| `POST /api/reviews` | Submit a code review by `{ prUrl }` (used by the viewer) |
| `GET /` · `GET /api/reviews` · `GET /api/reviews/:id` | Telemetry viewer + its read APIs |
| `POST /workflows/:name` | Run a workflow by name (in-process locally, dispatched in prod) |
| `GET /workflows` | List registered workflow names |
| `POST /webhooks/github` | GitHub PR webhook → code review |
| `GET /healthz` | Liveness check |

## Environment

| Variable | Description |
|----------|-------------|
| `RENDER_USE_LOCAL_DEV` | `true` runs tasks in-process (local dev) |
| `DATABASE_URL` | Postgres for durable runs/reviews; falls back to in-memory |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Optional; without one, agents use a mock model |
| `WORKFLOW_API_KEY` | Bearer token protecting `POST /workflows/*` and `/webhooks/*` (open when unset) |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for GitHub webhook verification |
| `GITHUB_TOKEN` | Raises GitHub API rate limits / enables private repo diffs |
| `RENDER_API_KEY` | Required in production for Render Workflow dispatch |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Gateway on port 3000 (in-process tasks) |
| `npm run dev:workflows` | Local Render task server + gateway |
| `npm run start` | Production start (gateway) |
| `npm run start:workflow` | Production start (workflow service) |
| `npm run typecheck` | TypeScript check |
