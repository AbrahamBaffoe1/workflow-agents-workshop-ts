/**
 * Wrap a shared Agent as a Render Workflow task.
 *
 * This is the *entire* difference between Pattern 3 and Patterns 1 & 2: instead
 * of calling `agent.run(input)` in-process, we register `agent.run` as a
 * `task()`. Each call then runs in its own isolated Render instance with
 * per-task retries, timeouts, and traces — for free.
 *
 * Agent spans are written to the shared telemetry store (@workshop/db) via
 * storeTracer — the same store the telemetry viewer reads — so a run's spans
 * show up alongside its findings.
 */
import { task } from "@renderinc/sdk/workflows";
import { storeTracer } from "@workshop/db";
import type { Agent, AgentInput, AgentResult } from "@workshop/agent";

interface AgentInvocation {
  input: AgentInput;
  _runId?: string;
  _parentSpanId?: string;
}

export function agentTask(agent: Agent) {
  return task(
    {
      name: agent.name,
      ...(agent.budget?.maxWallSeconds ? { timeoutSeconds: agent.budget.maxWallSeconds } : {}),
    },
    async function agentRun(invocation: AgentInvocation): Promise<AgentResult> {
      return agent.run(invocation.input, {
        tracer: storeTracer(),
        ...(invocation._runId ? { runId: invocation._runId } : {}),
        ...(invocation._parentSpanId ? { parentSpanId: invocation._parentSpanId } : {}),
      });
    },
  );
}
