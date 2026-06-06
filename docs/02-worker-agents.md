# 02 — Worker agents (queue + background worker)

> Same agent, different substrate. The web tier becomes a thin producer; a
> Background Worker consumes a Valkey queue and runs the review out-of-band.

## The shape

```
browser ─POST /api/reviews─▶ web (producer)
                               create review → XADD job to Valkey → return 202
Valkey stream ─▶ worker (consumer)        [scale: run N workers]
                  runReview()             ← byte-for-byte identical to Pattern 1
                  publish progress ─pub/sub─▶ web ─SSE─▶ browser
                  write telemetry → Postgres
```

- Producer: [`packages/worker-agents/src/web.ts`](../packages/worker-agents/src/web.ts)
- Consumer: [`packages/worker-agents/src/worker.ts`](../packages/worker-agents/src/worker.ts)
- Queue + pub/sub: [`worker-agents/src/kv.ts`](../packages/worker-agents/src/kv.ts)

The agent code did not change. Only *where it runs* did.

## Run it

```sh
npm run worker:web         # terminal A — http://localhost:3000
npm run worker:worker      # terminal B — one worker
npm run worker:worker      # terminal C — another worker (scale out)
```

Try these demos:

1. **Concurrency** — submit several PRs quickly; watch workers share the load.
2. **Scale-out** — start more workers; throughput rises with no code change.
3. **Resilience** — kill the web service mid-review; the worker finishes and the
   result is still in Postgres when web restarts.

## What Render adds

- **Background Worker** — a service with no public port that runs your consumer.
  Scale it independently (`numInstances`).
- **Valkey** — managed Redis-compatible store; here it's both the work queue
  (stream + consumer group) and the live progress bus (pub/sub).

## What you had to build yourself

Look at [`worker-agents/src/kv.ts`](../packages/worker-agents/src/kv.ts): the stream, the consumer group,
blocking reads, acks, retry-on-failure (un-acked messages), and the pub/sub
progress channel. It's not much — but it's all coordination code *you* now own and
debug. There's no built-in trace of which agent ran where.

That is precisely what Pattern 3 deletes.

Next: [03 — Workflow agents](03-workflow-agents.md).
