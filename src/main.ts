import { loadEvents } from './data/loader';
import { render, computeFullRange, LAYOUT } from './timeline/renderer';
import { computeLayout, LayoutItem } from './timeline/layout';
import { Viewport, zoomViewport } from './timeline/viewport';
import { hitTest } from './timeline/hitTest';
import { TimelineSelection } from './types';
import { setupInput } from './timeline/input';
import { SnapState } from './timeline/snap';

function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

async function main() {
  const canvas = document.getElementById('timeline-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element not found');
  }

  const events = await loadEvents('/events.json', '/events.example.json');

  // Compute layout once (events are static)
  const layout: LayoutItem[] = computeLayout(events, LAYOUT.eventsStartY);

  // Initialize viewport to show full data range
  let viewport: Viewport = computeFullRange(events);
  let hoveredItem: LayoutItem | null = null;
  let selectedItem: LayoutItem | null = null;
  let cursorX = -1;
  let selection: TimelineSelection | null = null;
  let snapState: SnapState = { highlightYears: new Set(), cursorDetail: null, selStartDetail: null, selEndDetail: null };
  let dblClickPrevViewport: Viewport | null = null;
  let dblClickItem: LayoutItem | null = null;
  let preClickSelection: TimelineSelection | null = null;
  let preClickSelectedItem: LayoutItem | null = null;
  let lastMouseDownTime = 0;

  // rAF-batched rendering
  let rafId = 0;

  // Zoom animation state
  let animFrom: Viewport | null = null;
  let animTo: Viewport | null = null;
  let animStartTime = 0;
  const ZOOM_ANIM_MS = 150;

  function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }

  function draw() {
    rafId = 0;

    if (animFrom && animTo) {
      const elapsed = performance.now() - animStartTime;
      const t = Math.min(elapsed / ZOOM_ANIM_MS, 1);
      const e = easeInOut(t);
      viewport = {
        start: animFrom.start + (animTo.start - animFrom.start) * e,
        end: animFrom.end + (animTo.end - animFrom.end) * e,
      };
      if (t < 1) {
        rafId = requestAnimationFrame(draw);
      } else {
        animFrom = null;
        animTo = null;
      }
    }

    const ctx = setupCanvas(canvas);
    const rect = canvas.getBoundingClientRect();
    render(ctx, rect.width, rect.height, layout, viewport, hoveredItem, selectedItem, cursorX, selection, snapState);
  }

  function requestRedraw() {
    if (rafId === 0) {
      rafId = requestAnimationFrame(draw);
    }
  }

  function animateZoom(target: Viewport) {
    animFrom = { ...viewport };
    animTo = target;
    animStartTime = performance.now();
    requestRedraw();
  }

  // Wire up input
  setupInput(
    canvas,
    () => viewport,
    (v: Viewport) => {
      const spanBefore = viewport.end - viewport.start;
      const spanAfter = v.end - v.start;
      if (Math.abs(spanAfter - spanBefore) > 1e-6) {
        dblClickPrevViewport = null;
        dblClickItem = null;
      }
      viewport = v;
    },
    () => layout,
    () => hoveredItem,
    (item: LayoutItem | null) => { hoveredItem = item; },
    (item: LayoutItem | null) => { selectedItem = item; },
    (x: number) => { cursorX = x; },
    () => selection,
    (sel: TimelineSelection | null) => { selection = sel; },
    (state: SnapState) => { snapState = state; },
    requestRedraw,
  );

  // Zoom buttons
  const ZOOM_DELTA = 120; // equivalent to one scroll wheel tick
  document.getElementById('zoom-in')!.addEventListener('click', () => {
    const center = canvas.clientWidth / 2;
    const base = animTo ?? viewport;
    animateZoom(zoomViewport(base, center, canvas.clientWidth, -ZOOM_DELTA));
  });
  document.getElementById('zoom-out')!.addEventListener('click', () => {
    const center = canvas.clientWidth / 2;
    const base = animTo ?? viewport;
    animateZoom(zoomViewport(base, center, canvas.clientWidth, ZOOM_DELTA));
  });

  // Snapshot selection state on first mousedown of a potential double-click
  canvas.addEventListener('mousedown', () => {
    const now = performance.now();
    if (now - lastMouseDownTime > 500) {
      preClickSelection = selection ? { ...selection } : null;
      preClickSelectedItem = selectedItem;
    }
    lastMouseDownTime = now;
  });

  // Double-click to zoom into event (toggle back on second double-click)
  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTest(x, y, layout, viewport, canvas.clientWidth);

    if (!hit || hit.event.end === undefined) return;

    // Restore selection state from before the double-click
    selection = preClickSelection;
    selectedItem = preClickSelectedItem;

    if (dblClickItem === hit && dblClickPrevViewport) {
      animateZoom(dblClickPrevViewport);
      dblClickPrevViewport = null;
      dblClickItem = null;
    } else {
      dblClickPrevViewport = { ...(animTo ?? viewport) };
      dblClickItem = hit;
      const padding = (hit.nominalEndYear - hit.nominalStartYear) * 0.1;
      animateZoom({
        start: hit.nominalStartYear - padding,
        end: hit.nominalEndYear + padding,
      });
    }
  });

  // Initial draw and resize handler
  draw();
  window.addEventListener('resize', () => requestRedraw());
}

main();
