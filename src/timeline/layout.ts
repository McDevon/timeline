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
  children: LayoutItem[];
}

/**
 * Assign each child to a row index using greedy interval packing.
 * Children should be sorted by start time before calling.
 * Returns an array of row indices (one per child).
 */
function packRows(children: { startYear: number; endYear: number }[]): number[] {
  // Each row tracks the end year of its last placed event
  const rowEnds: number[] = [];
  const assignments: number[] = [];

  for (const child of children) {
    let placed = false;
    for (let r = 0; r < rowEnds.length; r++) {
      if (child.startYear >= rowEnds[r]) {
        rowEnds[r] = child.endYear;
        assignments.push(r);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rowEnds.push(child.endYear);
      assignments.push(rowEnds.length - 1);
    }
  }

  return assignments;
}

/**
 * Compute the height of a container given the number of packed rows.
 */
function containerHeight(numRows: number): number {
  if (numRows === 0) return LAYOUT.parentBarHeight;
  return (
    LAYOUT.containerHeaderHeight +
    LAYOUT.containerPadding +
    numRows * LAYOUT.childBarHeight +
    (numRows - 1) * LAYOUT.rowGap +
    LAYOUT.containerPadding
  );
}

/**
 * Recursively compute layout for a list of events starting at a given Y offset.
 */
export function computeLayout(events: TimelineEvent[], startY: number): LayoutItem[] {
  const items: LayoutItem[] = [];
  let currentY = startY;

  for (const event of events) {
    const startYear = dateToDecimalYear(event.start);
    const endYear = dateToDecimalYear(event.end);

    if (!event.nested || event.nested.length === 0) {
      // Leaf event — simple bar
      items.push({
        event,
        startYear,
        endYear,
        y: currentY,
        height: LAYOUT.parentBarHeight,
        isContainer: false,
        children: [],
      });
      currentY += LAYOUT.parentBarHeight + LAYOUT.itemGap;
    } else {
      // Container event — compute children layout
      const childData = event.nested.map(child => ({
        event: child,
        startYear: dateToDecimalYear(child.start),
        endYear: dateToDecimalYear(child.end),
      }));

      // Sort by start time for packing
      const sorted = childData
        .map((c, i) => ({ ...c, originalIndex: i }))
        .sort((a, b) => a.startYear - b.startYear);

      const rowAssignments = packRows(sorted);
      const numRows = rowAssignments.length > 0 ? Math.max(...rowAssignments) + 1 : 0;
      const height = containerHeight(numRows);

      const containerY = currentY;
      const childrenStartY = containerY + LAYOUT.containerHeaderHeight + LAYOUT.containerPadding;

      // Build child layout items with Y positions based on row assignment
      const children: LayoutItem[] = sorted.map((child, i) => {
        const row = rowAssignments[i];
        const childY = childrenStartY + row * (LAYOUT.childBarHeight + LAYOUT.rowGap);

        // Recurse for deeply nested events
        if (child.event.nested && child.event.nested.length > 0) {
          const nestedItems = computeLayout([child.event], childY);
          return nestedItems[0];
        }

        return {
          event: child.event,
          startYear: child.startYear,
          endYear: child.endYear,
          y: childY,
          height: LAYOUT.childBarHeight,
          isContainer: false,
          children: [],
        };
      });

      items.push({
        event,
        startYear,
        endYear,
        y: containerY,
        height,
        isContainer: true,
        children,
      });
      currentY += height + LAYOUT.itemGap;
    }
  }

  return items;
}
