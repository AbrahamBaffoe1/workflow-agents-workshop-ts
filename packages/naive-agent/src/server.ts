/**
 * Pattern 1 — Naive agent.
 *
 * One web service. The code-review agent runs *in-process, inside the request*:
 * the POST handler awaits the whole pipeline before responding. Simple and
 * complete — and exactly why it doesn't scale. A big PR ties up the request, a
 * redeploy kills in-flight reviews, and concurrent users compete for one process.
 * Patterns 2 and 3 fix that.
 */
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { runReview } from '@workshop/agent'
import {
  addFinding,
  createReview,
  migrate,
  setReviewResult,
  storeTracer,
} from '@workshop/db'
import { createUiRouter } from '@workshop/ui'

const app = new Hono()

app.get('/healthz', (c) => c.text('ok'))

app.post('/api/reviews', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { prUrl?: string }
  if (!body.prUrl) return c.json({ error: 'prUrl is required' }, 400)

  const id = await createReview(body.prUrl)

  // The naive part: we run the whole review here and block until it's done.
  try {
    const result = await runReview(body.prUrl, { runId: id, tracer: storeTracer() })
    for (const finding of result.reviews) {
      await addFinding(id, finding.agent, finding.note)
    }
    await setReviewResult(id, {
      status: 'done',
      verdict: result.decision.verdict,
      reason: result.decision.reason,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    })
    return c.json({ id, verdict: result.decision.verdict })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setReviewResult(id, { status: 'error', reason: message })
    return c.json({ id, error: message }, 500)
  }
})

// Telemetry viewer (page + read APIs) at the root.
app.route('/', createUiRouter('Pattern 1 — Naive agent'))

const port = Number(process.env.PORT ?? 3000)

await migrate()
serve({ fetch: app.fetch, port }, (info) => {
  console.info(`[naive-agent] listening on http://localhost:${info.port}`)
})
