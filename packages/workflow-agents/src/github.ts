/**
 * GitHub webhook helpers — signature verification and pull-request matching.
 *
 * Inlined (no generic adapter): this workshop has exactly one webhook source.
 * `verifyGithubSignature` checks the HMAC when GITHUB_WEBHOOK_SECRET is set;
 * `matchPullRequest` projects a reviewable PR event into the code-review input.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

type Headers = Record<string, string | undefined>;

interface PullRequestEvent {
  action?: string;
  pull_request?: {
    html_url?: string;
    labels?: Array<{ name?: string }>;
  };
}

const REVIEWABLE_ACTIONS = new Set(["opened", "reopened", "synchronize"]);

/** Verify the `X-Hub-Signature-256` HMAC. Open (returns true) when no secret is set. */
export function verifyGithubSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true; // not configured → accept (local dev)
  const signature = headers["x-hub-signature-256"];
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Map a `pull_request` event (opened / reopened / synchronize) to the
 * code-review workflow input, or null to ignore the event.
 */
export function matchPullRequest(
  event: unknown,
  headers: Headers,
): { url: string; labels: string[] } | null {
  if (headers["x-github-event"] !== "pull_request") return null;
  const e = event as PullRequestEvent;
  if (!e.action || !REVIEWABLE_ACTIONS.has(e.action)) return null;
  const url = e.pull_request?.html_url;
  if (!url) return null;
  const labels = (e.pull_request?.labels ?? [])
    .map((l) => l.name)
    .filter((name): name is string => Boolean(name));
  return { url, labels };
}
