# Pattern 2 — Worker agents

The same agent, **offloaded to background workers** via a Valkey queue.

```
browser ─POST /api/reviews─▶ web (producer)
                               └─ create review, XADD job to Valkey, return 202
Valkey stream ──▶ worker (consumer)   [run N of these to scale out]
                    └─ runReview()  ← identical to Pattern 1
                    └─ publish progress (pub/sub) ──▶ web ──SSE──▶ browser
                    └─ write telemetry to Postgres
```

- **Render primitives:** Web Service + **Background Worker** + **Valkey** + Postgres.
- **What this unlocks:** the web tier returns instantly; long reviews run
  out-of-band; many reviews run concurrently; **scale by adding workers**
  (`numInstances`); a web redeploy doesn't kill in-flight runs; failed jobs stay
  un-acked and retry.
- **What you now own:** the queue, the consumer group, acks, retry semantics, and
  the progress plumbing. That hand-rolled coordination is exactly what Pattern 3
  removes.

## Run locally

Needs local Postgres **and** Redis/Valkey.

```sh
# from the repo root
npm install
createdb agents_workshop
redis-server &                            # or: docker run -p 6379:6379 redis
cp ../../.env.example .env                 # set DATABASE_URL + REDIS_URL

npm run worker:web                         # terminal A — http://localhost:3000
npm run worker:worker                      # terminal B — start one worker
npm run worker:worker                      # terminal C — add another (scale out)
```

Submit a PR URL in the UI; watch a worker pick it up. Kill/restart the web
service mid-run to see the review survive.

## Deploy

`render.yaml` provisions web + worker + Valkey + Postgres. Bump the worker's
`numInstances` to scale out.
