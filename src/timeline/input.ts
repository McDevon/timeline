import { Viewport, panViewport, zoomViewport, xToYear, yearToX, MIN_SPAN, MAX_SPAN } from './viewport';
import { LayoutItem } from './layout';
import { TimelineEvent, TimelineSelection } from '../types';
import { hitTest } from './hitTest';
import { Tooltip } from '../ui/tooltip';
import { LAYOUT, chooseTickInterval } from './renderer';
import { collectSnapTargets, findSnapYear, getSnapDetail, SnapDetail, SnapState } from './snap';
import { todayDecimalYear, todayIsoDate, formatDate, dateToDecimalYear } from '../data/time';

export interface InputHandlers {
  destroy(): void;
  getSelectionOverrides(): { anchor: SnapDetail | null; extend: SnapDetail | null };
  restoreSelectionOverrides(anchor: SnapDetail | null, extend: SnapDetail | null): void;
}

export interface InputConfig {
  canvas: HTMLCanvasElement;
  getViewport: () => Viewport;
  setViewport: (v: Viewport) => void;
  getLayout: () => LayoutItem[];
  getHovered: () => LayoutItem | null;
  setHovered: (item: LayoutItem | null) => void;
  setSelected: (item: LayoutItem | null) => void;
  setCursorX: (x: number) => void;
  getSelection: () => TimelineSelection | null;
  setSelection: (sel: TimelineSelection | null) => void;
  setSnapState: (state: SnapState) => void;
  onCollapseToggle: (event: import('../types').TimelineEvent) => void;
  onReorderMove: (item: LayoutItem, cursorY: number) => void;
  onReorderEnd: (item: LayoutItem) => void;
  onReorderCancel: () => void;
  getScrollY: () => number;
  setScrollY: (y: number) => void;
  getMaxScrollY: () => number;
  requestRedraw: () => void;
  getShowTodayLine?: () => boolean;
  onContextMenu?: (event: import('../types').TimelineEvent, x: number, y: number) => void;
  getSketchMode?: () => boolean;
  onSketchMove?: (item: LayoutItem, newStartYear: number, newEndYear: number, isResize?: boolean) => void;
  onSketchEnd?: (item: LayoutItem) => void;
  onSketchCancel?: () => void;
}

const CLICK_THRESHOLD = 3; // pixels — movement under this is a click, not a drag
const ZOOM_DRAG_SENSITIVITY = 200; // pixels of horizontal drag for a 2× zoom

/**
 * Attach input handlers to a canvas for panning, hover, and click.
 */
export function setupInput(config: InputConfig): InputHandlers {
  const {
    canvas,
    getViewport,
    setViewport,
    getLayout,
    getHovered,
    setHovered,
    setSelected,
    setCursorX,
    getSelection,
    setSelection,
    setSnapState,
    onCollapseToggle,
    onReorderMove,
    onReorderEnd,
    onReorderCancel,
    getScrollY,
    setScrollY,
    getMaxScrollY,
    requestRedraw,
    getShowTodayLine,
    onContextMenu,
    getSketchMode,
    onSketchMove,
    onSketchEnd,
    onSketchCancel,
  } = config;
  const tooltip = new Tooltip();

  function clearSelection() {
    tooltip.hide();
    setSelected(null);
    setSelection(null);
    selAnchorOverride = null;
    selExtendOverride = null;
  }

  // --- Snapping ---
  let modifierHeld = false;
  let altHeld = false;
  let cachedLayout: LayoutItem[] | null = null;
  let eventSnapTargets: number[] = [];
  let snapTargetsCache: number[] = [];
  let snapExcludeEvent: TimelineEvent | null = null;

  let cachedNowYear = 0;
  let cachedNowIso = '';
  let cachedViewportStart = 0;
  let cachedViewportEnd = 0;

  const TICK_SNAP_THRESHOLD_PX = 6;

  function collectAxisSnapTargets(viewport: Viewport, canvasWidth: number): number[] {
    const interval = chooseTickInterval(viewport, canvasWidth);
    const firstTick = Math.ceil(viewport.start / interval) * interval;
    const ticks: number[] = [];
    for (let year = firstTick; year <= viewport.end; year += interval) {
      ticks.push(year);
    }
    return ticks;
  }

  function ensureSnapCaches(): void {
    const layout = getLayout();
    const viewport = getViewport();

    if (layout !== cachedLayout) {
      cachedLayout = layout;
      cachedNowYear = todayDecimalYear();
      cachedNowIso = todayIsoDate();
      eventSnapTargets = collectSnapTargets(layout, snapExcludeEvent ?? undefined);
      if (!getShowTodayLine || getShowTodayLine()) {
        eventSnapTargets.push(cachedNowYear);
      }
      eventSnapTargets.sort((a, b) => a - b);
      cachedViewportStart = NaN; // force merge rebuild
    }

    if (viewport.start !== cachedViewportStart || viewport.end !== cachedViewportEnd) {
      cachedViewportStart = viewport.start;
      cachedViewportEnd = viewport.end;
      const axisTicks = collectAxisSnapTargets(viewport, canvas.clientWidth);
      const all = [...new Set([...eventSnapTargets, ...axisTicks])];
      all.sort((a, b) => a - b);
      snapTargetsCache = all;
    }
  }

  /** Two-tier snap: event edges at 10px, then all targets (incl. ticks) at 6px. */
  function findBestSnap(pixelX: number): number | null {
    ensureSnapCaches();
    const viewport = getViewport();
    const w = canvas.clientWidth;
    return findSnapYear(pixelX, eventSnapTargets, viewport, w) ??
      findSnapYear(pixelX, snapTargetsCache, viewport, w, TICK_SNAP_THRESHOLD_PX);
  }

  function snapYear(pixelX: number): number {
    const viewport = getViewport();
    const rawYear = xToYear(pixelX, viewport, canvas.clientWidth);
    if (modifierHeld) return rawYear;
    return findBestSnap(pixelX) ?? rawYear;
  }

  // --- Snap highlighting ---
  let cursorSnapYear: number | null = null;

  // Overrides for selection details when set by clicking events (not axis)
  let selAnchorOverride: SnapDetail | null = null;
  let selExtendOverride: SnapDetail | null = null;

  /** Build a SnapDetail for a specific clicked item and edge year. */
  function clickDetail(item: LayoutItem, year: number): SnapDetail {
    if (item.event.end === undefined) {
      return { label: item.event.name, date: formatDate(item.event.start), isoDate: item.event.start };
    }
    if (year === item.nominalStartYear) {
      return { label: `Beginning of ${item.event.name}`, date: formatDate(item.event.start), isoDate: item.event.start };
    }
    if (item.event.end === 'ongoing') {
      ensureSnapCaches();
      return { label: 'Now', date: formatDate(cachedNowIso), isoDate: cachedNowIso };
    }
    return { label: `End of ${item.event.name}`, date: formatDate(item.event.end), isoDate: item.event.end };
  }

  function nowSnapDetail(): SnapDetail {
    return { label: 'Now', date: formatDate(cachedNowIso), isoDate: cachedNowIso };
  }

  function axisTickSnapDetail(year: number): SnapDetail {
    const absYear = Math.abs(year);
    const suffix = year < 0 ? ' BCE' : '';
    const isoDate = year < 0 ? `-${absYear}-01-01` : `${year}-01-01`;
    return {
      label: `Beginning of ${absYear}${suffix}`,
      date: formatDate(isoDate),
      isoDate,
    };
  }

  function snapDetailFor(year: number, layout: LayoutItem[]): SnapDetail | null {
    return getSnapDetail(year, layout) ??
      (year === cachedNowYear ? nowSnapDetail() : null) ??
      (Number.isInteger(year) ? axisTickSnapDetail(year) : null);
  }

  function updateSnapHighlights() {
    const years = new Set<number>();
    const layout = getLayout();
    let cursorDetail: SnapDetail | null = null;
    let selStartDetail: SnapDetail | null = null;
    let selEndDetail: SnapDetail | null = null;

    if (cursorSnapYear !== null) {
      years.add(cursorSnapYear);
      cursorDetail = snapDetailFor(cursorSnapYear, layout);
    }
    const sel = getSelection();
    if (sel !== null) {
      if (sel.start === sel.end) {
        // Single point
        selStartDetail = selAnchorOverride ?? snapDetailFor(sel.start, layout);
      } else {
        // Range — assign anchor/extend overrides to correct ends
        const anchorIsStart = sel.anchor === sel.start;
        selStartDetail = (anchorIsStart ? selAnchorOverride : selExtendOverride) ?? snapDetailFor(sel.start, layout);
        selEndDetail = (anchorIsStart ? selExtendOverride : selAnchorOverride) ?? snapDetailFor(sel.end, layout);
      }
      if (selStartDetail !== null) {
        years.add(sel.start);
      }
      if (sel.start !== sel.end && selEndDetail !== null) {
        years.add(sel.end);
      }
    }
    setSnapState({ highlightYears: years, cursorDetail, selStartDetail, selEndDetail });
  }

  function scheduleRedraw() {
    updateSnapHighlights();
    requestRedraw();
  }

  // --- Sketch mode edge detection ---
  const EDGE_THRESHOLD_PX = 6;

  function detectEdge(
    canvasX: number,
    item: LayoutItem,
    viewport: Viewport,
    canvasWidth: number,
  ): 'start' | 'end' | 'body' {
    if (item.isPoint) return 'body';
    const startX = yearToX(item.nominalStartYear, viewport, canvasWidth);
    const endX = yearToX(item.nominalEndYear, viewport, canvasWidth);
    if (Math.abs(canvasX - startX) <= EDGE_THRESHOLD_PX) return 'start';
    if (item.event.end === 'ongoing') return 'body'; // can't resize ongoing end
    if (Math.abs(canvasX - endX) <= EDGE_THRESHOLD_PX) return 'end';
    return 'body';
  }

  // --- Wheel / trackpad ---
  function sketchCursor(hit: LayoutItem | null): string {
    if (!hit) return 'grab';
    if (!getSketchMode || !getSketchMode()) return 'pointer';
    const edge = detectEdge(cursorCanvasX, hit, getViewport(), canvas.clientWidth);
    return edge === 'body' ? 'grab' : 'ew-resize';
  }

  function updateHover() {
    if (cursorCanvasX < 0) return;
    const layout = getLayout();
    const viewport = getViewport();
    const hit = hitTest(cursorCanvasX, cursorCanvasY, layout, viewport, canvas.clientWidth, getScrollY());
    const prev = getHovered();
    if (hit !== prev) {
      setHovered(hit);
      canvas.style.cursor = sketchCursor(hit);
      if (hit) {
        const rect = canvas.getBoundingClientRect();
        tooltip.show(hit.event, rect.left + cursorCanvasX, rect.top + cursorCanvasY);
      } else {
        tooltip.hide();
      }
    }
  }

  // Scroll direction lock: accumulate deltas until threshold, then lock axis
  const SCROLL_LOCK_THRESHOLD = 8;
  let scrollLock: 'none' | 'horizontal' | 'vertical' = 'none';
  let scrollAccumX = 0;
  let scrollAccumY = 0;
  let scrollLockTimer = 0;

  function resetScrollLock() {
    scrollLock = 'none';
    scrollAccumX = 0;
    scrollAccumY = 0;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    modifierHeld = e.ctrlKey || e.metaKey;
    const viewport = getViewport();

    // Reset lock after gesture idle
    clearTimeout(scrollLockTimer);
    scrollLockTimer = window.setTimeout(resetScrollLock, 150);

    if (e.ctrlKey || e.metaKey) {
      // Zoom — Ctrl+wheel or trackpad pinch
      resetScrollLock();
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      setViewport(zoomViewport(viewport, cursorX, canvas.clientWidth, e.deltaY));
    } else {
      const maxScroll = getMaxScrollY();
      if (maxScroll > 0 && !e.shiftKey) {
        // Content overflows: lock direction after threshold
        if (scrollLock === 'none') {
          scrollAccumX += Math.abs(e.deltaX);
          scrollAccumY += Math.abs(e.deltaY);
          if (scrollAccumX >= SCROLL_LOCK_THRESHOLD || scrollAccumY >= SCROLL_LOCK_THRESHOLD) {
            scrollLock = scrollAccumX >= scrollAccumY ? 'horizontal' : 'vertical';
          }
        } else {
          // Break lock when primary direction changes (new gesture)
          const primaryVertical = Math.abs(e.deltaY) > Math.abs(e.deltaX);
          if ((scrollLock === 'horizontal' && primaryVertical) ||
              (scrollLock === 'vertical' && !primaryVertical)) {
            resetScrollLock();
          }
        }
        if (scrollLock === 'horizontal') {
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          setViewport(panViewport(viewport, delta, canvas.clientWidth));
        } else if (scrollLock === 'vertical') {
          const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
          const newScrollY = Math.max(0, Math.min(maxScroll, getScrollY() + delta));
          setScrollY(newScrollY);
        }
        // Before lock decided: don't scroll in either direction (accumulating)
      } else {
        // Content fits or shift held: all delta → horizontal pan
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        setViewport(panViewport(viewport, delta, canvas.clientWidth));
      }
    }

    updateCursorLine(cursorCanvasX, cursorCanvasY);
    updateHover();
    scheduleRedraw();
  }

  // --- Mouse drag + click ---
  type DragState =
    | { mode: 'none' }
    | { mode: 'undecided'; mouseDownX: number; mouseDownY: number; startViewport: Viewport; reorderCandidate: LayoutItem; edgeHint?: 'start' | 'end' | 'body' }
    | { mode: 'axis-selecting'; mouseDownX: number; mouseDownY: number; anchorYear: number; didDrag: boolean }
    | { mode: 'panning'; mouseDownX: number; mouseDownY: number; lastMouseX: number; didDrag: boolean; startViewport: Viewport }
    | { mode: 'reordering'; item: LayoutItem; startViewport: Viewport }
    | { mode: 'zooming'; mouseDownX: number; mouseDownY: number; anchorYear: number; startViewport: Viewport; didDrag: boolean }
    | { mode: 'sketch-moving'; item: LayoutItem; startViewport: Viewport; originalStartYear: number; originalEndYear: number; anchorYear: number }
    | { mode: 'sketch-resizing'; item: LayoutItem; startViewport: Viewport; edge: 'start' | 'end'; originalStartYear: number; originalEndYear: number; anchorYear: number };

  let drag: DragState = { mode: 'none' };
  const REORDER_DECISION_THRESHOLD = 8;

  // Auto-scroll during reorder drag
  const AUTOSCROLL_ZONE = 60; // px from edge
  const AUTOSCROLL_MAX_SPEED = 8; // px per frame
  let autoScrollRaf = 0;
  let lastClientY = 0;

  function startAutoScroll(): void {
    if (autoScrollRaf) return;
    function tick() {
      if (drag.mode !== 'reordering') { autoScrollRaf = 0; return; }
      const rect = canvas.getBoundingClientRect();
      const relY = lastClientY - rect.top;
      let delta = 0;
      if (relY < AUTOSCROLL_ZONE) {
        delta = -AUTOSCROLL_MAX_SPEED * (1 - relY / AUTOSCROLL_ZONE);
      } else if (relY > rect.height - AUTOSCROLL_ZONE) {
        delta = AUTOSCROLL_MAX_SPEED * (1 - (rect.height - relY) / AUTOSCROLL_ZONE);
      }
      if (delta !== 0) {
        const newScroll = Math.max(0, Math.min(getScrollY() + delta, getMaxScrollY()));
        setScrollY(newScroll);
        onReorderMove(drag.item, (lastClientY - rect.top) + newScroll);
        scheduleRedraw();
      }
      autoScrollRaf = requestAnimationFrame(tick);
    }
    autoScrollRaf = requestAnimationFrame(tick);
  }

  function stopAutoScroll(): void {
    if (autoScrollRaf) {
      cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = 0;
    }
  }

  // Last known cursor position on the canvas (for hover updates during scroll)
  let cursorCanvasX = -1;
  let cursorCanvasY = -1;
  let lastSetCursorX = -1;

  /** Update the cursor line X with snapping; returns true if it changed. */
  function updateCursorLine(canvasX: number, canvasY: number): boolean {
    let newX = canvasY < LAYOUT.eventsStartY ? canvasX : -1;
    let newSnapYear: number | null = null;
    if (newX >= 0 && !modifierHeld) {
      const snapped = findBestSnap(newX);
      if (snapped !== null) {
        const viewport = getViewport();
        newX = yearToX(snapped, viewport, canvas.clientWidth);
        newSnapYear = snapped;
      }
    }
    cursorSnapYear = newSnapYear;
    if (newX === lastSetCursorX) return false;
    lastSetCursorX = newX;
    setCursorX(newX);
    return true;
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    modifierHeld = e.ctrlKey || e.metaKey;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    cursorSnapYear = null;

    if (y < LAYOUT.eventsStartY) {
      // Axis region — start selection mode
      drag = {
        mode: 'axis-selecting',
        mouseDownX: e.clientX,
        mouseDownY: e.clientY,
        anchorYear: snapYear(x),
        didDrag: false,
      };
      canvas.style.cursor = 'col-resize';
      selAnchorOverride = null;
      selExtendOverride = null;
    } else if (modifierHeld) {
      // Ctrl/Cmd + drag in events region — zoom drag
      const viewport = getViewport();
      drag = {
        mode: 'zooming',
        mouseDownX: e.clientX,
        mouseDownY: e.clientY,
        anchorYear: xToYear(x, viewport, canvas.clientWidth),
        startViewport: { ...viewport },
        didDrag: false,
      };
      tooltip.hide();
      updateCursorLine(-1, LAYOUT.eventsStartY);
      canvas.style.cursor = 'ew-resize';
    } else {
      // Events region — undecided if item under cursor, else straight to panning
      const hit = hitTest(x, y, getLayout(), getViewport(), canvas.clientWidth, getScrollY());
      if (hit) {
        const edgeHint = getSketchMode?.()
          ? detectEdge(x, hit, getViewport(), canvas.clientWidth)
          : undefined;
        drag = {
          mode: 'undecided',
          mouseDownX: e.clientX,
          mouseDownY: e.clientY,
          startViewport: { ...getViewport() },
          reorderCandidate: hit,
          edgeHint,
        };
      } else {
        drag = {
          mode: 'panning',
          mouseDownX: e.clientX,
          mouseDownY: e.clientY,
          lastMouseX: e.clientX,
          didDrag: false,
          startViewport: { ...getViewport() },
        };
      }
      updateCursorLine(-1, LAYOUT.eventsStartY);
      canvas.style.cursor = 'grabbing';
    }
  }

  function onMouseMove(e: MouseEvent) {
    modifierHeld = e.ctrlKey || e.metaKey;

    if (drag.mode === 'axis-selecting') {
      const dist = Math.hypot(e.clientX - drag.mouseDownX, e.clientY - drag.mouseDownY);
      if (dist >= CLICK_THRESHOLD) drag.didDrag = true;
      if (drag.didDrag) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const currentYear = snapYear(x);
        setSelection({
          start: Math.min(drag.anchorYear, currentYear),
          end: Math.max(drag.anchorYear, currentYear),
          anchor: drag.anchorYear,
        });
        scheduleRedraw();
      }
      return;
    }

    if (drag.mode === 'zooming') {
      const dist = Math.hypot(e.clientX - drag.mouseDownX, e.clientY - drag.mouseDownY);
      if (dist >= CLICK_THRESHOLD) drag.didDrag = true;
      if (drag.didDrag) {
        const totalDx = e.clientX - drag.mouseDownX;
        let zoomFactor = Math.pow(2, -totalDx / ZOOM_DRAG_SENSITIVITY);
        const originalSpan = drag.startViewport.end - drag.startViewport.start;
        let newSpan = originalSpan * zoomFactor;
        newSpan = Math.max(MIN_SPAN, Math.min(MAX_SPAN, newSpan));
        zoomFactor = newSpan / originalSpan;
        setViewport({
          start: drag.anchorYear - (drag.anchorYear - drag.startViewport.start) * zoomFactor,
          end: drag.anchorYear + (drag.startViewport.end - drag.anchorYear) * zoomFactor,
        });
        scheduleRedraw();
      }
      return;
    }

    if (drag.mode === 'undecided') {
      const dist = Math.hypot(e.clientX - drag.mouseDownX, e.clientY - drag.mouseDownY);
      if (dist >= REORDER_DECISION_THRESHOLD) {
        const absDx = Math.abs(e.clientX - drag.mouseDownX);
        const absDy = Math.abs(e.clientY - drag.mouseDownY);
        if (absDy > absDx) {
          // Vertical — pivot to reorder
          const item = drag.reorderCandidate;
          drag = { mode: 'reordering', item, startViewport: drag.startViewport };
          tooltip.hide();
          canvas.style.cursor = 'ns-resize';
          lastClientY = e.clientY;
          const rect = canvas.getBoundingClientRect();
          onReorderMove(item, e.clientY - rect.top + getScrollY());
          startAutoScroll();
          scheduleRedraw();
        } else if (drag.edgeHint !== undefined) {
          // Horizontal + sketch mode — start sketch operation
          const item = drag.reorderCandidate;
          const sv = drag.startViewport;
          setViewport(sv); // restore viewport to pre-drag snapshot
          const anchorYear = xToYear(drag.mouseDownX - canvas.getBoundingClientRect().left, sv, canvas.clientWidth);
          tooltip.hide();

          const origStart = dateToDecimalYear(item.event.start);
          const origEnd = item.event.end !== undefined && item.event.end !== 'ongoing'
            ? dateToDecimalYear(item.event.end) : origStart;

          // Set up snap exclusion for the dragged event
          snapExcludeEvent = item.event;
          cachedLayout = null; // force snap cache rebuild

          if (drag.edgeHint === 'body') {
            drag = {
              mode: 'sketch-moving',
              item,
              startViewport: sv,
              originalStartYear: origStart,
              originalEndYear: origEnd,
              anchorYear,
            };
            canvas.style.cursor = 'grabbing';
          } else {
            drag = {
              mode: 'sketch-resizing',
              item,
              startViewport: sv,
              edge: drag.edgeHint,
              originalStartYear: origStart,
              originalEndYear: origEnd,
              anchorYear,
            };
            canvas.style.cursor = 'ew-resize';
          }
          onSketchMove?.(item, origStart, origEnd);
          scheduleRedraw();
        } else {
          // Horizontal — transition to panning
          const sv = drag.startViewport;
          drag = {
            mode: 'panning',
            mouseDownX: drag.mouseDownX,
            mouseDownY: drag.mouseDownY,
            lastMouseX: e.clientX,
            didDrag: true,
            startViewport: sv,
          };
          const dx = drag.mouseDownX - e.clientX;
          setViewport(panViewport(sv, dx, canvas.clientWidth));
          scheduleRedraw();
        }
      }
      return;
    }

    if (drag.mode === 'reordering') {
      lastClientY = e.clientY;
      const rect = canvas.getBoundingClientRect();
      const canvasY = e.clientY - rect.top;
      onReorderMove(drag.item, canvasY + getScrollY());
      scheduleRedraw();
      return;
    }

    if (drag.mode === 'sketch-moving') {
      altHeld = e.altKey;
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const currentYear = xToYear(cursorX, drag.startViewport, canvas.clientWidth);
      const deltaYears = currentYear - drag.anchorYear;

      let newStartYear = drag.originalStartYear + deltaYears;
      let newEndYear = drag.originalEndYear + deltaYears;

      // Apply snapping: snap whichever edge is closer to a snap target
      if (!modifierHeld) {
        const w = canvas.clientWidth;
        const snappedStart = findBestSnap(yearToX(newStartYear, drag.startViewport, w));
        const snappedEnd = findBestSnap(yearToX(newEndYear, drag.startViewport, w));
        if (snappedStart !== null || snappedEnd !== null) {
          const startDist = snappedStart !== null
            ? Math.abs(yearToX(snappedStart, drag.startViewport, w) - yearToX(newStartYear, drag.startViewport, w))
            : Infinity;
          const endDist = snappedEnd !== null
            ? Math.abs(yearToX(snappedEnd, drag.startViewport, w) - yearToX(newEndYear, drag.startViewport, w))
            : Infinity;
          if (startDist <= endDist && snappedStart !== null) {
            const snapDelta = snappedStart - newStartYear;
            newStartYear += snapDelta;
            newEndYear += snapDelta;
          } else if (snappedEnd !== null) {
            const snapDelta = snappedEnd - newEndYear;
            newStartYear += snapDelta;
            newEndYear += snapDelta;
          }
        }
      }

      // Clamp: ongoing events cannot have start past today
      if (drag.item.event.end === 'ongoing') {
        const today = todayDecimalYear();
        if (newStartYear > today) {
          const excess = newStartYear - today;
          newStartYear -= excess;
          newEndYear -= excess;
        }
      }

      onSketchMove?.(drag.item, newStartYear, newEndYear);
      scheduleRedraw();
      return;
    }

    if (drag.mode === 'sketch-resizing') {
      altHeld = e.altKey;
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const currentYear = xToYear(cursorX, drag.startViewport, canvas.clientWidth);
      const deltaYears = currentYear - drag.anchorYear;

      let newStartYear = drag.originalStartYear;
      let newEndYear = drag.originalEndYear;

      if (drag.edge === 'start') {
        newStartYear = drag.originalStartYear + deltaYears;
        if (altHeld) {
          newEndYear = drag.originalEndYear - deltaYears;
        }
        // Snap the start edge
        if (!modifierHeld) {
          const snapped = findBestSnap(yearToX(newStartYear, drag.startViewport, canvas.clientWidth));
          if (snapped !== null) {
            const snapDelta = snapped - newStartYear;
            newStartYear = snapped;
            if (altHeld) newEndYear -= snapDelta;
          }
        }
      } else {
        newEndYear = drag.originalEndYear + deltaYears;
        if (altHeld) {
          newStartYear = drag.originalStartYear - deltaYears;
        }
        // Snap the end edge
        if (!modifierHeld) {
          const snapped = findBestSnap(yearToX(newEndYear, drag.startViewport, canvas.clientWidth));
          if (snapped !== null) {
            const snapDelta = snapped - newEndYear;
            newEndYear = snapped;
            if (altHeld) newStartYear -= snapDelta;
          }
        }
      }

      if (drag.item.event.end === 'ongoing') {
        // Ongoing events: clamp start to today (no real "end" to invert against)
        const today = todayDecimalYear();
        if (newStartYear > today) newStartYear = today;
      } else if (newStartYear > newEndYear) {
        // Prevent inverted range
        if (altHeld) {
          // Alt-resize: freeze at the midpoint of the original range
          const mid = (drag.originalStartYear + drag.originalEndYear) / 2;
          newStartYear = mid;
          newEndYear = mid;
        } else if (drag.edge === 'start') {
          newStartYear = newEndYear;
        } else {
          newEndYear = newStartYear;
        }
      }

      onSketchMove?.(drag.item, newStartYear, newEndYear, true);
      scheduleRedraw();
      return;
    }

    if (drag.mode === 'panning') {
      const dx = drag.lastMouseX - e.clientX;
      drag.lastMouseX = e.clientX;

      const dist = Math.hypot(e.clientX - drag.mouseDownX, e.clientY - drag.mouseDownY);
      if (dist >= CLICK_THRESHOLD) drag.didDrag = true;

      setViewport(panViewport(getViewport(), dx, canvas.clientWidth));
      scheduleRedraw();
      return;
    }

    // Not dragging — track cursor position and update hover
    if (e.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    cursorCanvasX = e.clientX - rect.left;
    cursorCanvasY = e.clientY - rect.top;
    const cursorChanged = updateCursorLine(cursorCanvasX, cursorCanvasY);
    const prevHover = getHovered();
    updateHover();
    if (cursorChanged || getHovered() !== prevHover) {
      scheduleRedraw();
    }
  }

  function onMouseUp(e: MouseEvent) {
    modifierHeld = e.ctrlKey || e.metaKey;
    const state = drag;
    drag = { mode: 'none' };

    if (state.mode === 'none') return; // mousedown wasn't on the canvas

    if (state.mode === 'reordering') {
      stopAutoScroll();
      onReorderEnd(state.item);
      const rect = canvas.getBoundingClientRect();
      cursorCanvasX = e.clientX - rect.left;
      cursorCanvasY = e.clientY - rect.top;
      updateCursorLine(cursorCanvasX, cursorCanvasY);
      updateHover();
      canvas.style.cursor = sketchCursor(getHovered());
      scheduleRedraw();
      return;
    }

    if (state.mode === 'sketch-moving' || state.mode === 'sketch-resizing') {
      snapExcludeEvent = null;
      cachedLayout = null; // force snap cache rebuild
      onSketchEnd?.(state.item);
      const rect = canvas.getBoundingClientRect();
      cursorCanvasX = e.clientX - rect.left;
      cursorCanvasY = e.clientY - rect.top;
      updateCursorLine(cursorCanvasX, cursorCanvasY);
      updateHover();
      canvas.style.cursor = sketchCursor(getHovered());
      scheduleRedraw();
      return;
    }

    if (state.mode === 'axis-selecting') {
      if (!state.didDrag) {
        // Click on axis (not drag)
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const year = snapYear(x);
        const existing = getSelection();

        if (e.shiftKey && existing !== null) {
          // Shift-click: extend from existing anchor
          setSelection({
            start: Math.min(existing.anchor, year),
            end: Math.max(existing.anchor, year),
            anchor: existing.anchor,
          });
        } else if (e.shiftKey && (!getShowTodayLine || getShowTodayLine())) {
          // Shift-click with no selection: range from now to clicked year
          ensureSnapCaches(); // ensure cachedNowYear is set
          const now = cachedNowYear;
          setSelection({
            start: Math.min(now, year),
            end: Math.max(now, year),
            anchor: now,
          });
        } else {
          // Normal click: single point
          setSelection({ start: year, end: year, anchor: year });
        }
      }
      // If didDrag, range was already committed during mousemove
      scheduleRedraw();
    } else if (state.mode === 'undecided' || ((state.mode === 'panning' || state.mode === 'zooming') && !state.didDrag)) {
      // Click in events area (not drag)
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const layout = getLayout();
      const viewport = getViewport();
      const hit = hitTest(x, y, layout, viewport, canvas.clientWidth, getScrollY());

      // Ctrl/Cmd+click on a container toggles collapse
      if (modifierHeld && hit && hit.isContainer) {
        onCollapseToggle(hit.event);
        // Restore cursor and hover after collapse
        cursorCanvasX = x;
        cursorCanvasY = y;
        updateCursorLine(cursorCanvasX, cursorCanvasY);
        updateHover();
        canvas.style.cursor = sketchCursor(getHovered());
        scheduleRedraw();
        return;
      }

      if (hit) {
        setSelected(hit);

        // Determine selection year: point → nominal date; range → closer nominal edge
        let selYear: number | null = null;
        if (hit.isPoint) {
          selYear = hit.nominalStartYear;
        } else {
          const startX = yearToX(hit.nominalStartYear, viewport, canvas.clientWidth);
          const endX = yearToX(hit.nominalEndYear, viewport, canvas.clientWidth);
          selYear = Math.abs(x - startX) <= Math.abs(x - endX) ? hit.nominalStartYear : hit.nominalEndYear;
        }

        if (selYear !== null) {
          const detail = clickDetail(hit, selYear);
          const existing = getSelection();
          if (e.shiftKey && existing !== null) {
            selExtendOverride = detail;
            setSelection({
              start: Math.min(existing.anchor, selYear),
              end: Math.max(existing.anchor, selYear),
              anchor: existing.anchor,
            });
          } else if (e.shiftKey && (!getShowTodayLine || getShowTodayLine())) {
            ensureSnapCaches();
            const now = cachedNowYear;
            selAnchorOverride = null;
            selExtendOverride = detail;
            setSelection({
              start: Math.min(now, selYear),
              end: Math.max(now, selYear),
              anchor: now,
            });
          } else {
            selAnchorOverride = detail;
            selExtendOverride = null;
            setSelection({ start: selYear, end: selYear, anchor: selYear });
          }
        }
      } else {
        clearSelection();
      }
      scheduleRedraw();
    }

    // Restore cursor line and hover
    const rect = canvas.getBoundingClientRect();
    cursorCanvasX = e.clientX - rect.left;
    cursorCanvasY = e.clientY - rect.top;
    updateCursorLine(cursorCanvasX, cursorCanvasY);
    updateHover();
    const hovered = getHovered();
    canvas.style.cursor = sketchCursor(hovered);
    scheduleRedraw();
  }

  // --- Touch drag ---
  let lastTouchX = 0;

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      lastTouchX = e.touches[0].clientX;
      clearSelection();
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const dx = lastTouchX - e.touches[0].clientX;
    lastTouchX = e.touches[0].clientX;
    const viewport = getViewport();
    setViewport(panViewport(viewport, dx, canvas.clientWidth));
    scheduleRedraw();
  }

  function onMouseLeave() {
    if (drag.mode === 'none') {
      cursorCanvasX = -1;
      cursorCanvasY = -1;
      updateCursorLine(-1, LAYOUT.eventsStartY);
      setHovered(null);
      tooltip.hide();
      canvas.style.cursor = 'grab';
      scheduleRedraw();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && (drag.mode === 'sketch-moving' || drag.mode === 'sketch-resizing')) {
      snapExcludeEvent = null;
      cachedLayout = null;
      drag = { mode: 'none' };
      onSketchCancel?.();
      canvas.style.cursor = sketchCursor(getHovered());
      scheduleRedraw();
    }
    if (e.key === 'Escape' && drag.mode === 'reordering') {
      stopAutoScroll();
      drag = { mode: 'none' };
      onReorderCancel();
      canvas.style.cursor = 'grab';
      scheduleRedraw();
    }
    if (e.key === 'Escape' && drag.mode === 'zooming') {
      setViewport(drag.startViewport);
      drag = { mode: 'none' };
      canvas.style.cursor = sketchCursor(getHovered());
      scheduleRedraw();
    }
    if (e.key === 'Escape' && drag.mode === 'undecided') {
      drag = { mode: 'none' };
      canvas.style.cursor = sketchCursor(getHovered());
      scheduleRedraw();
    }
  }

  function onCanvasContextMenu(e: MouseEvent) {
    if (!onContextMenu) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < LAYOUT.eventsStartY) return; // axis area — use default
    const hit = hitTest(x, y, getLayout(), getViewport(), canvas.clientWidth, getScrollY());
    if (hit) {
      e.preventDefault();
      onContextMenu(hit.event, e.clientX, e.clientY);
    }
  }

  // Attach listeners
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('contextmenu', onCanvasContextMenu);

  canvas.style.cursor = 'grab';

  return {
    destroy() {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('contextmenu', onCanvasContextMenu);
      tooltip.hide();
    },
    getSelectionOverrides() {
      return { anchor: selAnchorOverride, extend: selExtendOverride };
    },
    restoreSelectionOverrides(anchor: SnapDetail | null, extend: SnapDetail | null) {
      selAnchorOverride = anchor;
      selExtendOverride = extend;
      updateSnapHighlights();
    },
  };
}
