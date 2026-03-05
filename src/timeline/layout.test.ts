import { describe, it, expect } from 'vitest';
import { computeLayout } from './layout';
import { TimelineEvent } from '../types';

function makeEvent(name: string, start: string, end?: string, nested?: TimelineEvent[]): TimelineEvent {
  const e: TimelineEvent = { name, start };
  if (end) e.end = end;
  if (nested) e.nested = nested;
  return e;
}

describe('computeLayout', () => {
  const startY = 100;

  it('lays out a single range event', () => {
    const events = [makeEvent('A', '2000', '2010')];
    const layout = computeLayout(events, startY);
    expect(layout).toHaveLength(1);
    expect(layout[0].event.name).toBe('A');
    expect(layout[0].y).toBe(startY);
    expect(layout[0].isContainer).toBe(true);
    expect(layout[0].isPoint).toBe(false);
  });

  it('lays out a single point event', () => {
    const events = [makeEvent('P', '2000')];
    const layout = computeLayout(events, startY);
    expect(layout).toHaveLength(1);
    expect(layout[0].isPoint).toBe(true);
    expect(layout[0].isContainer).toBe(false);
    expect(layout[0].nominalStartYear).toBe(layout[0].nominalEndYear);
  });

  it('places non-overlapping events at same Y level', () => {
    const events = [
      makeEvent('A', '2000', '2005'),
      makeEvent('B', '2010', '2020'),
    ];
    const layout = computeLayout(events, startY);
    expect(layout).toHaveLength(2);
    // Non-overlapping → both at startY
    expect(layout[0].y).toBe(startY);
    expect(layout[1].y).toBe(startY);
  });

  it('stacks overlapping events vertically', () => {
    const events = [
      makeEvent('A', '2000', '2010'),
      makeEvent('B', '2005', '2015'),
    ];
    const layout = computeLayout(events, startY);
    expect(layout).toHaveLength(2);
    // A placed first, B must be below A
    expect(layout[1].y).toBeGreaterThan(layout[0].y);
  });

  it('places nested events inside container', () => {
    const child = makeEvent('C', '2002', '2008');
    const parent = makeEvent('P', '2000', '2010', [child]);
    const layout = computeLayout([parent], startY);
    expect(layout).toHaveLength(1);
    expect(layout[0].children).toHaveLength(1);
    expect(layout[0].children[0].event.name).toBe('C');
    // Child Y is inside parent
    expect(layout[0].children[0].y).toBeGreaterThan(layout[0].y);
  });

  it('computes container height to encompass children', () => {
    const children = [
      makeEvent('C1', '2002', '2004'),
      makeEvent('C2', '2006', '2008'),
    ];
    const parent = makeEvent('P', '2000', '2010', children);
    const layout = computeLayout([parent], startY);
    const container = layout[0];
    // Container height should be larger than a simple bar
    expect(container.height).toBeGreaterThan(30);
  });

  it('collapses events when in collapsed set', () => {
    const child = makeEvent('C', '2002', '2008');
    const parent = makeEvent('P', '2000', '2010', [child]);
    const collapsed = new Set([parent]);
    const layout = computeLayout([parent], startY, collapsed);
    expect(layout[0].isCollapsed).toBe(true);
    expect(layout[0].children).toHaveLength(0);
    expect(layout[0].height).toBe(20); // collapsedBarHeight
  });

  it('hides events in hidden set', () => {
    const a = makeEvent('A', '2000', '2005');
    const b = makeEvent('B', '2010', '2020');
    const hidden = new Set([a]);
    const layout = computeLayout([a, b], startY, undefined, undefined, hidden);
    expect(layout).toHaveLength(1);
    expect(layout[0].event.name).toBe('B');
  });

  it('sorts events by start year by default', () => {
    const events = [
      makeEvent('B', '2010', '2020'),
      makeEvent('A', '2000', '2005'),
    ];
    const layout = computeLayout(events, startY);
    expect(layout[0].event.name).toBe('A');
    expect(layout[1].event.name).toBe('B');
  });

  it('respects custom event orders', () => {
    const events = [
      makeEvent('A', '2000', '2005'),
      makeEvent('B', '2010', '2020'),
    ];
    const orders = new Map([['[]', ['B', 'A']]]);
    const layout = computeLayout(events, startY, undefined, orders);
    // B should be placed first (lower Y or same Y but before A)
    expect(layout[0].event.name).toBe('B');
    expect(layout[1].event.name).toBe('A');
  });

  it('stacks same-date point events on separate rows', () => {
    const events = [
      makeEvent('P1', '2000'),
      makeEvent('P2', '2000'),
    ];
    const layout = computeLayout(events, startY);
    expect(layout).toHaveLength(2);
    // POINT_OVERLAP_RADIUS makes them overlap → different Y
    expect(layout[0].y).not.toBe(layout[1].y);
  });

  it('packs events into gaps above when possible', () => {
    // A, B, C overlap each other and stack vertically.
    // D only overlaps C — it should fit in the gap at the top
    // where A sits, not below everything.
    const events = [
      makeEvent('A', '2000', '2010'),
      makeEvent('B', '2005', '2015'),
      makeEvent('C', '2008', '2018'),
      makeEvent('D', '2016', '2025'), // only overlaps C, not A or B
    ];
    const layout = computeLayout(events, startY);
    // D should be packed into the first available gap (y = startY),
    // not stacked below C
    expect(layout[3].event.name).toBe('D');
    expect(layout[3].y).toBe(startY);
  });

  it('does not pack into gaps when custom order is active', () => {
    // Same events as above, but with a custom order — should use
    // simple stacking to preserve predictable drag-reorder behavior.
    const events = [
      makeEvent('A', '2000', '2010'),
      makeEvent('B', '2005', '2015'),
      makeEvent('C', '2008', '2018'),
      makeEvent('D', '2016', '2025'),
    ];
    const orders = new Map([['[]', ['A', 'B', 'C', 'D']]]);
    const layout = computeLayout(events, startY, undefined, orders);
    // D should be stacked below C, not packed into the gap at the top
    expect(layout[3].event.name).toBe('D');
    expect(layout[3].y).toBeGreaterThan(layout[2].y);
  });

  it('places tall container first for more compact mixed-height layout', () => {
    // Container P overlaps both A and B. A and B don't overlap each other.
    // Height-descending places P first at y=0, then A and B share the row below.
    // Start-year would place A first, then P below, then B below P — taller stack.
    const child1 = makeEvent('C1', '2002', '2006');
    const child2 = makeEvent('C2', '2008', '2014');
    const container = makeEvent('P', '2000', '2015', [child1, child2]);
    const barA = makeEvent('A', '2000', '2010');
    const barB = makeEvent('B', '2012', '2020');

    const layout = computeLayout([container, barA, barB], startY);

    const containerItem = layout.find(l => l.event.name === 'P')!;
    const barAItem = layout.find(l => l.event.name === 'A')!;
    const barBItem = layout.find(l => l.event.name === 'B')!;

    // Container should be at the top (placed first by height-desc)
    expect(containerItem.y).toBe(startY);
    // A and B should be on the same row below (they don't overlap in time)
    expect(barAItem.y).toBe(barBItem.y);
    expect(barAItem.y).toBeGreaterThan(containerItem.y);
  });

  it('detects overflow when child extends beyond parent range', () => {
    const child = makeEvent('C', '1990', '2015');
    const parent = makeEvent('P', '2000', '2010', [child]);
    const layout = computeLayout([parent], startY);
    const container = layout[0];
    expect(container.overflowStart).toBeDefined();
    expect(container.overflowStart).toBeLessThan(container.nominalStartYear);
    expect(container.overflowEnd).toBeDefined();
    expect(container.overflowEnd).toBeGreaterThan(container.nominalEndYear);
  });

  it('computes correct nominalStartYear and nominalEndYear', () => {
    const events = [makeEvent('A', '2000-06', '2010-03')];
    const layout = computeLayout(events, startY);
    expect(layout[0].nominalStartYear).toBeGreaterThan(2000);
    expect(layout[0].nominalStartYear).toBeLessThan(2001);
    expect(layout[0].nominalEndYear).toBeGreaterThan(2010);
    expect(layout[0].nominalEndYear).toBeLessThan(2011);
  });
});
