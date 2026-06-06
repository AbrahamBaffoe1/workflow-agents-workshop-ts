# Code Review Workflow Setup

The code-review workflow reviews GitHub pull requests using multiple specialist agents (security, performance, and optionally UX for frontend changes). A judge agent consolidates findings into a single verdict.

## Prerequisites

- An LLM API key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) in your `.env`
- The server running (`npm run dev`)

## Quick test with a curl

You can trigger a review directly with a public PR URL — no webhook setup needed:

```sh
curl -s -X POST http://localhost:3000/api/reviews \
  -H 'content-type: application/json' \
  -d '{"prUrl":"https://github.com/octocat/Hello-World/pull/9681"}'
```

Then browse the telemetry viewer at `http://localhost:3000/` to watch it run and
see the verdict plus per-agent findings. Deep per-agent traces are in the Render
Dashboard.

## GitHub webhook setup

### 1. Generate a webhook secret

```sh
openssl rand -hex 32
```

Add it to `.env`:

```
GITHUB_WEBHOOK_SECRET=<the generated hex>
```

If `WORKFLOW_API_KEY` is also set, the webhook endpoint requires it as a bearer token (see below).

### 2. Configure the webhook in GitHub

Go to your repo's **Settings → Webhooks → Add webhook**:

| Field | Value |
|---|---|
| Payload URL | `https://your-server.onrender.com/webhooks/github` |
| Content type | `application/json` |
| Secret | The hex string from step 1 |
| Events | Select **Pull requests** only |

For local development, use a tunnel like [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) to expose `localhost:3000`.

### 3. Test with a mock webhook payload

You can simulate a GitHub webhook locally without configuring a real webhook:

```sh
curl -s -X POST http://localhost:3000/webhooks/github \
  -H 'content-type: application/json' \
  -H 'x-github-event: pull_request' \
  -d '{
    "action": "opened",
    "pull_request": {
      "html_url": "https://github.com/octocat/Hello-World/pull/9681",
      "labels": []
    }
  }'
```

## How it works

### Events handled

The GitHub webhook adapter triggers the code-review workflow on these `pull_request` actions:

- `opened` — new PR
- `reopened` — PR reopened after closing
- `synchronize` — new commits pushed to an existing PR

All other events (closed, labeled, etc.) are ignored with a `202` response.

### Signature verification

When `GITHUB_WEBHOOK_SECRET` is set, the adapter verifies the `X-Hub-Signature-256` HMAC header. When unset (local dev), all requests are accepted.

### Diff fetching

The workflow fetches per-file patches from the GitHub API (`GET /repos/{owner}/{repo}/pulls/{number}/files`). For public repos, no token is needed. For private repos, set `GITHUB_TOKEN` in `.env`.

Noise files are automatically filtered out before agents see the diff: lock files (`package-lock.json`, `yarn.lock`, etc.), minified assets (`.min.js`, `.min.css`), source maps (`.map`), and bundled files (`.bundle.js`).

### Agents

| Agent | Runs when | What it checks |
|---|---|---|
| `security` | Always | Injection, auth gaps, secrets, SSRF |
| `performance` | Always | N+1 queries, unbounded loops, blocking I/O |
| `ux` | Frontend files in diff (`.tsx`, `.jsx`, `.vue`, `.css`, etc.) | State coverage, accessibility, interaction design |
| `judge` | Always (last) | Consolidates findings into approve/request-changes verdict |

Security and performance (and UX when applicable) run in parallel, then the judge reviews their findings.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | Yes | LLM provider credentials |
| `GITHUB_WEBHOOK_SECRET` | Production | HMAC secret for webhook signature verification |
| `GITHUB_TOKEN` | Private repos | GitHub personal access token for fetching PR diffs |
| `WORKFLOW_API_KEY` | Production | Bearer token protecting the `/webhooks/*` endpoint |
