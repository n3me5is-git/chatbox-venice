// A single native Back listener dismisses the last registered surface before navigating.
const surfaces = new Map<string, () => void>()
export function registerBackSurface(id: string, close: () => void) {
  surfaces.set(id, close)
  return () => { surfaces.delete(id) }
}
export function closeTopSurface() {
  const top = [...surfaces.values()].at(-1)
  if (!top) return false
  top()
  return true
}
