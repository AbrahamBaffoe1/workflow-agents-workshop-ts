/**
 * Fetch per-file patches from a GitHub pull request (lifted from
 * agent-orchestrator). Works with public repos without authentication; a
 * GITHUB_TOKEN raises rate limits and unlocks private repos.
 */

export interface PullRequest {
  url: string
  labels: string[]
}

export interface Patch {
  file: string
  diff: string
}

const PR_URL_RE = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/

function parsePrUrl(url: string): { owner: string; repo: string; number: number } {
  const match = PR_URL_RE.exec(url)
  if (!match) {
    throw new Error(
      `cannot parse PR URL: "${url}" (expected https://github.com/{owner}/{repo}/pull/{number})`,
    )
  }
  return { owner: match[1]!, repo: match[2]!, number: Number(match[3]) }
}

interface GitHubFile {
  filename: string
  patch?: string
  status: string
}

export async function prepareDiff(input: PullRequest): Promise<Patch[]> {
  const { owner, repo, number } = parsePrUrl(input.url)
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'render-agents-workshop',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.authorization = `Bearer ${token}`

  const res = await fetch(apiUrl, { headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GitHub API ${res.status} for ${apiUrl}: ${body.slice(0, 300)}`)
  }

  const files = (await res.json()) as GitHubFile[]
  // Return every changed file that has a patch. Noise filtering is a separate,
  // explicit pipeline step (see filterDiff) so the "break-glass" override is
  // visible rather than buried in fetch logic.
  return files.filter((f) => f.patch).map((f) => ({ file: f.filename, diff: f.patch! }))
}
