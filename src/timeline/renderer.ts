import { TimelineEvent } from '../types';

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
  nestIndent: 20,
  barRadius: 4,
  fontSize: 13,
  smallFontSize: 11,
};

interface TimeRange {
  min: number;
  max: number;
}

function findTimeRange(events: TimelineEvent[]): TimeRange {
  let min = Infinity;
  let max = -Infinity;

  function walk(list: TimelineEvent[]) {
    for (const e of list) {
      if (e.start < min) min = e.start;
      if (e.end > max) max = e.end;
      if (e.end === e.start) {
        // Point event: give it a little visual space
        if (e.start - 1 < min) min = e.start - 1;
        if (e.end + 1 > max) max = e.end + 1;
      }
      if (e.nested) walk(e.nested);
    }
  }

  walk(events);
  // Add a small margin
  const span = max - min;
  min -= span * 0.02;
  max += span * 0.02;
  return { min, max };
}

function yearToX(year: number, range: TimeRange, canvasWidth: number): number {
  const drawWidth = canvasWidth - LAYOUT.paddingX * 2;
  return LAYOUT.paddingX + ((year - range.min) / (range.max - range.min)) * drawWidth;
}

function chooseTickInterval(range: TimeRange, canvasWidth: number): number {
  const span = range.max - range.min;
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

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year}`;
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

function drawAxis(ctx: CanvasRenderingContext2D, range: TimeRange, canvasWidth: number) {
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
  const interval = chooseTickInterval(range, canvasWidth);
  const firstTick = Math.ceil(range.min / interval) * interval;

  ctx.fillStyle = COLORS.axisText;
  ctx.font = `${LAYOUT.smallFontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let year = firstTick; year <= range.max; year += interval) {
    const x = yearToX(year, range, canvasWidth);
    ctx.beginPath();
    ctx.moveTo(x, y - LAYOUT.tickHeight / 2);
    ctx.lineTo(x, y + LAYOUT.tickHeight / 2);
    ctx.stroke();
    ctx.fillText(formatYear(year), x, y + LAYOUT.tickHeight / 2 + 4);
  }
}

function drawEventBar(
  ctx: CanvasRenderingContext2D,
  event: TimelineEvent,
  y: number,
  range: TimeRange,
  canvasWidth: number,
  isChild: boolean,
) {
  const x1 = yearToX(event.start, range, canvasWidth);
  const x2 = yearToX(event.end, range, canvasWidth);
  const barHeight = isChild ? LAYOUT.childBarHeight : LAYOUT.parentBarHeight;
  const barWidth = Math.max(x2 - x1, 3); // minimum 3px for point events

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
    ctx.fillText(event.name, textX, textY);
    ctx.restore();
  } else {
    // Bar too small: draw label to the right
    ctx.fillText(event.name, x1 + barWidth + 4, textY);
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  events: TimelineEvent[],
) {
  const width = canvas.width;
  const height = canvas.height;

  // Clear
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  if (events.length === 0) return;

  const range = findTimeRange(events);

  // Draw axis
  drawAxis(ctx, range, width);

  // Draw events
  let currentY = LAYOUT.parentRowStart;

  for (const event of events) {
    drawEventBar(ctx, event, currentY, range, width, false);
    currentY += LAYOUT.parentBarHeight + LAYOUT.rowGap;

    if (event.nested) {
      for (const child of event.nested) {
        drawEventBar(ctx, child, currentY, range, width, true);
        currentY += LAYOUT.childBarHeight + LAYOUT.rowGap;
      }
      // Add extra gap after a group's children
      currentY += LAYOUT.rowGap;
    }
  }
}
