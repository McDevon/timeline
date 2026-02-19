import { describe, it, expect } from 'vitest';
import { collectSnapTargets, findSnapYear } from './snap';
import { LayoutItem } from './layout';
import { TimelineEvent } from '../types';

function makeEvent(name: string, start: string, end?: string): TimelineEvent {
  return { name, start, end };
}

function makeLayoutItem(event: TimelineEvent, nominalStart: number, nominalEnd: number, children: LayoutItem[] = []): LayoutItem {
  return {
    event,
    startYear: nominalStart,
    endYear: nominalEnd,
    nominalStartYear: nominalStart,
    nominalEndYear: nominalEnd,
    y: 0,
    height: 30,
    isContainer: children.length > 0,
    isCollapsed: false,
    isPoint: event.end === undefined,
    children,
  };
}

describe('collectSnapTargets', () => {
  it('returns empty array for empty layout', () => {
    expect(collectSnapTargets([])).toEqual([]);
  });

  it('collects start and end years', () => {
    const e = makeEvent('A', '2000', '2010');
    const layout = [makeLayoutItem(e, 2000, 2010)];
    expect(collectSnapTargets(layout)).toEqual([2000, 2010]);
  });

  it('deduplicates years', () => {
    const e1 = makeEvent('A', '2000', '2010');
    const e2 = makeEvent('B', '2010', '2020');
    const layout = [makeLayoutItem(e1, 2000, 2010), makeLayoutItem(e2, 2010, 2020)];
    const targets = collectSnapTargets(layout);
    expect(targets).toEqual([2000, 2010, 2020]);
  });

  it('returns sorted results', () => {
    const e1 = makeEvent('A', '2020', '2030');
    const e2 = makeEvent('B', '2000', '2010');
    const layout = [makeLayoutItem(e1, 2020, 2030), makeLayoutItem(e2, 2000, 2010)];
    const targets = collectSnapTargets(layout);
    expect(targets).toEqual([2000, 2010, 2020, 2030]);
  });

  it('collects from nested children', () => {
    const child = makeEvent('C', '2005', '2008');
    const parent = makeEvent('P', '2000', '2010');
    parent.nested = [child];
    const childLayout = makeLayoutItem(child, 2005, 2008);
    const parentLayout = makeLayoutItem(parent, 2000, 2010, [childLayout]);
    const targets = collectSnapTargets([parentLayout]);
    expect(targets).toEqual([2000, 2005, 2008, 2010]);
  });

  it('handles point events (start === end)', () => {
    const e = makeEvent('P', '2000');
    const layout = [makeLayoutItem(e, 2000, 2000)];
    expect(collectSnapTargets(layout)).toEqual([2000]);
  });
});

describe('findSnapYear', () => {
  const vp = { start: 2000, end: 2100 };
  const canvasWidth = 1000;

  it('returns null for empty targets', () => {
    expect(findSnapYear(500, [], vp, canvasWidth)).toBeNull();
  });

  it('snaps to exact target', () => {
    // 2050 is at pixel 500
    const targets = [2000, 2050, 2100];
    expect(findSnapYear(500, targets, vp, canvasWidth)).toBe(2050);
  });

  it('snaps to nearest target within threshold', () => {
    const targets = [2050];
    // 2050 is at x=500; try x=505 (within default 10px threshold)
    expect(findSnapYear(505, targets, vp, canvasWidth)).toBe(2050);
  });

  it('returns null when beyond threshold', () => {
    const targets = [2050];
    // 2050 is at x=500; try x=520 (beyond 10px threshold)
    expect(findSnapYear(520, targets, vp, canvasWidth)).toBeNull();
  });

  it('snaps to closer of two targets', () => {
    const targets = [2040, 2060];
    // 2040→x=400, 2060→x=600; cursor at x=405 → closer to 2040
    expect(findSnapYear(405, targets, vp, canvasWidth)).toBe(2040);
  });

  it('respects custom threshold', () => {
    const targets = [2050];
    // At x=500, try x=530 with threshold=50
    expect(findSnapYear(530, targets, vp, canvasWidth, 50)).toBe(2050);
  });

  it('snaps to first target when cursor is before all', () => {
    const targets = [2050, 2060];
    // 2050→x=500; cursor at x=495 (within threshold)
    expect(findSnapYear(495, targets, vp, canvasWidth)).toBe(2050);
  });

  it('snaps to last target when cursor is after all', () => {
    const targets = [2040, 2050];
    // 2050→x=500; cursor at x=505
    expect(findSnapYear(505, targets, vp, canvasWidth)).toBe(2050);
  });
});
