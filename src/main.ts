import { loadEvents } from './data/loader';
import { render, computeFullRange, LAYOUT, LayoutTransition } from './timeline/renderer';
import { computeLayout, LayoutItem } from './timeline/layout';
import { Viewport, zoomViewport } from './timeline/viewport';
import { hitTest } from './timeline/hitTest';
import { TimelineEvent, TimelineSelection } from './types';
import { setupInput } from './timeline/input';
import { SnapState } from './timeline/snap';
import { EventListPanel } from './ui/eventList';

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

  // Visibility state and dynamic layout
  const hiddenEvents = new Set<TimelineEvent>();
  let layout: LayoutItem[] = computeLayout(events, LAYOUT.eventsStartY);

  function relayout() {
    const visible = events.filter(e => !hiddenEvents.has(e));
    layout = computeLayout(visible, LAYOUT.eventsStartY);
  }

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

  // Layout transition animation state
  interface LayoutTransitionState {
    startTime: number;
    fadingOut: LayoutItem[];
    yOffsets: Map<TimelineEvent, number>;
    fadingIn: Set<TimelineEvent>;
  }
  let layoutTransition: LayoutTransitionState | null = null;
  const LAYOUT_ANIM_MS = 200;

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

    // Layout transition animation
    let transition: LayoutTransition | undefined;
    if (layoutTransition) {
      const elapsed = performance.now() - layoutTransition.startTime;
      const lt = Math.min(elapsed / LAYOUT_ANIM_MS, 1);
      transition = {
        fadingOut: layoutTransition.fadingOut,
        yOffsets: layoutTransition.yOffsets,
        fadingIn: layoutTransition.fadingIn,
        progress: easeInOut(lt),
      };
      if (lt < 1) {
        if (rafId === 0) rafId = requestAnimationFrame(draw);
      } else {
        layoutTransition = null;
      }
    }

    const ctx = setupCanvas(canvas);
    const rect = canvas.getBoundingClientRect();
    render(ctx, rect.width, rect.height, layout, viewport, hoveredItem, selectedItem, cursorX, selection, snapState, transition);
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

  // Event list panel — visibility toggles
  function isDescendantOf(item: LayoutItem, ancestor: TimelineEvent): boolean {
    if (item.event === ancestor) return true;
    if (!ancestor.nested) return false;
    for (const child of ancestor.nested) {
      if (item.event === child) return true;
      if (child.nested && isDescendantOf(item, child)) return true;
    }
    return false;
  }

  function onToggleEvent(event: TimelineEvent, visible: boolean) {
    // Capture old Y positions
    const oldPositions = new Map<TimelineEvent, number>();
    for (const item of layout) oldPositions.set(item.event, item.y);

    // Capture items about to be hidden
    const fadingOut: LayoutItem[] = [];
    if (!visible) {
      const hiding = layout.find(item => item.event === event);
      if (hiding) fadingOut.push(hiding);
    }

    // Update hidden set and recompute layout
    if (visible) hiddenEvents.delete(event);
    else hiddenEvents.add(event);
    relayout();

    // Compute Y offsets for items that moved
    const yOffsets = new Map<TimelineEvent, number>();
    for (const item of layout) {
      const oldY = oldPositions.get(item.event);
      if (oldY !== undefined && oldY !== item.y) {
        yOffsets.set(item.event, oldY - item.y);
      }
    }

    // Items fading in
    const fadingIn = new Set<TimelineEvent>();
    if (visible) fadingIn.add(event);

    // Start animation
    layoutTransition = { startTime: performance.now(), fadingOut, yOffsets, fadingIn };

    // Clear hovered/selected if they reference the hidden event
    if (!visible) {
      if (hoveredItem && isDescendantOf(hoveredItem, event)) hoveredItem = null;
      if (selectedItem && isDescendantOf(selectedItem, event)) selectedItem = null;
      if (dblClickItem && isDescendantOf(dblClickItem, event)) {
        dblClickPrevViewport = null;
        dblClickItem = null;
      }
    }

    requestRedraw();
  }

  function onHoverEvent(event: TimelineEvent | null) {
    if (event === null) {
      hoveredItem = null;
    } else {
      hoveredItem = layout.find(item => item.event === event) ?? null;
    }
    requestRedraw();
  }

  new EventListPanel(events, onToggleEvent, onHoverEvent);

  // Initial draw and resize handler
  draw();
  window.addEventListener('resize', () => requestRedraw());
}

main();
