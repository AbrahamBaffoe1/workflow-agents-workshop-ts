# 01 — Naive agent (in-process)

> The agent runs inside the web request. Simple, complete, and the baseline we
> spend the rest of the workshop improving.

## The shape

```
browser ──POST /api/reviews──▶ web service (single process)
                                  runReview():
                                    prepareDiff(prUrl)
                                    Promise.all([ security, performance ])   ← fan-out, in-process
                                    judge(findings)
                                  persist telemetry → Postgres
                                  respond when done
```

The whole pipeline lives in [`packages/naive-agent/src/server.ts`](../packages/naive-agent/src/server.ts).
Notice the handler `await`s `runReview()` and only then responds.

## Run it

```sh
npm run naive:dev          # http://localhost:3000
```

Paste a public PR URL and hit **Review**. The table shows the run; click a row to
see reviewer findings and the agent spans (LLM turns + tool calls).

## What Render gives you

- **Web Service** — your HTTP server, deployed from `git push`.
- **Postgres** — the durable telemetry record the UI reads.
- One Blueprint (`render.yaml`) wires both together.

## Where it breaks (motivation for Pattern 2)

- The review runs **inside the request**. A large PR or a slow model can blow past
  HTTP/proxy timeouts.
- A deploy or crash **kills in-flight reviews** — there's nowhere durable for the
  work to live.
- Concurrent users **share one process**; the "parallel" reviewers still compete
  for the same box.
- You can't scale the agent **independently** of the web tier.

Next: [02 — Worker agents](02-worker-agents.md).
