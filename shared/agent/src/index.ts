/**
 * @workshop/agent — the constant core, shared by all three patterns.
 *
 * Reused from agent-orchestrator: the LLM loop, the model client, prepareDiff.
 * NOT reused: markdown agent parsing and the agent-as-task factory. Agents here
 * are plain data wrapped by `defineAgent` into objects with an in-process
 * `.run()`. Tools + MCP are an import-and-register registry. The substrate
 * (in-process / worker / Render task) decides how `.run()` is invoked.
 */

export { runReview, parseDecision } from './review.js'
export type {
  ReviewEvent,
  ReviewResult,
  ReviewFinding,
  ReviewDecision,
  RunReviewOptions,
} from './review.js'

export { defineAgent } from './agent.js'
export {
  REVIEWERS,
  AGENTS,
  securityReviewer,
  performanceReviewer,
  uxReviewer,
  judge,
  hasFrontendFiles,
  selectReviewers,
} from './agents.js'

export { prepareDiff } from './prepareDiff.js'
export type { Patch, PullRequest } from './prepareDiff.js'

export { filterDiff } from './filterDiff.js'
export type { FilterDiffOptions, FilterDiffResult } from './filterDiff.js'

// Tools + MCP: extend by importing a module and registering it.
export { defineTool, defineMcpSource } from './tool.js'
export type { McpSourceSpec } from './tool.js'
export { TOOL_REGISTRY, registerTool, resolveTools } from './tools.js'

export { runLoop } from './loop.js'
export type { RunLoopArgs, RunLoopResult } from './loop.js'

export { resolveClient } from './model.js'
export { MODEL_TIERS, resolveModelSpec } from './model-tiers.js'
export type { ModelTier } from './model-tiers.js'

export { createLogger } from './logger.js'

export type * from './types.js'
