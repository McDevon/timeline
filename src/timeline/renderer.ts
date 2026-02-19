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
} from "../data/time";
import { LayoutItem } from "./layout";
import { SnapDetail, SnapState } from "./snap";

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

export type CanvasColors = typeof colors;

let colors = {
  background: "#1a1a2e",
  axis: "#e0e0e0",
  axisText: "#a0a0a0",
  containerFill: "rgba(15, 52, 96, 0.25)",
  containerBorder: "#0f3460",
  containerText: "#e0e0e0",
  containerHoverFill: "rgba(15, 52, 96, 0.4)",
  containerHoverBorder: "#1a6ea0",
  containerSnapFill: "rgba(15, 52, 96, 0.30)",
  containerSnapBorder: "#124878",
  containerSelectedFill: "rgba(80, 56, 12, 0.4)",
  containerSelectedBorder: "#c89a2c",
  barFill: "#0f3460",
  barBorder: "#533483",
  barText: "#e0e0e0",
  barHoverFill: "#163d6e",
  barHoverBorder: "#7b52ab",
  barSnapFill: "#12395e",
  barSnapBorder: "#634598",
  barSelectedFill: "#4a3800",
  barSelectedBorder: "#c89a2c",
  todayLine: "rgba(255, 82, 82, 0.5)",
  todayText: "rgba(255, 82, 82, 0.8)",
  cursorLine: "rgba(255, 255, 255, 0.2)",
  cursorText: "rgba(255, 255, 255, 0.6)",
  selectionLine: "rgba(255, 255, 255, 0.5)",
  selectionText: "rgba(255, 255, 255, 0.9)",
  selectionFill: "rgba(255, 255, 255, 0.05)",
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

function drawAxis(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  canvasWidth: number,
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

  const x = yearToX(today, viewport, canvasWidth);

  // Vertical line
  ctx.strokeStyle = colors.todayLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, LAYOUT.axisY - LAYOUT.tickHeight);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();

  // Date label above axis
  ctx.fillStyle = colors.todayText;
  ctx.font = `${LAYOUT.smallFontSize}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    formatDate(todayIsoDate()),
    x,
    LAYOUT.axisY - LAYOUT.tickHeight - 4,
  );
}

function drawCursorLine(
  ctx: CanvasRenderingContext2D,
  cursorX: number,
  selection: TimelineSelection | null,
  cursorDetail: SnapDetail | null,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
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

  if (cursorDetail) {
    lines.push({ text: cursorDetail.label, color: colors.cursorText });
  }

  const dateStr = cursorDetail
    ? cursorDetail.date
    : formatDate(decimalYearToIso(year));
  lines.push({ text: dateStr, color: colors.cursorText });

  if (!isRange) {
    const today = todayDecimalYear();
    const deltaNow = today - year;
    const span = viewport.end - viewport.start;
    const nowMag = formatDecimalYearDelta(deltaNow, span);
    const nowLabel = deltaNow > 0 ? `${nowMag} ago` : `in ${nowMag}`;
    lines.push({ text: nowLabel, color: colors.cursorText });

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

      if (selStartDetail) {
        ctx.fillText(selStartDetail.label, x, baseY - lineHeight);
        ctx.fillText(dateStr, x, baseY);
      } else {
        ctx.fillText(dateStr, x, baseY);
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

    // Event labels line (only when both ends are snapped)
    if (selStartDetail && selEndDetail) {
      lines.push(`${selStartDetail.label} — ${selEndDetail.label}`);
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

  // Container background
  const fillColor = isSelected
    ? colors.containerSelectedFill
    : isHovered
      ? colors.containerHoverFill
      : isSnap
        ? colors.containerSnapFill
        : colors.containerFill;
  const strokeColor = isSelected
    ? colors.containerSelectedBorder
    : isHovered
      ? colors.containerHoverBorder
      : isSnap
        ? colors.containerSnapBorder
        : colors.containerBorder;
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
    const labelX = item.approxStartRange
      ? Math.max(x1 + 6, yearToX(item.approxStartRange[1], viewport, canvasWidth) + 6)
      : x1 + 6;
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
    const labelX = item.approxStartRange
      ? Math.max(x1 + 8, yearToX(item.approxStartRange[1], viewport, canvasWidth) + 8)
      : x1 + 8;
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

  const fillColor = isSelected
    ? colors.barSelectedFill
    : isHovered
      ? colors.barHoverFill
      : isSnap
        ? colors.barSnapFill
        : colors.barFill;
  const strokeColor = isSelected
    ? colors.barSelectedBorder
    : isHovered
      ? colors.barHoverBorder
      : isSnap
        ? colors.barSnapBorder
        : colors.barBorder;
  const lineWidth = isSelected || isHovered ? 2 : 1;

  applyGradient(ctx, item, viewport, canvasWidth, x1, barWidth, fillColor, strokeColor, lineWidth);

  // Label — only render when bar is wide enough to show text
  if (barWidth > 10) {
    ctx.fillStyle = colors.barText;
    ctx.font = `${LAYOUT.smallFontSize}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // Position label in the solid region for approx events
    const labelX = item.approxStartRange
      ? Math.max(x1 + 6, yearToX(item.approxStartRange[1], viewport, canvasWidth) + 6)
      : x1 + 6;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, item.y, barWidth, item.height);
    ctx.clip();
    ctx.fillText(item.event.name, labelX, item.y + item.height / 2);
    ctx.restore();
  }

  // Diamond marker for point events with uncertainty
  if (item.event.end === undefined && item.approxStartRange) {
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

  ctx.beginPath();
  ctx.arc(x, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = isSelected
    ? colors.barSelectedFill
    : isHovered
      ? colors.barHoverFill
      : isSnap
        ? colors.barSnapFill
        : colors.barFill;
  ctx.fill();
  ctx.strokeStyle = isSelected
    ? colors.barSelectedBorder
    : isHovered
      ? colors.barHoverBorder
      : isSnap
        ? colors.barSnapBorder
        : colors.barBorder;
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
    if (yOffset) ctx.translate(0, yOffset * (1 - transition!.progress));
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
  drawAxis(ctx, viewport, canvasWidth);
  if (showTodayLine !== false) drawTodayLine(ctx, viewport, canvasWidth, canvasHeight);
  drawSelectionForeground(
    ctx,
    selection,
    snapState.selStartDetail,
    snapState.selEndDetail,
    viewport,
    canvasWidth,
    canvasHeight,
  );
  drawCursorLine(
    ctx,
    cursorX,
    selection,
    snapState.cursorDetail,
    viewport,
    canvasWidth,
    canvasHeight,
  );
}
