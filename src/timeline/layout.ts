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
  nominalStartYear: number;
  nominalEndYear: number;
  approxStartRange?: [number, number];
  approxEndRange?: [number, number];
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
  nominalStartYear: number;
  nominalEndYear: number;
  approxStartRange?: [number, number];
  approxEndRange?: [number, number];
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
    const nominalStart = dateToDecimalYear(event.start);
    const nominalEnd = event.end !== undefined ? dateToDecimalYear(event.end) : nominalStart;

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
      if (event.endApprox && event.end !== undefined) {
        approxEndRange = [dateToDecimalYear(event.endApprox[0]), dateToDecimalYear(event.endApprox[1])];
      }
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
      ...base,
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
      nominalStartYear: item.nominalStartYear,
      nominalEndYear: item.nominalEndYear,
      approxStartRange: item.approxStartRange,
      approxEndRange: item.approxEndRange,
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
        isPoint: item.isPoint,
        children: [],
      };
    }

    const childrenStartY = y + LAYOUT.containerHeaderHeight + LAYOUT.containerPadding;
    const children = toLayoutItems(item.placedChildren, childrenStartY);

    return {
      ...base,
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
