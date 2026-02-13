import { loadEvents } from './data/loader';
import { render, computeFullRange, LAYOUT } from './timeline/renderer';
import { computeLayout, LayoutItem } from './timeline/layout';
import { Viewport } from './timeline/viewport';
import { setupInput } from './timeline/input';

function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

async function main() {
  const canvas = document.getElementById('timeline-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element not found');
  }

  canvas.style.width = '100vw';
  canvas.style.height = '100vh';

  const events = await loadEvents('/events.json');

  // Compute layout once (events are static)
  const layout: LayoutItem[] = computeLayout(events, LAYOUT.eventsStartY);

  // Initialize viewport to show full data range
  let viewport: Viewport = computeFullRange(events);
  let hoveredItem: LayoutItem | null = null;
  let selectedItem: LayoutItem | null = null;

  // rAF-batched rendering
  let rafId = 0;

  function draw() {
    rafId = 0;
    const ctx = setupCanvas(canvas);
    const rect = canvas.getBoundingClientRect();
    render(ctx, rect.width, rect.height, layout, viewport, hoveredItem, selectedItem);
  }

  function requestRedraw() {
    if (rafId === 0) {
      rafId = requestAnimationFrame(draw);
    }
  }

  // Wire up input
  setupInput(
    canvas,
    () => viewport,
    (v: Viewport) => { viewport = v; },
    () => layout,
    () => hoveredItem,
    (item: LayoutItem | null) => { hoveredItem = item; },
    () => selectedItem,
    (item: LayoutItem | null) => { selectedItem = item; },
    requestRedraw,
  );

  // Initial draw and resize handler
  draw();
  window.addEventListener('resize', () => requestRedraw());
}

main();
