/**
 * Pattern 3 — gateway (web service).
 *
 * A Hono server that turns inbound PR submissions / GitHub webhooks into Render
 * Workflow runs, and serves the shared telemetry viewer.
 *
 * In local dev (`RENDER_USE_LOCAL_DEV=true`) workflows run in-process as direct
 * function calls. In production the Render SDK dispatches them as Workflow task
 * runs on separate instances. Either way, code reviews are persisted to
 * @workshop/db so the viewer shows the same reviews table as Patterns 1 & 2.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { addFinding, createReview, migrate, setReviewResult } from "@workshop/db";
import { createUiRouter } from "@workshop/ui";
import { loadWorkflows } from "./workflows/loader.js";
import { matchPullRequest, verifyGithubSignature } from "./github.js";

/** What the code-review workflow returns (see workflows/code-review). */
interface CodeReviewResult {
  verdict?: string;
  reason?: string;
  reviews?: Array<{ agent: string; note: string }>;
}

const isLocalDev = process.env.RENDER_USE_LOCAL_DEV === "true";

const { mapping, localTasks } = await loadWorkflows(
  new URL("./workflows", import.meta.url).pathname,
);

// Shared telemetry tables (reviews/findings/spans) — no-op without DATABASE_URL.
await migrate();

/**
 * Run a workflow to completion and return its result. Local dev calls the task
 * function directly; production dispatches it to the Render Workflow service.
 */
async function runWorkflow(name: string, input: unknown): Promise<unknown> {
  if (isLocalDev) {
    const fn = localTasks[name];
    if (!fn) throw new Error(`no local task for workflow "${name}"`);
    return fn(input);
  }
  const slug = mapping[name];
  if (!slug) throw new Error(`unknown workflow "${name}"`);
  const { Render } = await import("@renderinc/sdk");
  const render = new Render();
  const started = await render.workflows.startTask(slug, [input]);
  const finished = await started.get();
  const ok = finished.status === "succeeded" || finished.status === "completed";
  if (!ok) throw new Error(finished.error ? String(finished.error) : "workflow failed");
  return finished.results;
}

/**
 * Start a code review: create the review row immediately (so the viewer shows it
 * as running), then run the workflow in the background and persist the outcome.
 */
async function runCodeReview(prUrl: string, labels: string[] = []): Promise<string> {
  const reviewId = await createReview(prUrl);
  void (async () => {
    try {
      const result = (await runWorkflow("code-review", {
        url: prUrl,
        labels,
        _runId: reviewId,
      })) as CodeReviewResult;
      for (const f of result.reviews ?? []) await addFinding(reviewId, f.agent, f.note);
      await setReviewResult(reviewId, {
        status: "done",
        ...(result.verdict ? { verdict: result.verdict } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[workflow-agents] review ${reviewId} failed:`, message);
      await setReviewResult(reviewId, { status: "error", reason: message }).catch(() => {});
    }
  })();
  return reviewId;
}

const app = new Hono();

// API-key auth for workflow + webhook POSTs. Open when WORKFLOW_API_KEY is unset.
const apiKey = process.env.WORKFLOW_API_KEY;
if (apiKey) {
  const expected = `Bearer ${apiKey}`;
  app.use("/workflows/*", async (c, next) => {
    if (c.req.method !== "POST") return next();
    if (c.req.header("authorization") === expected) return next();
    return c.json({ error: "unauthorized" }, 401);
  });
  app.use("/webhooks/*", async (c, next) => {
    if (c.req.header("authorization") === expected) return next();
    return c.json({ error: "unauthorized" }, 401);
  });
}

app.get("/healthz", (c) => c.json({ ok: true }));

app.get("/workflows", (c) => c.json({ workflows: Object.keys(mapping) }));

// Generic workflow trigger (used for quick-review and the authoring finale).
app.post("/workflows/:name", async (c) => {
  const name = c.req.param("name");
  if (!mapping[name]) return c.json({ error: `unknown workflow "${name}"` }, 404);
  const input = await c.req.json().catch(() => ({}));
  try {
    const result = await runWorkflow(name, input);
    return c.json({ result }, 200);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// The shared viewer's submit path: enqueue a code review by PR URL.
app.post("/api/reviews", async (c) => {
  if (!mapping["code-review"]) return c.json({ error: "code-review not available" }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { prUrl?: string };
  if (!body.prUrl) return c.json({ error: "prUrl is required" }, 400);
  const reviewId = await runCodeReview(body.prUrl);
  return c.json({ id: reviewId }, 202);
});

app.post("/webhooks/github", async (c) => {
  const rawBody = await c.req.text();
  if (!verifyGithubSignature(rawBody, c.req.header())) {
    return c.json({ error: "signature verification failed" }, 401);
  }
  let event: unknown;
  try {
    event = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const matched = matchPullRequest(event, c.req.header());
  if (!matched) return c.json({ ignored: true }, 202);
  const reviewId = await runCodeReview(matched.url, matched.labels);
  return c.json({ runId: reviewId, status: "running" }, 202);
});

// The same telemetry viewer as Patterns 1 & 2 (reviews + findings + spans).
// Deep per-agent traces live in the Render Dashboard.
app.route("/", createUiRouter("Pattern 3 — Workflow agents"));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.info(
    `[workflow-agents] listening on http://localhost:${info.port} ` +
      `(workflows: ${Object.keys(mapping).join(", ")}, localDev: ${isLocalDev})`,
  );
});
