import { describe, it, expect } from 'vitest';
import { panViewport, yearToX, xToYear, zoomViewport, MIN_SPAN, MAX_SPAN } from './viewport';

describe('panViewport', () => {
  it('shifts viewport by pixel delta', () => {
    const vp = { start: 2000, end: 2100 };
    const result = panViewport(vp, 100, 1000);
    // 100px at span=100, width=1000 → yearDelta = 100*(100/1000) = 10
    expect(result.start).toBe(2010);
    expect(result.end).toBe(2110);
  });

  it('preserves span', () => {
    const vp = { start: 2000, end: 2100 };
    const result = panViewport(vp, 200, 1000);
    expect(result.end - result.start).toBeCloseTo(100);
  });

  it('handles negative delta', () => {
    const vp = { start: 2000, end: 2100 };
    const result = panViewport(vp, -50, 1000);
    expect(result.start).toBe(1995);
  });

  it('handles zero delta', () => {
    const vp = { start: 2000, end: 2100 };
    const result = panViewport(vp, 0, 1000);
    expect(result.start).toBe(2000);
    expect(result.end).toBe(2100);
  });
});

describe('yearToX and xToYear round-trip', () => {
  const vp = { start: 2000, end: 2100 };
  const canvasWidth = 1000;

  it('start year maps to x=0', () => {
    expect(yearToX(2000, vp, canvasWidth)).toBe(0);
  });

  it('end year maps to canvasWidth', () => {
    expect(yearToX(2100, vp, canvasWidth)).toBe(canvasWidth);
  });

  it('round-trips year → x → year', () => {
    const year = 2050;
    const x = yearToX(year, vp, canvasWidth);
    const back = xToYear(x, vp, canvasWidth);
    expect(back).toBeCloseTo(year, 10);
  });

  it('round-trips x → year → x', () => {
    const x = 333;
    const year = xToYear(x, vp, canvasWidth);
    const back = yearToX(year, vp, canvasWidth);
    expect(back).toBeCloseTo(x, 10);
  });

  it('midpoint x maps to midpoint year', () => {
    const x = canvasWidth / 2;
    const year = xToYear(x, vp, canvasWidth);
    expect(year).toBeCloseTo(2050, 10);
  });
});

describe('zoomViewport', () => {
  it('zooms in (negative deltaY) reduces span', () => {
    const vp = { start: 2000, end: 2100 };
    const result = zoomViewport(vp, 500, 1000, -100);
    expect(result.end - result.start).toBeLessThan(100);
  });

  it('zooms out (positive deltaY) increases span', () => {
    const vp = { start: 2000, end: 2100 };
    const result = zoomViewport(vp, 500, 1000, 100);
    expect(result.end - result.start).toBeGreaterThan(100);
  });

  it('keeps anchor year at same pixel position', () => {
    const vp = { start: 2000, end: 2100 };
    const cursorX = 300;
    const anchorYear = xToYear(cursorX, vp, 1000);
    const result = zoomViewport(vp, cursorX, 1000, -50);
    const newX = yearToX(anchorYear, result, 1000);
    expect(newX).toBeCloseTo(cursorX, 5);
  });

  it('clamps to MIN_SPAN', () => {
    const vp = { start: 2000, end: 2000 + MIN_SPAN * 2 };
    const result = zoomViewport(vp, 500, 1000, -5000);
    expect(result.end - result.start).toBeCloseTo(MIN_SPAN, 5);
  });

  it('clamps to MAX_SPAN', () => {
    const vp = { start: 0, end: MAX_SPAN / 2 };
    const result = zoomViewport(vp, 500, 1000, 5000);
    expect(result.end - result.start).toBeCloseTo(MAX_SPAN, 5);
  });

  it('zero deltaY returns same viewport', () => {
    const vp = { start: 2000, end: 2100 };
    const result = zoomViewport(vp, 500, 1000, 0);
    expect(result.start).toBeCloseTo(2000);
    expect(result.end).toBeCloseTo(2100);
  });
});
