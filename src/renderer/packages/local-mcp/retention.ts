export const MCP_SWEEP_INTERVAL = 60_000
export const MCP_DOWNLOAD_GRACE = 2 * 60_000
export const MCP_WORKSPACE_IDLE = 30 * 60_000
export const MCP_UNCLAIMED_OUTPUT_AGE = 60 * 60_000
export const MCP_WORKSPACE_MAX_AGE = 24 * 60 * 60_000

export type GeneratedRange = {
  kind: 'media' | 'image'
  generationId: string
  resourceId: string
  version: string
  offset: number
  bytes: number
  total: number
}

export type MCPDelivery = { kind: GeneratedRange['kind']; generationId: string; resourceId: string; completedAt: number }
type Progress = { version: string; total: number; ranges: [number, number][]; updatedAt: number }
const progress = new Map<string, Map<string, Progress>>()

/** Track byte ranges only. Seeing the last chunk alone is insufficient for deletion. */
export function observeGeneratedRange(workspace: string, range: GeneratedRange): boolean {
  const files = progress.get(workspace) ?? new Map<string, Progress>()
  progress.set(workspace, files)
  const prior = files.get(range.resourceId)
  const ranges = prior?.version === range.version && prior.total === range.total ? prior.ranges : []
  ranges.push([range.offset, range.offset + range.bytes])
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const current of ranges) {
    const last = merged.at(-1)
    if (last && current[0] <= last[1]) last[1] = Math.max(last[1], current[1])
    else merged.push(current)
  }
  if (merged.length === 1 && merged[0][0] === 0 && merged[0][1] === range.total) {
    files.delete(range.resourceId)
    if (!files.size) progress.delete(workspace)
    return true
  }
  if (merged.length <= 512) files.set(range.resourceId, { version: range.version, total: range.total, ranges: merged, updatedAt: Date.now() })
  else files.delete(range.resourceId)
  if (files.size > 512) files.delete(files.keys().next().value!)
  return false
}

export function hasRecentMCPDownload(workspace: string, resourceId: string, now: number) {
  const item = progress.get(workspace)?.get(resourceId)
  return !!item && now - item.updatedAt < MCP_DOWNLOAD_GRACE
}

export function clearMCPDownloadProgress(workspaces: ReadonlySet<string>) {
  for (const id of workspaces) progress.delete(id)
}
