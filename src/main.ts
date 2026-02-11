import { loadEvents } from './data/loader';
import { render, computeFullRange } from './timeline/renderer';
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

  // Initialize viewport to show full data range
  let viewport: Viewport = computeFullRange(events);

  // rAF-batched rendering
  let rafId = 0;

  function draw() {
    rafId = 0;
    const ctx = setupCanvas(canvas);
    const rect = canvas.getBoundingClientRect();
    render(ctx, rect.width, rect.height, events, viewport);
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
    requestRedraw,
  );

  // Initial draw and resize handler
  draw();
  window.addEventListener('resize', () => requestRedraw());
}

main();
