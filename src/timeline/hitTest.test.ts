import { describe, it, expect } from 'vitest';
import { hitTest } from './hitTest';
import { LayoutItem } from './layout';
import { Viewport } from './viewport';
import { TimelineEvent } from '../types';

// Viewport {start:0, end:100} with canvasWidth 100 → yearToX(year) = year (1:1)
const vp: Viewport = { start: 0, end: 100 };
const W = 100;

function makeEvent(name: string): TimelineEvent {
  return { name, start: '2000' };
}

function makeItem(overrides: Partial<LayoutItem> & { event: TimelineEvent }): LayoutItem {
  return {
    startYear: 0,
    endYear: 0,
    nominalStartYear: 0,
    nominalEndYear: 0,
    y: 0,
    height: 20,
    isContainer: false,
    isCollapsed: false,
    isPoint: false,
    children: [],
    ...overrides,
  };
}

describe('hitTest', () => {
  it('returns null for empty layout', () => {
    expect(hitTest(50, 50, [], vp, W)).toBeNull();
  });

  describe('point events', () => {
    const ev = makeEvent('P');
    // Point at x=50, y=100..120, center=(50,110), radius=height/4=5
    const item = makeItem({ event: ev, startYear: 50, endYear: 50, y: 100, height: 20, isPoint: true });

    it('hits when cursor is within radius', () => {
      expect(hitTest(50, 110, [item], vp, W)).toBe(item);
    });

    it('hits at boundary (exactly at radius)', () => {
      // center=(50,110), radius=5, cursor at (55,110) → dist=5 → hit
      expect(hitTest(55, 110, [item], vp, W)).toBe(item);
    });

    it('misses when cursor is outside radius', () => {
      // cursor at (56,110) → dist=6 > radius=5
      expect(hitTest(56, 110, [item], vp, W)).toBeNull();
    });
  });

  describe('range events', () => {
    const ev = makeEvent('R');
    // Range from x=20 to x=80, y=50..70
    const item = makeItem({ event: ev, startYear: 20, endYear: 80, y: 50, height: 20 });

    it('hits when cursor is inside bounds', () => {
      expect(hitTest(50, 60, [item], vp, W)).toBe(item);
    });

    it('misses when cursor is outside X bounds', () => {
      expect(hitTest(10, 60, [item], vp, W)).toBeNull();
    });

    it('misses when cursor is outside Y bounds', () => {
      expect(hitTest(50, 40, [item], vp, W)).toBeNull();
    });

    it('hits at exact boundaries', () => {
      expect(hitTest(20, 50, [item], vp, W)).toBe(item);
      expect(hitTest(80, 70, [item], vp, W)).toBe(item);
    });
  });

  describe('minimum width', () => {
    it('applies 3px minimum width for very narrow events', () => {
      const ev = makeEvent('Narrow');
      // startYear=50, endYear=50.01 → width ~0.01px, but clamped to 3px
      const item = makeItem({ event: ev, startYear: 50, endYear: 50.01, y: 100, height: 20 });
      // x1=50, itemWidth=max(0.01, 3)=3 → hit zone is [50, 53]
      expect(hitTest(51, 110, [item], vp, W)).toBe(item);
    });
  });

  describe('nesting', () => {
    it('returns child over parent when cursor is on child', () => {
      const parentEv = makeEvent('Parent');
      const childEv = makeEvent('Child');
      const child = makeItem({ event: childEv, startYear: 30, endYear: 60, y: 55, height: 10 });
      const parent = makeItem({
        event: parentEv, startYear: 20, endYear: 80, y: 50, height: 20,
        isContainer: true, children: [child],
      });
      expect(hitTest(45, 60, [parent], vp, W)).toBe(child);
    });

    it('returns container when cursor misses child but hits parent', () => {
      const parentEv = makeEvent('Parent');
      const childEv = makeEvent('Child');
      const child = makeItem({ event: childEv, startYear: 30, endYear: 40, y: 55, height: 10 });
      const parent = makeItem({
        event: parentEv, startYear: 20, endYear: 80, y: 50, height: 20,
        isContainer: true, children: [child],
      });
      // cursor at x=60 misses child (30-40) but hits parent (20-80)
      expect(hitTest(60, 55, [parent], vp, W)).toBe(parent);
    });
  });

  describe('scroll offset', () => {
    it('adjusts py by scrollY', () => {
      const ev = makeEvent('S');
      // Item at layout y=200..220
      const item = makeItem({ event: ev, startYear: 20, endYear: 80, y: 200, height: 20 });
      // Screen py=50, scrollY=160 → layoutY=210 → inside y range
      expect(hitTest(50, 50, [item], vp, W, 160)).toBe(item);
      // Without scroll offset, py=50 → layoutY=50 → miss
      expect(hitTest(50, 50, [item], vp, W, 0)).toBeNull();
    });
  });

  describe('reverse order (painter priority)', () => {
    it('returns later item when both overlap', () => {
      const ev1 = makeEvent('First');
      const ev2 = makeEvent('Second');
      const item1 = makeItem({ event: ev1, startYear: 20, endYear: 80, y: 50, height: 20 });
      const item2 = makeItem({ event: ev2, startYear: 20, endYear: 80, y: 50, height: 20 });
      // item2 is later in array → drawn on top → hit first
      expect(hitTest(50, 60, [item1, item2], vp, W)).toBe(item2);
    });
  });
});
