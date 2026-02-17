import { TimelineEvent } from '../types';
import { dateToDecimalYear, todayDecimalYear } from '../data/time';

/**
 * Maps a parent path key to an ordered array of child event names.
 * Keys: "" for root level, JSON-stringified path arrays for nested levels.
 * Only levels where the user has manually reordered are stored.
 */
export type EventOrderMap = Map<string, string[]>;

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
 * Returns max(bottom + gap) across all conflicting items, so the result
 * depends only on already-placed items — not on the new item's height.
 */
function findMinY(conflicting: PlacedItem[], gap: number): number {
  let y = 0;
  for (const item of conflicting) {
    y = Math.max(y, item.relativeY + item.height + gap);
  }
  return y;
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
): { items: PlacedItem[]; totalHeight: number } {
  // Filter out hidden events at this level
  const visibleEvents = hiddenEvents
    ? events.filter(e => !hiddenEvents.has(e))
    : events;

  // Phase 1: compute heights (recursively for containers)
  const sized = visibleEvents.map(event => {
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

    // Point events and leaf events without children
    if (isPoint || !event.nested || event.nested.length === 0) {
      return {
        ...base,
        height: barHeight,
        isContainer: false,
        isCollapsed: false,
        isPoint,
        placedChildren: [] as PlacedItem[],
      };
    }

    // Collapsed container: thin bar, no children
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

    const childPath = [...(parentPath ?? []), event.name];
    const { items: placedChildren, totalHeight: contentHeight } =
      placeLevel(event.nested, LAYOUT.childBarHeight, LAYOUT.rowGap, collapsedEvents, eventOrders, childPath, hiddenEvents);

    // Compute overlap range that includes children extending beyond the parent
    let overlapStart = base.startYear;
    let overlapEnd = base.endYear;
    for (const child of placedChildren) {
      if (child.startYear < overlapStart) overlapStart = child.startYear;
      if (child.endYear > overlapEnd) overlapEnd = child.endYear;
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

  // Phase 3: sort by custom order or start time
  const orderKey = JSON.stringify(parentPath ?? []);
  const customOrder = eventOrders?.get(orderKey);
  const sorted = customOrder
    ? sortByCustomOrder(sized, customOrder)
    : [...sized].sort((a, b) => a.startYear - b.startYear);

  // Phase 4: place events using overlap graph
  const placedMap = new Map<TimelineEvent, PlacedItem>();
  const placed: PlacedItem[] = [];

  for (const item of sorted) {
    // Find already-placed items that overlap this one in time
    const neighbors = overlaps.get(item.event) ?? new Set();
    const conflicting: PlacedItem[] = [];
    for (const n of neighbors) {
      const p = placedMap.get(n);
      if (p) conflicting.push(p);
    }
    conflicting.sort((a, b) => a.relativeY - b.relativeY);

    const y = findMinY(conflicting, gap);

    const placedItem: PlacedItem = {
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
      overflowStart: 'overflowStart' in item ? (item as { overflowStart?: number }).overflowStart : undefined,
      overflowEnd: 'overflowEnd' in item ? (item as { overflowEnd?: number }).overflowEnd : undefined,
    };

    placedMap.set(item.event, placedItem);
    placed.push(placedItem);
  }

  const totalHeight = placed.length > 0
    ? Math.max(...placed.map(p => p.relativeY + p.height))
    : 0;

  return { items: placed, totalHeight };
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
): LayoutItem[] {
  const { items } = placeLevel(events, LAYOUT.parentBarHeight, LAYOUT.itemGap, collapsedEvents, eventOrders, [], hiddenEvents);
  return toLayoutItems(items, startY);
}
