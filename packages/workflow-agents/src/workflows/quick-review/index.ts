/**
 * EXERCISE — Author a task.
 *
 * This is the workshop's final, hands-on activity: you write a Render Workflow
 * task and watch how much you get for how little. This file already *is* a
 * working task — adding it under `workflows/<name>/index.ts` is all it took for
 * `loader.ts` to auto-discover it as the `quick-review` workflow. Trigger it,
 * force a failure to watch it retry, and find it in the Render Dashboard traces.
 *
 * Then do the YOUR TURN section to compose a real agent as its own task.
 *
 * See docs/04-author-a-task.md for the full walkthrough + solution.
 */
import { task } from "@renderinc/sdk/workflows";
import { prepareDiff, type Patch } from "@workshop/agent";

interface QuickReviewInput {
  url: string;
  _runId?: string;
  _parentSpanId?: string;
}

// A *deterministic step* is just a plain async function. Pure logic doesn't need
// task() — it runs in-process inside whatever task calls it.
async function summarize(patches: Patch[]) {
  return { files: patches.length, names: patches.map((p) => p.file).slice(0, 20) };
}

// A *task* is a plain async function + a config object. That config is the whole
// point: per-task timeout and retries (with backoff), isolation, and traces —
// none of which you implement. Compare this to everything `worker-agents/src/kv.ts`
// had to hand-roll for the same guarantees.
export default task(
  {
    name: "quick-review",
    timeoutSeconds: 120,
    retry: { maxRetries: 2, waitDurationMs: 1000, backoffScaling: 2 },
  },
  async function quickReview(input: QuickReviewInput) {
    const patches = await prepareDiff({ url: input.url, labels: [] });
    const summary = await summarize(patches);

    // ── YOUR TURN ──────────────────────────────────────────────────────────
    // Compose a real reviewer as its *own* task and return its findings:
    //
    //   import { securityReviewer } from "@workshop/agent";
    //   import { agentTask } from "../../agentTask.js";
    //   const securityTask = agentTask(securityReviewer);
    //
    //   const meta = {
    //     ...(input._runId ? { _runId: input._runId } : {}),
    //     ...(input._parentSpanId ? { _parentSpanId: input._parentSpanId } : {}),
    //   };
    //   const review = await securityTask({ input: { patches }, ...meta });
    //   return { summary, review: review.text };
    //
    // Bonus: fan out BOTH reviewers with Promise.all (see code-review/index.ts).
    // ───────────────────────────────────────────────────────────────────────

    return { summary };
  },
);
