import { TimelineEvent } from '../types';
import { LayoutItem } from './layout';

/** Find the sibling event list and parent path key for an event. */
export function findSiblingInfo(
  event: TimelineEvent,
  events: TimelineEvent[],
  hiddenEvents: Set<TimelineEvent>,
): { siblings: TimelineEvent[]; parentPath: string } {
  const visibleRoot = events.filter(e => !hiddenEvents.has(e));
  if (visibleRoot.includes(event)) {
    return { siblings: visibleRoot, parentPath: '[]' };
  }
  function walk(list: TimelineEvent[], path: string[]): { siblings: TimelineEvent[]; parentPath: string } | null {
    for (const e of list) {
      if (e.nested && e.nested.includes(event)) {
        return { siblings: e.nested, parentPath: JSON.stringify([...path, e.name]) };
      }
      if (e.nested) {
        const found = walk(e.nested, [...path, e.name]);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(events, []) ?? { siblings: [event], parentPath: '[]' };
}

/** Find layout items that are siblings of the given item. */
export function findSiblingLayoutItems(item: LayoutItem, layout: LayoutItem[]): LayoutItem[] {
  if (layout.some(l => l.event === item.event)) return layout;
  function walkChildren(items: LayoutItem[]): LayoutItem[] | null {
    for (const parent of items) {
      if (parent.children.some(c => c.event === item.event)) return parent.children;
      if (parent.children.length > 0) {
        const found = walkChildren(parent.children);
        if (found) return found;
      }
    }
    return null;
  }
  return walkChildren(layout) ?? [item];
}

/** Find the parent layout item for a nested event. */
export function findParentLayoutItem(event: TimelineEvent, layout: LayoutItem[]): LayoutItem | null {
  function walk(items: LayoutItem[]): LayoutItem | null {
    for (const item of items) {
      if (item.children.some(c => c.event === event)) return item;
      if (item.children.length > 0) {
        const found = walk(item.children);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(layout);
}

/** Build per-item reference positions from siblings (excluding the dragged item). */
export function buildRefPositions(
  draggedItem: LayoutItem,
  layout: LayoutItem[],
): { center: number; bottom: number }[] {
  return findSiblingLayoutItems(draggedItem, layout)
    .filter(s => s.event !== draggedItem.event)
    .map(s => ({ center: s.y + s.height / 2, bottom: s.y + s.height }))
    .sort((a, b) => a.center - b.center);
}

/** Compute drop index from cursor Y using per-item reference positions. */
export function computeDropIndex(
  positions: { center: number; bottom: number }[],
  cursorY: number,
): number {
  if (positions.length === 0) return 0;

  const MAX_BOUNDARY_GAP = 60;
  let count = 0;
  let prevBottom = -Infinity;
  for (const pos of positions) {
    let boundary = pos.center;
    if (prevBottom !== -Infinity) {
      boundary = Math.min(boundary, prevBottom + MAX_BOUNDARY_GAP);
    }
    if (cursorY >= boundary) {
      count++;
      prevBottom = Math.max(prevBottom, pos.bottom);
    } else {
      break;
    }
  }
  return count;
}
