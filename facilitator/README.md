# Facilitator guide

Two ~50-minute sessions. One agent (code review), three Render substrates. The
teaching device: the agent code never changes — only the infrastructure does.

See [`index.md`](../index.md) for the proposal, objectives, and rationale.

## Goals

By the end, attendees can:

1. Deploy a web service + Postgres on Render from a Blueprint.
2. Decompose a blocking in-process agent into a queue + background worker on Valkey.
3. Express the same pipeline as Render Workflows and articulate what the platform
   replaces (queue, retries, coordination, observability).
4. **Author their own Render task** — and feel how a config object + a function
   buys durability, retries, isolation, fan-out, and traces. (The finale.)

## Session 1 — Foundations (~50 min)

- **Intro to Render** — ~5 min.
- **Intro to the workshop (~5 min).** 30-second framing: the `sf-pulse` critique —
  domain complexity hid the primitives. Today: one tiny agent, three ways to run
  it. Open `shared/agent` and show the entire agent is a few hundred lines.

**Part 1 — Naive agent (~20 min).**
- Walk `packages/naive-agent/src/server.ts`. Point at `await runReview(...)`.
- Deploy the Blueprint (web + Postgres).
- Sanity check: review a public PR, open the telemetry table.
- Break it: review a huge PR / open three tabs at once. Name the limits — and lead
  into Part 2.

**Part 2 — Worker agents (~20 min).**
- Diff `naive-agent` vs `worker-agents`: the agent is identical; web now enqueues,
  a worker consumes.
- Deploy the Blueprint (web + worker + Valkey + Postgres). Add workers to scale out;
  redeploy the web mid-run to show resilience.
- Open `worker-agents/src/kv.ts` and count the coordination code *they* now own —
  the setup for Session 2.

## Session 2 — Enter Workflows (~50 min)

**Part 1 — Workflow agents (~25 min).**
- Run `render workflows dev`, trigger `code-review`. Open the Render Dashboard trace
  view; show per-agent isolation, retries, timeouts, parallel fan-out.
- Map each line of `worker-agents/src/kv.ts` to something Workflows does for free.
- Deploy the Blueprint; sanity-check a review.
- Pivot to authoring: open `code-review/index.ts` and `agentTask.ts` and show that a
  task is just **a config object + an async function**, and composition is just
  function calls (`await someTask(...)`, `Promise.all`).

— 10 min break —

**Part 2 — Hands-on finale: author a task (~25 min).** The thing they leave having
*done*. Walk [`docs/04-author-a-task.md`](../docs/04-author-a-task.md):
- Open the `quick-review` starter — already a working task, auto-discovered with
  zero registration — run it, and see it in the telemetry viewer.
- Compose the security reviewer as its own task and re-run.
- Throw a random error to watch Render retry per the `retry` config — no try/catch,
  no queue, no dead-letter.
- Bonus: fan out both reviewers with `Promise.all`.
- Land it: "you just added durable, retried, isolated, traced, parallel execution
  by writing a function and a config object."

**Wrap (~5 min).** The decision guide: in-process for prototypes; worker+queue when
you need async/scale/durability and can own coordination; Workflows when you want
that coordination + observability for free — and authoring is just writing tasks.

## Talking points

- "The agent is the constant. Everything else is Render." Repeat it each part.
- The agents are a **library they use**; tasks are the thing they **author**.
- Always show the **diff between folders**, not just each folder.
- Tie every primitive to a pain it removes from the previous pattern.
- The finale is the point of the day — protect time for it.
