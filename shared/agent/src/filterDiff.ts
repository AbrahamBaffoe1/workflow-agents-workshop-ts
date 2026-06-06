/**
 * filterDiff — a deterministic pipeline step that drops noise from a PR diff
 * before any agent (or any tokens) sees it.
 *
 * Lock files, minified bundles, and source maps are pure cost: they balloon the
 * prompt, add latency, and produce no useful review signal. Filtering them is the
 * cheap, in-process step that runs *before* the expensive agent fan-out.
 *
 * ## Break-glass
 *
 * Sometimes you genuinely need to review everything — an incident, a suspicious
 * lockfile change, a generated file that actually matters. `breakGlass: true` is
 * the emergency override: it bypasses the filter and sends the full, unredacted
 * diff to the reviewers. It's deliberately explicit so it shows up in the trace.
 */
import type { Patch } from './prepareDiff.js'

const NOISE_FILES = new Set([
  'bun.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'go.sum',
  'poetry.lock',
  'Pipfile.lock',
  'composer.lock',
  'Gemfile.lock',
])

const NOISE_EXTENSIONS = ['.min.js', '.min.css', '.bundle.js', '.map']

function isNoise(filename: string): boolean {
  const basename = filename.split('/').pop() ?? filename
  if (NOISE_FILES.has(basename)) return true
  return NOISE_EXTENSIONS.some((ext) => filename.endsWith(ext))
}

export interface FilterDiffOptions {
  /**
   * Break-glass override. When true, no filtering happens and every patch —
   * including lock files and minified bundles — is passed through to the
   * reviewers. Use sparingly; it's the expensive path.
   */
  breakGlass?: boolean
}

export interface FilterDiffResult {
  /** The patches the reviewers will actually see. */
  patches: Patch[]
  /** Files removed as noise (empty when break-glass is engaged). */
  dropped: string[]
  breakGlass: boolean
}

/**
 * Drop noise files from a set of patches. Returns the kept patches plus the list
 * of dropped files so the decision is visible in telemetry.
 */
export function filterDiff(patches: Patch[], options: FilterDiffOptions = {}): FilterDiffResult {
  if (options.breakGlass) {
    return { patches, dropped: [], breakGlass: true }
  }

  const kept: Patch[] = []
  const dropped: string[] = []
  for (const patch of patches) {
    if (isNoise(patch.file)) {
      dropped.push(patch.file)
    } else {
      kept.push(patch)
    }
  }
  return { patches: kept, dropped, breakGlass: false }
}
