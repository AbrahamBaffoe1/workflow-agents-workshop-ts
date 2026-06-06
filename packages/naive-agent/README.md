# Pattern 1 — Naive agent

The code-review agent running **in-process** inside a single web service.

```
browser ──POST /api/reviews──▶ web service
                                  └─ runReview() in-process:
                                       prepareDiff → [security ‖ performance] → judge
                                  └─ writes telemetry to Postgres
                                  └─ responds when the whole review is done
```

- **Render primitives:** Web Service + Postgres.
- **Why it's here:** establishes the baseline. It works and it's simple.
- **Where it breaks:** the review runs *inside the HTTP request*. Long PRs block
  the request and risk timeouts; a redeploy kills in-flight reviews; concurrent
  users contend for one process. That pain motivates Pattern 2.

## Run locally

```sh
# from the repo root
npm install
createdb agents_workshop                 # or set DATABASE_URL
cp ../../.env.example .env                # edit DATABASE_URL if needed
npm run naive:dev                         # http://localhost:3000
```

No API key required — the agent falls back to a mock model. Set `ANTHROPIC_API_KEY`
or `OPENAI_API_KEY` for a real review. Then paste a public PR URL, e.g.
`https://github.com/<owner>/<repo>/pull/<n>`.

## Deploy

`render.yaml` provisions a web service + Postgres. Deploy the Blueprint from the
repo root.
