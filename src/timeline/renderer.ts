import { TimelineEvent } from '../types';
import { Viewport } from './viewport';
import { dateToDecimalYear, formatAxisLabel } from '../data/time';

const COLORS = {
  background: '#1a1a2e',
  axis: '#e0e0e0',
  axisText: '#a0a0a0',
  parentBar: '#16213e',
  parentBorder: '#0f3460',
  parentText: '#e0e0e0',
  childBar: '#0f3460',
  childBorder: '#533483',
  childText: '#e0e0e0',
};

const LAYOUT = {
  paddingX: 60,
  paddingTop: 60,
  axisY: 80,
  tickHeight: 8,
  parentBarHeight: 30,
  childBarHeight: 22,
  parentRowStart: 110,
  rowGap: 6,
  barRadius: 4,
  fontSize: 13,
  smallFontSize: 11,
};

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
      const end = dateToDecimalYear(e.end);
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

function yearToX(year: number, viewport: Viewport, canvasWidth: number): number {
  const drawWidth = canvasWidth - LAYOUT.paddingX * 2;
  return LAYOUT.paddingX + ((year - viewport.start) / (viewport.end - viewport.start)) * drawWidth;
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

  // Main axis line
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();

  // Ticks and labels
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

/** Check if an event is visible within the viewport */
function isVisible(startYear: number, endYear: number, viewport: Viewport): boolean {
  return endYear >= viewport.start && startYear <= viewport.end;
}

function drawEventBar(
  ctx: CanvasRenderingContext2D,
  startYear: number,
  endYear: number,
  name: string,
  y: number,
  viewport: Viewport,
  canvasWidth: number,
  isChild: boolean,
) {
  const x1 = yearToX(startYear, viewport, canvasWidth);
  const x2 = yearToX(endYear, viewport, canvasWidth);
  const barHeight = isChild ? LAYOUT.childBarHeight : LAYOUT.parentBarHeight;
  const barWidth = Math.max(x2 - x1, 3);

  // Bar
  const fillColor = isChild ? COLORS.childBar : COLORS.parentBar;
  const borderColor = isChild ? COLORS.childBorder : COLORS.parentBorder;

  drawRoundedRect(ctx, x1, y, barWidth, barHeight, LAYOUT.barRadius);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Label
  const textColor = isChild ? COLORS.childText : COLORS.parentText;
  const fontSize = isChild ? LAYOUT.smallFontSize : LAYOUT.fontSize;
  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const textY = y + barHeight / 2;
  const textX = x1 + 6;
  const maxTextWidth = barWidth - 12;

  if (maxTextWidth > 20) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, y, barWidth, barHeight);
    ctx.clip();
    ctx.fillText(name, textX, textY);
    ctx.restore();
  } else {
    ctx.fillText(name, x1 + barWidth + 4, textY);
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  events: TimelineEvent[],
  viewport: Viewport,
) {
  // Clear
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (events.length === 0) return;

  // Draw axis
  drawAxis(ctx, viewport, canvasWidth);

  // Draw events
  let currentY = LAYOUT.parentRowStart;

  for (const event of events) {
    const eventStart = dateToDecimalYear(event.start);
    const eventEnd = dateToDecimalYear(event.end);

    if (isVisible(eventStart, eventEnd, viewport)) {
      drawEventBar(ctx, eventStart, eventEnd, event.name, currentY, viewport, canvasWidth, false);
    }
    currentY += LAYOUT.parentBarHeight + LAYOUT.rowGap;

    if (event.nested) {
      for (const child of event.nested) {
        const childStart = dateToDecimalYear(child.start);
        const childEnd = dateToDecimalYear(child.end);
        if (isVisible(childStart, childEnd, viewport)) {
          drawEventBar(ctx, childStart, childEnd, child.name, currentY, viewport, canvasWidth, true);
        }
        currentY += LAYOUT.childBarHeight + LAYOUT.rowGap;
      }
      currentY += LAYOUT.rowGap;
    }
  }
}
