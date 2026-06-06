# 00 — Setup

## Prerequisites

- Node.js >= 22.12
- PostgreSQL (local) for Patterns 1 & 2
- Redis or Valkey (local) for Pattern 2
- A [Render](https://render.com) account for deploys
- *(optional)* `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — without one, the agent
  uses a deterministic **mock** model so everything still runs

## Install

```sh
git clone <this repo>
cd localhost
npm install            # installs every workspace
```

## Local services

```sh
# Postgres
createdb agents_workshop
# or point DATABASE_URL at any Postgres you have

# Redis / Valkey (Pattern 2 only)
redis-server &
# or: docker run -p 6379:6379 redis
```

## Environment

Each app reads a `.env` in its own folder. Start from the root example:

```sh
cp .env.example packages/naive-agent/.env
cp .env.example packages/worker-agents/.env
```

Key vars:

| Var | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | P1, P2 | Postgres connection string |
| `REDIS_URL` | P2 | defaults to `redis://127.0.0.1:6379` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | all | optional; mock model if absent |
| `AGENT_MODEL=mock` | all | force the mock model even with a key |
| `GITHUB_TOKEN` | all | optional; raises GitHub rate limits |
| `PORT` | P1, P2 web | defaults to 3000 |

## A demo PR

Any public PR works. Pick one with a few changed files:

```
https://github.com/<owner>/<repo>/pull/<number>
```

Next: [01 — Naive agent](01-naive-agent.md).
