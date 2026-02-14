import { Viewport, panViewport, zoomViewport, xToYear, yearToX } from './viewport';
import { LayoutItem } from './layout';
import { TimelineSelection } from '../types';
import { hitTest } from './hitTest';
import { Tooltip } from '../ui/tooltip';
import { LAYOUT, chooseTickInterval } from './renderer';
import { collectSnapTargets, findSnapYear, getSnapDetail, SnapDetail, SnapState } from './snap';
import { todayDecimalYear, todayIsoDate, formatDate } from '../data/time';

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
  setSelected: (item: LayoutItem | null) => void,
  setCursorX: (x: number) => void,
  getSelection: () => TimelineSelection | null,
  setSelection: (sel: TimelineSelection | null) => void,
  setSnapState: (state: SnapState) => void,
  requestRedraw: () => void,
): InputHandlers {
  const tooltip = new Tooltip();

  tooltip.onClick = () => {
    tooltip.hide();
    setSelected(null);
    scheduleRedraw();
  };

  function clearSelection() {
    tooltip.hide();
    setSelected(null);
    setSelection(null);
  }

  // --- Snapping ---
  let modifierHeld = false;
  let cachedLayout: LayoutItem[] | null = null;
  let eventSnapTargets: number[] = [];
  let snapTargetsCache: number[] = [];

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
      eventSnapTargets = collectSnapTargets(layout);
      eventSnapTargets.push(cachedNowYear);
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
      selStartDetail = snapDetailFor(sel.start, layout);
      if (selStartDetail !== null) {
        years.add(sel.start);
      }
      if (sel.start !== sel.end) {
        selEndDetail = snapDetailFor(sel.end, layout);
        if (selEndDetail !== null) {
          years.add(sel.end);
        }
      }
    }
    setSnapState({ highlightYears: years, cursorDetail, selStartDetail, selEndDetail });
  }

  function scheduleRedraw() {
    updateSnapHighlights();
    requestRedraw();
  }

  // --- Wheel / trackpad ---
  function updateHover() {
    if (cursorCanvasX < 0) return;
    const layout = getLayout();
    const viewport = getViewport();
    const hit = hitTest(cursorCanvasX, cursorCanvasY, layout, viewport, canvas.clientWidth);
    const prev = getHovered();
    if (hit !== prev) {
      setHovered(hit);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      if (!tooltip.isLocked) {
        if (hit) {
          const rect = canvas.getBoundingClientRect();
          tooltip.show(hit.event, rect.left + cursorCanvasX, rect.top + cursorCanvasY);
        } else {
          tooltip.hide();
        }
      }
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    modifierHeld = e.ctrlKey || e.metaKey;
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

    updateCursorLine(cursorCanvasX, cursorCanvasY);
    updateHover();
    scheduleRedraw();
  }

  // --- Mouse drag + click ---
  let dragMode: 'none' | 'panning' | 'axis-selecting' = 'none';
  let mouseDownX = 0;
  let mouseDownY = 0;
  let lastMouseX = 0;
  let didDrag = false;
  let axisAnchorYear = 0;

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

    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    lastMouseX = e.clientX;
    didDrag = false;

    cursorSnapYear = null;

    if (y < LAYOUT.eventsStartY) {
      // Axis region — start selection mode
      dragMode = 'axis-selecting';
      axisAnchorYear = snapYear(x);
      canvas.style.cursor = 'col-resize';
    } else {
      // Events region — start panning
      dragMode = 'panning';
      updateCursorLine(-1, LAYOUT.eventsStartY);
      canvas.style.cursor = 'grabbing';
    }
  }

  function onMouseMove(e: MouseEvent) {
    modifierHeld = e.ctrlKey || e.metaKey;

    if (dragMode === 'axis-selecting') {
      const dist = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY);
      if (dist >= CLICK_THRESHOLD) {
        didDrag = true;
      }
      if (didDrag) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const currentYear = snapYear(x);
        setSelection({
          start: Math.min(axisAnchorYear, currentYear),
          end: Math.max(axisAnchorYear, currentYear),
          anchor: axisAnchorYear,
        });
        scheduleRedraw();
      }
      return;
    }

    if (dragMode === 'panning') {
      const dx = lastMouseX - e.clientX;
      lastMouseX = e.clientX;

      const dist = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY);
      if (dist >= CLICK_THRESHOLD) {
        didDrag = true;
      }

      const viewport = getViewport();
      setViewport(panViewport(viewport, dx, canvas.clientWidth));
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
    const mode = dragMode;
    dragMode = 'none';

    if (mode === 'axis-selecting') {
      if (!didDrag) {
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
        } else if (e.shiftKey) {
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
    } else if (mode === 'panning' && !didDrag) {
      // Click in events area (not drag)
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const layout = getLayout();
      const viewport = getViewport();
      const hit = hitTest(x, y, layout, viewport, canvas.clientWidth);

      if (hit) {
        tooltip.show(hit.event, e.clientX, e.clientY);
        tooltip.lock();
        setSelected(hit);

        // Determine selection year: always for points, shift-only for ranges
        let selYear: number | null = null;
        if (hit.isPoint) {
          selYear = hit.startYear;
        } else if (e.shiftKey) {
          const startX = yearToX(hit.startYear, viewport, canvas.clientWidth);
          const endX = yearToX(hit.endYear, viewport, canvas.clientWidth);
          selYear = Math.abs(x - startX) <= Math.abs(x - endX) ? hit.startYear : hit.endYear;
        }

        if (selYear !== null) {
          const existing = getSelection();
          if (e.shiftKey && existing !== null) {
            setSelection({
              start: Math.min(existing.anchor, selYear),
              end: Math.max(existing.anchor, selYear),
              anchor: existing.anchor,
            });
          } else if (e.shiftKey) {
            ensureSnapCaches();
            const now = cachedNowYear;
            setSelection({
              start: Math.min(now, selYear),
              end: Math.max(now, selYear),
              anchor: now,
            });
          } else {
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
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
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
    if (dragMode === 'none') {
      cursorCanvasX = -1;
      cursorCanvasY = -1;
      updateCursorLine(-1, LAYOUT.eventsStartY);
      setHovered(null);
      if (!tooltip.isLocked) {
        tooltip.hide();
      }
      canvas.style.cursor = 'grab';
      scheduleRedraw();
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
      tooltip.hide();
    },
  };
}
