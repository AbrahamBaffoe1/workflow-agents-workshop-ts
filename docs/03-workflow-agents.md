# 03 — Workflow agents (Render Workflows)

> The same fan-out, expressed as Render tasks. The queue, retries, coordination,
> and observability you hand-rolled in Pattern 2 are now declarative — and the
> unit you author is just a **task**: a plain async function + a config object.
> This pattern builds to the hands-on finale, [04 — Author a task](04-author-a-task.md).

Lives in [`packages/workflow-agents`](../packages/workflow-agents) (the
`agent-orchestrator` template).

## The shape

```
trigger (PR URL or GitHub webhook) ─▶ code-review task
                                        prepareDiff()                  ← plain fn, in-process
                                        Promise.all([
                                          security.run(),              ← each agent is its own task()
                                          performance.run(),
                                        ])
                                        judge.run()
```

Everything is built on one primitive: `task()` from `@renderinc/sdk/workflows`.
Each agent runs in its **own isolated container** with per-task retries, timeouts,
compute size, and traces — none of which you wrote.

## Side-by-side: how fan-out is implemented

| | Code | You maintain |
| --- | --- | --- |
| P1 naive | `Promise.all([...])` in one process | nothing (but no scale/durability) |
| P2 worker | `XADD` jobs → consumer group → acks → pub/sub | the whole queue + coordination |
| P3 workflow | `Promise.all([agent.run(), ...])` where `agent` is a `task()` | nothing — Render does it |

The punchline of the workshop: **Pattern 2's `kv.ts` is, in Pattern 3, the
Render platform.**

## Run it locally

Render Workflows run under the local dev runtime:

```sh
cd packages/workflow-agents
cp .env.example .env
npm install

# terminal A — start the workflow dev runtime + host
npm run dev:workflows

# terminal B — list and trigger tasks
render workflows tasks list --local
# choose: code-review → run → input: { "url": "https://github.com/<owner>/<repo>/pull/<n>", "labels": [] }
```

## Trigger from a public repo (dummy inbound)

The GitHub webhook adapter
([`src/server/webhooks/github.ts`](../packages/workflow-agents/src/server/webhooks/github.ts))
maps `pull_request` events onto the `code-review` task. Point a public repo's
webhook (or a manual "Trigger Run") at the deployed service to review real PRs.

## What Render gives you here

- **Workflows** — durable, on-demand tasks with managed queuing, retries/backoff,
  per-task compute, parallel fan-out, and full traces in the dashboard.
- Deploy with `git push`; no separate worker/queue to operate.

## Same agents as Patterns 1 & 2

This package consumes `@workshop/agent` directly — the **same** `REVIEWERS` and
`judge` the naive and worker patterns run. The only Pattern-3-specific code is
[`src/agentTask.ts`](../packages/workflow-agents/src/agentTask.ts):

```ts
// the entire difference between P3 and P1/P2:
task(agent.name, ({ input }) => agent.run(input, { tracer, runId }))
```

`agent.run()` is identical everywhere; wrapping it in `task()` is what buys
per-agent isolation, retries, and traces. The markdown agent parser,
`loadAgents`/`makeAgentTask`, and skills are gone — agents are the plain
`defineAgent` objects from the shared package. Workflows (and the per-agent tasks
they register) are auto-discovered by `loader.ts`.

Tools and MCP also come from the shared registry, so adding a tool or an MCP
server (`defineMcpSource`) makes it available to all three patterns at once.

## Now author your own

The agents are a library you *use*; the thing you *write* is tasks. Head to
[04 — Author a task](04-author-a-task.md) and build the `quick-review` workflow:
a task with retry/timeout config, a deterministic step, and an agent composed as
its own task — all auto-discovered, no registration. That's the payoff of the
whole workshop.
