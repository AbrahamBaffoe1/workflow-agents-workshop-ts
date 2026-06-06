/**
 * Agent definitions as plain data, wrapped by `defineAgent` so each gets an
 * in-process `.run()`. No markdown, no frontmatter, no Render coupling. The
 * substrate decides how to invoke them:
 *
 *   naive    → agent.run(input)
 *   worker   → agent.run(input)            inside a queue consumer
 *   workflow → task(agent.name, ({ input }) => agent.run(input))
 */
import { defineAgent } from './agent.js'
import { resolveModelSpec } from './model-tiers.js'
import type { Patch } from './prepareDiff.js'
import type { Agent } from './types.js'

const FINDING_FORMAT = `## Output format

Return a short list of findings. Each finding has:
- **severity**: \`info\` | \`warn\` | \`block\`
- **location**: \`path/to/file:line\`
- **note**: 1–3 sentences. State the problem and the fix. Do not restate the diff.

Prefer one precise finding over several vague ones. Never invent line numbers —
cite what you actually see in the patch. If you find nothing, say so explicitly.`

export const securityReviewer: Agent = defineAgent({
  name: 'security',
  model: resolveModelSpec('medium'),
  tools: ['current_time'],
  systemPrompt: `# Security reviewer

You review a pull request's per-file patches. Stay strictly within your specialty;
other agents cover the rest.

Focus exclusively on security: injection, authn/authz gaps, secret handling,
unsafe deserialization, SSRF, path traversal, and dependency risk. Do not comment
on style, performance, or naming. Do not block on theoretical issues without a
concrete exploit path.

${FINDING_FORMAT}`,
})

export const performanceReviewer: Agent = defineAgent({
  name: 'performance',
  model: resolveModelSpec('medium'),
  systemPrompt: `# Performance reviewer

You review a pull request's per-file patches. Stay strictly within your specialty;
other agents cover the rest.

Focus exclusively on performance: N+1 queries, unnecessary work in hot paths,
unbounded memory growth, blocking I/O on request paths, missing indexes, and
quadratic loops. Do not comment on security, style, or naming.

${FINDING_FORMAT}`,
})

export const uxReviewer: Agent = defineAgent({
  name: 'ux',
  model: resolveModelSpec('medium'),
  systemPrompt: `# UX reviewer

You review a pull request's per-file patches. Stay strictly within your specialty;
other agents cover the rest.

Focus exclusively on user-facing quality of frontend changes: accessibility
(labels, roles, keyboard/focus handling, contrast), loading/empty/error state
coverage, and interaction clarity. Only comment on UI/UX concerns. Do not comment
on security, performance, or backend logic.

${FINDING_FORMAT}`,
})

export const judge: Agent = defineAgent({
  name: 'judge',
  model: resolveModelSpec('large'),
  systemPrompt: `# Judge

You receive the findings from every specialist reviewer. Weigh them, deduplicate,
and produce a single decision as JSON:

\`{ "verdict": "approve" | "request-changes", "reason": string, "findings": Array<{ "agent": string, "severity": string, "note": string }> }\`

Approve unless at least one finding is severity \`block\`, or the cumulative
\`warn\`s clearly warrant changes. Do not re-review the diff yourself — decide only
from the findings you are given. Respond with JSON only, no prose around it.`,
})

/** The reviewers that always run, fanned out in parallel. */
export const REVIEWERS: Agent[] = [securityReviewer, performanceReviewer]

/** File extensions that signal a frontend change and warrant the UX reviewer. */
const FRONTEND_EXTENSIONS = /\.(tsx|jsx|vue|svelte|css|scss|less|html)$/

/**
 * Does this diff touch frontend files? Used to conditionally branch the UX
 * reviewer into the fan-out — security and performance always run; UX only runs
 * when there's UI to review.
 */
export function hasFrontendFiles(patches: Patch[]): boolean {
  return patches.some((p) => FRONTEND_EXTENSIONS.test(p.file))
}

/**
 * The reviewers to run for a given diff: the always-on specialists plus the UX
 * reviewer when the diff contains frontend files.
 */
export function selectReviewers(patches: Patch[]): Agent[] {
  return hasFrontendFiles(patches) ? [...REVIEWERS, uxReviewer] : [...REVIEWERS]
}

/** Every agent, by name. */
export const AGENTS: Record<string, Agent> = {
  [securityReviewer.name]: securityReviewer,
  [performanceReviewer.name]: performanceReviewer,
  [uxReviewer.name]: uxReviewer,
  [judge.name]: judge,
}
