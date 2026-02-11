import { Viewport, panViewport } from './viewport';

export interface InputHandlers {
  destroy(): void;
}

/**
 * Attach input handlers to a canvas for panning the viewport.
 * Returns a destroy function to remove all listeners.
 */
export function setupInput(
  canvas: HTMLCanvasElement,
  getViewport: () => Viewport,
  setViewport: (v: Viewport) => void,
  requestRedraw: () => void,
): InputHandlers {
  // --- Wheel / trackpad ---
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const viewport = getViewport();
    // Use deltaX for horizontal swipe; fall back to deltaY for vertical-only wheels
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    setViewport(panViewport(viewport, delta, canvas.clientWidth));
    requestRedraw();
  }

  // --- Mouse drag ---
  let dragging = false;
  let lastMouseX = 0;

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return; // left button only
    dragging = true;
    lastMouseX = e.clientX;
    canvas.style.cursor = 'grabbing';
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging) return;
    const dx = lastMouseX - e.clientX; // inverted: drag right → scroll left
    lastMouseX = e.clientX;
    const viewport = getViewport();
    setViewport(panViewport(viewport, dx, canvas.clientWidth));
    requestRedraw();
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
  }

  // --- Touch drag ---
  let lastTouchX = 0;

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      lastTouchX = e.touches[0].clientX;
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const dx = lastTouchX - e.touches[0].clientX;
    lastTouchX = e.touches[0].clientX;
    const viewport = getViewport();
    setViewport(panViewport(viewport, dx, canvas.clientWidth));
    requestRedraw();
  }

  // Attach listeners
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });

  // Set initial cursor
  canvas.style.cursor = 'grab';

  return {
    destroy() {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
    },
  };
}
