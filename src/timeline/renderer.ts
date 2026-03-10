import { TimelineEvent, TimelineSelection } from "../types";
import { Viewport, yearToX, xToYear } from "./viewport";
import {
  dateToDecimalYear,
  decimalYearToIso,
  formatAxisLabel,
  formatDate,
  formatDecimalYearDelta,
  hasFullDate,
  formatPreciseDuration,
  todayDecimalYear,
  todayIsoDate,
  MONTH_NAMES,
  daysInYear,
  monthStartDay,
  decYearToAbsDay,
  absDayToDecYear,
} from "../data/time";
import { LayoutItem } from "./layout";
import { SnapDetail, SnapState } from "./snap";
import { getEventColor } from "../colorPalette";

export interface LayoutTransition {
  fadingOut: LayoutItem[];
  yOffsets: Map<TimelineEvent, number>;
  fadingIn: Set<TimelineEvent>;
  progress: number; // 0–1, already eased
}

export interface ReorderState {
  draggedEvent: TimelineEvent;
  ghostY: number;
}

export interface CanvasColors {
  background: string;
  axis: string;
  axisText: string;
  containerFill: string;
  containerBorder: string;
  containerText: string;
  containerHoverFill: string;
  containerHoverBorder: string;
  containerSnapFill: string;
  containerSnapBorder: string;
  containerSelectedFill: string;
  containerSelectedBorder: string;
  barFill: string;
  barBorder: string;
  barText: string;
  barHoverFill: string;
  barHoverBorder: string;
  barSnapFill: string;
  barSnapBorder: string;
  barSelectedFill: string;
  barSelectedBorder: string;
  todayLine: string;
  todayText: string;
  cursorLine: string;
  cursorText: string;
  selectionLine: string;
  selectionText: string;
  selectionFill: string;
}

// Placeholder defaults — overwritten by applyTheme() at startup
let colors: CanvasColors = {
  background: '', axis: '', axisText: '',
  containerFill: '', containerBorder: '', containerText: '',
  containerHoverFill: '', containerHoverBorder: '',
  containerSnapFill: '', containerSnapBorder: '',
  containerSelectedFill: '', containerSelectedBorder: '',
  barFill: '', barBorder: '', barText: '',
  barHoverFill: '', barHoverBorder: '',
  barSnapFill: '', barSnapBorder: '',
  barSelectedFill: '', barSelectedBorder: '',
  todayLine: '', todayText: '',
  cursorLine: '', cursorText: '',
  selectionLine: '', selectionText: '', selectionFill: '',
};

export function setCanvasColors(newColors: CanvasColors) {
  colors = newColors;
}

const LAYOUT = {
  paddingX: 0,
  axisY: 80,
  tickHeight: 8,
  eventsStartY: 110,
  barRadius: 4,
  containerRadius: 6,
  fontSize: 13,
  smallFontSize: 11,
};

export { LAYOUT };

/**
 * Compute the full time range of all events (including nested).
 * Returns a Viewport spanning the entire dataset with a small margin.
 */
export function computeFullRange(events: TimelineEvent[]): Viewport {
  let min = Infinity;
  let max = -Infinity;

  function walk(list: TimelineEvent[]) {
    for (const e of list) {
      const s = dateToDecimalYear(e.start);
      const end = dateToDecimalYear(e.end ?? e.start);
      const outerStart = e.startApprox ? dateToDecimalYear(e.startApprox[0]) : s;
      const outerEnd = e.endApprox ? dateToDecimalYear(e.endApprox[1]) : end;
      if (outerStart < min) min = outerStart;
      if (outerEnd > max) max = outerEnd;
      if (s === end && !e.startApprox) {
        if (s - 1 < min) min = s - 1;
        if (end + 1 > max) max = end + 1;
      }
      if (e.nested) walk(e.nested);
    }
  }

  walk(events);

  // Empty events: show a sensible default range around the current year
  if (min === Infinity || max === -Infinity) {
    const now = new Date().getFullYear();
    return { start: now - 50, end: now + 10 };
  }

  const span = max - min;
  min -= span * 0.02;
  max += span * 0.02;
  return { start: min, end: max };
}

export function chooseTickInterval(
  viewport: Viewport,
  canvasWidth: number,
): number {
  const span = viewport.end - viewport.start;
  const drawWidth = canvasWidth - LAYOUT.paddingX * 2;
  const minPixelsPerTick = 80;
  const maxTicks = drawWidth / minPixelsPerTick;
  const rawInterval = span / maxTicks;

  const niceIntervals = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const interval of niceIntervals) {
    if (interval >= rawInterval) return interval;
  }
  return Math.ceil(rawInterval / 1000) * 1000;
}

/** Convert a color string to rgba with a given alpha multiplier. */
function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    const baseAlpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${baseAlpha * alpha})`;
  }
  return color;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  radiusRight?: number,
) {
  const rl = Math.min(radius, width / 2, height / 2);
  const rr = Math.min(radiusRight ?? radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + rl, y);
  ctx.lineTo(x + width - rr, y);
  ctx.arcTo(x + width, y, x + width, y + rr, rr);
  ctx.lineTo(x + width, y + height - rr);
  ctx.arcTo(x + width, y + height, x + width - rr, y + height, rr);
  ctx.lineTo(x + rl, y + height);
  ctx.arcTo(x, y + height, x, y + height - rl, rl);
  ctx.lineTo(x, y + rl);
  ctx.arcTo(x, y, x + rl, y, rl);
  ctx.closePath();
}

function drawMonthGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  weekBandsVisible: boolean,
) {
  const firstYear = Math.floor(viewport.start);
  const lastYear = Math.ceil(viewport.end);

  ctx.lineWidth = 1;

  const labelY = LAYOUT.axisY + LAYOUT.tickHeight / 2 + 4;

  for (let year = firstYear; year <= lastYear; year++) {
    const totalDays = daysInYear(year);
    for (let month = 0; month < 12; month++) {
      const decYear = year + monthStartDay(year, month + 1) / totalDays;
      const nextMonth = month + 1;
      const nextDecYear = nextMonth < 12
        ? year + monthStartDay(year, nextMonth + 1) / totalDays
        : year + 1;
      const x = yearToX(decYear, viewport, canvasWidth);
      const nextX = yearToX(nextDecYear, viewport, canvasWidth);

      // Vertical grid line at month boundary
      if (decYear >= viewport.start && decYear <= viewport.end) {
        ctx.strokeStyle = colorWithAlpha(colors.axisText, weekBandsVisible ? 0.3 : 0.15);
        ctx.beginPath();
        if (month === 0) {
          // Year boundary: start below the year label
          ctx.moveTo(x, labelY + LAYOUT.smallFontSize + 2);
        } else {
          ctx.moveTo(x, LAYOUT.axisY);
        }
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }

      // Month label centered between this boundary and the next
      const labelX = (x + nextX) / 2;
      if (labelX >= 0 && labelX <= canvasWidth) {
        ctx.fillStyle = colorWithAlpha(colors.axisText, 0.5);
        ctx.font = `${LAYOUT.smallFontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(MONTH_NAMES[month], labelX, labelY);
      }
    }
  }
}

function drawWeekBands(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
) {
  // Convert viewport edges to absolute days from epoch (Jan 1 2024 = Monday)
  const startDay = decYearToAbsDay(viewport.start);
  const endDay = decYearToAbsDay(viewport.end);

  // Find the first Monday-aligned week boundary at or before startDay
  // Epoch day 0 is a Monday, so align to multiples of 7
  const firstWeekDay = Math.floor(startDay / 7) * 7;
  let weekIndex = Math.floor(startDay / 7);

  const top = LAYOUT.axisY;
  ctx.fillStyle = colorWithAlpha(colors.axisText, 0.05);

  let dayPos = firstWeekDay;
  while (dayPos < endDay) {
    const nextDayPos = dayPos + 7;

    if (weekIndex % 2 !== 0) {
      const x1 = Math.max(0, yearToX(absDayToDecYear(dayPos), viewport, canvasWidth));
      const x2 = Math.min(canvasWidth, yearToX(absDayToDecYear(nextDayPos), viewport, canvasWidth));
      if (x2 > x1) {
        ctx.fillRect(x1, top, x2 - x1, canvasHeight - top);
      }
    }

    dayPos = nextDayPos;
    weekIndex++;
  }
}

function drawAxis(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
) {
  const y = LAYOUT.axisY;
  const x1 = LAYOUT.paddingX;
  const x2 = canvasWidth - LAYOUT.paddingX;

  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();

  const interval = chooseTickInterval(viewport, canvasWidth);
  const firstTick = Math.ceil(viewport.start / interval) * interval;
  const spanYears = viewport.end - viewport.start;

  // Draw month grid lines and labels when zoomed to individual years
  if (interval === 1) {
    const pxPerMonth = canvasWidth / (spanYears * 12);
    const pxPerWeek = canvasWidth / (spanYears * (365 / 7));
    const weekBandsVisible = pxPerWeek >= 30;
    if (weekBandsVisible) {
      drawWeekBands(ctx, viewport, canvasWidth, canvasHeight);
    }
    if (pxPerMonth >= 50) {
      drawMonthGrid(ctx, viewport, canvasWidth, canvasHeight, weekBandsVisible);
    }
  }

  ctx.strokeStyle = colors.axis;
  ctx.fillStyle = colors.axisText;
  ctx.font = `${LAYOUT.smallFontSize}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (let year = firstTick; year <= viewport.end; year += interval) {
    const x = yearToX(year, viewport, canvasWidth);
    ctx.beginPath();
    ctx.moveTo(x, y - LAYOUT.tickHeight / 2);
    ctx.lineTo(x, y + LAYOUT.tickHeight / 2);
    ctx.stroke();
    ctx.fillText(
      formatAxisLabel(year, spanYears),
      x,
      y + LAYOUT.tickHeight / 2 + 4,
    );
  }
}

function drawTodayLine(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
) {
  const today = todayDecimalYear();
  if (today < viewport.start || today > viewport.end) return;

  const spanYears = viewport.end - viewport.start;
  const pxPerWeek = canvasWidth / (spanYears * (365 / 7));
  const weekBandsVisible = pxPerWeek >= 30;

  const x = yearToX(today, viewport, canvasWidth);
  const top = LAYOUT.axisY - LAYOUT.tickHeight;

  let labelX: number;

  if (weekBandsVisible) {
    // Full-day-width highlight when zoomed in enough to see weeks
    const absDay = Math.floor(decYearToAbsDay(today));
    const dayStart = yearToX(absDayToDecYear(absDay), viewport, canvasWidth);
    const dayEnd = yearToX(absDayToDecYear(absDay + 1), viewport, canvasWidth);
    ctx.fillStyle = colorWithAlpha(colors.todayLine, 0.3);
    ctx.fillRect(dayStart, top, dayEnd - dayStart, canvasHeight - top);
    labelX = (dayStart + dayEnd) / 2;
  } else {
    // Thin vertical line at normal zoom levels
    ctx.strokeStyle = colors.todayLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
    labelX = x;
  }

  // Date label above axis
  ctx.fillStyle = colors.todayText;
  ctx.font = `${LAYOUT.smallFontSize}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    formatDate(todayIsoDate()),
    labelX,
    LAYOUT.axisY - LAYOUT.tickHeight - 4,
  );
}

/** Format a "X ago" / "in X" string, using day-precise calendar math when the detail has a full date. */
function formatRelativeToNow(year: number, detail: SnapDetail | null, span: number): string {
  const today = todayDecimalYear();
  const delta = today - year;
  if (detail && hasFullDate(detail.isoDate)) {
    const todayIso = todayIsoDate();
    const dur = delta >= 0
      ? formatPreciseDuration(detail.isoDate, todayIso)
      : formatPreciseDuration(todayIso, detail.isoDate);
    return delta > 0 ? `${dur} ago` : delta < 0 ? `in ${dur}` : 'today';
  }
  const mag = formatDecimalYearDelta(delta, span);
  return delta > 0 ? `${mag} ago` : `in ${mag}`;
}

function drawCursorLine(
  ctx: CanvasRenderingContext2D,
  cursorX: number,
  selection: TimelineSelection | null,
  cursorDetail: SnapDetail | null,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  showTodayLine: boolean,
) {
  if (cursorX < 0) return;

  const year = xToYear(cursorX, viewport, canvasWidth);

  // Vertical line
  ctx.strokeStyle = colors.cursorLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cursorX, LAYOUT.axisY - LAYOUT.tickHeight);
  ctx.lineTo(cursorX, canvasHeight);
  ctx.stroke();

  // Build label lines (top to bottom)
  const isRange = selection !== null && selection.start !== selection.end;
  const isSinglePoint = selection !== null && selection.start === selection.end;
  const lines: { text: string; color: string }[] = [];

  if (cursorDetail && cursorDetail.label !== cursorDetail.date) {
    lines.push({ text: cursorDetail.label, color: colors.cursorText });
  }

  const dateStr = cursorDetail
    ? cursorDetail.date
    : formatDate(decimalYearToIso(year));
  lines.push({ text: dateStr, color: colors.cursorText });

  if (!isRange) {
    const span = viewport.end - viewport.start;
    if (showTodayLine) {
      const nowLabel = formatRelativeToNow(year, cursorDetail, span);
      lines.push({ text: nowLabel, color: colors.cursorText });
    }

    if (isSinglePoint) {
      const deltaSel = year - selection!.start;
      const selMag = formatDecimalYearDelta(deltaSel, span);
      const selLabel = deltaSel >= 0 ? `+${selMag}` : `-${selMag}`;
      lines.push({ text: selLabel, color: colors.selectionText });
    }
  }

  // Render lines bottom-up from axis
  ctx.font = `${LAYOUT.smallFontSize}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const lineHeight = 14;
  const baseY = LAYOUT.axisY - LAYOUT.tickHeight - 4;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = lines[i].color;
    ctx.fillText(
      lines[i].text,
      cursorX,
      baseY - (lines.length - 1 - i) * lineHeight,
    );
  }
}

function drawSelectionBackground(
  ctx: CanvasRenderingContext2D,
  selection: TimelineSelection | null,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (selection === null || selection.start === selection.end) return;
  if (selection.end < viewport.start || selection.start > viewport.end) return;

  const x1 = yearToX(
    Math.max(selection.start, viewport.start),
    viewport,
    canvasWidth,
  );
  const x2 = yearToX(
    Math.min(selection.end, viewport.end),
    viewport,
    canvasWidth,
  );
  const top = LAYOUT.axisY - LAYOUT.tickHeight;

  ctx.fillStyle = colors.selectionFill;
  ctx.fillRect(x1, top, x2 - x1, canvasHeight - top);
}

function drawSelectionLine(
  ctx: CanvasRenderingContext2D,
  year: number,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (year < viewport.start || year > viewport.end) return;
  const x = yearToX(year, viewport, canvasWidth);

  ctx.strokeStyle = colors.selectionLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, LAYOUT.axisY - LAYOUT.tickHeight);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();
}

function drawSelectionForeground(
  ctx: CanvasRenderingContext2D,
  selection: TimelineSelection | null,
  selStartDetail: SnapDetail | null,
  selEndDetail: SnapDetail | null,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  showTodayLine: boolean,
) {
  if (selection === null) return;

  ctx.fillStyle = colors.selectionText;
  ctx.font = `${LAYOUT.smallFontSize}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const lineHeight = 14;
  const baseY = LAYOUT.axisY - LAYOUT.tickHeight - 4;

  if (selection.start === selection.end) {
    // Single point: one line + labels
    drawSelectionLine(
      ctx,
      selection.start,
      viewport,
      canvasWidth,
      canvasHeight,
    );

    if (selection.start >= viewport.start && selection.start <= viewport.end) {
      const x = yearToX(selection.start, viewport, canvasWidth);
      const dateStr = selStartDetail
        ? selStartDetail.date
        : formatDate(decimalYearToIso(selection.start));
      const span = viewport.end - viewport.start;
      const agoLabel = formatRelativeToNow(selection.start, selStartDetail, span);

      const selLines: string[] = [];
      if (selStartDetail && selStartDetail.label !== selStartDetail.date) {
        selLines.push(selStartDetail.label);
      }
      selLines.push(dateStr);
      if (showTodayLine) {
        selLines.push(agoLabel);
      }

      for (let i = 0; i < selLines.length; i++) {
        ctx.fillText(selLines[i], x, baseY - (selLines.length - 1 - i) * lineHeight);
      }
    }
  } else {
    // Range: two lines + centered label
    drawSelectionLine(
      ctx,
      selection.start,
      viewport,
      canvasWidth,
      canvasHeight,
    );
    drawSelectionLine(ctx, selection.end, viewport, canvasWidth, canvasHeight);

    const x1 = yearToX(selection.start, viewport, canvasWidth);
    const x2 = yearToX(selection.end, viewport, canvasWidth);
    const centerX = (x1 + x2) / 2;

    // Build label lines bottom-up
    const lines: string[] = [];

    // Event labels line: show when at least one end is a named event (label differs from date)
    const startIsNamed = selStartDetail != null && selStartDetail.label !== selStartDetail.date;
    const endIsNamed = selEndDetail != null && selEndDetail.label !== selEndDetail.date;
    if (startIsNamed || endIsNamed) {
      const startLabel = startIsNamed ? selStartDetail!.label : (selStartDetail?.date ?? formatDate(decimalYearToIso(selection.start)));
      const endLabel = endIsNamed ? selEndDetail!.label : (selEndDetail?.date ?? formatDate(decimalYearToIso(selection.end)));
      lines.push(`${startLabel} — ${endLabel}`);
    }

    // Date + duration line
    const startDate = selStartDetail
      ? selStartDetail.date
      : formatDate(decimalYearToIso(selection.start));
    const endDate = selEndDetail
      ? selEndDetail.date
      : formatDate(decimalYearToIso(selection.end));

    // Use precise duration when both endpoints have full ISO dates
    let duration: string;
    if (
      selStartDetail &&
      selEndDetail &&
      hasFullDate(selStartDetail.isoDate) &&
      hasFullDate(selEndDetail.isoDate)
    ) {
      duration = formatPreciseDuration(
        selStartDetail.isoDate,
        selEndDetail.isoDate,
      );
    } else {
      const span = viewport.end - viewport.start;
      duration = formatDecimalYearDelta(selection.end - selection.start, span);
    }

    lines.push(`${startDate} — ${endDate} (${duration})`);

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(
        lines[i],
        centerX,
        baseY - (lines.length - 1 - i) * lineHeight,
      );
    }
  }
}

function isVisible(
  startYear: number,
  endYear: number,
  viewport: Viewport,
): boolean {
  return endYear >= viewport.start && startYear <= viewport.end;
}

function drawContainer(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
  hoveredItem: LayoutItem | null,
  selectedItem: LayoutItem | null,
  snapHighlightYears: Set<number>,
  transition?: LayoutTransition,
) {
  const x1 = yearToX(item.startYear, viewport, canvasWidth);
  const x2 = yearToX(item.endYear, viewport, canvasWidth);
  const boxWidth = Math.max(x2 - x1, 3);
  const isSelected = selectedItem === item;
  const isHovered = !isSelected && hoveredItem === item;
  const isSnap =
    !isSelected &&
    !isHovered &&
    (snapHighlightYears.has(item.nominalStartYear) ||
      snapHighlightYears.has(item.nominalEndYear));

  // Container background — use custom color if set
  const eventColor = getEventColor(item.event.color);
  const custom = eventColor ? deriveContainerColors(eventColor.hex) : null;

  const fillColor = isSelected
    ? colors.containerSelectedFill
    : isHovered
      ? (custom?.hoverFill ?? colors.containerHoverFill)
      : isSnap
        ? (custom?.snapFill ?? colors.containerSnapFill)
        : (custom?.fill ?? colors.containerFill);
  const strokeColor = isSelected
    ? colors.containerSelectedBorder
    : isHovered
      ? (custom?.hoverBorder ?? colors.containerHoverBorder)
      : isSnap
        ? (custom?.snapBorder ?? colors.containerSnapBorder)
        : (custom?.border ?? colors.containerBorder);
  const lineWidth = isSelected || isHovered ? 2 : 1;

  // When both uncertainty gradient and child overflow exist on the same side,
  // extend the bar to cover both so applyGradient draws one smooth fade
  const combinedLeft = item.approxStartRange !== undefined && item.overflowStart !== undefined;
  const combinedRight = item.approxEndRange !== undefined && item.overflowEnd !== undefined;

  let drawLeft = x1;
  let drawRight = x1 + boxWidth;
  if (combinedLeft) drawLeft = yearToX(item.overflowStart!, viewport, canvasWidth);
  if (combinedRight) drawRight = yearToX(item.overflowEnd!, viewport, canvasWidth);
  const drawWidth = Math.max(drawRight - drawLeft, 3);

  applyGradient(ctx, item, viewport, canvasWidth, drawLeft, drawWidth, fillColor, strokeColor, lineWidth);

  // Draw overflow shadows for children extending beyond container
  // (skip sides already covered by the extended gradient above)
  if (!item.isCollapsed) {
    drawOverflowShadow(ctx, item, viewport, canvasWidth, fillColor, combinedLeft, combinedRight);
  }

  if (item.isCollapsed) {
    // Collapsed: small font, vertically centered label, no children
    ctx.fillStyle = colors.containerText;
    ctx.font = `${LAYOUT.smallFontSize}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    const labelY = item.y + item.height / 2;
    let labelX = x1 + 6;
    if (item.approxStartRange) {
      const nominalX = yearToX(item.nominalStartYear, viewport, canvasWidth);
      const tw = ctx.measureText(item.event.name).width;
      labelX = Math.max(x1 + 6, Math.min(nominalX + 6, x1 + boxWidth - tw - 6));
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, item.y, boxWidth, item.height);
    ctx.clip();
    ctx.fillText(item.event.name, labelX, labelY);
    ctx.restore();
  } else {
    // Container label at top
    ctx.fillStyle = colors.containerText;
    ctx.font = `${LAYOUT.fontSize}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    const labelY = item.y + 12;
    let labelX = x1 + 8;
    if (item.approxStartRange) {
      const nominalX = yearToX(item.nominalStartYear, viewport, canvasWidth);
      const tw = ctx.measureText(item.event.name).width;
      labelX = Math.max(x1 + 8, Math.min(nominalX + 8, x1 + boxWidth - tw - 8));
    }
    ctx.save();
    ctx.beginPath();
    const clipLeft = item.overflowStart !== undefined
      ? yearToX(item.overflowStart, viewport, canvasWidth) : x1;
    const clipRight = item.overflowEnd !== undefined
      ? yearToX(item.overflowEnd, viewport, canvasWidth) : x1 + boxWidth;
    ctx.rect(clipLeft, item.y, clipRight - clipLeft, item.height);
    ctx.clip();
    ctx.fillText(item.event.name, labelX, labelY);
    ctx.restore();

    // Draw children in two passes: non-point first, then point events on top
    for (const child of item.children) {
      if (!child.isPoint) drawLayoutItem(ctx, child, viewport, canvasWidth, hoveredItem, selectedItem, snapHighlightYears, transition);
    }
    for (const child of item.children) {
      if (child.isPoint) drawLayoutItem(ctx, child, viewport, canvasWidth, hoveredItem, selectedItem, snapHighlightYears, transition);
    }
  }
}

/** Parse an rgba/rgb/hex color into [r, g, b, a] components. */
function parseColor(color: string): [number, number, number, number] {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return [r, g, b, 1];
  }
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return [
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
      match[4] !== undefined ? parseFloat(match[4]) : 1,
    ];
  }
  return [0, 0, 0, 0];
}

/** Blend a hex color toward white by amount (0–1). */
function lighten(hex: string, amount: number): string {
  const [r, g, b] = parseColor(hex);
  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

/** Blend a hex color toward black by amount (0–1). */
function darken(hex: string, amount: number): string {
  const [r, g, b] = parseColor(hex);
  const nr = Math.round(r * (1 - amount));
  const ng = Math.round(g * (1 - amount));
  const nb = Math.round(b * (1 - amount));
  return `rgb(${nr}, ${ng}, ${nb})`;
}

/** Return a light or dark text color based on the perceived luminance of a background. */
function textColorForBg(hex: string): string {
  const [r, g, b] = parseColor(hex);
  // Relative luminance (sRGB)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? '#1a1a1a' : '#f0f0f0';
}

interface DerivedColors {
  fill: string;
  border: string;
  hoverFill: string;
  hoverBorder: string;
  snapFill: string;
  snapBorder: string;
  text: string;
}

function deriveBarColors(hex: string): DerivedColors {
  return {
    fill: hex,
    border: darken(hex, 0.20),
    hoverFill: lighten(hex, 0.12),
    hoverBorder: darken(hex, 0.10),
    snapFill: lighten(hex, 0.06),
    snapBorder: darken(hex, 0.15),
    text: textColorForBg(hex),
  };
}

function deriveContainerColors(hex: string): DerivedColors {
  return {
    fill: colorWithAlpha(hex, 0.20),
    border: hex,
    hoverFill: colorWithAlpha(hex, 0.35),
    hoverBorder: lighten(hex, 0.20),
    snapFill: colorWithAlpha(hex, 0.25),
    snapBorder: lighten(hex, 0.10),
    text: colors.containerText, // background shows through
  };
}

function drawOverflowShadow(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
  fillColor: string,
  skipLeft?: boolean,
  skipRight?: boolean,
) {
  if (item.overflowStart === undefined && item.overflowEnd === undefined) return;

  const [r, g, b, a] = parseColor(fillColor);
  const peakAlpha = Math.max(a * 0.8, 0.18);
  const edgeAlpha = peakAlpha * 0.35;
  const radius = LAYOUT.containerRadius;

  // Left overflow shadow
  if (item.overflowStart !== undefined && !skipLeft) {
    const shadowLeft = yearToX(item.overflowStart, viewport, canvasWidth);
    const shadowRight = yearToX(item.startYear, viewport, canvasWidth);
    const w = shadowRight - shadowLeft;
    if (w > 1) {
      const grad = ctx.createLinearGradient(shadowLeft, 0, shadowRight, 0);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${edgeAlpha})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${peakAlpha})`);
      ctx.fillStyle = grad;
      drawRoundedRect(ctx, shadowLeft, item.y, w, item.height, radius, 0);
      ctx.fill();
    }
  }

  // Right overflow shadow
  if (item.overflowEnd !== undefined && !skipRight) {
    const shadowLeft = yearToX(item.endYear, viewport, canvasWidth);
    const shadowRight = yearToX(item.overflowEnd, viewport, canvasWidth);
    const w = shadowRight - shadowLeft;
    if (w > 1) {
      const grad = ctx.createLinearGradient(shadowLeft, 0, shadowRight, 0);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${peakAlpha})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${edgeAlpha})`);
      ctx.fillStyle = grad;
      drawRoundedRect(ctx, shadowLeft, item.y, w, item.height, 0, radius);
      ctx.fill();
    }
  }
}

function applyGradient(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
  x1: number,
  barWidth: number,
  fillColor: string,
  strokeColor: string,
  lineWidth: number,
) {
  const hasApprox = item.approxStartRange !== undefined || item.approxEndRange !== undefined;
  const baseRadius = item.isContainer ? LAYOUT.containerRadius : LAYOUT.barRadius;

  drawRoundedRect(ctx, x1, item.y, barWidth, item.height,
    item.approxStartRange ? 0 : baseRadius,
    item.approxEndRange ? 0 : baseRadius);

  if (!hasApprox) {
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    return;
  }

  // Compute normalized gradient stop positions
  let solidStart = 0;
  let solidEnd = 1;

  if (item.approxStartRange) {
    const innerX = yearToX(item.approxStartRange[1], viewport, canvasWidth);
    solidStart = Math.max(0, Math.min(1, (innerX - x1) / barWidth));
  }
  if (item.approxEndRange) {
    const innerX = yearToX(item.approxEndRange[0], viewport, canvasWidth);
    solidEnd = Math.max(0, Math.min(1, (innerX - x1) / barWidth));
  }

  // If uncertainty overlaps (wider than bar), collapse to peak at midpoint
  if (solidStart > solidEnd) {
    const mid = (solidStart + solidEnd) / 2;
    solidStart = mid;
    solidEnd = mid;
  }

  // Fill gradient
  const fillGrad = ctx.createLinearGradient(x1, 0, x1 + barWidth, 0);
  fillGrad.addColorStop(0, colorWithAlpha(fillColor, 0));
  fillGrad.addColorStop(solidStart, fillColor);
  fillGrad.addColorStop(solidEnd, fillColor);
  fillGrad.addColorStop(1, colorWithAlpha(fillColor, 0));
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Stroke: clip to solid region so borders don't appear in fade zones
  ctx.save();
  const clipLeft = x1 + solidStart * barWidth;
  const clipRight = x1 + solidEnd * barWidth;
  ctx.beginPath();
  ctx.rect(clipLeft, item.y - lineWidth, clipRight - clipLeft, item.height + lineWidth * 2);
  ctx.clip();

  drawRoundedRect(ctx, x1, item.y, barWidth, item.height,
    item.approxStartRange ? 0 : baseRadius,
    item.approxEndRange ? 0 : baseRadius);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
  isHovered: boolean,
  isSelected: boolean,
  isSnap: boolean,
) {
  const x1 = yearToX(item.startYear, viewport, canvasWidth);
  const x2 = yearToX(item.endYear, viewport, canvasWidth);
  const barWidth = Math.max(x2 - x1, 3);

  const eventColor = getEventColor(item.event.color);
  const custom = eventColor ? deriveBarColors(eventColor.hex) : null;

  const fillColor = isSelected
    ? colors.barSelectedFill
    : isHovered
      ? (custom?.hoverFill ?? colors.barHoverFill)
      : isSnap
        ? (custom?.snapFill ?? colors.barSnapFill)
        : (custom?.fill ?? colors.barFill);
  const strokeColor = isSelected
    ? colors.barSelectedBorder
    : isHovered
      ? (custom?.hoverBorder ?? colors.barHoverBorder)
      : isSnap
        ? (custom?.snapBorder ?? colors.barSnapBorder)
        : (custom?.border ?? colors.barBorder);
  const lineWidth = isSelected || isHovered ? 2 : 1;
  const textColor = isSelected ? colors.barText : (custom?.text ?? colors.barText);

  applyGradient(ctx, item, viewport, canvasWidth, x1, barWidth, fillColor, strokeColor, lineWidth);

  // Label — only render when bar is wide enough to show text
  if (barWidth > 10) {
    ctx.fillStyle = textColor;
    ctx.font = `${LAYOUT.smallFontSize}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // Diamond marker for point events with uncertainty (drawn before label so label renders on top)
    const hasDiamond = item.event.end === undefined && item.approxStartRange;
    if (hasDiamond) {
      const nx = yearToX(item.nominalStartYear, viewport, canvasWidth);
      const cy = item.y + item.height / 2;
      const r = 3;
      ctx.beginPath();
      ctx.moveTo(nx, cy - r);
      ctx.lineTo(nx + r, cy);
      ctx.lineTo(nx, cy + r);
      ctx.lineTo(nx - r, cy);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    let labelX = x1 + 6;
    if (item.approxStartRange) {
      const nominalX = yearToX(item.nominalStartYear, viewport, canvasWidth);
      // Offset past diamond marker for point events
      const offset = hasDiamond ? 10 : 6;
      const tw = ctx.measureText(item.event.name).width;
      labelX = Math.max(x1 + 6, Math.min(nominalX + offset, x2 - tw - 6));
    }

    ctx.fillStyle = textColor;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, item.y, barWidth, item.height);
    ctx.clip();
    ctx.fillText(item.event.name, labelX, item.y + item.height / 2);
    ctx.restore();
  }
}

function drawPointEvent(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
  isHovered: boolean,
  isSelected: boolean,
  isSnap: boolean,
) {
  const x = yearToX(item.startYear, viewport, canvasWidth);
  const cy = item.y + item.height / 2;
  const radius = item.height / 4 - 1;

  const eventColor = getEventColor(item.event.color);
  const custom = eventColor ? deriveBarColors(eventColor.hex) : null;

  ctx.beginPath();
  ctx.arc(x, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = isSelected
    ? colors.barSelectedFill
    : isHovered
      ? (custom?.hoverFill ?? colors.barHoverFill)
      : isSnap
        ? (custom?.snapFill ?? colors.barSnapFill)
        : (custom?.fill ?? colors.barFill);
  ctx.fill();
  ctx.strokeStyle = isSelected
    ? colors.barSelectedBorder
    : isHovered
      ? (custom?.hoverBorder ?? colors.barHoverBorder)
      : isSnap
        ? (custom?.snapBorder ?? colors.barSnapBorder)
        : (custom?.border ?? colors.barBorder);
  ctx.lineWidth = isSelected || isHovered ? 2 : 1;
  ctx.stroke();
}

// Module-level state set during render() so nested drawing can detect the dragged event
let currentDraggedEvent: TimelineEvent | null = null;

function drawLayoutItem(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
  hoveredItem: LayoutItem | null,
  selectedItem: LayoutItem | null,
  snapHighlightYears: Set<number>,
  transition?: LayoutTransition,
) {
  const visStart = item.overflowStart ?? item.startYear;
  const visEnd = item.overflowEnd ?? item.endYear;
  if (!isVisible(visStart, visEnd, viewport)) return;

  // Apply transition offset and fade-in
  const yOffset = transition?.yOffsets.get(item.event);
  const isFadingIn = transition?.fadingIn.has(item.event);
  const hasTransitionEffect = (yOffset || isFadingIn) && transition;

  if (hasTransitionEffect) {
    ctx.save();
    if (yOffset) ctx.translate(0, yOffset);
    if (isFadingIn) ctx.globalAlpha = transition!.progress;
  }

  // During reorder: draw dragged item (including nested) at reduced alpha
  const isDragged = currentDraggedEvent !== null && item.event === currentDraggedEvent;
  if (isDragged) {
    ctx.save();
    ctx.globalAlpha = 0.3;
  }

  const isSelected = selectedItem === item;
  const isHovered = !isSelected && hoveredItem === item;
  const isSnap =
    !isSelected &&
    !isHovered &&
    (snapHighlightYears.has(item.nominalStartYear) ||
      snapHighlightYears.has(item.nominalEndYear));

  if (item.isContainer && (item.isCollapsed || item.children.length > 0)) {
    drawContainer(
      ctx,
      item,
      viewport,
      canvasWidth,
      hoveredItem,
      selectedItem,
      snapHighlightYears,
      transition,
    );
  } else if (item.isPoint) {
    drawPointEvent(
      ctx,
      item,
      viewport,
      canvasWidth,
      isHovered,
      isSelected,
      isSnap,
    );
  } else {
    drawBar(ctx, item, viewport, canvasWidth, isHovered, isSelected, isSnap);
  }

  if (isDragged) {
    ctx.restore();
  }
  if (hasTransitionEffect) {
    ctx.restore();
  }
}

/** Find a layout item by event reference, searching recursively through children. */
function findLayoutItemByEvent(event: TimelineEvent, items: LayoutItem[]): LayoutItem | null {
  for (const item of items) {
    if (item.event === event) return item;
    if (item.children.length > 0) {
      const found = findLayoutItemByEvent(event, item.children);
      if (found) return found;
    }
  }
  return null;
}

/** Compute the maximum Y extent of a layout tree (for scroll bounds). */
export function computeMaxLayoutY(layout: LayoutItem[]): number {
  let maxY = 0;
  for (const item of layout) {
    const bottom = item.y + item.height;
    if (bottom > maxY) maxY = bottom;
  }
  return maxY;
}

export function render(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  layout: LayoutItem[],
  viewport: Viewport,
  hoveredItem: LayoutItem | null,
  selectedItem: LayoutItem | null,
  cursorX: number,
  selection: TimelineSelection | null,
  snapState: SnapState,
  scrollY: number,
  showTodayLine?: boolean,
  transition?: LayoutTransition,
  reorderState?: ReorderState,
) {
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  drawSelectionBackground(ctx, selection, viewport, canvasWidth, canvasHeight);

  // Enter scroll space for events
  ctx.save();
  ctx.translate(0, -scrollY);

  // Draw fading-out items (old layout, decreasing alpha)
  if (transition && transition.fadingOut.length > 0) {
    ctx.save();
    ctx.globalAlpha = 1 - transition.progress;
    for (const item of transition.fadingOut) {
      drawLayoutItem(ctx, item, viewport, canvasWidth, null, null, new Set());
    }
    ctx.restore();
  }

  // Set module-level drag state so nested drawLayoutItem calls can dim the dragged item
  currentDraggedEvent = reorderState?.draggedEvent ?? null;

  // Draw current layout items in two passes: non-point first, then point events on top
  for (const item of layout) {
    if (!item.isPoint) drawLayoutItem(ctx, item, viewport, canvasWidth, hoveredItem, selectedItem, snapState.highlightYears, transition);
  }
  for (const item of layout) {
    if (item.isPoint) drawLayoutItem(ctx, item, viewport, canvasWidth, hoveredItem, selectedItem, snapState.highlightYears, transition);
  }

  // Draw reorder ghost on top of everything else
  if (reorderState) {
    const draggedItem = findLayoutItemByEvent(reorderState.draggedEvent, layout);
    if (draggedItem) {
      const offsetY = reorderState.ghostY - draggedItem.y - draggedItem.height / 2;
      currentDraggedEvent = null; // don't dim inside the ghost
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.translate(0, offsetY);
      drawLayoutItem(ctx, draggedItem, viewport, canvasWidth, draggedItem, null, snapState.highlightYears);
      ctx.restore();
    }
  }

  currentDraggedEvent = null;

  // Exit scroll space
  ctx.restore();

  // Axis overlay: semi-transparent background over header area
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, canvasWidth, LAYOUT.eventsStartY - 1);
  ctx.restore();

  // Axis and overlays drawn in screen space (not scrolled)
  drawAxis(ctx, viewport, canvasWidth, canvasHeight);
  if (showTodayLine !== false) drawTodayLine(ctx, viewport, canvasWidth, canvasHeight);
  const todayVisible = showTodayLine !== false;
  drawSelectionForeground(
    ctx,
    selection,
    snapState.selStartDetail,
    snapState.selEndDetail,
    viewport,
    canvasWidth,
    canvasHeight,
    todayVisible,
  );
  drawCursorLine(
    ctx,
    cursorX,
    selection,
    snapState.cursorDetail,
    viewport,
    canvasWidth,
    canvasHeight,
    todayVisible,
  );
}
