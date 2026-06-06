/**
 * The code-review orchestration used by Patterns 1 & 2.
 *
 *   prepareDiff → filterDiff → [security ‖ performance ‖ ux?] (Promise.all) → judge
 *
 * The UX reviewer is conditionally branched in only when the diff touches
 * frontend files. Substrate-agnostic: it doesn't know whether it runs in a web
 * request or a queue worker. Progress is surfaced via the `onEvent` callback so a
 * worker can stream it over pub/sub. Pattern 3 expresses the same shape as Render
 * tasks.
 */
import { prepareDiff, type Patch } from './prepareDiff.js'
import { filterDiff } from './filterDiff.js'
import { selectReviewers, judge } from './agents.js'
import type { RunContext, Tracer } from './types.js'

export interface ReviewFinding {
  agent: string
  note: string
}

export interface ReviewDecision {
  verdict: string
  reason: string
  findings: Array<Record<string, unknown>>
  raw: string
}

export interface ReviewResult {
  prUrl: string
  patches: Patch[]
  reviews: ReviewFinding[]
  decision: ReviewDecision
  usage: { inputTokens: number; outputTokens: number }
}

export type ReviewEvent =
  | { type: 'phase'; phase: 'prepare' | 'filter' | 'review' | 'judge' | 'done'; detail?: string }
  | { type: 'agent_start'; agent: string }
  | { type: 'agent_done'; agent: string; note: string }
  | { type: 'error'; message: string }

export interface RunReviewOptions {
  onEvent?: (event: ReviewEvent) => void | Promise<void>
  signal?: AbortSignal
  tracer?: Tracer
  /** Ties telemetry spans together — typically the persisted review id. */
  runId?: string
  /**
   * Break-glass: skip noise filtering and review the entire diff (lock files,
   * minified bundles, and all). Use only when you genuinely need full coverage.
   */
  breakGlass?: boolean
}

export async function runReview(prUrl: string, options: RunReviewOptions = {}): Promise<ReviewResult> {
  const { onEvent, signal, tracer, runId, breakGlass } = options
  const emit = async (event: ReviewEvent) => {
    await onEvent?.(event)
  }
  const ctx: RunContext = {
    ...(signal ? { signal } : {}),
    ...(tracer ? { tracer } : {}),
    ...(runId ? { runId } : {}),
  }

  await emit({ type: 'phase', phase: 'prepare' })
  const allPatches = await prepareDiff({ url: prUrl, labels: [] })

  // Deterministic, in-process step: drop noise before the expensive fan-out.
  const filtered = filterDiff(allPatches, { ...(breakGlass ? { breakGlass } : {}) })
  const patches = filtered.patches
  await emit({
    type: 'phase',
    phase: 'filter',
    detail: filtered.breakGlass
      ? `break-glass: reviewing all ${patches.length} files`
      : `${patches.length} files (${filtered.dropped.length} noise dropped)`,
  })

  // Conditional branching: UX reviewer joins only when the diff touches frontend.
  const reviewers = selectReviewers(patches)
  await emit({ type: 'phase', phase: 'review', detail: reviewers.map((r) => r.name).join(', ') })

  const reviews = await Promise.all(
    reviewers.map(async (agent) => {
      await emit({ type: 'agent_start', agent: agent.name })
      const result = await agent.run({ patches }, ctx)
      await emit({ type: 'agent_done', agent: agent.name, note: result.text })
      return { agent: agent.name, note: result.text, usage: result.usage }
    }),
  )

  await emit({ type: 'phase', phase: 'judge' })
  const judgeResult = await judge.run(
    { findings: reviews.map(({ agent, note }) => ({ agent, note })) },
    ctx,
  )

  const usage = [...reviews.map((r) => r.usage), judgeResult.usage].reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  )

  await emit({ type: 'phase', phase: 'done' })

  return {
    prUrl,
    patches,
    reviews: reviews.map(({ agent, note }) => ({ agent, note })),
    decision: parseDecision(judgeResult.text),
    usage,
  }
}

export function parseDecision(raw: string): ReviewDecision {
  const json = extractJson(raw)
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    return {
      verdict: typeof obj.verdict === 'string' ? obj.verdict : 'unknown',
      reason: typeof obj.reason === 'string' ? obj.reason : '',
      findings: Array.isArray(obj.findings) ? (obj.findings as Array<Record<string, unknown>>) : [],
      raw,
    }
  }
  return { verdict: 'unknown', reason: raw, findings: [], raw }
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}
