import { TimelineEvent } from '../types';
import { dateToDecimalYear, todayDecimalYear } from '../data/time';

/**
 * Maps a parent path key to an ordered array of child event names.
 * Keys: "" for root level, JSON-stringified path arrays for nested levels.
 * Only levels where the user has manually reordered are stored.
 */
export type EventOrderMap = Map<string, string[]>;

/** Tiny time radius so same-date point events register as overlapping in layout. */
const POINT_OVERLAP_RADIUS = 0.001;

const LAYOUT = {
  parentBarHeight: 30,
  childBarHeight: 22,
  collapsedBarHeight: 20,
  rowGap: 4,
  containerPadding: 6,
  containerHeaderHeight: 24,
  itemGap: 8,
};

export interface LayoutItem {
  event: TimelineEvent;
  startYear: number;
  endYear: number;
  nominalStartYear: number;
  nominalEndYear: number;
  approxStartRange?: [number, number];
  approxEndRange?: [number, number];
  y: number;
  height: number;
  isContainer: boolean;
  isCollapsed: boolean;
  isPoint: boolean;
  children: LayoutItem[];
  overflowStart?: number;
  overflowEnd?: number;
}

/** Internal: a sized event ready for placement (output of Phase 1). */
interface SizedItem {
  event: TimelineEvent;
  startYear: number;
  endYear: number;
  nominalStartYear: number;
  nominalEndYear: number;
  approxStartRange?: [number, number];
  approxEndRange?: [number, number];
  overlapStart?: number;
  overlapEnd?: number;
  height: number;
  isContainer: boolean;
  isCollapsed: boolean;
  isPoint: boolean;
  placedChildren: PlacedItem[];
  overflowStart?: number;
  overflowEnd?: number;
}

/** Internal: an event placed at a relative Y within its level. */
interface PlacedItem {
  event: TimelineEvent;
  startYear: number;
  endYear: number;
  nominalStartYear: number;
  nominalEndYear: number;
  approxStartRange?: [number, number];
  approxEndRange?: [number, number];
  relativeY: number;
  height: number;
  isContainer: boolean;
  isCollapsed: boolean;
  isPoint: boolean;
  placedChildren: PlacedItem[];
  overflowStart?: number;
  overflowEnd?: number;
}

/**
 * Per-level adjacency map: for each event, the set of other events it
 * overlaps with in time. Derived from time ranges only — independent of
 * sort order, heights, or other levels.
 */
type OverlapGraph = Map<TimelineEvent, Set<TimelineEvent>>;

/**
 * Compute time-overlap relationships for a set of sized events.
 * Two events overlap if their time ranges intersect (strictly).
 * Uses overlapStart/overlapEnd when present (containers with protruding children),
 * falling back to startYear/endYear.
 */
function computeOverlaps(events: { event: TimelineEvent; startYear: number; endYear: number; overlapStart?: number; overlapEnd?: number }[]): OverlapGraph {
  const graph: OverlapGraph = new Map();
  for (const e of events) graph.set(e.event, new Set());

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      const aStart = a.overlapStart ?? a.startYear;
      const aEnd = a.overlapEnd ?? a.endYear;
      const bStart = b.overlapStart ?? b.startYear;
      const bEnd = b.overlapEnd ?? b.endYear;
      if (aEnd > bStart && aStart < bEnd) {
        graph.get(a.event)!.add(b.event);
        graph.get(b.event)!.add(a.event);
      }
    }
  }
  return graph;
}

/**
 * Find the minimum Y position past all conflicting items.
 * Simple stacking: always places below everything.
 * Used when custom ordering is active to preserve predictable visual order.
 */
function findMinY(conflicting: PlacedItem[], gap: number): number {
  let y = 0;
  for (const item of conflicting) {
    y = Math.max(y, item.relativeY + item.height + gap);
  }
  return y;
}

/**
 * Try placing an item at its hinted Y position (from pre-drag layout).
 * If the hinted position conflicts with any already-placed overlapping item,
 * falls back to findMinYPacked to find the next available gap.
 */
function findYWithHint(conflicting: PlacedItem[], gap: number, itemHeight: number, hintY: number): number {
  for (const c of conflicting) {
    if (hintY < c.relativeY + c.height + gap && hintY + itemHeight + gap > c.relativeY) {
      // Conflict — fall back to normal packing
      return findMinYPacked(conflicting, gap, itemHeight);
    }
  }
  return hintY;
}

/**
 * Find the minimum Y position where an item of the given height fits
 * without overlapping any conflicting items.
 * Scans from top to bottom for the first gap large enough.
 * Used for initial layout (no custom ordering) to pack events efficiently.
 * Conflicting array must be sorted by relativeY (ascending).
 */
function findMinYPacked(conflicting: PlacedItem[], gap: number, itemHeight: number): number {
  if (conflicting.length === 0) return 0;

  // Try placing at y=0, before the first conflicting item
  if (conflicting[0].relativeY >= itemHeight + gap) {
    return 0;
  }

  // Track running max bottom — conflicting items can overlap in Y
  // (they don't conflict with each other in time, only with the new item)
  let maxBottom = conflicting[0].relativeY + conflicting[0].height;

  // Try gaps between consecutive conflicting items
  for (let i = 0; i < conflicting.length - 1; i++) {
    maxBottom = Math.max(maxBottom, conflicting[i].relativeY + conflicting[i].height);
    const candidateY = maxBottom + gap;
    const nextTop = conflicting[i + 1].relativeY;
    if (candidateY + itemHeight + gap <= nextTop) {
      return candidateY;
    }
  }

  // Place after all conflicting items
  maxBottom = Math.max(maxBottom, conflicting[conflicting.length - 1].relativeY + conflicting[conflicting.length - 1].height);
  return maxBottom + gap;
}

/**
 * Sort sized items by a custom name order. Items not in the custom order
 * appear after explicitly ordered items, sorted by startYear.
 */
function sortByCustomOrder<T extends { event: TimelineEvent; startYear: number }>(
  items: T[],
  customOrder: string[],
): T[] {
  const indexMap = new Map(customOrder.map((name, i) => [name, i]));
  return [...items].sort((a, b) => {
    const ai = indexMap.get(a.event.name);
    const bi = indexMap.get(b.event.name);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.startYear - b.startYear;
  });
}

/**
 * Sort and place sized items using first-fit gap filling.
 * Runs Phases 3+4 with the given comparator.
 */
function placeWithOrder(
  sized: SizedItem[],
  overlaps: OverlapGraph,
  comparator: (a: SizedItem, b: SizedItem) => number,
  gap: number,
  priorityEvent?: TimelineEvent,
  pinnedRelativeY?: number,
  sketchHints?: Map<TimelineEvent, number>,
): { items: PlacedItem[]; totalHeight: number } {
  const sorted = [...sized].sort((a, b) => {
    if (priorityEvent) {
      if (a.event === priorityEvent) return -1;
      if (b.event === priorityEvent) return 1;
    }
    // In sketch mode, process by hinted Y (ascending) so higher events keep position
    if (sketchHints) {
      const aHint = sketchHints.get(a.event);
      const bHint = sketchHints.get(b.event);
      if (aHint !== undefined && bHint !== undefined) return aHint - bHint;
      if (aHint !== undefined) return -1;
      if (bHint !== undefined) return 1;
    }
    return comparator(a, b);
  });

  const placedMap = new Map<TimelineEvent, PlacedItem>();
  const placed: PlacedItem[] = [];

  for (const item of sorted) {
    const neighbors = overlaps.get(item.event) ?? new Set();
    const conflicting: PlacedItem[] = [];
    for (const n of neighbors) {
      const p = placedMap.get(n);
      if (p) conflicting.push(p);
    }
    conflicting.sort((a, b) => a.relativeY - b.relativeY);

    let y: number;
    if (pinnedRelativeY !== undefined && item.event === priorityEvent) {
      y = pinnedRelativeY;
    } else if (sketchHints) {
      const hint = sketchHints.get(item.event);
      y = hint !== undefined
        ? findYWithHint(conflicting, gap, item.height, hint)
        : findMinYPacked(conflicting, gap, item.height);
    } else {
      y = findMinYPacked(conflicting, gap, item.height);
    }

    placed.push({
      event: item.event,
      startYear: item.startYear,
      endYear: item.endYear,
      nominalStartYear: item.nominalStartYear,
      nominalEndYear: item.nominalEndYear,
      approxStartRange: item.approxStartRange,
      approxEndRange: item.approxEndRange,
      relativeY: y,
      height: item.height,
      isContainer: item.isContainer,
      isCollapsed: item.isCollapsed,
      isPoint: item.isPoint,
      placedChildren: item.placedChildren,
      overflowStart: item.overflowStart,
      overflowEnd: item.overflowEnd,
    });
    placedMap.set(item.event, placed[placed.length - 1]);
  }

  const totalHeight = placed.length > 0
    ? Math.max(...placed.map(p => p.relativeY + p.height))
    : 0;

  return { items: placed, totalHeight };
}

/**
 * Recursively compute sizes and place events at a given level.
 *
 * Four phases:
 * 1. Size — compute heights (recursive for containers, depends on collapse)
 * 2. Overlaps — build per-event adjacency graph from time ranges
 * 3. Sort — by custom order or startYear
 * 4. Place — assign Y positions using overlap graph + sort priority
 *
 * The overlap graph is independent of sort order, so reordering events
 * never causes incorrect overlap detection.
 */
function placeLevel(
  events: TimelineEvent[],
  barHeight: number,
  gap: number,
  collapsedEvents?: Set<TimelineEvent>,
  eventOrders?: EventOrderMap,
  parentPath?: string[],
  hiddenEvents?: Set<TimelineEvent>,
  priorityEvent?: TimelineEvent,
  pinnedRelativeY?: number,
  sketchHints?: Map<TimelineEvent, number>,
): { items: PlacedItem[]; totalHeight: number } {
  // Filter out hidden events at this level
  const visibleEvents = hiddenEvents
    ? events.filter(e => !hiddenEvents.has(e))
    : events;

  // Phase 1: compute heights (recursively for containers)
  const sized: SizedItem[] = visibleEvents.map(event => {
    const nominalStart = dateToDecimalYear(event.start);
    const isOngoing = event.end === 'ongoing';
    const nominalEnd = isOngoing
      ? todayDecimalYear()
      : (event.end !== undefined ? dateToDecimalYear(event.end) : nominalStart);

    // Compute uncertainty ranges
    let approxStartRange: [number, number] | undefined;
    let approxEndRange: [number, number] | undefined;

    if (event.end === undefined && event.startApprox) {
      // Point event with uncertainty: gradient bar peaking at nominal date
      approxStartRange = [dateToDecimalYear(event.startApprox[0]), nominalStart];
      approxEndRange = [nominalStart, dateToDecimalYear(event.startApprox[1])];
    } else {
      if (event.startApprox) {
        approxStartRange = [dateToDecimalYear(event.startApprox[0]), dateToDecimalYear(event.startApprox[1])];
      }
      if (event.endApprox && event.end !== undefined && !isOngoing) {
        approxEndRange = [dateToDecimalYear(event.endApprox[0]), dateToDecimalYear(event.endApprox[1])];
      }
    }

    // Ongoing events: fade from today into the future
    if (isOngoing) {
      const duration = nominalEnd - nominalStart;
      const fadeWidth = Math.min(50, Math.max(5, duration * 0.05));
      approxEndRange = [nominalEnd, nominalEnd + fadeWidth];
    }

    // Widen start/end to include gradient extent
    const startYear = approxStartRange ? approxStartRange[0] : nominalStart;
    const endYear = approxEndRange ? approxEndRange[1] : nominalEnd;
    const isPoint = event.end === undefined && !event.startApprox;

    const base = {
      event,
      startYear,
      endYear,
      nominalStartYear: nominalStart,
      nominalEndYear: nominalEnd,
      approxStartRange,
      approxEndRange,
    };

    // Point events: never collapsible
    if (isPoint) {
      return {
        ...base,
        overlapStart: startYear - POINT_OVERLAP_RADIUS,
        overlapEnd: endYear + POINT_OVERLAP_RADIUS,
        height: barHeight,
        isContainer: false,
        isCollapsed: false,
        isPoint: true,
        placedChildren: [] as PlacedItem[],
      };
    }

    // Collapsed container or collapsed childless range: thin bar, no children
    if (collapsedEvents?.has(event)) {
      return {
        ...base,
        height: LAYOUT.collapsedBarHeight,
        isContainer: true,
        isCollapsed: true,
        isPoint: false,
        placedChildren: [] as PlacedItem[],
      };
    }

    // Childless range events: collapsible but rendered as a simple bar when expanded
    if (!event.nested || event.nested.length === 0) {
      return {
        ...base,
        height: barHeight,
        isContainer: true,
        isCollapsed: false,
        isPoint: false,
        placedChildren: [] as PlacedItem[],
      };
    }

    const childPath = [...(parentPath ?? []), event.name];
    const { items: placedChildren, totalHeight: contentHeight } =
      placeLevel(event.nested, LAYOUT.childBarHeight, LAYOUT.rowGap, collapsedEvents, eventOrders, childPath, hiddenEvents, priorityEvent);

    // Compute overlap range that includes children (and grandchildren) extending beyond the parent
    let overlapStart = base.startYear;
    let overlapEnd = base.endYear;
    for (const child of placedChildren) {
      const childStart = child.overflowStart ?? child.startYear;
      const childEnd = child.overflowEnd ?? child.endYear;
      if (childStart < overlapStart) overlapStart = childStart;
      if (childEnd > overlapEnd) overlapEnd = childEnd;
    }

    const height =
      LAYOUT.containerHeaderHeight +
      LAYOUT.containerPadding +
      contentHeight +
      LAYOUT.containerPadding;

    return {
      ...base,
      overlapStart,
      overlapEnd,
      height,
      isContainer: true,
      isCollapsed: false,
      isPoint: false,
      placedChildren,
      overflowStart: overlapStart < base.startYear ? overlapStart : undefined,
      overflowEnd: overlapEnd > base.endYear ? overlapEnd : undefined,
    };
  });

  // Phase 2: compute overlap graph from time ranges
  const overlaps = computeOverlaps(sized);

  // Phase 3+4: sort and place
  const orderKey = JSON.stringify(parentPath ?? []);
  const customOrder = eventOrders?.get(orderKey);

  // Custom order: single pass with simple stacking (preserves drag-reorder behavior)
  if (customOrder) {
    const customSorted = sortByCustomOrder(sized, customOrder);
    let sorted: SizedItem[];
    if (priorityEvent && sketchHints) {
      // Sketch mode: priority first, then by hinted Y ascending
      const rest = customSorted.filter(s => s.event !== priorityEvent);
      rest.sort((a, b) => {
        const aHint = sketchHints.get(a.event);
        const bHint = sketchHints.get(b.event);
        if (aHint !== undefined && bHint !== undefined) return aHint - bHint;
        if (aHint !== undefined) return -1;
        if (bHint !== undefined) return 1;
        return 0;
      });
      sorted = [
        ...customSorted.filter(s => s.event === priorityEvent),
        ...rest,
      ];
    } else if (priorityEvent) {
      // Priority but no sketch: move priority event to front
      sorted = [
        ...customSorted.filter(s => s.event === priorityEvent),
        ...customSorted.filter(s => s.event !== priorityEvent),
      ];
    } else {
      sorted = customSorted;
    }
    const placedMap = new Map<TimelineEvent, PlacedItem>();
    const placed: PlacedItem[] = [];

    for (const item of sorted) {
      const neighbors = overlaps.get(item.event) ?? new Set();
      const conflicting: PlacedItem[] = [];
      for (const n of neighbors) {
        const p = placedMap.get(n);
        if (p) conflicting.push(p);
      }
      conflicting.sort((a, b) => a.relativeY - b.relativeY);

      let y: number;
      if (pinnedRelativeY !== undefined && item.event === priorityEvent) {
        y = pinnedRelativeY;
      } else if (sketchHints) {
        const hint = sketchHints.get(item.event);
        y = hint !== undefined
          ? findYWithHint(conflicting, gap, item.height, hint)
          : findMinY(conflicting, gap);
      } else {
        y = findMinY(conflicting, gap);
      }

      placed.push({
        event: item.event,
        startYear: item.startYear,
        endYear: item.endYear,
        nominalStartYear: item.nominalStartYear,
        nominalEndYear: item.nominalEndYear,
        approxStartRange: item.approxStartRange,
        approxEndRange: item.approxEndRange,
        relativeY: y,
        height: item.height,
        isContainer: item.isContainer,
        isCollapsed: item.isCollapsed,
        isPoint: item.isPoint,
        placedChildren: item.placedChildren,
        overflowStart: item.overflowStart,
        overflowEnd: item.overflowEnd,
      });
      placedMap.set(item.event, placed[placed.length - 1]);
    }

    const totalHeight = placed.length > 0
      ? Math.max(...placed.map(p => p.relativeY + p.height))
      : 0;

    return { items: placed, totalHeight };
  }

  // Default: try multiple sort orders with gap filling, pick the most compact.
  // Skip multi-pass when all items have the same height (common for nested children).
  const byStartYear = (a: SizedItem, b: SizedItem) => a.startYear - b.startYear;

  const hasVariedHeights = sized.length > 1 && sized.some(s => s.height !== sized[0].height);
  if (!hasVariedHeights) {
    const result = placeWithOrder(sized, overlaps, byStartYear, gap, priorityEvent, pinnedRelativeY, sketchHints);
    result.items.sort((a, b) => a.startYear - b.startYear);
    return result;
  }

  // Skip multi-pass when sketch hints are active (hints determine positions)
  if (sketchHints) {
    const result = placeWithOrder(sized, overlaps, byStartYear, gap, priorityEvent, pinnedRelativeY, sketchHints);
    result.items.sort((a, b) => a.startYear - b.startYear);
    return result;
  }

  const byHeightDesc = (a: SizedItem, b: SizedItem) =>
    b.height - a.height || a.startYear - b.startYear;

  const result1 = placeWithOrder(sized, overlaps, byStartYear, gap, priorityEvent, pinnedRelativeY);
  const result2 = placeWithOrder(sized, overlaps, byHeightDesc, gap, priorityEvent, pinnedRelativeY);

  // Pick the more compact result; start-year wins ties for visual stability
  const best = result2.totalHeight < result1.totalHeight ? result2 : result1;
  best.items.sort((a, b) => a.startYear - b.startYear);
  return best;
}

/**
 * Convert relative-Y placed items to absolute-Y LayoutItems.
 */
function toLayoutItems(placed: PlacedItem[], offsetY: number): LayoutItem[] {
  return placed.map(item => {
    const y = offsetY + item.relativeY;

    const base = {
      event: item.event,
      startYear: item.startYear,
      endYear: item.endYear,
      nominalStartYear: item.nominalStartYear,
      nominalEndYear: item.nominalEndYear,
      approxStartRange: item.approxStartRange,
      approxEndRange: item.approxEndRange,
      y,
      height: item.height,
    };

    if (!item.isContainer) {
      return {
        ...base,
        isContainer: false,
        isCollapsed: false,
        isPoint: item.isPoint,
        children: [],
      };
    }

    if (item.isCollapsed) {
      return {
        ...base,
        isContainer: true,
        isCollapsed: true,
        isPoint: false,
        children: [],
      };
    }

    const childrenStartY = y + LAYOUT.containerHeaderHeight + LAYOUT.containerPadding;
    const children = toLayoutItems(item.placedChildren, childrenStartY);

    return {
      ...base,
      isContainer: true,
      isCollapsed: false,
      isPoint: false,
      children,
      overflowStart: item.overflowStart,
      overflowEnd: item.overflowEnd,
    };
  });
}

/**
 * Recursively compute layout for a list of events starting at a given Y offset.
 */
export function computeLayout(
  events: TimelineEvent[],
  startY: number,
  collapsedEvents?: Set<TimelineEvent>,
  eventOrders?: EventOrderMap,
  hiddenEvents?: Set<TimelineEvent>,
  priorityEvent?: TimelineEvent,
  pinnedY?: number,
  sketchHints?: Map<TimelineEvent, number>,
): LayoutItem[] {
  const pinnedRelativeY = pinnedY !== undefined ? pinnedY - startY : undefined;
  // Convert absolute Y hints to relative
  let relativeHints: Map<TimelineEvent, number> | undefined;
  if (sketchHints) {
    relativeHints = new Map();
    for (const [e, y] of sketchHints) {
      relativeHints.set(e, y - startY);
    }
  }
  const { items } = placeLevel(events, LAYOUT.parentBarHeight, LAYOUT.itemGap, collapsedEvents, eventOrders, [], hiddenEvents, priorityEvent, pinnedRelativeY, relativeHints);
  return toLayoutItems(items, startY);
}
