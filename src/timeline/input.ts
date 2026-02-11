import { Viewport, panViewport, zoomViewport } from './viewport';
import { LayoutItem } from './layout';
import { hitTest } from './hitTest';
import { Tooltip } from '../ui/tooltip';

export interface InputHandlers {
  destroy(): void;
}

const CLICK_THRESHOLD = 3; // pixels — movement under this is a click, not a drag

/**
 * Attach input handlers to a canvas for panning, hover, and click.
 */
export function setupInput(
  canvas: HTMLCanvasElement,
  getViewport: () => Viewport,
  setViewport: (v: Viewport) => void,
  getLayout: () => LayoutItem[],
  getHovered: () => LayoutItem | null,
  setHovered: (item: LayoutItem | null) => void,
  requestRedraw: () => void,
): InputHandlers {
  const tooltip = new Tooltip();

  // --- Wheel / trackpad ---
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const viewport = getViewport();

    if (e.ctrlKey || e.metaKey) {
      // Zoom — Ctrl+wheel or trackpad pinch
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      setViewport(zoomViewport(viewport, cursorX, canvas.clientWidth, e.deltaY));
    } else {
      // Pan
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      setViewport(panViewport(viewport, delta, canvas.clientWidth));
    }

    requestRedraw();
  }

  // --- Mouse drag + click ---
  let dragging = false;
  let mouseDownX = 0;
  let mouseDownY = 0;
  let lastMouseX = 0;
  let didDrag = false;

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    dragging = true;
    didDrag = false;
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    lastMouseX = e.clientX;
    canvas.style.cursor = 'grabbing';
  }

  function onMouseMove(e: MouseEvent) {
    if (dragging) {
      const dx = lastMouseX - e.clientX;
      lastMouseX = e.clientX;

      const dist = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY);
      if (dist >= CLICK_THRESHOLD) {
        didDrag = true;
      }

      const viewport = getViewport();
      setViewport(panViewport(viewport, dx, canvas.clientWidth));
      requestRedraw();
      return;
    }

    // Hover detection
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const layout = getLayout();
    const viewport = getViewport();
    const hit = hitTest(x, y, layout, viewport, canvas.clientWidth);

    const prev = getHovered();
    if (hit !== prev) {
      setHovered(hit);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      requestRedraw();
    }
  }

  function onMouseUp(e: MouseEvent) {
    if (!dragging) return;
    dragging = false;

    if (!didDrag) {
      // This was a click, not a drag
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const layout = getLayout();
      const viewport = getViewport();
      const hit = hitTest(x, y, layout, viewport, canvas.clientWidth);

      if (hit) {
        tooltip.show(hit.event, e.clientX, e.clientY);
      } else {
        tooltip.hide();
      }
    }

    const hovered = getHovered();
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  }

  // --- Touch drag ---
  let lastTouchX = 0;

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      lastTouchX = e.touches[0].clientX;
      tooltip.hide();
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

  canvas.style.cursor = 'grab';

  return {
    destroy() {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      tooltip.hide();
    },
  };
}
