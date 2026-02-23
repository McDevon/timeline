import { describe, it, expect } from 'vitest';
import {
  computeDropIndex,
  findSiblingInfo,
  findSiblingLayoutItems,
  findParentLayoutItem,
  buildRefPositions,
} from './reorder';
import { LayoutItem } from './layout';
import { TimelineEvent } from '../types';

function makeEvent(name: string, start: string, end?: string, nested?: TimelineEvent[]): TimelineEvent {
  const e: TimelineEvent = { name, start };
  if (end) e.end = end;
  if (nested) e.nested = nested;
  return e;
}

function makeItem(event: TimelineEvent, y: number, height: number, children: LayoutItem[] = []): LayoutItem {
  return {
    event,
    startYear: 0,
    endYear: 10,
    nominalStartYear: 0,
    nominalEndYear: 10,
    y,
    height,
    isContainer: children.length > 0,
    isCollapsed: false,
    isPoint: false,
    children,
  };
}

describe('computeDropIndex', () => {
  it('returns 0 for empty positions', () => {
    expect(computeDropIndex([], 100)).toBe(0);
  });

  it('returns 0 when cursor is above all items', () => {
    const positions = [
      { center: 100, bottom: 120 },
      { center: 200, bottom: 220 },
    ];
    expect(computeDropIndex(positions, 50)).toBe(0);
  });

  it('returns positions.length when cursor is below all items', () => {
    const positions = [
      { center: 100, bottom: 120 },
      { center: 200, bottom: 220 },
    ];
    expect(computeDropIndex(positions, 300)).toBe(2);
  });

  it('returns correct index when cursor is between items', () => {
    const positions = [
      { center: 100, bottom: 120 },
      { center: 200, bottom: 220 },
      { center: 300, bottom: 320 },
    ];
    expect(computeDropIndex(positions, 150)).toBe(1);
  });

  it('counts item when cursor is exactly on center', () => {
    const positions = [
      { center: 100, bottom: 120 },
      { center: 200, bottom: 220 },
    ];
    expect(computeDropIndex(positions, 100)).toBe(1);
  });

  it('caps boundary gap at 60px', () => {
    // Items with a 200px gap between bottom of first and center of second
    const positions = [
      { center: 100, bottom: 110 },
      { center: 310, bottom: 320 }, // center is 200px after prevBottom
    ];
    // boundary = min(310, 110 + 60) = 170
    // cursor at 170 should count second item
    expect(computeDropIndex(positions, 170)).toBe(2);
    // cursor at 169 should not count second item
    expect(computeDropIndex(positions, 169)).toBe(1);
  });
});

describe('findSiblingInfo', () => {
  const a = makeEvent('A', '1000', '2000');
  const b = makeEvent('B', '1000', '2000');
  const child1 = makeEvent('C1', '1100', '1200');
  const child2 = makeEvent('C2', '1300', '1400');
  const parent = makeEvent('P', '1000', '2000', [child1, child2]);
  const events = [a, b, parent];

  it('finds root siblings and parentPath "[]"', () => {
    const result = findSiblingInfo(a, events, new Set());
    expect(result.parentPath).toBe('[]');
    expect(result.siblings).toEqual([a, b, parent]);
  });

  it('finds nested siblings and parentPath with parent name', () => {
    const result = findSiblingInfo(child1, events, new Set());
    expect(result.parentPath).toBe(JSON.stringify(['P']));
    expect(result.siblings).toEqual([child1, child2]);
  });

  it('filters hidden events from root siblings', () => {
    const hidden = new Set<TimelineEvent>([b]);
    const result = findSiblingInfo(a, events, hidden);
    expect(result.siblings).toEqual([a, parent]);
  });

  it('returns fallback for event not in tree', () => {
    const orphan = makeEvent('Orphan', '1000');
    const result = findSiblingInfo(orphan, events, new Set());
    expect(result.parentPath).toBe('[]');
    expect(result.siblings).toEqual([orphan]);
  });
});

describe('findSiblingLayoutItems', () => {
  const evA = makeEvent('A', '1000');
  const evB = makeEvent('B', '1000');
  const evC1 = makeEvent('C1', '1000');
  const evC2 = makeEvent('C2', '1000');

  const itemC1 = makeItem(evC1, 60, 10);
  const itemC2 = makeItem(evC2, 80, 10);
  const itemA = makeItem(evA, 0, 50, [itemC1, itemC2]);
  const itemB = makeItem(evB, 100, 50);
  const layout = [itemA, itemB];

  it('returns entire layout for root item', () => {
    expect(findSiblingLayoutItems(itemA, layout)).toBe(layout);
  });

  it('returns parent children for nested item', () => {
    expect(findSiblingLayoutItems(itemC1, layout)).toEqual([itemC1, itemC2]);
  });
});

describe('findParentLayoutItem', () => {
  const evA = makeEvent('A', '1000');
  const evChild = makeEvent('Child', '1000');

  const itemChild = makeItem(evChild, 60, 10);
  const itemA = makeItem(evA, 0, 50, [itemChild]);
  const layout = [itemA];

  it('returns null for root event', () => {
    expect(findParentLayoutItem(evA, layout)).toBeNull();
  });

  it('returns parent for nested event', () => {
    expect(findParentLayoutItem(evChild, layout)).toBe(itemA);
  });
});

describe('buildRefPositions', () => {
  const evA = makeEvent('A', '1000');
  const evB = makeEvent('B', '1000');
  const evC = makeEvent('C', '1000');

  const itemA = makeItem(evA, 0, 20);
  const itemB = makeItem(evB, 30, 20);
  const itemC = makeItem(evC, 60, 20);
  const layout = [itemA, itemB, itemC];

  it('excludes dragged item from positions', () => {
    const positions = buildRefPositions(itemB, layout);
    expect(positions.length).toBe(2);
    expect(positions.some(p => p.center === 40)).toBe(false); // itemB center
  });

  it('computes correct center and bottom', () => {
    const positions = buildRefPositions(itemC, layout);
    // itemA: center=10, bottom=20; itemB: center=40, bottom=50
    expect(positions[0]).toEqual({ center: 10, bottom: 20 });
    expect(positions[1]).toEqual({ center: 40, bottom: 50 });
  });

  it('sorts by center Y', () => {
    // Reverse the layout order to verify sorting
    const reversed = [itemC, itemA, itemB];
    const positions = buildRefPositions(itemC, reversed);
    expect(positions[0].center).toBeLessThan(positions[1].center);
  });
});
