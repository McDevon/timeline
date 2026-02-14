import { LayoutItem } from './layout';
import { Viewport, yearToX } from './viewport';

/**
 * Find the deepest LayoutItem under the given point.
 * For containers, children are checked first (deepest match wins).
 * Returns null if no item is under the point.
 */
export function hitTest(
  px: number,
  py: number,
  layout: LayoutItem[],
  viewport: Viewport,
  canvasWidth: number,
): LayoutItem | null {
  // Iterate in reverse so items drawn on top are hit first
  for (let i = layout.length - 1; i >= 0; i--) {
    const result = hitTestItem(px, py, layout[i], viewport, canvasWidth);
    if (result) return result;
  }
  return null;
}

function hitTestItem(
  px: number,
  py: number,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
): LayoutItem | null {
  if (item.isPoint) {
    // Circle hit test for point events
    const cx = yearToX(item.startYear, viewport, canvasWidth);
    const cy = item.y + item.height / 2;
    const radius = item.height / 4;
    const dist = Math.hypot(px - cx, py - cy);
    return dist <= radius ? item : null;
  }

  const x1 = yearToX(item.startYear, viewport, canvasWidth);
  const x2 = yearToX(item.endYear, viewport, canvasWidth);
  const itemWidth = Math.max(x2 - x1, 3);

  const inX = px >= x1 && px <= x1 + itemWidth;
  const inY = py >= item.y && py <= item.y + item.height;

  if (!inX || !inY) return null;

  // For containers, check children first (deepest match wins)
  if (item.isContainer && item.children.length > 0) {
    for (let i = item.children.length - 1; i >= 0; i--) {
      const childHit = hitTestItem(px, py, item.children[i], viewport, canvasWidth);
      if (childHit) return childHit;
    }
  }

  return item;
}
