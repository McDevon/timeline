import { TimelineEvent } from '../types';
import { dateToDecimalYear } from '../data/time';

const LAYOUT = {
  parentBarHeight: 30,
  childBarHeight: 22,
  rowGap: 4,
  containerPadding: 6,
  containerHeaderHeight: 24,
  itemGap: 8,
};

export interface LayoutItem {
  event: TimelineEvent;
  startYear: number;
  endYear: number;
  y: number;
  height: number;
  isContainer: boolean;
  isPoint: boolean;
  children: LayoutItem[];
}

/** Internal: an event placed at a relative Y within its level. */
interface PlacedItem {
  event: TimelineEvent;
  startYear: number;
  endYear: number;
  relativeY: number;
  height: number;
  isContainer: boolean;
  isPoint: boolean;
  placedChildren: PlacedItem[];
}

/**
 * Find the minimum Y position where an item of the given height fits
 * without overlapping any active event. Active list must be sorted by Y.
 */
function findMinY(active: PlacedItem[], height: number, gap: number): number {
  let y = 0;
  for (const event of active) {
    if (y + height + gap <= event.relativeY) {
      break; // found a gap
    }
    y = Math.max(y, event.relativeY + event.height + gap);
  }
  return y;
}

/**
 * Insert an item into a Y-sorted active list, maintaining sort order.
 */
function insertSorted(active: PlacedItem[], item: PlacedItem): void {
  let i = active.length;
  while (i > 0 && active[i - 1].relativeY > item.relativeY) {
    i--;
  }
  active.splice(i, 0, item);
}

/**
 * Recursively compute sizes and place events at a given level.
 *
 * Uses sweep-and-prune: events are processed in time order, maintaining
 * an active set of time-overlapping events sorted by Y position.
 * Each event is placed at the highest Y that doesn't collide with any
 * active event. Works for arbitrary nesting depth — containers recursively
 * place their children the same way.
 */
function placeLevel(
  events: TimelineEvent[],
  barHeight: number,
  gap: number,
): { items: PlacedItem[]; totalHeight: number } {
  // Phase 1: compute heights (recursively for containers)
  const sized = events.map(event => {
    const startYear = dateToDecimalYear(event.start);
    const isPoint = event.end === undefined;
    const endYear = event.end !== undefined ? dateToDecimalYear(event.end) : startYear;

    // Point events and leaf events without children
    if (isPoint || !event.nested || event.nested.length === 0) {
      return {
        event,
        startYear,
        endYear,
        height: barHeight,
        isContainer: false,
        isPoint,
        placedChildren: [] as PlacedItem[],
      };
    }

    const { items: placedChildren, totalHeight: contentHeight } =
      placeLevel(event.nested, LAYOUT.childBarHeight, LAYOUT.rowGap);

    const height =
      LAYOUT.containerHeaderHeight +
      LAYOUT.containerPadding +
      contentHeight +
      LAYOUT.containerPadding;

    return {
      event,
      startYear,
      endYear,
      height,
      isContainer: true,
      isPoint: false,
      placedChildren,
    };
  });

  // Sort by start time for sweep
  const sorted = [...sized].sort((a, b) => a.startYear - b.startYear);

  // Phase 2: sweep-and-prune placement
  const active: PlacedItem[] = []; // Y-sorted active set
  const placed: PlacedItem[] = [];

  for (const item of sorted) {
    // Prune: remove events whose time range no longer overlaps
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].endYear <= item.startYear) {
        active.splice(i, 1);
      }
    }

    const y = findMinY(active, item.height, gap);

    const placedItem: PlacedItem = {
      event: item.event,
      startYear: item.startYear,
      endYear: item.endYear,
      relativeY: y,
      height: item.height,
      isContainer: item.isContainer,
      isPoint: item.isPoint,
      placedChildren: item.placedChildren,
    };

    insertSorted(active, placedItem);
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

    if (!item.isContainer) {
      return {
        event: item.event,
        startYear: item.startYear,
        endYear: item.endYear,
        y,
        height: item.height,
        isContainer: false,
        isPoint: item.isPoint,
        children: [],
      };
    }

    const childrenStartY = y + LAYOUT.containerHeaderHeight + LAYOUT.containerPadding;
    const children = toLayoutItems(item.placedChildren, childrenStartY);

    return {
      event: item.event,
      startYear: item.startYear,
      endYear: item.endYear,
      y,
      height: item.height,
      isContainer: true,
      isPoint: false,
      children,
    };
  });
}

/**
 * Recursively compute layout for a list of events starting at a given Y offset.
 */
export function computeLayout(events: TimelineEvent[], startY: number): LayoutItem[] {
  const { items } = placeLevel(events, LAYOUT.parentBarHeight, LAYOUT.itemGap);
  return toLayoutItems(items, startY);
}
