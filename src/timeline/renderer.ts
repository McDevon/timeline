import { TimelineEvent, TimelineSelection } from '../types';
import { Viewport, yearToX, xToYear } from './viewport';
import { dateToDecimalYear, decimalYearToIso, formatAxisLabel, formatDate, formatDecimalYearDelta } from '../data/time';
import { LayoutItem } from './layout';

const COLORS = {
  background: '#1a1a2e',
  axis: '#e0e0e0',
  axisText: '#a0a0a0',
  containerFill: 'rgba(15, 52, 96, 0.25)',
  containerBorder: '#0f3460',
  containerText: '#e0e0e0',
  containerHoverFill: 'rgba(15, 52, 96, 0.4)',
  containerHoverBorder: '#1a6ea0',
  containerSelectedFill: 'rgba(80, 56, 12, 0.4)',
  containerSelectedBorder: '#c89a2c',
  barFill: '#0f3460',
  barBorder: '#533483',
  barText: '#e0e0e0',
  barHoverFill: '#163d6e',
  barHoverBorder: '#7b52ab',
  barSelectedFill: '#4a3800',
  barSelectedBorder: '#c89a2c',
  todayLine: 'rgba(255, 82, 82, 0.5)',
  todayText: 'rgba(255, 82, 82, 0.8)',
  cursorLine: 'rgba(255, 255, 255, 0.2)',
  cursorText: 'rgba(255, 255, 255, 0.6)',
  selectionLine: 'rgba(255, 255, 255, 0.5)',
  selectionText: 'rgba(255, 255, 255, 0.9)',
  selectionFill: 'rgba(255, 255, 255, 0.05)',
};

const LAYOUT = {
  paddingX: 60,
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
      if (s < min) min = s;
      if (end > max) max = end;
      if (s === end) {
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

function chooseTickInterval(viewport: Viewport, canvasWidth: number): number {
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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawAxis(ctx: CanvasRenderingContext2D, viewport: Viewport, canvasWidth: number) {
  const y = LAYOUT.axisY;
  const x1 = LAYOUT.paddingX;
  const x2 = canvasWidth - LAYOUT.paddingX;

  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();

  const interval = chooseTickInterval(viewport, canvasWidth);
  const firstTick = Math.ceil(viewport.start / interval) * interval;
  const spanYears = viewport.end - viewport.start;

  ctx.fillStyle = COLORS.axisText;
  ctx.font = `${LAYOUT.smallFontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let year = firstTick; year <= viewport.end; year += interval) {
    const x = yearToX(year, viewport, canvasWidth);
    ctx.beginPath();
    ctx.moveTo(x, y - LAYOUT.tickHeight / 2);
    ctx.lineTo(x, y + LAYOUT.tickHeight / 2);
    ctx.stroke();
    ctx.fillText(formatAxisLabel(year, spanYears), x, y + LAYOUT.tickHeight / 2 + 4);
  }
}

function todayDecimalYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = (now.getTime() - start.getTime()) / 86400000;
  return now.getFullYear() + dayOfYear / 365;
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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
  ctx.strokeStyle = COLORS.todayLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, LAYOUT.axisY - LAYOUT.tickHeight);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();

  // Date label above axis
  ctx.fillStyle = COLORS.todayText;
  ctx.font = `${LAYOUT.smallFontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(formatDate(todayIsoDate()), x, LAYOUT.axisY - LAYOUT.tickHeight - 4);
}

function drawCursorLine(
  ctx: CanvasRenderingContext2D,
  cursorX: number,
  selection: TimelineSelection | null,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (cursorX < 0) return;

  const year = xToYear(cursorX, viewport, canvasWidth);
  const isoDate = decimalYearToIso(year);

  // Vertical line
  ctx.strokeStyle = COLORS.cursorLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cursorX, LAYOUT.axisY - LAYOUT.tickHeight);
  ctx.lineTo(cursorX, canvasHeight);
  ctx.stroke();

  // Determine which labels to show
  const isRange = selection !== null && selection.start !== selection.end;
  const isSinglePoint = selection !== null && selection.start === selection.end;

  ctx.font = `${LAYOUT.smallFontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const lineHeight = 14;

  if (isRange) {
    // Range selected: date only
    ctx.fillStyle = COLORS.cursorText;
    ctx.fillText(formatDate(isoDate), cursorX, LAYOUT.axisY - LAYOUT.tickHeight - 4);
  } else {
    // No selection or single point: date + distance to now + optional distance to selection
    const extraLines = 1 + (isSinglePoint ? 1 : 0);
    const dateY = LAYOUT.axisY - LAYOUT.tickHeight - 4 - extraLines * lineHeight;

    ctx.fillStyle = COLORS.cursorText;
    ctx.fillText(formatDate(isoDate), cursorX, dateY);

    const today = todayDecimalYear();
    const deltaNow = today - year;
    const span = viewport.end - viewport.start;
    const nowMag = formatDecimalYearDelta(deltaNow, span);
    const nowLabel = deltaNow > 0 ? `${nowMag} ago` : `in ${nowMag}`;
    ctx.fillText(nowLabel, cursorX, dateY + lineHeight);

    if (isSinglePoint) {
      const deltaSel = year - selection!.start;
      const selMag = formatDecimalYearDelta(deltaSel, span);
      const selLabel = deltaSel >= 0 ? `+${selMag}` : `-${selMag}`;
      ctx.fillStyle = COLORS.selectionText;
      ctx.fillText(selLabel, cursorX, dateY + lineHeight * 2);
    }
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

  const x1 = yearToX(Math.max(selection.start, viewport.start), viewport, canvasWidth);
  const x2 = yearToX(Math.min(selection.end, viewport.end), viewport, canvasWidth);
  const top = LAYOUT.axisY - LAYOUT.tickHeight;

  ctx.fillStyle = COLORS.selectionFill;
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

  ctx.strokeStyle = COLORS.selectionLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, LAYOUT.axisY - LAYOUT.tickHeight);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();
}

function drawSelectionForeground(
  ctx: CanvasRenderingContext2D,
  selection: TimelineSelection | null,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (selection === null) return;

  if (selection.start === selection.end) {
    // Single point: one line + date label
    drawSelectionLine(ctx, selection.start, viewport, canvasWidth, canvasHeight);

    if (selection.start >= viewport.start && selection.start <= viewport.end) {
      const x = yearToX(selection.start, viewport, canvasWidth);
      ctx.fillStyle = COLORS.selectionText;
      ctx.font = `${LAYOUT.smallFontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(formatDate(decimalYearToIso(selection.start)), x, LAYOUT.axisY - LAYOUT.tickHeight - 4);
    }
  } else {
    // Range: two lines + centered label
    drawSelectionLine(ctx, selection.start, viewport, canvasWidth, canvasHeight);
    drawSelectionLine(ctx, selection.end, viewport, canvasWidth, canvasHeight);

    // Label centered between the two lines
    const x1 = yearToX(selection.start, viewport, canvasWidth);
    const x2 = yearToX(selection.end, viewport, canvasWidth);
    const centerX = (x1 + x2) / 2;
    const span = viewport.end - viewport.start;
    const duration = formatDecimalYearDelta(selection.end - selection.start, span);
    const startLabel = formatDate(decimalYearToIso(selection.start));
    const endLabel = formatDate(decimalYearToIso(selection.end));
    const label = `${startLabel} — ${endLabel} (${duration})`;

    ctx.fillStyle = COLORS.selectionText;
    ctx.font = `${LAYOUT.smallFontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, centerX, LAYOUT.axisY - LAYOUT.tickHeight - 4);
  }
}

function isVisible(startYear: number, endYear: number, viewport: Viewport): boolean {
  return endYear >= viewport.start && startYear <= viewport.end;
}

function drawContainer(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
  hoveredItem: LayoutItem | null,
  selectedItem: LayoutItem | null,
) {
  const x1 = yearToX(item.startYear, viewport, canvasWidth);
  const x2 = yearToX(item.endYear, viewport, canvasWidth);
  const boxWidth = Math.max(x2 - x1, 3);
  const isSelected = selectedItem === item;
  const isHovered = !isSelected && hoveredItem === item;

  // Container background
  drawRoundedRect(ctx, x1, item.y, boxWidth, item.height, LAYOUT.containerRadius);
  ctx.fillStyle = isSelected ? COLORS.containerSelectedFill : isHovered ? COLORS.containerHoverFill : COLORS.containerFill;
  ctx.fill();
  ctx.strokeStyle = isSelected ? COLORS.containerSelectedBorder : isHovered ? COLORS.containerHoverBorder : COLORS.containerBorder;
  ctx.lineWidth = isSelected || isHovered ? 2 : 1;
  ctx.stroke();

  // Container label at top
  ctx.fillStyle = COLORS.containerText;
  ctx.font = `${LAYOUT.fontSize}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const labelY = item.y + 12;
  const labelX = x1 + 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x1, item.y, boxWidth, item.height);
  ctx.clip();
  ctx.fillText(item.event.name, labelX, labelY);
  ctx.restore();

  // Draw children
  for (const child of item.children) {
    drawLayoutItem(ctx, child, viewport, canvasWidth, hoveredItem, selectedItem);
  }
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
  isHovered: boolean,
  isSelected: boolean,
) {
  const x1 = yearToX(item.startYear, viewport, canvasWidth);
  const x2 = yearToX(item.endYear, viewport, canvasWidth);
  const barWidth = Math.max(x2 - x1, 3);

  drawRoundedRect(ctx, x1, item.y, barWidth, item.height, LAYOUT.barRadius);
  ctx.fillStyle = isSelected ? COLORS.barSelectedFill : isHovered ? COLORS.barHoverFill : COLORS.barFill;
  ctx.fill();
  ctx.strokeStyle = isSelected ? COLORS.barSelectedBorder : isHovered ? COLORS.barHoverBorder : COLORS.barBorder;
  ctx.lineWidth = isSelected || isHovered ? 2 : 1;
  ctx.stroke();

  // Label — only render when bar is wide enough to show text
  if (barWidth > 32) {
    ctx.fillStyle = COLORS.barText;
    ctx.font = `${LAYOUT.smallFontSize}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, item.y, barWidth, item.height);
    ctx.clip();
    ctx.fillText(item.event.name, x1 + 6, item.y + item.height / 2);
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
) {
  const x = yearToX(item.startYear, viewport, canvasWidth);
  const cy = item.y + item.height / 2;
  const radius = item.height / 4 - 1;

  ctx.beginPath();
  ctx.arc(x, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = isSelected ? COLORS.barSelectedFill : isHovered ? COLORS.barHoverFill : COLORS.barFill;
  ctx.fill();
  ctx.strokeStyle = isSelected ? COLORS.barSelectedBorder : isHovered ? COLORS.barHoverBorder : COLORS.barBorder;
  ctx.lineWidth = isSelected || isHovered ? 2 : 1;
  ctx.stroke();
}

function drawLayoutItem(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  viewport: Viewport,
  canvasWidth: number,
  hoveredItem: LayoutItem | null,
  selectedItem: LayoutItem | null,
) {
  if (!isVisible(item.startYear, item.endYear, viewport)) return;

  if (item.isContainer) {
    drawContainer(ctx, item, viewport, canvasWidth, hoveredItem, selectedItem);
  } else {
    const isSelected = selectedItem === item;
    const isHovered = !isSelected && hoveredItem === item;
    if (item.isPoint) {
      drawPointEvent(ctx, item, viewport, canvasWidth, isHovered, isSelected);
    } else {
      drawBar(ctx, item, viewport, canvasWidth, isHovered, isSelected);
    }
  }
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
) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (layout.length === 0) return;

  drawAxis(ctx, viewport, canvasWidth);
  drawSelectionBackground(ctx, selection, viewport, canvasWidth, canvasHeight);

  for (const item of layout) {
    drawLayoutItem(ctx, item, viewport, canvasWidth, hoveredItem, selectedItem);
  }

  drawTodayLine(ctx, viewport, canvasWidth, canvasHeight);
  drawSelectionForeground(ctx, selection, viewport, canvasWidth, canvasHeight);
  drawCursorLine(ctx, cursorX, selection, viewport, canvasWidth, canvasHeight);
}
