export interface Viewport {
  start: number;  // left edge, decimal year (float)
  end: number;    // right edge, decimal year (float)
}

/** Padding in pixels on left/right of the drawing area. Must match renderer LAYOUT.paddingX. */
const PADDING_X = 60;

const MIN_SPAN = 0.1;     // ~1 month visible
const MAX_SPAN = 10_000;  // practical ceiling

/**
 * Shift the viewport by a pixel delta, converting to year delta
 * based on the current viewport span and canvas width.
 */
export function panViewport(viewport: Viewport, pixelDelta: number, canvasWidth: number): Viewport {
  const span = viewport.end - viewport.start;
  const yearDelta = pixelDelta * (span / canvasWidth);
  return {
    start: viewport.start + yearDelta,
    end: viewport.end + yearDelta,
  };
}

/** Convert a decimal year to a pixel X coordinate. */
export function yearToX(year: number, viewport: Viewport, canvasWidth: number): number {
  const drawWidth = canvasWidth - PADDING_X * 2;
  return PADDING_X + ((year - viewport.start) / (viewport.end - viewport.start)) * drawWidth;
}

/** Convert a pixel X coordinate to a decimal year. Inverse of yearToX. */
export function xToYear(px: number, viewport: Viewport, canvasWidth: number): number {
  const drawWidth = canvasWidth - PADDING_X * 2;
  return viewport.start + ((px - PADDING_X) / drawWidth) * (viewport.end - viewport.start);
}

/**
 * Zoom the viewport by a wheel delta, anchored at cursorX.
 * The year under the cursor stays at the same pixel position.
 */
export function zoomViewport(
  viewport: Viewport,
  cursorX: number,
  canvasWidth: number,
  deltaY: number,
): Viewport {
  const anchorYear = xToYear(cursorX, viewport, canvasWidth);

  let factor = 1 + deltaY * 0.001;

  // Clamp factor to respect span limits
  const currentSpan = viewport.end - viewport.start;
  const newSpan = currentSpan * factor;
  if (newSpan < MIN_SPAN) {
    factor = MIN_SPAN / currentSpan;
  } else if (newSpan > MAX_SPAN) {
    factor = MAX_SPAN / currentSpan;
  }

  return {
    start: anchorYear - (anchorYear - viewport.start) * factor,
    end: anchorYear + (viewport.end - anchorYear) * factor,
  };
}
