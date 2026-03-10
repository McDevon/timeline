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
  scrollY = 0,
): LayoutItem | null {
  // Convert screen Y to layout Y
  const layoutY = py + scrollY;
  // Iterate in reverse so items drawn on top are hit first
  for (let i = layout.length - 1; i >= 0; i--) {
    const result = hitTestItem(px, layoutY, layout[i], viewport, canvasWidth);
    if (result) return result;
  }
  return null;
}

/**
 * Find all LayoutItems fully enclosed within a screen-space rectangle.
 * Includes parent/container events if they are fully enclosed.
 */
export function hitTestBox(
  rect: { x1: number; y1: number; x2: number; y2: number },
  layout: LayoutItem[],
  viewport: Viewport,
  canvasWidth: number,
  scrollY = 0,
): LayoutItem[] {
  // Normalize rect to ensure x1 < x2, y1 < y2
  const rx1 = Math.min(rect.x1, rect.x2);
  const ry1 = Math.min(rect.y1, rect.y2) + scrollY; // convert to layout Y
  const rx2 = Math.max(rect.x1, rect.x2);
  const ry2 = Math.max(rect.y1, rect.y2) + scrollY;

  const hits: LayoutItem[] = [];

  function collect(items: LayoutItem[]) {
    for (const item of items) {
      if (item.children.length > 0) {
        collect(item.children);
      }
      if (isEnclosed(item, rx1, ry1, rx2, ry2, viewport, canvasWidth)) {
        hits.push(item);
      }
    }
  }
  collect(layout);

  return hits;
}

function isEnclosed(
  item: LayoutItem,
  rx1: number,
  ry1: number,
  rx2: number,
  ry2: number,
  viewport: Viewport,
  canvasWidth: number,
): boolean {
  if (item.isPoint) {
    // Entire circle must be within the box
    const cx = yearToX(item.startYear, viewport, canvasWidth);
    const cy = item.y + item.height / 2;
    const radius = item.height / 4;
    return (cx - radius) >= rx1 && (cx + radius) <= rx2 &&
           (cy - radius) >= ry1 && (cy + radius) <= ry2;
  }

  // Use nominal bounds so ongoing events end at the today line
  // and approx ranges don't bloat the enclosure check
  const x1 = yearToX(item.nominalStartYear, viewport, canvasWidth);
  const x2 = yearToX(item.nominalEndYear, viewport, canvasWidth);
  const itemWidth = Math.max(x2 - x1, 3);
  const itemRight = x1 + itemWidth;
  const itemTop = item.y;
  const itemBottom = item.y + item.height;

  return x1 >= rx1 && itemRight <= rx2 && itemTop >= ry1 && itemBottom <= ry2;
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

  // Check children first — they can extend horizontally outside parent bounds.
  // Y check still applies since children are vertically within the parent.
  if (item.isContainer && item.children.length > 0 && inY) {
    for (let i = item.children.length - 1; i >= 0; i--) {
      const childHit = hitTestItem(px, py, item.children[i], viewport, canvasWidth);
      if (childHit) return childHit;
    }
  }

  if (!inX || !inY) return null;

  return item;
}
