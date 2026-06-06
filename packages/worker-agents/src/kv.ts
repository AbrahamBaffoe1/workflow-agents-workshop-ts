/**
 * Valkey (Redis-compatible) plumbing — local to Pattern 2 (the only pattern that
 * needs a queue).
 *
 *   - a work queue on a Redis Stream (XADD / XREADGROUP / XACK)
 *   - live progress over pub/sub (PUBLISH / SUBSCRIBE)
 *
 * This is exactly the coordination layer that Render Workflows makes disappear
 * in Pattern 3 — here you own the stream, the consumer group, and the acks.
 */
import { Redis } from 'ioredis'

const STREAM = 'reviews:queue'
const GROUP = 'reviewers'

export interface ReviewJob {
  reviewId: string
  prUrl: string
}

function url(): string {
  return process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379'
}

let _client: Redis | undefined

/** Shared connection for non-blocking commands (XADD, PUBLISH). */
export function getRedis(): Redis {
  if (!_client) _client = new Redis(url(), { maxRetriesPerRequest: null })
  return _client
}

// ── Queue ────────────────────────────────────────────────────────────────────

export async function enqueueReview(job: ReviewJob): Promise<void> {
  await getRedis().xadd(STREAM, '*', 'reviewId', job.reviewId, 'prUrl', job.prUrl)
}

async function ensureGroup(client: Redis): Promise<void> {
  try {
    await client.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM')
  } catch (err) {
    // BUSYGROUP = group already exists; anything else is real.
    if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err
  }
}

export interface ConsumeOptions {
  consumerName?: string
  signal?: AbortSignal
}

/**
 * Blocking consumer loop. Reads one job at a time, runs the handler, and acks on
 * success. A failed handler leaves the message un-acked (visible in the pending
 * list) so it can be retried — the hand-rolled version of Pattern 3's retries.
 */
export async function consumeReviews(
  handler: (job: ReviewJob) => Promise<void>,
  options: ConsumeOptions = {},
): Promise<void> {
  const consumer = options.consumerName ?? `worker-${process.pid}`
  const client = new Redis(url(), { maxRetriesPerRequest: null })
  await ensureGroup(client)

  while (!options.signal?.aborted) {
    const response = (await client.xreadgroup(
      'GROUP',
      GROUP,
      consumer,
      'COUNT',
      1,
      'BLOCK',
      5000,
      'STREAMS',
      STREAM,
      '>',
    )) as Array<[string, Array<[string, string[]]>]> | null

    if (!response) continue

    for (const [, entries] of response) {
      for (const [id, fields] of entries) {
        const job = fieldsToJob(fields)
        try {
          if (job) await handler(job)
          await client.xack(STREAM, GROUP, id)
        } catch (err) {
          console.error('[kv] handler failed, leaving message un-acked for retry:', err)
        }
      }
    }
  }

  client.disconnect()
}

function fieldsToJob(fields: string[]): ReviewJob | null {
  const map = new Map<string, string>()
  for (let i = 0; i < fields.length; i += 2) map.set(fields[i]!, fields[i + 1]!)
  const reviewId = map.get('reviewId')
  const prUrl = map.get('prUrl')
  return reviewId && prUrl ? { reviewId, prUrl } : null
}

// ── Progress pub/sub ──────────────────────────────────────────────────────────

function channel(reviewId: string): string {
  return `review:${reviewId}`
}

export async function publishProgress(reviewId: string, event: unknown): Promise<void> {
  await getRedis().publish(channel(reviewId), JSON.stringify(event))
}

/**
 * Subscribe to one review's progress. Returns an unsubscribe function that also
 * closes the dedicated subscriber connection.
 */
export async function subscribeProgress(
  reviewId: string,
  onEvent: (event: unknown) => void,
): Promise<() => void> {
  const sub = new Redis(url(), { maxRetriesPerRequest: null })
  await sub.subscribe(channel(reviewId))
  sub.on('message', (_channel, message) => {
    try {
      onEvent(JSON.parse(message))
    } catch {
      // ignore malformed messages
    }
  })
  return () => {
    sub.disconnect()
  }
}
