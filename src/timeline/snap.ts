import { LayoutItem } from './layout';
import { Viewport, yearToX, xToYear } from './viewport';
import { formatDate } from '../data/time';

const SNAP_THRESHOLD_PX = 10;

export interface SnapDetail {
  label: string;
  date: string;
  isoDate: string;
}

export interface SnapState {
  highlightYears: Set<number>;
  cursorDetail: SnapDetail | null;
  selStartDetail: SnapDetail | null;
  selEndDetail: SnapDetail | null;
}

/**
 * Find the best event at a snap year and build a descriptive label + full date.
 * Priority: point events > beginnings > ends. Prefers non-containers.
 */
export function getSnapDetail(year: number, layout: LayoutItem[]): SnapDetail | null {
  // priority: 0 = point, 1 = beginning, 2 = end
  const matches: { label: string; date: string; isoDate: string; isContainer: boolean; priority: number }[] = [];

  function walk(items: LayoutItem[]) {
    for (const item of items) {
      if (item.isPoint && item.nominalStartYear === year) {
        matches.push({
          label: item.event.name,
          date: formatDate(item.event.start),
          isoDate: item.event.start,
          isContainer: false,
          priority: 0,
        });
      } else {
        if (item.nominalStartYear === year) {
          matches.push({
            label: `Beginning of ${item.event.name}`,
            date: formatDate(item.event.start),
            isoDate: item.event.start,
            isContainer: item.isContainer,
            priority: 1,
          });
        }
        if (item.nominalEndYear === year && item.event.end) {
          matches.push({
            label: `End of ${item.event.name}`,
            date: formatDate(item.event.end),
            isoDate: item.event.end,
            isContainer: item.isContainer,
            priority: 2,
          });
        }
      }
      if (item.children.length > 0) {
        walk(item.children);
      }
    }
  }

  walk(layout);
  if (matches.length === 0) return null;

  // Prefer non-container matches when deeper matches exist
  const nonContainer = matches.filter(m => !m.isContainer);
  const candidates = nonContainer.length > 0 ? nonContainer : matches;

  // Sort by priority (point > beginning > end)
  candidates.sort((a, b) => a.priority - b.priority);
  const best = candidates[0];

  return {
    label: best.label,
    date: best.date,
    isoDate: best.isoDate,
  };
}

/**
 * Collect all snap target years from the layout tree.
 * Returns a sorted, deduplicated array of decimal years.
 */
export function collectSnapTargets(layout: LayoutItem[]): number[] {
  const years = new Set<number>();

  function walk(items: LayoutItem[]) {
    for (const item of items) {
      years.add(item.nominalStartYear);
      years.add(item.nominalEndYear);
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
  threshold: number = SNAP_THRESHOLD_PX,
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
  let bestDist = threshold + 1;

  for (const idx of [lo - 1, lo]) {
    if (idx < 0 || idx >= snapTargets.length) continue;
    const candidateX = yearToX(snapTargets[idx], viewport, canvasWidth);
    const dist = Math.abs(candidateX - pixelX);
    if (dist < bestDist) {
      bestDist = dist;
      bestYear = snapTargets[idx];
    }
  }

  return bestDist <= threshold ? bestYear : null;
}
