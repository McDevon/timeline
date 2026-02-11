export interface Viewport {
  start: number;  // left edge, decimal year (float)
  end: number;    // right edge, decimal year (float)
}

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
