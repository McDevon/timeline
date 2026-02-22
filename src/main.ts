import './styles/base.css';
import './styles/controls.css';
import './styles/panels.css';
import './styles/dialogs.css';
import { loadEvents } from './data/loader';
import { render, computeFullRange, computeMaxLayoutY, LAYOUT, ReorderState } from './timeline/renderer';
import { computeLayout, LayoutItem } from './timeline/layout';
import { Viewport, zoomViewport, xToYear } from './timeline/viewport';
import { hitTest } from './timeline/hitTest';
import { TimelineEvent, TimelineSelection } from './types';
import { setupInput } from './timeline/input';
import { SnapDetail, SnapState } from './timeline/snap';
import { EventListPanel } from './ui/eventList';
import { InfoLog } from './ui/infoLog';
import { TimelineMenu } from './ui/timelineMenu';
import { EventMenu } from './ui/eventMenu';
import { ContextMenu } from './ui/contextMenu';
import { showAlertDialog, showConfirmDialog } from './ui/confirmDialog';
import { showPromptDialog } from './ui/promptDialog';
import { showHelpDialog } from './ui/helpDialog';
import { saveState, loadState, eventToPath, pathToEvent } from './state';
import { UndoManager, UndoableState, captureSnapshot, resolvePathSet, getEventId } from './undo';
import { dateToDecimalYear, decimalYearToIso } from './data/time';
import { isStoreInitialized, setStoreInitialized, loadStoredEvents, saveStoredEvents, clearStoredEvents, clearStore } from './data/store';
import { validateEvents } from './data/validate';
import { loadSavedTheme, applyTheme } from './themes';
import { AnimationManager, easeInOut, LAYOUT_ANIM_MS } from './animation';
import { toSnakeCase, countEvents, removeEvent, findParent, collectDescendants, isDescendantOf } from './eventActions';
import { findSiblingInfo, findSiblingLayoutItems, findParentLayoutItem, buildRefPositions, computeDropIndex } from './timeline/reorder';
import { resolveTimeline } from './timeline-config';

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

  const config = await resolveTimeline();
  const slug = config.slug;
  if (config.title) document.title = config.title;

  // IndexedDB is the primary data store. On first load, seed from static JSON.
  let events: TimelineEvent[];
  try {
    const initialized = await isStoreInitialized(slug);
    if (initialized) {
      events = await loadStoredEvents(slug);
    } else {
      events = await loadEvents(config.dataUrl, config.fallbackUrl);
      await saveStoredEvents(slug, events);
      await setStoreInitialized(slug);
    }
  } catch {
    events = [];
  }

  const infoLog = new InfoLog();

  if (config.unknownSlug) {
    showAlertDialog(`Timeline "/${config.unknownSlug}" not found. Showing default timeline.`);
  }

  // Visibility, collapse, and ordering state
  const hiddenEvents = new Set<TimelineEvent>();
  const collapsedEvents = new Set<TimelineEvent>();
  const eventOrders = new Map<string, string[]>();

  // Restore saved state
  const saved = loadState(slug, events);
  if (saved) {
    saved.hiddenEvents.forEach(e => hiddenEvents.add(e));
    saved.collapsedEvents.forEach(e => collapsedEvents.add(e));
    for (const [k, v] of saved.eventOrders) eventOrders.set(k, v);
  }

  let layout: LayoutItem[] = computeLayout(
    events,
    LAYOUT.eventsStartY,
    collapsedEvents,
    eventOrders,
    hiddenEvents,
  );

  function relayout() {
    layout = computeLayout(events, LAYOUT.eventsStartY, collapsedEvents, eventOrders, hiddenEvents);
    // Clamp scroll if layout shrank
    const max = computeMaxScrollY();
    if (view.scrollY > max) view.scrollY = max;
  }

  // Undo/redo
  const undoManager = new UndoManager();
  let skipCoalesce = false;

  function snapshot() {
    return captureSnapshot(events, hiddenEvents, collapsedEvents, eventOrders);
  }

  // --- View state ---
  const view = {
    viewport: (saved?.viewport ?? computeFullRange(events)) as Viewport,
    scrollY: 0,
  };

  const anim = new AnimationManager();

  // --- Selection state ---
  const sel = {
    selection: (saved?.selection ?? null) as TimelineSelection | null,
    selectedItem: null as LayoutItem | null,
    hoveredItem: null as LayoutItem | null,
    snapState: { highlightYears: new Set<number>(), cursorDetail: null, selStartDetail: null, selEndDetail: null } as SnapState,
  };

  // --- UI state ---
  const ui = {
    cursorX: -1,
    showTodayLine: saved?.showTodayLine ?? true,
  };

  let dblClickPrevViewport: Viewport | null = null;
  let dblClickItem: LayoutItem | null = null;
  let preClickSelection: TimelineSelection | null = null;
  let preClickSelectedItem: LayoutItem | null = null;
  let preClickSnapOverrides: { anchor: SnapDetail | null; extend: SnapDetail | null } = { anchor: null, extend: null };
  let lastMouseDownTime = 0;
  let eventListPanel: EventListPanel | null = null;

  function computeMaxScrollY(): number {
    const maxY = computeMaxLayoutY(layout);
    const canvasHeight = canvas.getBoundingClientRect().height;
    return Math.max(0, maxY - canvasHeight + 100);
  }

  function findLayoutItem(event: TimelineEvent, items: LayoutItem[]): LayoutItem | null {
    for (const item of items) {
      if (item.event === event) return item;
      if (item.children.length > 0) {
        const found = findLayoutItem(event, item.children);
        if (found) return found;
      }
    }
    return null;
  }

  function setHoveredItem(item: LayoutItem | null) {
    sel.hoveredItem = item;
    eventListPanel?.highlightEvent(item?.event ?? null);
  }

  // rAF-batched rendering
  let rafId = 0;

  function draw() {
    rafId = 0;

    const { viewport, scrollY, transition, needsFrame } = anim.tick(view.viewport, view.scrollY);
    view.viewport = viewport;
    view.scrollY = scrollY;
    if (needsFrame) rafId = requestAnimationFrame(draw);

    const ctx = setupCanvas(canvas);
    const rect = canvas.getBoundingClientRect();
    render(ctx, rect.width, rect.height, layout, view.viewport, sel.hoveredItem, sel.selectedItem, ui.cursorX, sel.selection, sel.snapState, view.scrollY, ui.showTodayLine, transition, reorderState ?? undefined);
  }

  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveState(slug, view.viewport, sel.selection, hiddenEvents, collapsedEvents, events, eventOrders, ui.showTodayLine);
    }, 500);
  }

  function requestRedraw() {
    if (rafId === 0) {
      rafId = requestAnimationFrame(draw);
    }
    scheduleSave();
  }

  function animateZoom(target: Viewport) {
    anim.animateZoom(view.viewport, target);
    requestRedraw();
  }

  function animateScroll(target: number) {
    anim.animateScroll(view.scrollY, target, computeMaxScrollY());
    requestRedraw();
  }

  /** After relayout, re-find and re-select the event, scrolling into view if needed. */
  function reselectEvent(event: TimelineEvent, prevScroll?: number) {
    const item = findLayoutItem(event, layout);
    sel.selectedItem = item;
    if (item) {
      const rect = canvas.getBoundingClientRect();
      // Use pre-relayout scroll to detect if the event moved out of the old view
      const checkScroll = prevScroll ?? view.scrollY;
      const visibleTop = checkScroll + LAYOUT.eventsStartY;
      const visibleBottom = checkScroll + rect.height;
      if (item.y + item.height > visibleBottom) {
        // Restore pre-clamp scroll so animation starts from the right place
        if (prevScroll !== undefined) view.scrollY = prevScroll;
        animateScroll(item.y + item.height - rect.height + 20);
      } else if (item.y < visibleTop) {
        if (prevScroll !== undefined) view.scrollY = prevScroll;
        animateScroll(Math.max(item.y - LAYOUT.eventsStartY - 10, 0));
      }
    }
  }

  // Position capture: record absolute Y for every item at all depths.
  function capturePositions(items: LayoutItem[], map: Map<TimelineEvent, number>) {
    for (const item of items) {
      map.set(item.event, item.y);
      if (item.children.length > 0) capturePositions(item.children, map);
    }
  }

  // Compute offsets relative to the parent's offset. The renderer applies
  // ctx.translate on each level, so children inherit their parent's offset.
  // Storing only the relative delta avoids double-counting.
  function computeOffsets(
    items: LayoutItem[],
    oldPositions: Map<TimelineEvent, number>,
    yOffsets: Map<TimelineEvent, number>,
    parentOffset = 0,
  ) {
    for (const item of items) {
      const oldY = oldPositions.get(item.event);
      const absoluteOffset = oldY !== undefined ? oldY - item.y : 0;
      const relativeOffset = absoluteOffset - parentOffset;
      if (relativeOffset !== 0) {
        yOffsets.set(item.event, relativeOffset);
      }
      if (item.children.length > 0) {
        computeOffsets(item.children, oldPositions, yOffsets, absoluteOffset);
      }
    }
  }

  // Collapse toggle handler
  function onCollapseToggle(event: TimelineEvent) {
    const oldPositions = new Map<TimelineEvent, number>();
    capturePositions(layout, oldPositions);

    const fadingOut: LayoutItem[] = [];
    const fadingIn = new Set<TimelineEvent>();
    const wasCollapsed = collapsedEvents.has(event);

    if (!wasCollapsed) {
      // Collapsing — capture children for fade-out
      const container = findLayoutItem(event, layout);
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
    computeOffsets(layout, oldPositions, yOffsets);

    // Mark newly visible children as fading in
    if (wasCollapsed) {
      const container = findLayoutItem(event, layout);
      if (container) {
        for (const child of container.children) fadingIn.add(child.event);
      }
    }

    anim.layoutTransition = { startTime: performance.now(), fadingOut, yOffsets, fadingIn };

    // Clear state referencing now-hidden children
    if (!wasCollapsed) {
      if (sel.hoveredItem && sel.hoveredItem.event !== event && isDescendantOf(sel.hoveredItem.event, event)) {
        setHoveredItem(null);
      }
      if (sel.selectedItem && sel.selectedItem.event !== event && isDescendantOf(sel.selectedItem.event, event)) {
        sel.selectedItem = null;
        eventListPanel?.selectEvent(null);
        eventMenu.hide();
      }
    }

    undoManager.push(snapshot());
    requestRedraw();
  }

  // --- Reorder drag ---
  let reorderState: ReorderState | null = null;
  let reorderOriginalOrders: Map<string, string[]> | null = null;
  let reorderLastIndex = -1;
  /** Stable reference positions for drop index computation (dragged item removed from flow). */
  let reorderRefPositions: { center: number; bottom: number }[] | null = null;

  function onReorderMove(item: LayoutItem, cursorY: number) {
    // Save original orders for cancel on first move
    if (!reorderOriginalOrders) {
      reorderOriginalOrders = new Map(eventOrders);
    }

    const { siblings, parentPath } = findSiblingInfo(item.event, events, hiddenEvents);

    // Clamp ghostY to parent bounds for nested events
    let ghostY = cursorY;
    if (parentPath !== '[]') {
      const parentItem = findParentLayoutItem(item.event, layout);
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

    // Build stable reference rows on first move: remove dragged item from
    // the order, relayout to get positions without it, capture those, then
    // restore. This ensures drop boundaries don't shift during the drag.
    if (!reorderRefPositions) {
      const order = eventOrders.get(parentPath)!;
      const originalIndex = order.indexOf(item.event.name);
      const withoutDragged = order.filter(n => n !== item.event.name);
      eventOrders.set(parentPath, withoutDragged);
      relayout();
      reorderRefPositions = buildRefPositions(item, layout);
      // Restore dragged item at its original position
      const restored = [...withoutDragged];
      const restoreIndex = originalIndex >= 0 ? Math.min(originalIndex, withoutDragged.length) : withoutDragged.length;
      restored.splice(restoreIndex, 0, item.event.name);
      eventOrders.set(parentPath, restored);
      relayout();
    }

    const dropIndex = computeDropIndex(reorderRefPositions, ghostY);
    if (dropIndex !== reorderLastIndex) {
      reorderLastIndex = dropIndex;

      // Capture current visual positions of siblings for animation
      const siblingItems = findSiblingLayoutItems(item, layout);
      const oldPositions = new Map<TimelineEvent, number>();
      for (const s of siblingItems) {
        let visualY = s.y;
        if (anim.layoutTransition) {
          const offset = anim.layoutTransition.yOffsets.get(s.event);
          if (offset) {
            const elapsed = performance.now() - anim.layoutTransition.startTime;
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
          const centerA = a.y + a.height / 2;
          const centerB = b.y + b.height / 2;
          if (Math.abs(centerA - centerB) > 1) return centerA - centerB;
          // Same visual center: preserve existing custom order
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
      const newSiblings = findSiblingLayoutItems(item, layout);
      const yOffsets = new Map<TimelineEvent, number>();
      for (const s of newSiblings) {
        const oldY = oldPositions.get(s.event);
        if (oldY !== undefined && Math.abs(oldY - s.y) > 0.5) {
          yOffsets.set(s.event, oldY - s.y);
        }
      }
      anim.layoutTransition = yOffsets.size > 0
        ? { startTime: performance.now(), fadingOut: [], yOffsets, fadingIn: new Set() }
        : null;
    }
    requestRedraw();
  }

  function onReorderEnd(_item: LayoutItem) {
    reorderState = null;
    reorderOriginalOrders = null;
    reorderLastIndex = -1;
    reorderRefPositions = null;
    undoManager.push(snapshot());
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
    reorderRefPositions = null;
    relayout();
    requestRedraw();
  }

  // Wire up input
  const inputHandlers = setupInput({
    canvas,
    getViewport: () => view.viewport,
    setViewport: (v: Viewport) => {
      const spanBefore = view.viewport.end - view.viewport.start;
      const spanAfter = v.end - v.start;
      if (Math.abs(spanAfter - spanBefore) > 1e-6) {
        dblClickPrevViewport = null;
        dblClickItem = null;
      }
      view.viewport = v;
    },
    getLayout: () => layout,
    getHovered: () => sel.hoveredItem,
    setHovered: setHoveredItem,
    setSelected: (item: LayoutItem | null) => {
      sel.selectedItem = item;
      eventListPanel?.selectEvent(item?.event ?? null);
      if (item) eventMenu.show(item.event); else eventMenu.hide();
    },
    setCursorX: (x: number) => { ui.cursorX = x; },
    getSelection: () => sel.selection,
    setSelection: (s: TimelineSelection | null) => { sel.selection = s; },
    setSnapState: (state: SnapState) => { sel.snapState = state; },
    onCollapseToggle,
    onReorderMove,
    onReorderEnd,
    onReorderCancel,
    getScrollY: () => view.scrollY,
    setScrollY: (y: number) => { view.scrollY = y; },
    getMaxScrollY: computeMaxScrollY,
    requestRedraw,
    getShowTodayLine: () => ui.showTodayLine,
    onContextMenu,
  });

  // Info button
  const infoBtn = document.createElement('button');
  infoBtn.className = 'info-btn';
  infoBtn.textContent = 'i';
  infoBtn.title = 'Keyboard & mouse shortcuts';
  infoBtn.addEventListener('click', () => showHelpDialog());
  document.body.appendChild(infoBtn);

  // Zoom buttons
  const ZOOM_DELTA = 120; // equivalent to one scroll wheel tick
  document.getElementById('zoom-in')!.addEventListener('click', () => {
    const center = canvas.clientWidth / 2;
    const base = anim.animTo ?? view.viewport;
    animateZoom(zoomViewport(base, center, canvas.clientWidth, -ZOOM_DELTA));
  });
  document.getElementById('zoom-out')!.addEventListener('click', () => {
    const center = canvas.clientWidth / 2;
    const base = anim.animTo ?? view.viewport;
    animateZoom(zoomViewport(base, center, canvas.clientWidth, ZOOM_DELTA));
  });

  // Snapshot selection state on first mousedown of a potential double-click
  canvas.addEventListener('mousedown', () => {
    const now = performance.now();
    if (now - lastMouseDownTime > 500) {
      preClickSelection = sel.selection ? { ...sel.selection } : null;
      preClickSelectedItem = sel.selectedItem;
      preClickSnapOverrides = inputHandlers.getSelectionOverrides();
    }
    lastMouseDownTime = now;
  });

  // Double-click to zoom into event (toggle back on second double-click)
  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTest(x, y, layout, view.viewport, canvas.clientWidth, view.scrollY);

    if (!hit || hit.event.end === undefined || e.ctrlKey || e.metaKey) return;

    // Restore selection state from before the double-click
    sel.selection = preClickSelection;
    sel.selectedItem = preClickSelectedItem;
    inputHandlers.restoreSelectionOverrides(preClickSnapOverrides.anchor, preClickSnapOverrides.extend);
    eventListPanel?.selectEvent(sel.selectedItem?.event ?? null);
    if (sel.selectedItem) eventMenu.show(sel.selectedItem.event); else eventMenu.hide();

    if (dblClickItem && hit.event === dblClickItem.event && dblClickPrevViewport) {
      animateZoom(dblClickPrevViewport);
      dblClickPrevViewport = null;
      dblClickItem = null;
    } else {
      dblClickPrevViewport = { ...(anim.animTo ?? view.viewport) };
      dblClickItem = hit;
      const padding = (hit.nominalEndYear - hit.nominalStartYear) * 0.1;
      animateZoom({
        start: hit.nominalStartYear - padding,
        end: hit.nominalEndYear + padding,
      });
    }
  });

  // Event list panel — visibility toggles
  function onToggleEvent(event: TimelineEvent, visible: boolean) {
    // Capture old Y positions
    const oldPositions = new Map<TimelineEvent, number>();
    capturePositions(layout, oldPositions);

    // Capture items about to be hidden
    const fadingOut: LayoutItem[] = [];
    if (!visible) {
      const hiding = findLayoutItem(event, layout);
      if (hiding) fadingOut.push(hiding);
    }

    // Update hidden set and recompute layout
    if (visible) hiddenEvents.delete(event);
    else hiddenEvents.add(event);
    relayout();

    // Compute Y offsets for items that moved
    const yOffsets = new Map<TimelineEvent, number>();
    computeOffsets(layout, oldPositions, yOffsets);

    // Items fading in
    const fadingIn = new Set<TimelineEvent>();
    if (visible) fadingIn.add(event);

    // Start animation
    anim.layoutTransition = { startTime: performance.now(), fadingOut, yOffsets, fadingIn };

    // Clear hovered/selected if they reference the hidden event
    if (!visible) {
      if (sel.hoveredItem && isDescendantOf(sel.hoveredItem.event, event)) setHoveredItem(null);
      if (sel.selectedItem && isDescendantOf(sel.selectedItem.event, event)) {
        sel.selectedItem = null;
        eventListPanel?.selectEvent(null);
        eventMenu.hide();
      }
      if (dblClickItem && isDescendantOf(dblClickItem.event, event)) {
        dblClickPrevViewport = null;
        dblClickItem = null;
      }
    }

    undoManager.push(snapshot());
    requestRedraw();
  }

  function onHoverEvent(event: TimelineEvent | null) {
    if (event === null) {
      setHoveredItem(null);
    } else {
      setHoveredItem(findLayoutItem(event, layout));
    }
    requestRedraw();
  }

  /** Pan and scroll so the given layout item is visible, accounting for UI panel occlusion. */
  function scrollItemIntoView(item: LayoutItem) {
    const rect = canvas.getBoundingClientRect();

    // Horizontal: pan viewport if event is not visible
    // Account for UI panels overlaying the left side of the canvas:
    // - events list panel (always)
    // - event menu (only when expanded)
    const vp = anim.animTo ?? view.viewport;
    const canvasWidth = canvas.clientWidth;
    const occludedRight = eventMenu.isExpanded()
      ? eventMenu.getRightEdge() - rect.left
      : (eventListPanel?.getRightEdge() ?? 0) - rect.left;
    const visibleLeftYear = xToYear(occludedRight, vp, canvasWidth);
    const eventOutLeft = item.endYear < visibleLeftYear;
    const eventOutRight = item.startYear > vp.end;
    if (eventOutLeft || eventOutRight) {
      const visibleSpan = vp.end - visibleLeftYear;
      const eventMid = (item.startYear + item.endYear) / 2;
      // Center the event within the unoccluded portion of the canvas
      const visibleCenter = visibleLeftYear + visibleSpan / 2;
      const offset = eventMid - visibleCenter;
      animateZoom({ start: vp.start + offset, end: vp.end + offset });
    }

    // Vertical: scroll if event is not visible
    const visibleTop = view.scrollY + LAYOUT.eventsStartY;
    const visibleBottom = view.scrollY + rect.height;
    const itemTop = item.y;
    const itemBottom = item.y + item.height;
    if (itemBottom > visibleBottom) {
      view.scrollY = Math.min(itemBottom - rect.height + 20, computeMaxScrollY());
    } else if (itemTop < visibleTop) {
      view.scrollY = Math.max(itemTop - LAYOUT.eventsStartY - 10, 0);
    }
  }

  function onSelectEvent(event: TimelineEvent) {
    const item = findLayoutItem(event, layout);
    sel.selectedItem = item;
    eventListPanel?.selectEvent(event);
    eventMenu.show(event);

    if (item) scrollItemIntoView(item);

    requestRedraw();
  }

  function onDblClickEvent(event: TimelineEvent) {
    if (event.end === undefined) return; // point events have no range to zoom into
    const item = findLayoutItem(event, layout);
    if (!item) return;

    if (dblClickItem && event === dblClickItem.event && dblClickPrevViewport) {
      animateZoom(dblClickPrevViewport);
      dblClickPrevViewport = null;
      dblClickItem = null;
    } else {
      dblClickPrevViewport = { ...(anim.animTo ?? view.viewport) };
      dblClickItem = item;
      const padding = (item.nominalEndYear - item.nominalStartYear) * 0.1;
      animateZoom({
        start: item.nominalStartYear - padding,
        end: item.nominalEndYear + padding,
      });
    }
  }

  function getParentCandidates(event: TimelineEvent) {
    const descendants = collectDescendants(event);
    const result: { event: TimelineEvent; name: string; depth: number }[] = [];

    function walk(list: TimelineEvent[], depth: number) {
      const sorted = [...list].sort(
        (a, b) => dateToDecimalYear(a.start) - dateToDecimalYear(b.start),
      );
      for (const e of sorted) {
        if (e === event || descendants.has(e)) continue;
        if (e.end === undefined) continue;
        result.push({ event: e, name: e.name, depth });
        if (e.nested) walk(e.nested, depth + 1);
      }
    }
    walk(events, 0);
    return result;
  }

  const contextMenu = new ContextMenu({
    onEdit: (event) => {
      onSelectEvent(event);
      eventMenu.expand();
    },
    onChangeParent: (event, newParent) => {
      removeEvent(events, event);
      if (newParent === null) {
        events.push(event);
      } else {
        if (!newParent.nested) newParent.nested = [];
        newParent.nested.push(event);
      }
      relayout();
      requestRedraw();
      eventListPanel?.rebuild(events, onToggleEvent, onHoverEvent, onSelectEvent, hiddenEvents, onContextMenu);
      saveStoredEvents(slug, events);
      undoManager.push(snapshot());
      infoLog.show(`Moved "${event.name}" to ${newParent ? `"${newParent.name}"` : 'top level'}`);
    },
    onHoverEvent: (event) => {
      onHoverEvent(event);
    },
    onExport: (event) => {
      const json = JSON.stringify(event, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = toSnakeCase(event.name) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      const count = countEvents(event);
      infoLog.show(`Exported "${event.name}"${count > 1 ? ` with ${count - 1} sub-events` : ''}`);
    },
    onDelete: deleteEvent,
    getParentCandidates,
    getCurrentParent: (event) => findParent(events, event),
  });

  function onContextMenu(event: TimelineEvent, x: number, y: number) {
    contextMenu.show(event, x, y);
  }

  eventListPanel = new EventListPanel(events, onToggleEvent, onHoverEvent, onSelectEvent, hiddenEvents, onDblClickEvent, onContextMenu);

  // --- Event editing helpers ---
  function deleteEvent(event: TimelineEvent) {
    removeEvent(events, event);
    hiddenEvents.delete(event);
    collapsedEvents.delete(event);
    sel.selectedItem = null;
    eventMenu.hide();
    eventListPanel?.selectEvent(null);
    eventListPanel?.removeEvent(event);
    relayout();
    requestRedraw();
    saveStoredEvents(slug, events);
    undoManager.push(snapshot());
    infoLog.show(`Deleted "${event.name}"`);
  }

  const eventMenu = new EventMenu({
    onRename: (event, name) => {
      event.name = name;
      eventListPanel?.updateEventName(event);
      relayout();
      requestRedraw();
      saveStoredEvents(slug, events);
      if (!skipCoalesce) undoManager.pushCoalesced(`rename:${getEventId(event)}`, snapshot());
    },
    onEditInfo: (event, info) => {
      event.info = info || undefined;
      saveStoredEvents(slug, events);
      if (!skipCoalesce) undoManager.pushCoalesced(`info:${getEventId(event)}`, snapshot());
    },
    onChangeStart: (event, start) => {
      event.start = start;
      const prevScroll = view.scrollY;
      relayout();
      reselectEvent(event, prevScroll);
      requestRedraw();
      saveStoredEvents(slug, events);
      if (!skipCoalesce) undoManager.pushCoalesced(`start:${getEventId(event)}`, snapshot());
    },
    onChangeEnd: (event, end) => {
      if (end === undefined) {
        delete event.end;
        delete event.endApprox;
      } else {
        event.end = end;
      }
      const prevScroll = view.scrollY;
      relayout();
      reselectEvent(event, prevScroll);
      requestRedraw();
      saveStoredEvents(slug, events);
      if (!skipCoalesce) undoManager.pushCoalesced(`end:${getEventId(event)}`, snapshot());
    },
    onChangeStartApprox: (event, approx) => {
      if (approx === undefined) delete event.startApprox;
      else event.startApprox = approx;
      const prevScroll = view.scrollY;
      relayout();
      reselectEvent(event, prevScroll);
      requestRedraw();
      saveStoredEvents(slug, events);
      if (!skipCoalesce) undoManager.pushCoalesced(`startApprox:${getEventId(event)}`, snapshot());
    },
    onChangeEndApprox: (event, approx) => {
      if (approx === undefined) delete event.endApprox;
      else event.endApprox = approx;
      const prevScroll = view.scrollY;
      relayout();
      reselectEvent(event, prevScroll);
      requestRedraw();
      saveStoredEvents(slug, events);
      if (!skipCoalesce) undoManager.pushCoalesced(`endApprox:${getEventId(event)}`, snapshot());
    },
    onTypeChange: () => {
      skipCoalesce = true;
      queueMicrotask(() => {
        skipCoalesce = false;
        undoManager.push(snapshot());
      });
    },
    onHoverEvent: (event) => {
      onHoverEvent(event);
    },
    onChangeParent: (event, newParent) => {
      // Remove from current location
      removeEvent(events, event);

      // Add to new location
      if (newParent === null) {
        events.push(event);
      } else {
        if (!newParent.nested) newParent.nested = [];
        newParent.nested.push(event);
      }

      // Update UI
      relayout();
      requestRedraw();
      eventListPanel?.rebuild(events, onToggleEvent, onHoverEvent, onSelectEvent, hiddenEvents, onContextMenu);
      saveStoredEvents(slug, events);
      undoManager.push(snapshot());
      infoLog.show(`Moved "${event.name}" to ${newParent ? `"${newParent.name}"` : 'top level'}`);
    },
    onDelete: deleteEvent,
    onExport: (event) => {
      const json = JSON.stringify(event, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = toSnakeCase(event.name) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      const count = countEvents(event);
      infoLog.show(`Exported "${event.name}"${count > 1 ? ` with ${count - 1} sub-events` : ''}`);
    },
    hasChildren: (event) => {
      return event.nested !== undefined && event.nested.length > 0;
    },
    getParentCandidates,
    getCurrentParent: (event) => findParent(events, event),
  });

  // --- New event button ---
  const newEventBtn = document.createElement('div');
  newEventBtn.className = 'new-event-btn';
  newEventBtn.textContent = '+';
  newEventBtn.title = 'New event';
  document.body.appendChild(newEventBtn);

  newEventBtn.style.left = '536px';

  newEventBtn.addEventListener('click', () => {
    // 1. Determine parent
    const parent = (sel.selectedItem && sel.selectedItem.event.end !== undefined)
      ? sel.selectedItem.event : null;

    // 2. Determine date/type
    let start: string;
    let end: string | undefined;

    const parentStart = parent ? dateToDecimalYear(parent.start) : null;
    const parentEnd = parent
      ? (parent.end === 'ongoing' ? dateToDecimalYear(new Date().toISOString().slice(0, 10)) : dateToDecimalYear(parent.end!))
      : null;

    if (sel.selection && sel.selection.start !== sel.selection.end) {
      // Range selection
      let selStart = sel.selection.start;
      let selEnd = sel.selection.end;
      if (parent && parentStart !== null && parentEnd !== null) {
        // Clamp to parent range if overlapping
        if (selStart < parentEnd && selEnd > parentStart) {
          selStart = Math.max(selStart, parentStart);
          selEnd = Math.min(selEnd, parentEnd);
        }
      }
      start = decimalYearToIso(selStart);
      end = decimalYearToIso(selEnd);
    } else if (sel.selection && sel.selection.start === sel.selection.end) {
      // Single cursor point
      start = decimalYearToIso(sel.selection.start);
    } else {
      // No cursor/selection — use center of parent or viewport
      if (parent && parentStart !== null && parentEnd !== null) {
        start = decimalYearToIso((parentStart + parentEnd) / 2);
      } else {
        const vp = anim.animTo ?? view.viewport;
        start = decimalYearToIso((vp.start + vp.end) / 2);
      }
    }

    // 3. Create event
    const newEvent: TimelineEvent = { name: 'New event', start };
    if (end !== undefined) newEvent.end = end;

    // 4. Add to data
    if (parent) {
      if (!parent.nested) parent.nested = [];
      parent.nested.push(newEvent);
    } else {
      events.push(newEvent);
    }

    // 5. Update
    relayout();
    requestRedraw();
    saveStoredEvents(slug, events);
    eventListPanel?.rebuild(events, onToggleEvent, onHoverEvent, onSelectEvent, hiddenEvents, onContextMenu);

    // 6. Select, scroll into view, and edit
    const item = findLayoutItem(newEvent, layout);
    sel.selectedItem = item;
    eventListPanel?.selectEvent(newEvent);
    eventMenu.show(newEvent);
    eventMenu.focusName();
    if (item) scrollItemIntoView(item);
    requestRedraw();

    undoManager.push(snapshot());
  });

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
      await saveStoredEvents(slug, events);

      // Snapshot after import for undo
      undoManager.push(snapshot());

      // Recompute layout with fade-in animation for new events
      relayout();

      const fadingIn = new Set<TimelineEvent>();
      for (const ne of newEvents) fadingIn.add(ne);
      anim.layoutTransition = {
        startTime: performance.now(),
        fadingOut: [],
        yOffsets: new Map(),
        fadingIn,
      };

      // Update event list panel
      eventListPanel?.addEvents(newEvents, onToggleEvent, onHoverEvent, onSelectEvent);

      infoLog.show(`Added ${newEvents.length} event${newEvents.length !== 1 ? 's' : ''} from "${file.name}"`);
      requestRedraw();
    };

    reader.onerror = () => {
      infoLog.show(`Failed to read "${file.name}"`);
    };

    reader.readAsText(file);
  }

  function loadEventsFromFile(file: File) {
    if (!file.name.endsWith('.json')) {
      infoLog.show(`Cannot load "${file.name}": only .json files are supported`);
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

      const count = result.events.reduce((n, e) => n + countEvents(e), 0);
      showConfirmDialog(
        `Replace all current events with ${count} event${count !== 1 ? 's' : ''} from "${file.name}"? This cannot be undone.`,
        async () => {
          events.length = 0;
          events.push(...result.events);
          hiddenEvents.clear();
          collapsedEvents.clear();
          eventOrders.clear();
          await saveStoredEvents(slug, events);
          sel.hoveredItem = null;
          sel.selectedItem = null;
          eventMenu.hide();
          dblClickPrevViewport = null;
          dblClickItem = null;
          relayout();
          undoManager.init(snapshot());
          eventListPanel?.rebuild(events, onToggleEvent, onHoverEvent, onSelectEvent, hiddenEvents, onContextMenu);
          requestRedraw();
          infoLog.show(`Loaded ${count} event${count !== 1 ? 's' : ''} from "${file.name}"`);
        },
      );
    };

    reader.onerror = () => {
      infoLog.show(`Failed to read "${file.name}"`);
    };

    reader.readAsText(file);
  }

  function importIntoNewEvent(file: File) {
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

      showPromptDialog('Name for the container event:', 'Event name', async (name) => {
        // Compute container bounds from imported events
        let earliestIso = '';
        let latestIso = '';
        let earliestYear = Infinity;
        let latestYear = -Infinity;
        let earliestApprox: [string, string] | undefined;
        let latestApprox: [string, string] | undefined;

        function walkBounds(list: TimelineEvent[]) {
          for (const e of list) {
            const startIso = e.startApprox ? e.startApprox[0] : e.start;
            const startYear = dateToDecimalYear(startIso);
            if (startYear < earliestYear) {
              earliestYear = startYear;
              earliestIso = e.start;
              earliestApprox = e.startApprox;
            }

            const endIso = e.endApprox ? e.endApprox[1] : (e.end && e.end !== 'ongoing' ? e.end : e.start);
            const endYear = dateToDecimalYear(endIso);
            if (endYear > latestYear) {
              latestYear = endYear;
              latestIso = e.end && e.end !== 'ongoing' ? e.end : e.start;
              latestApprox = e.endApprox;
            }

            if (e.nested) walkBounds(e.nested);
          }
        }

        walkBounds(result.events);

        const container: TimelineEvent = {
          name,
          start: earliestIso,
          end: latestIso,
          nested: result.events,
        };
        if (earliestApprox) container.startApprox = earliestApprox;
        if (latestApprox) container.endApprox = latestApprox;

        events.push(container);
        await saveStoredEvents(slug, events);
        undoManager.push(snapshot());

        relayout();
        const fadingIn = new Set<TimelineEvent>();
        fadingIn.add(container);
        anim.layoutTransition = {
          startTime: performance.now(),
          fadingOut: [],
          yOffsets: new Map(),
          fadingIn,
        };

        eventListPanel?.addEvents([container], onToggleEvent, onHoverEvent, onSelectEvent);

        const total = countEvents(container);
        infoLog.show(`Created "${name}" with ${total - 1} event${total - 1 !== 1 ? 's' : ''}`);
        requestRedraw();
      });
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
    onImportIntoEvent: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) importIntoNewEvent(file);
      });
      input.click();
    },
    onLoadFile: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) loadEventsFromFile(file);
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
        await clearStoredEvents(slug);
        eventListPanel?.clear();
        sel.hoveredItem = null;
        sel.selectedItem = null;
        eventMenu.hide();
        dblClickPrevViewport = null;
        dblClickItem = null;
        relayout();
        undoManager.init(snapshot());
        requestRedraw();
        infoLog.show('All events deleted');
      });
    },
    onReloadDefaults: () => {
      showConfirmDialog('Reload default events? All imported events and settings will be lost.', async () => {
        await clearStore(slug);
        localStorage.removeItem(slug ? `timeline-state-${slug}` : 'timeline-state');
        localStorage.removeItem(slug ? `timeline-theme-${slug}` : 'timeline-theme');
        location.reload();
      });
    },
    onToggleTodayLine: (show) => {
      ui.showTodayLine = show;
      requestRedraw();
    },
    onThemeChange: () => requestRedraw(),
  }, ui.showTodayLine, slug);

  // --- Undo/redo ---
  undoManager.init(snapshot());

  function restoreFromSnapshot(state: UndoableState): void {
    // Capture selected event identity before replacing state
    const selectedPath = sel.selectedItem
      ? eventToPath(sel.selectedItem.event, events)
      : null;

    // Cancel in-progress animations
    anim.cancelAll();
    reorderState = null;
    reorderOriginalOrders = null;
    reorderRefPositions = null;

    // Replace events array
    events.length = 0;
    events.push(...structuredClone(state.events));

    // Rebuild hidden/collapsed sets from paths
    hiddenEvents.clear();
    for (const e of resolvePathSet(state.hiddenPaths, events)) hiddenEvents.add(e);

    collapsedEvents.clear();
    for (const e of resolvePathSet(state.collapsedPaths, events)) collapsedEvents.add(e);

    // Replace event orders
    eventOrders.clear();
    for (const [k, v] of state.eventOrders) eventOrders.set(k, [...v]);

    // Recompute layout
    relayout();

    // Attempt to re-select by path
    if (selectedPath) {
      const event = pathToEvent(selectedPath, events);
      if (event) {
        const item = findLayoutItem(event, layout);
        sel.selectedItem = item;
        eventListPanel?.selectEvent(event);
        eventMenu.show(event);
      } else {
        sel.selectedItem = null;
        eventListPanel?.selectEvent(null);
        eventMenu.hide();
      }
    } else {
      sel.selectedItem = null;
      eventListPanel?.selectEvent(null);
      eventMenu.hide();
    }

    sel.hoveredItem = null;
    inputHandlers.restoreSelectionOverrides(null, null);

    // Rebuild event list and redraw
    eventListPanel?.rebuild(events, onToggleEvent, onHoverEvent, onSelectEvent, hiddenEvents, onContextMenu);
    saveStoredEvents(slug, events);
    requestRedraw();
  }

  window.addEventListener('keydown', (e) => {
    // Skip when form elements are focused (let browser handle native undo)
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Skip during active reorder drag
    if (reorderState !== null) return;

    // Undo: Cmd+Z or Ctrl+Z
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      const state = undoManager.undo();
      if (state) {
        restoreFromSnapshot(state);
        infoLog.show('Undo');
      }
      return;
    }

    // Redo: Cmd+Shift+Z, Ctrl+Shift+Z, or Ctrl+Y
    if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') ||
        (e.ctrlKey && !e.metaKey && e.key === 'y')) {
      e.preventDefault();
      const state = undoManager.redo();
      if (state) {
        restoreFromSnapshot(state);
        infoLog.show('Redo');
      }
      return;
    }

    // Delete/Backspace: delete selected event
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.selectedItem) {
      e.preventDefault();
      const event = sel.selectedItem.event;
      showConfirmDialog(`Delete "${event.name}"?`, () => deleteEvent(event));
      return;
    }
  });

  // Apply saved theme before first draw
  const savedTheme = loadSavedTheme(slug, config.defaultTheme);
  applyTheme(slug, savedTheme, () => {});

  // Initial draw and resize handler
  draw();
  window.addEventListener('resize', () => {
    const max = computeMaxScrollY();
    if (view.scrollY > max) view.scrollY = max;
    requestRedraw();
  });
}

main();
