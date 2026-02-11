import { loadEvents } from './data/loader';
import { render } from './timeline/renderer';

function setupCanvas(canvas: HTMLCanvasElement) {
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

  // Fill viewport
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';

  const events = await loadEvents('/events.json');

  function draw() {
    const ctx = setupCanvas(canvas);
    render(ctx, canvas, events);
  }

  draw();
  window.addEventListener('resize', draw);
}

main();
