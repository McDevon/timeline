export interface Viewport {
  start: number;  // left edge, decimal year (float)
  end: number;    // right edge, decimal year (float)
}

/**
 * Shift the viewport by a pixel delta, converting to year delta
 * based on the current viewport span and canvas width.
 */
/** Padding in pixels on left/right of the drawing area. Must match renderer LAYOUT.paddingX. */
const PADDING_X = 60;

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
