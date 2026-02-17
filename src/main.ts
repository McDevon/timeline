import { loadEvents } from './data/loader';
import { render, computeFullRange, LAYOUT, LayoutTransition, ReorderState } from './timeline/renderer';
import { computeLayout, LayoutItem } from './timeline/layout';
import { Viewport, zoomViewport } from './timeline/viewport';
import { hitTest } from './timeline/hitTest';
import { TimelineEvent, TimelineSelection } from './types';
import { setupInput } from './timeline/input';
import { SnapState } from './timeline/snap';
import { EventListPanel } from './ui/eventList';
import { InfoLog } from './ui/infoLog';
import { TimelineMenu } from './ui/timelineMenu';
import { showConfirmDialog } from './ui/confirmDialog';
import { saveState, loadState } from './state';
import { dateToDecimalYear } from './data/time';
import { isStoreInitialized, setStoreInitialized, loadStoredEvents, saveStoredEvents, clearStoredEvents, clearStore } from './data/store';
import { validateEvents } from './data/validate';
import { loadSavedTheme, applyTheme } from './themes';

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

  // IndexedDB is the primary data store. On first load, seed from static JSON.
  let events: TimelineEvent[];
  const initialized = await isStoreInitialized();
  if (initialized) {
    events = await loadStoredEvents();
  } else {
    events = await loadEvents('/events.json', '/events.example.json');
    await saveStoredEvents(events);
    await setStoreInitialized();
  }

  const infoLog = new InfoLog();

  // Visibility, collapse, and ordering state
  const hiddenEvents = new Set<TimelineEvent>();
  const collapsedEvents = new Set<TimelineEvent>();
  const eventOrders = new Map<string, string[]>();

  // Restore saved state
  const saved = loadState(events);
  if (saved) {
    saved.hiddenEvents.forEach(e => hiddenEvents.add(e));
    saved.collapsedEvents.forEach(e => collapsedEvents.add(e));
    for (const [k, v] of saved.eventOrders) eventOrders.set(k, v);
  }

  let layout: LayoutItem[] = computeLayout(
    events.filter(e => !hiddenEvents.has(e)),
    LAYOUT.eventsStartY,
    collapsedEvents,
    eventOrders,
  );

  function relayout() {
    const visible = events.filter(e => !hiddenEvents.has(e));
    layout = computeLayout(visible, LAYOUT.eventsStartY, collapsedEvents, eventOrders);
  }

  // Initialize viewport — use saved or compute full range
  let viewport: Viewport = saved?.viewport ?? computeFullRange(events);
  let hoveredItem: LayoutItem | null = null;
  let eventListPanel: EventListPanel | null = null;

  function findTopLevelEvent(item: LayoutItem): TimelineEvent | null {
    for (const evt of events) {
      if (evt === item.event) return evt;
      if (evt.nested) {
        const found = (function walk(nested: TimelineEvent[]): boolean {
          for (const child of nested) {
            if (child === item.event) return true;
            if (child.nested && walk(child.nested)) return true;
          }
          return false;
        })(evt.nested);
        if (found) return evt;
      }
    }
    return null;
  }

  function setHoveredItem(item: LayoutItem | null) {
    hoveredItem = item;
    const topEvent = item ? findTopLevelEvent(item) : null;
    eventListPanel?.highlightEvent(topEvent);
  }
  let selectedItem: LayoutItem | null = null;
  let cursorX = -1;
  let selection: TimelineSelection | null = saved?.selection ?? null;
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
    render(ctx, rect.width, rect.height, layout, viewport, hoveredItem, selectedItem, cursorX, selection, snapState, transition, reorderState ?? undefined);
  }

  // Debounced state persistence
  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveState(viewport, selection, hiddenEvents, collapsedEvents, events, eventOrders);
    }, 500);
  }

  function requestRedraw() {
    if (rafId === 0) {
      rafId = requestAnimationFrame(draw);
    }
    scheduleSave();
  }

  function animateZoom(target: Viewport) {
    animFrom = { ...viewport };
    animTo = target;
    animStartTime = performance.now();
    requestRedraw();
  }

  // Collapse toggle handler
  function onCollapseToggle(event: TimelineEvent) {
    const oldPositions = new Map<TimelineEvent, number>();
    for (const item of layout) oldPositions.set(item.event, item.y);

    const fadingOut: LayoutItem[] = [];
    const fadingIn = new Set<TimelineEvent>();
    const wasCollapsed = collapsedEvents.has(event);

    if (!wasCollapsed) {
      // Collapsing — capture children for fade-out
      const container = layout.find(item => item.event === event);
      if (container) {
        for (const child of container.children) fadingOut.push(child);
      }
      collapsedEvents.add(event);
    } else {
      collapsedEvents.delete(event);
    }

    relayout();

    // Compute Y offsets for animated items
    const yOffsets = new Map<TimelineEvent, number>();
    for (const item of layout) {
      const oldY = oldPositions.get(item.event);
      if (oldY !== undefined && oldY !== item.y) {
        yOffsets.set(item.event, oldY - item.y);
      }
    }

    // Mark newly visible children as fading in
    if (wasCollapsed) {
      const container = layout.find(item => item.event === event);
      if (container) {
        for (const child of container.children) fadingIn.add(child.event);
      }
    }

    layoutTransition = { startTime: performance.now(), fadingOut, yOffsets, fadingIn };

    // Clear state referencing now-hidden children
    if (!wasCollapsed) {
      if (hoveredItem && hoveredItem.event !== event && isDescendantOf(hoveredItem, event)) {
        setHoveredItem(null);
      }
      if (selectedItem && selectedItem.event !== event && isDescendantOf(selectedItem, event)) {
        selectedItem = null;
      }
    }

    requestRedraw();
  }

  // --- Reorder drag ---
  let reorderState: ReorderState | null = null;
  let reorderOriginalOrders: Map<string, string[]> | null = null;
  let reorderLastIndex = -1;

  /** Find the sibling list and parent path key for an event. */
  function findSiblingInfo(event: TimelineEvent): { siblings: TimelineEvent[]; parentPath: string } {
    const visibleRoot = events.filter(e => !hiddenEvents.has(e));
    if (visibleRoot.includes(event)) {
      return { siblings: visibleRoot, parentPath: '[]' };
    }
    function walk(list: TimelineEvent[], path: string[]): { siblings: TimelineEvent[]; parentPath: string } | null {
      for (const e of list) {
        if (e.nested && e.nested.includes(event)) {
          return { siblings: e.nested, parentPath: JSON.stringify([...path, e.name]) };
        }
        if (e.nested) {
          const found = walk(e.nested, [...path, e.name]);
          if (found) return found;
        }
      }
      return null;
    }
    return walk(events, []) ?? { siblings: [event], parentPath: '[]' };
  }

  /** Find layout items that are siblings of the given item. */
  function findSiblingLayoutItems(item: LayoutItem): LayoutItem[] {
    if (layout.some(l => l.event === item.event)) return layout;
    function walkChildren(items: LayoutItem[]): LayoutItem[] | null {
      for (const parent of items) {
        if (parent.children.some(c => c.event === item.event)) return parent.children;
        if (parent.children.length > 0) {
          const found = walkChildren(parent.children);
          if (found) return found;
        }
      }
      return null;
    }
    return walkChildren(layout) ?? [item];
  }

  /** Find the parent layout item for a nested event. */
  function findParentLayoutItem(event: TimelineEvent): LayoutItem | null {
    function walk(items: LayoutItem[]): LayoutItem | null {
      for (const item of items) {
        if (item.children.some(c => c.event === event)) return item;
        if (item.children.length > 0) {
          const found = walk(item.children);
          if (found) return found;
        }
      }
      return null;
    }
    return walk(layout);
  }

  /** Compute drop index from cursor Y, grouping same-row siblings. */
  function computeDropIndex(draggedItem: LayoutItem, cursorY: number): number {
    const others = findSiblingLayoutItems(draggedItem)
      .filter(s => s.event !== draggedItem.event)
      .sort((a, b) => a.y - b.y);
    if (others.length === 0) return 0;

    // Group into rows (items at the same Y ± 1px)
    const rows: LayoutItem[][] = [];
    for (const item of others) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || Math.abs(item.y - lastRow[0].y) > 1) {
        rows.push([item]);
      } else {
        lastRow.push(item);
      }
    }

    // Count items in rows whose midpoint is above the cursor.
    // The cursor must pass a row's vertical center to count it.
    // For distant rows (tall containers), cap the boundary so the user
    // never needs to drag more than MAX_BOUNDARY_GAP past the previous row.
    const MAX_BOUNDARY_GAP = 60;
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const rowTop = rows[i][0].y;
      const rowBottom = Math.max(...rows[i].map(r => r.y + r.height));
      let boundary = (rowTop + rowBottom) / 2;

      if (i > 0) {
        const prevBottom = Math.max(...rows[i - 1].map(r => r.y + r.height));
        boundary = Math.min(boundary, prevBottom + MAX_BOUNDARY_GAP);
      }

      if (cursorY >= boundary) {
        count += rows[i].length;
      } else {
        break;
      }
    }
    return count;
  }

  function onReorderMove(item: LayoutItem, cursorY: number) {
    // Save original orders for cancel on first move
    if (!reorderOriginalOrders) {
      reorderOriginalOrders = new Map(eventOrders);
    }

    const { siblings, parentPath } = findSiblingInfo(item.event);

    // Clamp ghostY to parent bounds for nested events
    let ghostY = cursorY;
    if (parentPath !== '[]') {
      const parentItem = findParentLayoutItem(item.event);
      if (parentItem) {
        const minY = parentItem.y + 30; // containerHeaderHeight + padding
        const maxY = parentItem.y + parentItem.height - 6;
        ghostY = Math.max(minY, Math.min(maxY, cursorY));
      }
    }

    reorderState = { draggedEvent: item.event, ghostY };

    // Initialize order for this level if needed
    if (!eventOrders.has(parentPath)) {
      const defaultOrder = [...siblings]
        .sort((a, b) => dateToDecimalYear(a.start) - dateToDecimalYear(b.start))
        .map(e => e.name);
      eventOrders.set(parentPath, defaultOrder);
    }

    const dropIndex = computeDropIndex(item, ghostY);
    if (dropIndex !== reorderLastIndex) {
      reorderLastIndex = dropIndex;

      // Capture current visual positions of siblings for animation
      const siblingItems = findSiblingLayoutItems(item);
      const oldPositions = new Map<TimelineEvent, number>();
      for (const s of siblingItems) {
        let visualY = s.y;
        if (layoutTransition) {
          const offset = layoutTransition.yOffsets.get(s.event);
          if (offset) {
            const elapsed = performance.now() - layoutTransition.startTime;
            const progress = easeInOut(Math.min(elapsed / LAYOUT_ANIM_MS, 1));
            visualY = s.y + offset * (1 - progress);
          }
        }
        oldPositions.set(s.event, visualY);
      }

      // Rebuild order from current visual positions
      const oldOrder = eventOrders.get(parentPath);
      const oldIndexMap = oldOrder
        ? new Map(oldOrder.map((name, i) => [name, i]))
        : null;
      const visualOrder = [...siblingItems]
        .filter(s => s.event !== item.event)
        .sort((a, b) => {
          if (Math.abs(a.y - b.y) > 1) return a.y - b.y;
          // Same row: preserve existing custom order
          if (oldIndexMap) {
            const ai = oldIndexMap.get(a.event.name) ?? Infinity;
            const bi = oldIndexMap.get(b.event.name) ?? Infinity;
            return ai - bi;
          }
          return a.startYear - b.startYear;
        })
        .map(s => s.event.name);

      // Insert dragged item at the computed row-group position
      visualOrder.splice(dropIndex, 0, item.event.name);

      // Preserve names from old order not in current layout (hidden events)
      if (oldOrder) {
        for (const name of oldOrder) {
          if (!visualOrder.includes(name)) {
            visualOrder.push(name);
          }
        }
      }

      eventOrders.set(parentPath, visualOrder);
      relayout();

      // Animate siblings to new positions
      const newSiblings = findSiblingLayoutItems(item);
      const yOffsets = new Map<TimelineEvent, number>();
      for (const s of newSiblings) {
        const oldY = oldPositions.get(s.event);
        if (oldY !== undefined && Math.abs(oldY - s.y) > 0.5) {
          yOffsets.set(s.event, oldY - s.y);
        }
      }
      layoutTransition = yOffsets.size > 0
        ? { startTime: performance.now(), fadingOut: [], yOffsets, fadingIn: new Set() }
        : null;
    }
    requestRedraw();
  }

  function onReorderEnd(_item: LayoutItem) {
    reorderState = null;
    reorderOriginalOrders = null;
    reorderLastIndex = -1;
    requestRedraw();
  }

  function onReorderCancel() {
    if (reorderOriginalOrders) {
      eventOrders.clear();
      for (const [k, v] of reorderOriginalOrders) eventOrders.set(k, v);
      reorderOriginalOrders = null;
    }
    reorderState = null;
    reorderLastIndex = -1;
    relayout();
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
    setHoveredItem,
    (item: LayoutItem | null) => { selectedItem = item; },
    (x: number) => { cursorX = x; },
    () => selection,
    (sel: TimelineSelection | null) => { selection = sel; },
    (state: SnapState) => { snapState = state; },
    onCollapseToggle,
    onReorderMove,
    onReorderEnd,
    onReorderCancel,
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

    if (dblClickItem && hit.event === dblClickItem.event && dblClickPrevViewport) {
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
      if (hoveredItem && isDescendantOf(hoveredItem, event)) setHoveredItem(null);
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
      setHoveredItem(null);
    } else {
      setHoveredItem(layout.find(item => item.event === event) ?? null);
    }
    requestRedraw();
  }

  eventListPanel = new EventListPanel(events, onToggleEvent, onHoverEvent, hiddenEvents);

  // --- Event import (shared by drop handler and menu) ---
  function importEventsFromFile(file: File) {
    if (!file.name.endsWith('.json')) {
      infoLog.show(`Cannot import "${file.name}": only .json files are supported`);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(reader.result as string);
      } catch {
        infoLog.show(`Invalid JSON in "${file.name}"`);
        return;
      }

      const result = validateEvents(parsed);
      if ('error' in result) {
        infoLog.show(result.error);
        return;
      }

      // Deduplicate against existing events
      const newEvents: TimelineEvent[] = [];
      for (const ie of result.events) {
        if (events.some(e => e.name === ie.name)) {
          infoLog.show(`Skipped duplicate event: ${ie.name}`);
        } else {
          newEvents.push(ie);
        }
      }

      if (newEvents.length === 0) {
        infoLog.show(`No new events to add from "${file.name}"`);
        return;
      }

      // Add to main events array and persist
      events.push(...newEvents);
      await saveStoredEvents(events);

      // Recompute layout with fade-in animation for new events
      relayout();

      const fadingIn = new Set<TimelineEvent>();
      for (const ne of newEvents) fadingIn.add(ne);
      layoutTransition = {
        startTime: performance.now(),
        fadingOut: [],
        yOffsets: new Map(),
        fadingIn,
      };

      // Update event list panel
      eventListPanel?.addEvents(newEvents, onToggleEvent, onHoverEvent);

      infoLog.show(`Added ${newEvents.length} event${newEvents.length !== 1 ? 's' : ''} from "${file.name}"`);
      requestRedraw();
    };

    reader.onerror = () => {
      infoLog.show(`Failed to read "${file.name}"`);
    };

    reader.readAsText(file);
  }

  // --- File drop handler ---
  let dropOverlay: HTMLDivElement | null = null;
  let dragCounter = 0;

  function getDropOverlay(): HTMLDivElement {
    if (!dropOverlay) {
      dropOverlay = document.createElement('div');
      dropOverlay.className = 'drop-overlay';
      dropOverlay.textContent = 'Drop JSON file to import events';
      document.body.appendChild(dropOverlay);
    }
    return dropOverlay;
  }

  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  document.body.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      getDropOverlay().classList.add('visible');
    }
  });

  document.body.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay?.classList.remove('visible');
    }
  });

  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay?.classList.remove('visible');

    const file = e.dataTransfer?.files[0];
    if (file) importEventsFromFile(file);
  });

  // --- Timeline menu ---
  new TimelineMenu({
    onImport: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) importEventsFromFile(file);
      });
      input.click();
    },
    onExport: () => {
      const json = JSON.stringify(events, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'timeline-events.json';
      a.click();
      URL.revokeObjectURL(url);
      infoLog.show(`Exported ${events.length} events`);
    },
    onDeleteAll: () => {
      showConfirmDialog('Delete all events? This cannot be undone.', async () => {
        events.length = 0;
        hiddenEvents.clear();
        collapsedEvents.clear();
        eventOrders.clear();
        await clearStoredEvents();
        eventListPanel?.clear();
        hoveredItem = null;
        selectedItem = null;
        dblClickPrevViewport = null;
        dblClickItem = null;
        relayout();
        requestRedraw();
        infoLog.show('All events deleted');
      });
    },
    onReloadDefaults: () => {
      showConfirmDialog('Reload default events? All imported events and settings will be lost.', async () => {
        await clearStore();
        localStorage.removeItem('timeline-state');
        location.reload();
      });
    },
    onThemeChange: () => requestRedraw(),
  });

  // Apply saved theme before first draw
  const savedTheme = loadSavedTheme();
  applyTheme(savedTheme, () => {});

  // Initial draw and resize handler
  draw();
  window.addEventListener('resize', () => requestRedraw());
}

main();
