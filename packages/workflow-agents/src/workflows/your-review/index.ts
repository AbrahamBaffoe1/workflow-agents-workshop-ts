/**
 * Authored workflow for the workshop.
 *
 * This is the file attendees customize. It keeps the workflow shape explicit:
 *
 *   prepareDiff -> filterDiff -> [custom reviewer tasks...] -> judge
 *
 * The queue coordination from Pattern 2 is gone. Each reviewer below is a
 * Render task with its own timeout, retry policy, logs, and Dashboard trace.
 */
import { task } from "@renderinc/sdk/workflows";
import {
  defineAgent,
  filterDiff,
  judge,
  prepareDiff,
  resolveModelSpec,
  toReviewSummary,
} from "@workshop/agent";
import type { AgentResult, Patch } from "@workshop/agent";
import { storeTracer } from "@workshop/db";

type ReviewerInput = { patches: Patch[] };
type Finding = { agent: string; note: string };
type ReviewerOutput = Finding & { usage: AgentResult["usage"] };

interface YourReviewInput {
  url: string;
  labels?: string[];
  _runId?: string;
}

const taskContext = (runId?: string) => ({
  tracer: storeTracer(),
  ...(runId ? { runId } : {}),
});

const reviewerTaskOptions = {
  timeoutSeconds: 120,
  retry: { maxRetries: 2, waitDurationMs: 1000, backoffScaling: 2 },
};

const REVIEWER_OUTPUT = `## Output format

Return a short list of findings. Each finding must include:
- **severity**: \`info\` | \`warn\` | \`block\`
- **location**: \`path/to/file:line\`
- **note**: 1-3 sentences explaining the issue and the fix

Prefer one precise finding over several vague ones. If nothing needs attention,
say "No findings." Do not invent line numbers.`;

const maintainabilityReviewer = defineAgent({
  name: "your-maintainability",
  model: resolveModelSpec("medium"),
  tools: ["diff_stats"],
  budget: { maxIterations: 4, maxWallSeconds: 90 },
  systemPrompt: `# Maintainability reviewer

Review only the changed lines in the pull request diff.

Focus on:
- confusing names or unclear control flow
- duplicated logic that should be extracted
- functions or modules taking on too many responsibilities
- changes that do not match nearby project patterns

Do not comment on security, performance, formatting-only style, or subjective
preferences.

Use \`diff_stats\` when the patch is large enough that size or churn matters.

${REVIEWER_OUTPUT}`,
});

const testReadinessReviewer = defineAgent({
  name: "your-test-readiness",
  model: resolveModelSpec("medium"),
  tools: ["diff_stats"],
  budget: { maxIterations: 4, maxWallSeconds: 90 },
  systemPrompt: `# Test readiness reviewer

Review only the changed lines in the pull request diff.

Focus on:
- behavior changes without a matching test
- missing edge cases for failures, empty states, or boundaries
- tests that assert implementation details instead of user-visible behavior
- risky refactors where existing tests may no longer cover the changed path

Do not ask for tests on docs-only, comment-only, or generated-file changes.

${REVIEWER_OUTPUT}`,
});

const maintainabilityTask = task(
  { name: "your-maintainability", ...reviewerTaskOptions },
  async function maintainability(input: ReviewerInput, runId?: string) {
    return maintainabilityReviewer.run(input, taskContext(runId));
  },
);

const testReadinessTask = task(
  { name: "your-test-readiness", ...reviewerTaskOptions },
  async function testReadiness(input: ReviewerInput, runId?: string) {
    return testReadinessReviewer.run(input, taskContext(runId));
  },
);

const yourJudgeTask = task(
  { name: "your-review-judge", ...reviewerTaskOptions },
  async function yourJudge(input: { findings: Finding[] }, runId?: string) {
    return judge.run(input, taskContext(runId));
  },
);

export default task(
  {
    name: "your-review",
    timeoutSeconds: 600,
    retry: { maxRetries: 2, waitDurationMs: 2000, backoffScaling: 2 },
  },
  async function yourReview(input: YourReviewInput) {
    const runId = input._runId;

    const allPatches = await prepareDiff({ url: input.url, labels: input.labels ?? [] });
    const { patches } = filterDiff(allPatches);

    if (patches.length === 0) {
      return {
        verdict: "approve",
        reason: "No reviewable diff remained after filtering lock files and generated output.",
        reviews: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    const reviewerResults: ReviewerOutput[] = await Promise.all(
      [
        { agent: maintainabilityReviewer.name, run: maintainabilityTask },
        { agent: testReadinessReviewer.name, run: testReadinessTask },
      ].map(async ({ agent, run }) => {
        const result = await run({ patches }, runId);
        return { agent, note: result.text, usage: result.usage };
      }),
    );

    const decision = await yourJudgeTask(
      {
        findings: reviewerResults.map(({ agent, note }) => ({ agent, note })),
      },
      runId,
    );

    return toReviewSummary(reviewerResults, decision);
  },
);
