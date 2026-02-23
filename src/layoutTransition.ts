import { LayoutItem } from './timeline/layout';
import { TimelineEvent } from './types';

/** Record absolute Y for every layout item at all depths. */
export function capturePositions(items: LayoutItem[], map: Map<TimelineEvent, number>): void {
  for (const item of items) {
    map.set(item.event, item.y);
    if (item.children.length > 0) capturePositions(item.children, map);
  }
}

/**
 * Compute offsets relative to the parent's offset. The renderer applies
 * ctx.translate on each level, so children inherit their parent's offset.
 * Storing only the relative delta avoids double-counting.
 */
export function computeOffsets(
  items: LayoutItem[],
  oldPositions: Map<TimelineEvent, number>,
  yOffsets: Map<TimelineEvent, number>,
  parentOffset = 0,
): void {
  for (const item of items) {
    const oldY = oldPositions.get(item.event);
    const absoluteOffset = oldY !== undefined ? oldY - item.y : 0;
    const relativeOffset = absoluteOffset - parentOffset;
    if (relativeOffset !== 0) {
      yOffsets.set(item.event, relativeOffset);
    }
    if (item.children.length > 0) {
      computeOffsets(item.children, oldPositions, yOffsets, absoluteOffset);
    }
  }
}
