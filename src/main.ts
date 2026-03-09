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
import { dateToDecimalYear, decimalYearToIso, shiftIsoDate } from './data/time';
import { isStoreInitialized, setStoreInitialized, loadStoredEvents, saveStoredEvents, clearStoredEvents, clearStore } from './data/store';
import { validateEvents } from './data/validate';
import { loadSavedTheme, applyTheme } from './themes';
import { AnimationManager, easeInOut, LAYOUT_ANIM_MS } from './animation';
import { toSnakeCase, countEvents, removeEvent, findParent, collectDescendants, isDescendantOf, getSiblings, uniqueSiblingName, deduplicateSiblingNames } from './eventActions';
import { findSiblingInfo, findSiblingLayoutItems, findParentLayoutItem, buildRefPositions, computeDropIndex } from './timeline/reorder';
import { resolveTimeline } from './timeline-config';
import { readJsonFile, exportToFile } from './fileOps';
import { capturePositions, computeOffsets } from './layoutTransition';

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

  // Restore saved state
  const saved = loadState(slug, events);

  const state = {
    // Data (persisted to IndexedDB)
    events,
    hiddenEvents: new Set<TimelineEvent>(),
    collapsedEvents: new Set<TimelineEvent>(),
    eventOrders: new Map<string, string[]>(),

    // View (persisted to localStorage)
    viewport: (saved?.viewport ?? computeFullRange(events)) as Viewport,
    scrollY: 0,
    selection: (saved?.selection ?? null) as TimelineSelection | null,
    showTodayLine: saved?.showTodayLine ?? config.showTodayLine ?? true,
    sketchMode: saved?.sketchMode ?? config.sketchMode ?? false,
    sketchModeUnlocked: !!(saved?.sketchMode ?? config.sketchMode),

    // Transient interaction
    selectedItem: null as LayoutItem | null,
    hoveredItem: null as LayoutItem | null,
    snapState: { highlightYears: new Set<number>(), cursorDetail: null, selStartDetail: null, selEndDetail: null } as SnapState,
    cursorX: -1,

    // Reorder
    reorderState: null as ReorderState | null,
    reorderOriginalOrders: null as Map<string, string[]> | null,
    reorderRefPositions: null as { center: number; bottom: number }[] | null,
    reorderLastIndex: -1,

    // Sketch mode
    sketchOriginalDates: null as Map<TimelineEvent, { start: string; end?: string }> | null,
    sketchPriorityEvent: null as TimelineEvent | null,
    sketchSavedPositions: null as Map<TimelineEvent, number> | null,

    // Collapse-all toggle
    collapseAllSaved: null as Set<TimelineEvent> | null,

    // Double-click zoom toggle
    dblClickPrevViewport: null as Viewport | null,
    dblClickItem: null as LayoutItem | null,

    // Pre-click snapshot
    preClickSelection: null as TimelineSelection | null,
    preClickSelectedItem: null as LayoutItem | null,
    preClickSnapOverrides: { anchor: null, extend: null } as { anchor: SnapDetail | null; extend: SnapDetail | null },
    lastMouseDownTime: 0,

    // Derived
    layout: [] as LayoutItem[],
  };

  if (saved) {
    saved.hiddenEvents.forEach(e => state.hiddenEvents.add(e));
    saved.collapsedEvents.forEach(e => state.collapsedEvents.add(e));
    for (const [k, v] of saved.eventOrders) state.eventOrders.set(k, v);
  } else if (config.compact) {
    state.collapseAllSaved = new Set<TimelineEvent>();
    for (const e of state.events) {
      if (e.end !== undefined || e.startApprox !== undefined) {
        state.collapsedEvents.add(e);
        state.collapseAllSaved.add(e);
      }
    }
  }

  state.layout = computeLayout(
    state.events,
    LAYOUT.eventsStartY,
    state.collapsedEvents,
    state.eventOrders,
    state.hiddenEvents,
  );

  function relayout(priorityEvent?: TimelineEvent, pinnedY?: number, sketchHints?: Map<TimelineEvent, number>) {
    state.layout = computeLayout(state.events, LAYOUT.eventsStartY, state.collapsedEvents, state.eventOrders, state.hiddenEvents, priorityEvent, pinnedY, sketchHints);
    const max = computeMaxScrollY();
    if (state.scrollY > max) state.scrollY = max;
  }

  // Undo/redo
  const undoManager = new UndoManager();
  let skipCoalesce = false;

  function snapshot() {
    return captureSnapshot(state.events, state.hiddenEvents, state.collapsedEvents, state.eventOrders, state.collapseAllSaved);
  }

  const anim = new AnimationManager();
  let eventListPanel: EventListPanel | null = null;

  interface CommitOptions {
    relayout?: boolean;
    saveEvents?: boolean;
    undo?: boolean;
    undoCoalesce?: string;
    rebuildList?: boolean;
  }

  function commit(opts: CommitOptions = {}) {
    if (opts.relayout) relayout();
    if (opts.rebuildList) {
      eventListPanel?.rebuild(state.events, onToggleEvent, onHoverEvent, onSelectEvent, state.hiddenEvents, onContextMenu);
    }
    if (opts.saveEvents) saveStoredEvents(slug, state.events);
    if (opts.undo) undoManager.push(snapshot());
    else if (opts.undoCoalesce) {
      if (!skipCoalesce) undoManager.pushCoalesced(opts.undoCoalesce, snapshot());
    }
    requestRedraw();
  }

  /** Shared pattern for event property edits (start, end, approx). */
  function commitEdit(event: TimelineEvent, tag: string) {
    const prevScroll = state.scrollY;
    relayout();
    reselectEvent(event, prevScroll);
    requestRedraw();
    saveStoredEvents(slug, state.events);
    if (!skipCoalesce) undoManager.pushCoalesced(tag, snapshot());
  }

  function computeMaxScrollY(): number {
    const maxY = computeMaxLayoutY(state.layout);
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
    state.hoveredItem = item;
    eventListPanel?.highlightEvent(item?.event ?? null);
  }

  // rAF-batched rendering
  let rafId = 0;

  function draw() {
    rafId = 0;

    const { viewport, scrollY, transition, needsFrame } = anim.tick(state.viewport, state.scrollY);
    state.viewport = viewport;
    state.scrollY = scrollY;
    if (needsFrame) rafId = requestAnimationFrame(draw);

    const ctx = setupCanvas(canvas);
    const rect = canvas.getBoundingClientRect();
    render(ctx, rect.width, rect.height, state.layout, state.viewport, state.hoveredItem, state.selectedItem, state.cursorX, state.selection, state.snapState, state.scrollY, state.showTodayLine, transition, state.reorderState ?? undefined);
  }

  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveState(slug, state);
    }, 500);
  }

  function requestRedraw() {
    if (rafId === 0) {
      rafId = requestAnimationFrame(draw);
    }
    scheduleSave();
  }

  function animateZoom(target: Viewport) {
    anim.animateZoom(state.viewport, target);
    requestRedraw();
  }

  function animateScroll(target: number) {
    anim.animateScroll(state.scrollY, target, computeMaxScrollY());
    requestRedraw();
  }

  /** After relayout, re-find and re-select the event, scrolling into view if needed. */
  function reselectEvent(event: TimelineEvent, prevScroll?: number) {
    const item = findLayoutItem(event, state.layout);
    state.selectedItem = item;
    if (item) {
      const rect = canvas.getBoundingClientRect();
      // Use pre-relayout scroll to detect if the event moved out of the old view
      const checkScroll = prevScroll ?? state.scrollY;
      const visibleTop = checkScroll + LAYOUT.eventsStartY;
      const visibleBottom = checkScroll + rect.height;
      if (item.y + item.height > visibleBottom) {
        // Restore pre-clamp scroll so animation starts from the right place
        if (prevScroll !== undefined) state.scrollY = prevScroll;
        animateScroll(item.y + item.height - rect.height + 20);
      } else if (item.y < visibleTop) {
        if (prevScroll !== undefined) state.scrollY = prevScroll;
        animateScroll(Math.max(item.y - LAYOUT.eventsStartY - 10, 0));
      }
    }
  }

  // Collapse toggle handler
  function onCollapseToggle(event: TimelineEvent) {
    const oldPositions = new Map<TimelineEvent, number>();
    capturePositions(state.layout, oldPositions);

    const fadingOut: LayoutItem[] = [];
    const fadingIn = new Set<TimelineEvent>();
    const wasCollapsed = state.collapsedEvents.has(event);

    // Individual toggle overrides collapse-all saved state
    state.collapseAllSaved?.delete(event);

    if (!wasCollapsed) {
      // Collapsing — capture children for fade-out
      const container = findLayoutItem(event, state.layout);
      if (container) {
        for (const child of container.children) fadingOut.push(child);
      }
      state.collapsedEvents.add(event);
    } else {
      state.collapsedEvents.delete(event);
    }

    relayout();

    // Compute Y offsets for animated items
    const yOffsets = new Map<TimelineEvent, number>();
    computeOffsets(state.layout, oldPositions, yOffsets);

    // Mark newly visible children as fading in
    if (wasCollapsed) {
      const container = findLayoutItem(event, state.layout);
      if (container) {
        for (const child of container.children) fadingIn.add(child.event);
      }
    }

    anim.layoutTransition = { startTime: performance.now(), fadingOut, yOffsets, fadingIn };

    // Clear state referencing now-hidden children
    if (!wasCollapsed) {
      if (state.hoveredItem && state.hoveredItem.event !== event && isDescendantOf(state.hoveredItem.event, event)) {
        setHoveredItem(null);
      }
      if (state.selectedItem && state.selectedItem.event !== event && isDescendantOf(state.selectedItem.event, event)) {
        state.selectedItem = null;
        eventListPanel?.selectEvent(null);
        eventMenu.hide();
      }
    }

    undoManager.push(snapshot());
    requestRedraw();
  }

  /** Collect top-level collapsible events (range events and uncertain points). */
  function topLevelCollapsibleEvents(): TimelineEvent[] {
    return state.events.filter(e => e.end !== undefined || e.startApprox !== undefined);
  }

  function toggleCollapseAll() {
    // Lock in current visual order so collapsing doesn't rearrange items
    // (the optimized packing may use a different sort for different heights)
    const rootKey = '[]';
    if (!state.eventOrders.has(rootKey)) {
      const yMap = new Map<string, number>();
      for (const item of state.layout) {
        yMap.set(item.event.name, item.y);
      }
      const order = [...state.events]
        .sort((a, b) => {
          const ya = yMap.get(a.name) ?? 0;
          const yb = yMap.get(b.name) ?? 0;
          if (ya !== yb) return ya - yb;
          return dateToDecimalYear(a.start) - dateToDecimalYear(b.start);
        })
        .map(e => e.name);
      state.eventOrders.set(rootKey, order);
    }

    const oldPositions = new Map<TimelineEvent, number>();
    capturePositions(state.layout, oldPositions);

    const fadingOut: LayoutItem[] = [];
    const fadingIn = new Set<TimelineEvent>();

    if (state.collapseAllSaved === null) {
      // Enter collapse-all: save currently expanded top-level events, collapse them
      const collapsible = topLevelCollapsibleEvents();
      state.collapseAllSaved = new Set<TimelineEvent>();
      for (const e of collapsible) {
        if (!state.collapsedEvents.has(e)) {
          state.collapseAllSaved.add(e);
          // Capture children for fade-out animation
          const container = findLayoutItem(e, state.layout);
          if (container) {
            for (const child of container.children) fadingOut.push(child);
          }
        }
        state.collapsedEvents.add(e);
      }
    } else {
      // Leave collapse-all: restore saved expanded events
      for (const e of state.collapseAllSaved) {
        state.collapsedEvents.delete(e);
      }
      state.collapseAllSaved = null;
    }

    relayout();

    const yOffsets = new Map<TimelineEvent, number>();
    computeOffsets(state.layout, oldPositions, yOffsets);

    // Mark newly visible children as fading in
    if (state.collapseAllSaved === null) {
      // We just restored — find newly visible children
      const collectFadingIn = (items: LayoutItem[]) => {
        for (const item of items) {
          if (item.isContainer && !item.isCollapsed) {
            for (const child of item.children) fadingIn.add(child.event);
          }
          if (item.children) collectFadingIn(item.children);
        }
      };
      collectFadingIn(state.layout);
    }

    anim.layoutTransition = (fadingOut.length > 0 || yOffsets.size > 0 || fadingIn.size > 0)
      ? { startTime: performance.now(), fadingOut, yOffsets, fadingIn }
      : null;

    // Clear selection if the selected event is no longer visible (nested inside a collapsed parent)
    if (state.selectedItem && !findLayoutItem(state.selectedItem.event, state.layout)) {
      state.selectedItem = null;
      eventListPanel?.selectEvent(null);
      eventMenu.hide();
    }

    undoManager.push(snapshot());
    infoLog.show(state.collapseAllSaved !== null ? 'Collapsed all' : 'Restored collapse state');
    requestRedraw();
  }

  function onReorderMove(item: LayoutItem, cursorY: number) {
    // Save original orders for cancel on first move
    if (!state.reorderOriginalOrders) {
      state.reorderOriginalOrders = new Map(state.eventOrders);
    }

    const { siblings, parentPath } = findSiblingInfo(item.event, state.events, state.hiddenEvents);

    // Clamp ghostY to parent bounds for nested events
    let ghostY = cursorY;
    if (parentPath !== '[]') {
      const parentItem = findParentLayoutItem(item.event, state.layout);
      if (parentItem) {
        const minY = parentItem.y + 30; // containerHeaderHeight + padding
        const maxY = parentItem.y + parentItem.height - 6;
        ghostY = Math.max(minY, Math.min(maxY, cursorY));
      }
    }

    state.reorderState = { draggedEvent: item.event, ghostY };

    // Initialize order for this level if needed.
    // Use current visual Y positions so the layout doesn't jump when
    // switching from optimized gap-filling to simple stacking.
    if (!state.eventOrders.has(parentPath)) {
      const siblingYMap = new Map<string, number>();
      for (const s of findSiblingLayoutItems(item, state.layout)) {
        siblingYMap.set(s.event.name, s.y);
      }
      const defaultOrder = [...siblings]
        .sort((a, b) => {
          const ya = siblingYMap.get(a.name) ?? 0;
          const yb = siblingYMap.get(b.name) ?? 0;
          if (ya !== yb) return ya - yb;
          return dateToDecimalYear(a.start) - dateToDecimalYear(b.start);
        })
        .map(e => e.name);
      state.eventOrders.set(parentPath, defaultOrder);
    }

    // Build stable reference rows on first move: remove dragged item from
    // the order, relayout to get positions without it, capture those, then
    // restore. This ensures drop boundaries don't shift during the drag.
    if (!state.reorderRefPositions) {
      const order = state.eventOrders.get(parentPath)!;
      const originalIndex = order.indexOf(item.event.name);
      const withoutDragged = order.filter(n => n !== item.event.name);
      state.eventOrders.set(parentPath, withoutDragged);
      relayout();
      state.reorderRefPositions = buildRefPositions(item, state.layout);
      // Restore dragged item at its original position
      const restored = [...withoutDragged];
      const restoreIndex = originalIndex >= 0 ? Math.min(originalIndex, withoutDragged.length) : withoutDragged.length;
      restored.splice(restoreIndex, 0, item.event.name);
      state.eventOrders.set(parentPath, restored);
      relayout();
    }

    const dropIndex = computeDropIndex(state.reorderRefPositions, ghostY);
    if (dropIndex !== state.reorderLastIndex) {
      state.reorderLastIndex = dropIndex;

      // Capture current visual positions of siblings for animation
      const siblingItems = findSiblingLayoutItems(item, state.layout);
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
      const oldOrder = state.eventOrders.get(parentPath);
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

      state.eventOrders.set(parentPath, visualOrder);
      relayout();

      // Animate siblings to new positions
      const newSiblings = findSiblingLayoutItems(item, state.layout);
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
    state.reorderState = null;
    state.reorderOriginalOrders = null;
    state.reorderLastIndex = -1;
    state.reorderRefPositions = null;
    commit({ undo: true });
  }

  function onReorderCancel() {
    if (state.reorderOriginalOrders) {
      state.eventOrders.clear();
      for (const [k, v] of state.reorderOriginalOrders) state.eventOrders.set(k, v);
      state.reorderOriginalOrders = null;
    }
    state.reorderState = null;
    state.reorderLastIndex = -1;
    state.reorderRefPositions = null;
    relayout();
    requestRedraw();
  }

  // --- Sketch mode callbacks ---
  function hasTargetChanged(items: LayoutItem[], prevTargets: Map<TimelineEvent, number>): boolean {
    for (const it of items) {
      const prev = prevTargets.get(it.event);
      if (prev !== undefined && Math.abs(prev - it.y) > 0.5) return true;
      if (it.children.length > 0 && hasTargetChanged(it.children, prevTargets)) return true;
    }
    return false;
  }

  function collectOriginalDates(events: TimelineEvent[], map: Map<TimelineEvent, { start: string; end?: string }>) {
    for (const e of events) {
      map.set(e, { start: e.start, end: e.end });
      if (e.nested) collectOriginalDates(e.nested, map);
    }
  }

  function onSketchMove(item: LayoutItem, newStartYear: number, newEndYear: number, isResize?: boolean) {
    const event = item.event;

    // Save original dates and all Y positions on first move
    if (!state.sketchOriginalDates) {
      const dates = new Map<TimelineEvent, { start: string; end?: string }>();
      dates.set(event, { start: event.start, end: event.end });
      if (event.nested) collectOriginalDates(event.nested, dates);
      state.sketchOriginalDates = dates;
      state.sketchPriorityEvent = event;
      state.sketchSavedPositions = new Map();
      capturePositions(state.layout, state.sketchSavedPositions);
    }

    // Compute total delta from original dates to avoid rounding drift
    // on imprecise (year-only, month-only) dates across many small moves.
    const origParent = state.sketchOriginalDates!.get(event)!;
    const totalStartDelta = newStartYear - dateToDecimalYear(origParent.start);

    // Update event dates from originals
    event.start = shiftIsoDate(origParent.start, totalStartDelta);
    if (origParent.end !== undefined && origParent.end !== 'ongoing') {
      const totalEndDelta = newEndYear - dateToDecimalYear(origParent.end);
      event.end = shiftIsoDate(origParent.end, totalEndDelta);
    }

    // For container moves (duration unchanged), shift children.
    // Resizes never shift children — only moves do.
    if (!isResize) {
      const duration = newEndYear - newStartYear;
      const origDuration = (state.sketchPriorityEvent === event)
        ? (item.nominalEndYear - item.nominalStartYear) // won't change during a move
        : 0;

      if (event.nested && event.nested.length > 0 && Math.abs(duration - origDuration) < 0.001) {
        shiftChildren(event.nested, totalStartDelta, state.sketchOriginalDates!);
      }
    }

    // Save layout positions before relayout (to detect if targets changed)
    const prevTargets = new Map<TimelineEvent, number>();
    capturePositions(state.layout, prevTargets);

    // Capture visual positions (for animation blending if targets change)
    const oldVisual = new Map<TimelineEvent, number>();
    const transition = anim.layoutTransition;
    const now = performance.now();
    function captureVisual(items: LayoutItem[], inheritedDecayed: number) {
      for (const it of items) {
        const origOffset = transition?.yOffsets.get(it.event) ?? 0;
        let ownDecayed = 0;
        if (origOffset !== 0 && transition) {
          const eventStart = transition.startTimes?.get(it.event) ?? transition.startTime;
          const eventProgress = easeInOut(Math.min((now - eventStart) / LAYOUT_ANIM_MS, 1));
          ownDecayed = origOffset * (1 - eventProgress);
        }
        oldVisual.set(it.event, it.y + inheritedDecayed + ownDecayed);
        if (it.children.length > 0) captureVisual(it.children, inheritedDecayed + ownDecayed);
      }
    }
    captureVisual(state.layout, 0);

    // Recompute layout: pinned event stays at its row, others use hints
    const pinnedY = state.sketchSavedPositions!.get(event);
    relayout(event, pinnedY, state.sketchSavedPositions!);

    // Only start/restart animation when layout targets actually changed
    const targetsChanged = hasTargetChanged(state.layout, prevTargets);

    if (targetsChanged) {
      const now = performance.now();
      const newOffsets = new Map<TimelineEvent, number>();
      computeOffsets(state.layout, oldVisual, newOffsets);

      // Merge: keep existing animation for events whose targets didn't change,
      // start fresh animation only for events whose targets moved.
      const existing = anim.layoutTransition;
      const mergedOffsets = new Map<TimelineEvent, number>();
      const mergedStartTimes = new Map<TimelineEvent, number>();

      function mergeWalk(items: LayoutItem[]) {
        for (const it of items) {
          const prev = prevTargets.get(it.event);
          const changed = prev !== undefined && Math.abs(prev - it.y) > 0.5;

          if (changed) {
            const off = newOffsets.get(it.event);
            if (off && Math.abs(off) > 0.1) {
              mergedOffsets.set(it.event, off);
              mergedStartTimes.set(it.event, now);
            }
          } else if (existing) {
            const existingOff = existing.yOffsets.get(it.event);
            if (existingOff) {
              mergedOffsets.set(it.event, existingOff);
              mergedStartTimes.set(it.event, existing.startTimes?.get(it.event) ?? existing.startTime);
            }
          }

          if (it.children.length > 0) mergeWalk(it.children);
        }
      }
      mergeWalk(state.layout);

      if (mergedOffsets.size > 0) {
        anim.layoutTransition = {
          startTime: Math.min(...mergedStartTimes.values()),
          fadingOut: [],
          yOffsets: mergedOffsets,
          fadingIn: new Set(),
          startTimes: mergedStartTimes,
        };
      } else {
        anim.layoutTransition = null;
      }
    }

    requestRedraw();
  }

  function shiftChildren(children: TimelineEvent[], deltaYears: number, origDates: Map<TimelineEvent, { start: string; end?: string }>) {
    for (const child of children) {
      const orig = origDates.get(child);
      if (orig) {
        child.start = shiftIsoDate(orig.start, deltaYears);
        if (orig.end !== undefined && orig.end !== 'ongoing') {
          child.end = shiftIsoDate(orig.end, deltaYears);
        }
      }
      if (child.nested) {
        shiftChildren(child.nested, deltaYears, origDates);
      }
    }
  }

  function onSketchEnd(_item: LayoutItem) {
    // Capture frozen positions before final relayout
    const oldPositions = new Map<TimelineEvent, number>();
    capturePositions(state.layout, oldPositions);

    state.sketchOriginalDates = null;
    state.sketchPriorityEvent = null;
    state.sketchSavedPositions = null;

    // Relayout — events settle to natural Y positions
    relayout();

    // Animate the vertical settle
    const yOffsets = new Map<TimelineEvent, number>();
    computeOffsets(state.layout, oldPositions, yOffsets);
    if (yOffsets.size > 0) {
      anim.layoutTransition = {
        startTime: performance.now(),
        fadingOut: [],
        yOffsets,
        fadingIn: new Set(),
      };
    }

    commit({ saveEvents: true, undo: true, rebuildList: true });
  }

  function onSketchCancel() {
    if (state.sketchOriginalDates) {
      // Capture frozen positions before restoring
      const oldPositions = new Map<TimelineEvent, number>();
      capturePositions(state.layout, oldPositions);

      // Restore original dates without replacing event objects
      for (const [event, dates] of state.sketchOriginalDates) {
        event.start = dates.start;
        event.end = dates.end;
      }
      state.sketchOriginalDates = null;
      state.sketchPriorityEvent = null;
      state.sketchSavedPositions = null;
      relayout();

      // Animate back to original positions
      const yOffsets = new Map<TimelineEvent, number>();
      computeOffsets(state.layout, oldPositions, yOffsets);
      if (yOffsets.size > 0) {
        anim.layoutTransition = {
          startTime: performance.now(),
          fadingOut: [],
          yOffsets,
          fadingIn: new Set(),
        };
      }

      requestRedraw();
    }
  }

  // Wire up input
  const inputHandlers = setupInput({
    canvas,
    getViewport: () => state.viewport,
    setViewport: (v: Viewport) => {
      const spanBefore = state.viewport.end - state.viewport.start;
      const spanAfter = v.end - v.start;
      if (Math.abs(spanAfter - spanBefore) > 1e-6) {
        state.dblClickPrevViewport = null;
        state.dblClickItem = null;
      }
      state.viewport = v;
    },
    getLayout: () => state.layout,
    getHovered: () => state.hoveredItem,
    setHovered: setHoveredItem,
    setSelected: (item: LayoutItem | null) => {
      state.selectedItem = item;
      eventListPanel?.selectEvent(item?.event ?? null);
      if (item) eventMenu.show(item.event); else eventMenu.hide();
    },
    setCursorX: (x: number) => { state.cursorX = x; },
    getSelection: () => state.selection,
    setSelection: (s: TimelineSelection | null) => { state.selection = s; },
    setSnapState: (s: SnapState) => { state.snapState = s; },
    onCollapseToggle,
    onReorderMove,
    onReorderEnd,
    onReorderCancel,
    getScrollY: () => state.scrollY,
    setScrollY: (y: number) => { state.scrollY = y; },
    getMaxScrollY: computeMaxScrollY,
    requestRedraw,
    getShowTodayLine: () => state.showTodayLine,
    onContextMenu,
    getSketchMode: () => state.sketchMode,
    onSketchMove,
    onSketchEnd,
    onSketchCancel,
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
    const base = anim.animTo ?? state.viewport;
    animateZoom(zoomViewport(base, center, canvas.clientWidth, -ZOOM_DELTA));
  });
  document.getElementById('zoom-out')!.addEventListener('click', () => {
    const center = canvas.clientWidth / 2;
    const base = anim.animTo ?? state.viewport;
    animateZoom(zoomViewport(base, center, canvas.clientWidth, ZOOM_DELTA));
  });

  // Snapshot selection state on first mousedown of a potential double-click
  canvas.addEventListener('mousedown', () => {
    const now = performance.now();
    if (now - state.lastMouseDownTime > 500) {
      state.preClickSelection = state.selection ? { ...state.selection } : null;
      state.preClickSelectedItem = state.selectedItem;
      state.preClickSnapOverrides = inputHandlers.getSelectionOverrides();
    }
    state.lastMouseDownTime = now;
  });

  function toggleZoom(event: TimelineEvent, item: LayoutItem) {
    if (state.dblClickItem && event === state.dblClickItem.event && state.dblClickPrevViewport) {
      animateZoom(state.dblClickPrevViewport);
      state.dblClickPrevViewport = null;
      state.dblClickItem = null;
    } else {
      state.dblClickPrevViewport = { ...(anim.animTo ?? state.viewport) };
      state.dblClickItem = item;
      const padding = (item.nominalEndYear - item.nominalStartYear) * 0.1;
      animateZoom({ start: item.nominalStartYear - padding, end: item.nominalEndYear + padding });
    }
  }

  // Double-click to zoom into event (toggle back on second double-click)
  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTest(x, y, state.layout, state.viewport, canvas.clientWidth, state.scrollY);

    if (!hit || hit.event.end === undefined || e.ctrlKey || e.metaKey) return;

    // Restore selection state from before the double-click
    state.selection = state.preClickSelection;
    state.selectedItem = state.preClickSelectedItem;
    inputHandlers.restoreSelectionOverrides(state.preClickSnapOverrides.anchor, state.preClickSnapOverrides.extend);
    eventListPanel?.selectEvent(state.selectedItem?.event ?? null);
    if (state.selectedItem) eventMenu.show(state.selectedItem.event); else eventMenu.hide();

    toggleZoom(hit.event, hit);
  });

  // Event list panel — visibility toggles
  function onToggleEvent(event: TimelineEvent, visible: boolean) {
    // Capture old Y positions
    const oldPositions = new Map<TimelineEvent, number>();
    capturePositions(state.layout, oldPositions);

    // Capture items about to be hidden
    const fadingOut: LayoutItem[] = [];
    if (!visible) {
      const hiding = findLayoutItem(event, state.layout);
      if (hiding) fadingOut.push(hiding);
    }

    // Update hidden set and recompute layout
    if (visible) state.hiddenEvents.delete(event);
    else state.hiddenEvents.add(event);
    relayout();

    // Compute Y offsets for items that moved
    const yOffsets = new Map<TimelineEvent, number>();
    computeOffsets(state.layout, oldPositions, yOffsets);

    // Items fading in
    const fadingIn = new Set<TimelineEvent>();
    if (visible) fadingIn.add(event);

    // Start animation
    anim.layoutTransition = { startTime: performance.now(), fadingOut, yOffsets, fadingIn };

    // Clear hovered/selected if they reference the hidden event
    if (!visible) {
      if (state.hoveredItem && isDescendantOf(state.hoveredItem.event, event)) setHoveredItem(null);
      if (state.selectedItem && isDescendantOf(state.selectedItem.event, event)) {
        state.selectedItem = null;
        eventListPanel?.selectEvent(null);
        eventMenu.hide();
      }
      if (state.dblClickItem && isDescendantOf(state.dblClickItem.event, event)) {
        state.dblClickPrevViewport = null;
        state.dblClickItem = null;
      }
    }

    undoManager.push(snapshot());
    requestRedraw();
  }

  function onHoverEvent(event: TimelineEvent | null) {
    if (event === null) {
      setHoveredItem(null);
    } else {
      setHoveredItem(findLayoutItem(event, state.layout));
    }
    requestRedraw();
  }

  /** Pan and scroll so the given state.layout item is visible, accounting for UI panel occlusion. */
  function scrollItemIntoView(item: LayoutItem) {
    const rect = canvas.getBoundingClientRect();

    // Horizontal: pan viewport if event is not visible
    // Account for UI panels overlaying the left side of the canvas:
    // - events list panel (always)
    // - event menu (only when expanded)
    const vp = anim.animTo ?? state.viewport;
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
    const visibleTop = state.scrollY + LAYOUT.eventsStartY;
    const visibleBottom = state.scrollY + rect.height;
    const itemTop = item.y;
    const itemBottom = item.y + item.height;
    if (itemBottom > visibleBottom) {
      state.scrollY = Math.min(itemBottom - rect.height + 20, computeMaxScrollY());
    } else if (itemTop < visibleTop) {
      state.scrollY = Math.max(itemTop - LAYOUT.eventsStartY - 10, 0);
    }
  }

  function onSelectEvent(event: TimelineEvent) {
    const item = findLayoutItem(event, state.layout);
    state.selectedItem = item;
    eventListPanel?.selectEvent(event);
    eventMenu.show(event);

    if (item) scrollItemIntoView(item);

    requestRedraw();
  }

  function onDblClickEvent(event: TimelineEvent) {
    if (event.end === undefined) return;
    const item = findLayoutItem(event, state.layout);
    if (item) toggleZoom(event, item);
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
    walk(state.events, 0);
    return result;
  }

  const contextMenu = new ContextMenu({
    onEdit: (event) => {
      onSelectEvent(event);
      eventMenu.expand();
    },
    onChangeParent: (event, newParent) => {
      removeEvent(state.events, event);
      if (newParent === null) {
        state.events.push(event);
      } else {
        if (!newParent.nested) newParent.nested = [];
        newParent.nested.push(event);
      }
      const destSiblings = newParent?.nested ?? state.events;
      const unique = uniqueSiblingName(event.name, destSiblings, event);
      if (unique !== event.name) {
        event.name = unique;
      }
      commit({ relayout: true, saveEvents: true, undo: true, rebuildList: true });
      infoLog.show(`Moved "${event.name}" to ${newParent ? `"${newParent.name}"` : 'top level'}`);
    },
    onHoverEvent: (event) => {
      onHoverEvent(event);
    },
    onExport: (event) => {
      exportToFile(event, toSnakeCase(event.name) + '.json');
      const count = countEvents(event);
      infoLog.show(`Exported "${event.name}"${count > 1 ? ` with ${count - 1} sub-events` : ''}`);
    },
    onDelete: deleteEvent,
    getParentCandidates,
    getCurrentParent: (event) => findParent(state.events, event),
  });

  function onContextMenu(event: TimelineEvent, x: number, y: number) {
    contextMenu.show(event, x, y);
  }

  eventListPanel = new EventListPanel(state.events, onToggleEvent, onHoverEvent, onSelectEvent, state.hiddenEvents, onDblClickEvent, onContextMenu);

  // --- Event editing helpers ---
  function deleteEvent(event: TimelineEvent) {
    removeEvent(state.events, event);
    state.hiddenEvents.delete(event);
    state.collapsedEvents.delete(event);
    state.collapseAllSaved?.delete(event);
    state.selectedItem = null;
    eventMenu.hide();
    eventListPanel?.selectEvent(null);
    eventListPanel?.removeEvent(event);
    commit({ relayout: true, saveEvents: true, undo: true });
    infoLog.show(`Deleted "${event.name}"`);
  }

  const eventMenu = new EventMenu({
    onRename: (event, name) => {
      event.name = name;
      eventListPanel?.updateEventName(event);
      commitEdit(event, `rename:${getEventId(event)}`);
    },
    onCommitRename: (event, name) => {
      const siblings = getSiblings(event, state.events);
      const unique = uniqueSiblingName(name, siblings, event);
      if (unique !== name) {
        event.name = unique;
        eventListPanel?.updateEventName(event);
        commit({ relayout: true, saveEvents: true, undo: true });
        infoLog.show(`Renamed to "${unique}" to avoid duplicate name`);
        return unique;
      }
      return null;
    },
    onEditInfo: (event, info) => {
      event.info = info || undefined;
      commit({ saveEvents: true, undoCoalesce: `info:${getEventId(event)}` });
    },
    onChangeStart: (event, start) => {
      event.start = start;
      commitEdit(event, `start:${getEventId(event)}`);
    },
    onChangeEnd: (event, end) => {
      if (end === undefined) {
        delete event.end;
        delete event.endApprox;
      } else {
        event.end = end;
      }
      commitEdit(event, `end:${getEventId(event)}`);
    },
    onChangeStartApprox: (event, approx) => {
      if (approx === undefined) delete event.startApprox;
      else event.startApprox = approx;
      commitEdit(event, `startApprox:${getEventId(event)}`);
    },
    onChangeEndApprox: (event, approx) => {
      if (approx === undefined) delete event.endApprox;
      else event.endApprox = approx;
      commitEdit(event, `endApprox:${getEventId(event)}`);
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
      removeEvent(state.events, event);

      // Add to new location
      if (newParent === null) {
        state.events.push(event);
      } else {
        if (!newParent.nested) newParent.nested = [];
        newParent.nested.push(event);
      }

      // Ensure unique name at destination
      const destSiblings = newParent?.nested ?? state.events;
      const unique = uniqueSiblingName(event.name, destSiblings, event);
      if (unique !== event.name) {
        event.name = unique;
      }

      // Update UI
      commit({ relayout: true, saveEvents: true, undo: true, rebuildList: true });
      infoLog.show(`Moved "${event.name}" to ${newParent ? `"${newParent.name}"` : 'top level'}`);
    },
    onDelete: deleteEvent,
    onExport: (event) => {
      exportToFile(event, toSnakeCase(event.name) + '.json');
      const count = countEvents(event);
      infoLog.show(`Exported "${event.name}"${count > 1 ? ` with ${count - 1} sub-events` : ''}`);
    },
    hasChildren: (event) => {
      return event.nested !== undefined && event.nested.length > 0;
    },
    getParentCandidates,
    getCurrentParent: (event) => findParent(state.events, event),
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
    const parent = (state.selectedItem && state.selectedItem.event.end !== undefined)
      ? state.selectedItem.event : null;

    // 2. Determine date/type
    let start: string;
    let end: string | undefined;

    const parentStart = parent ? dateToDecimalYear(parent.start) : null;
    const parentEnd = parent
      ? (parent.end === 'ongoing' ? dateToDecimalYear(new Date().toISOString().slice(0, 10)) : dateToDecimalYear(parent.end!))
      : null;

    if (state.selection && state.selection.start !== state.selection.end) {
      // Range selection
      let selStart = state.selection.start;
      let selEnd = state.selection.end;
      if (parent && parentStart !== null && parentEnd !== null) {
        // Clamp to parent range if overlapping
        if (selStart < parentEnd && selEnd > parentStart) {
          selStart = Math.max(selStart, parentStart);
          selEnd = Math.min(selEnd, parentEnd);
        }
      }
      start = decimalYearToIso(selStart);
      end = decimalYearToIso(selEnd);
    } else if (state.selection && state.selection.start === state.selection.end) {
      // Single cursor point
      start = decimalYearToIso(state.selection.start);
    } else {
      // No cursor/selection — use center of parent or viewport
      if (parent && parentStart !== null && parentEnd !== null) {
        start = decimalYearToIso((parentStart + parentEnd) / 2);
      } else {
        const vp = anim.animTo ?? state.viewport;
        start = decimalYearToIso((vp.start + vp.end) / 2);
      }
    }

    // 3. Create event
    const siblings = parent?.nested ?? state.events;
    const newEvent: TimelineEvent = { name: uniqueSiblingName('New event', siblings), start };
    if (end !== undefined) newEvent.end = end;

    // 4. Add to data
    if (parent) {
      if (!parent.nested) parent.nested = [];
      parent.nested.push(newEvent);
    } else {
      state.events.push(newEvent);
    }

    // 5. Update
    commit({ relayout: true, saveEvents: true, undo: true, rebuildList: true });

    // 6. Select, scroll into view, and edit
    const item = findLayoutItem(newEvent, state.layout);
    state.selectedItem = item;
    eventListPanel?.selectEvent(newEvent);
    eventMenu.show(newEvent);
    eventMenu.focusName();
    if (item) scrollItemIntoView(item);
    requestRedraw();
  });

  // --- Event import (shared by drop handler and menu) ---
  async function importEventsFromFile(file: File) {
    const read = await readJsonFile(file);
    if ('error' in read) { infoLog.show(read.error); return; }

    const result = validateEvents(read.data);
    if ('error' in result) { infoLog.show(result.error); return; }

    deduplicateSiblingNames(result.events);
    const newEvents: TimelineEvent[] = [];
    for (const ie of result.events) {
      ie.name = uniqueSiblingName(ie.name, state.events);
      newEvents.push(ie);
    }

    state.events.push(...newEvents);
    await saveStoredEvents(slug, state.events);
    undoManager.push(snapshot());
    relayout();

    anim.layoutTransition = {
      startTime: performance.now(),
      fadingOut: [],
      yOffsets: new Map(),
      fadingIn: new Set(newEvents),
    };

    eventListPanel?.addEvents(newEvents, onToggleEvent, onHoverEvent, onSelectEvent);
    infoLog.show(`Added ${newEvents.length} event${newEvents.length !== 1 ? 's' : ''} from "${file.name}"`);
    requestRedraw();
  }

  async function loadEventsFromFile(file: File) {
    const read = await readJsonFile(file);
    if ('error' in read) { infoLog.show(read.error); return; }

    const result = validateEvents(read.data);
    if ('error' in result) { infoLog.show(result.error); return; }

    deduplicateSiblingNames(result.events);
    const count = result.events.reduce((n, e) => n + countEvents(e), 0);
    showConfirmDialog(
      `Replace all current events with ${count} event${count !== 1 ? 's' : ''} from "${file.name}"? This cannot be undone.`,
      async () => {
        state.events.length = 0;
        state.events.push(...result.events);
        state.hiddenEvents.clear();
        state.collapsedEvents.clear();
        state.collapseAllSaved = null;
        state.eventOrders.clear();
        await saveStoredEvents(slug, state.events);
        state.hoveredItem = null;
        state.selectedItem = null;
        eventMenu.hide();
        state.dblClickPrevViewport = null;
        state.dblClickItem = null;
        relayout();
        undoManager.init(snapshot());
        eventListPanel?.rebuild(state.events, onToggleEvent, onHoverEvent, onSelectEvent, state.hiddenEvents, onContextMenu);
        requestRedraw();
        infoLog.show(`Loaded ${count} event${count !== 1 ? 's' : ''} from "${file.name}"`);
      },
    );
  }

  async function importIntoNewEvent(file: File) {
    const read = await readJsonFile(file);
    if ('error' in read) { infoLog.show(read.error); return; }

    const result = validateEvents(read.data);
    if ('error' in result) { infoLog.show(result.error); return; }

    deduplicateSiblingNames(result.events);

    showPromptDialog('Name for the container event:', 'Event name', async (rawName) => {
      const name = uniqueSiblingName(rawName, state.events);
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

      state.events.push(container);
      await saveStoredEvents(slug, state.events);
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
  const timelineMenu = new TimelineMenu({
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
      exportToFile(state.events, 'timeline-events.json');
      infoLog.show(`Exported ${state.events.length} events`);
    },
    onDeleteAll: () => {
      showConfirmDialog('Delete all events? This cannot be undone.', async () => {
        state.events.length = 0;
        state.hiddenEvents.clear();
        state.collapsedEvents.clear();
        state.collapseAllSaved = null;
        state.eventOrders.clear();
        await clearStoredEvents(slug);
        eventListPanel?.clear();
        state.hoveredItem = null;
        state.selectedItem = null;
        eventMenu.hide();
        state.dblClickPrevViewport = null;
        state.dblClickItem = null;
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
      state.showTodayLine = show;
      requestRedraw();
    },
    onToggleSketchMode: (enabled) => {
      state.sketchMode = enabled;
      if (enabled) state.sketchModeUnlocked = true;
      requestRedraw();
    },
    onThemeChange: () => requestRedraw(),
  }, state.showTodayLine, state.sketchMode, slug);

  // --- Undo/redo ---
  undoManager.init(snapshot());

  function restoreFromSnapshot(snap: UndoableState): void {
    // Capture selected event identity before replacing state
    const selectedPath = state.selectedItem
      ? eventToPath(state.selectedItem.event, state.events)
      : null;

    // Cancel in-progress animations and transient state
    anim.cancelAll();
    state.reorderState = null;
    state.reorderOriginalOrders = null;
    state.reorderRefPositions = null;

    // Replace events array
    state.events.length = 0;
    state.events.push(...structuredClone(snap.events));

    // Rebuild hidden/collapsed sets from paths
    state.hiddenEvents.clear();
    for (const e of resolvePathSet(snap.hiddenPaths, state.events)) state.hiddenEvents.add(e);

    state.collapsedEvents.clear();
    for (const e of resolvePathSet(snap.collapsedPaths, state.events)) state.collapsedEvents.add(e);

    // Restore collapse-all saved state
    if (snap.collapseAllSavedPaths !== null) {
      state.collapseAllSaved = resolvePathSet(snap.collapseAllSavedPaths, state.events);
    } else {
      state.collapseAllSaved = null;
    }

    // Replace event orders
    state.eventOrders.clear();
    for (const [k, v] of snap.eventOrders) state.eventOrders.set(k, [...v]);

    // Recompute layout
    relayout();

    // Attempt to re-select by path
    if (selectedPath) {
      const event = pathToEvent(selectedPath, state.events);
      if (event) {
        const item = findLayoutItem(event, state.layout);
        state.selectedItem = item;
        eventListPanel?.selectEvent(event);
        eventMenu.show(event);
      } else {
        state.selectedItem = null;
        eventListPanel?.selectEvent(null);
        eventMenu.hide();
      }
    } else {
      state.selectedItem = null;
      eventListPanel?.selectEvent(null);
      eventMenu.hide();
    }

    state.hoveredItem = null;
    inputHandlers.restoreSelectionOverrides(null, null);

    // Rebuild event list and redraw
    eventListPanel?.rebuild(state.events, onToggleEvent, onHoverEvent, onSelectEvent, state.hiddenEvents, onContextMenu);
    saveStoredEvents(slug, state.events);
    requestRedraw();
  }

  window.addEventListener('keydown', (e) => {
    // Skip when form elements are focused (let browser handle native undo)
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Skip during active reorder or sketch drag
    if (state.reorderState !== null) return;
    if (state.sketchOriginalDates !== null) return;

    // Undo: Cmd+Z or Ctrl+Z
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      const snap = undoManager.undo();
      if (snap) {
        restoreFromSnapshot(snap);
        infoLog.show('Undo');
      }
      return;
    }

    // Redo: Cmd+Shift+Z, Ctrl+Shift+Z, or Ctrl+Y
    if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') ||
        (e.ctrlKey && !e.metaKey && e.key === 'y')) {
      e.preventDefault();
      const snap = undoManager.redo();
      if (snap) {
        restoreFromSnapshot(snap);
        infoLog.show('Redo');
      }
      return;
    }

    // Collapse/expand all: M
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleCollapseAll();
      return;
    }

    // Delete/Backspace: delete selected event
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedItem) {
      e.preventDefault();
      const event = state.selectedItem.event;
      showConfirmDialog(`Delete "${event.name}"?`, () => deleteEvent(event));
      return;
    }

    // S: toggle sketch mode (only after it's been enabled from the menu once)
    if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && state.sketchModeUnlocked) {
      e.preventDefault();
      state.sketchMode = !state.sketchMode;
      timelineMenu.setSketchMode(state.sketchMode);
      infoLog.show(state.sketchMode ? 'Sketch mode on' : 'Sketch mode off');
      requestRedraw();
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
    if (state.scrollY > max) state.scrollY = max;
    requestRedraw();
  });
}

main();
