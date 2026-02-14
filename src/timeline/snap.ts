import { LayoutItem } from './layout';
import { Viewport, yearToX, xToYear } from './viewport';

const SNAP_THRESHOLD_PX = 10;

/**
 * Collect all snap target years from the layout tree.
 * Returns a sorted, deduplicated array of decimal years.
 */
export function collectSnapTargets(layout: LayoutItem[]): number[] {
  const years = new Set<number>();

  function walk(items: LayoutItem[]) {
    for (const item of items) {
      years.add(item.startYear);
      years.add(item.endYear);
      if (item.children.length > 0) {
        walk(item.children);
      }
    }
  }

  walk(layout);
  return [...years].sort((a, b) => a - b);
}

/**
 * Find the nearest snap target year within the pixel threshold.
 * Returns the snapped year, or null if no target is close enough.
 */
export function findSnapYear(
  pixelX: number,
  snapTargets: number[],
  viewport: Viewport,
  canvasWidth: number,
): number | null {
  if (snapTargets.length === 0) return null;

  const year = xToYear(pixelX, viewport, canvasWidth);

  // Binary search for the insertion point
  let lo = 0;
  let hi = snapTargets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (snapTargets[mid] < year) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Check the two nearest candidates (lo-1 and lo)
  let bestYear: number | null = null;
  let bestDist = SNAP_THRESHOLD_PX + 1;

  for (const idx of [lo - 1, lo]) {
    if (idx < 0 || idx >= snapTargets.length) continue;
    const candidateX = yearToX(snapTargets[idx], viewport, canvasWidth);
    const dist = Math.abs(candidateX - pixelX);
    if (dist < bestDist) {
      bestDist = dist;
      bestYear = snapTargets[idx];
    }
  }

  return bestDist <= SNAP_THRESHOLD_PX ? bestYear : null;
}
