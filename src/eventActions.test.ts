import { describe, it, expect } from 'vitest';
import {
  toSnakeCase,
  countEvents,
  removeEvent,
  findParent,
  collectDescendants,
  isDescendantOf,
} from './eventActions';
import { eventToPath, pathToEvent } from './state';
import { TimelineEvent } from './types';

function makeEvent(name: string, start: string, end?: string, nested?: TimelineEvent[]): TimelineEvent {
  const e: TimelineEvent = { name, start };
  if (end) e.end = end;
  if (nested) e.nested = nested;
  return e;
}

describe('toSnakeCase', () => {
  it('converts spaces to underscores', () => {
    expect(toSnakeCase('Hello World')).toBe('hello_world');
  });

  it('lowercases everything', () => {
    expect(toSnakeCase('ABC')).toBe('abc');
  });

  it('replaces multiple special chars with single underscore', () => {
    expect(toSnakeCase('a--b  c')).toBe('a_b_c');
  });

  it('trims leading/trailing underscores', () => {
    expect(toSnakeCase('  hello  ')).toBe('hello');
  });

  it('preserves numbers', () => {
    expect(toSnakeCase('World War 2')).toBe('world_war_2');
  });

  it('handles all-symbol input', () => {
    expect(toSnakeCase('---')).toBe('');
  });

  it('handles empty string', () => {
    expect(toSnakeCase('')).toBe('');
  });
});

describe('countEvents', () => {
  it('counts a leaf event as 1', () => {
    const e = makeEvent('A', '2000');
    expect(countEvents(e)).toBe(1);
  });

  it('counts parent + children', () => {
    const e = makeEvent('P', '2000', '2010', [
      makeEvent('C1', '2001'),
      makeEvent('C2', '2002'),
    ]);
    expect(countEvents(e)).toBe(3);
  });

  it('counts deeply nested events', () => {
    const e = makeEvent('P', '2000', '2010', [
      makeEvent('C', '2001', '2005', [
        makeEvent('GC', '2002'),
      ]),
    ]);
    expect(countEvents(e)).toBe(3);
  });
});

describe('removeEvent', () => {
  it('removes event from top level', () => {
    const a = makeEvent('A', '2000');
    const b = makeEvent('B', '2001');
    const arr = [a, b];
    expect(removeEvent(arr, a)).toBe(true);
    expect(arr).toEqual([b]);
  });

  it('removes event from nested level', () => {
    const child = makeEvent('C', '2001');
    const parent = makeEvent('P', '2000', '2010', [child]);
    const arr = [parent];
    expect(removeEvent(arr, child)).toBe(true);
    expect(parent.nested).toEqual([]);
  });

  it('returns false when event not found', () => {
    const a = makeEvent('A', '2000');
    const b = makeEvent('B', '2001');
    expect(removeEvent([a], b)).toBe(false);
  });

  it('removes by reference, not by value', () => {
    const a = makeEvent('A', '2000');
    const aCopy = makeEvent('A', '2000');
    const arr = [a];
    expect(removeEvent(arr, aCopy)).toBe(false);
    expect(arr).toHaveLength(1);
  });
});

describe('findParent', () => {
  it('returns null for root-level event', () => {
    const a = makeEvent('A', '2000');
    expect(findParent([a], a)).toBeNull();
  });

  it('finds direct parent', () => {
    const child = makeEvent('C', '2001');
    const parent = makeEvent('P', '2000', '2010', [child]);
    expect(findParent([parent], child)).toBe(parent);
  });

  it('finds grandparent relationship', () => {
    const gc = makeEvent('GC', '2002');
    const child = makeEvent('C', '2001', '2005', [gc]);
    const parent = makeEvent('P', '2000', '2010', [child]);
    expect(findParent([parent], gc)).toBe(child);
  });

  it('returns null when event not in tree', () => {
    const a = makeEvent('A', '2000');
    const b = makeEvent('B', '2001');
    expect(findParent([a], b)).toBeNull();
  });
});

describe('collectDescendants', () => {
  it('returns empty set for leaf event', () => {
    const e = makeEvent('A', '2000');
    expect(collectDescendants(e).size).toBe(0);
  });

  it('collects direct children', () => {
    const c1 = makeEvent('C1', '2001');
    const c2 = makeEvent('C2', '2002');
    const parent = makeEvent('P', '2000', '2010', [c1, c2]);
    const desc = collectDescendants(parent);
    expect(desc.size).toBe(2);
    expect(desc.has(c1)).toBe(true);
    expect(desc.has(c2)).toBe(true);
  });

  it('does not include the event itself', () => {
    const child = makeEvent('C', '2001');
    const parent = makeEvent('P', '2000', '2010', [child]);
    const desc = collectDescendants(parent);
    expect(desc.has(parent)).toBe(false);
  });

  it('collects deeply nested descendants', () => {
    const gc = makeEvent('GC', '2002');
    const child = makeEvent('C', '2001', '2005', [gc]);
    const parent = makeEvent('P', '2000', '2010', [child]);
    const desc = collectDescendants(parent);
    expect(desc.size).toBe(2);
    expect(desc.has(gc)).toBe(true);
  });
});

describe('isDescendantOf', () => {
  it('returns true for same event', () => {
    const e = makeEvent('A', '2000');
    expect(isDescendantOf(e, e)).toBe(true);
  });

  it('returns true for direct child', () => {
    const child = makeEvent('C', '2001');
    const parent = makeEvent('P', '2000', '2010', [child]);
    expect(isDescendantOf(child, parent)).toBe(true);
  });

  it('returns true for deep descendant', () => {
    const gc = makeEvent('GC', '2002');
    const child = makeEvent('C', '2001', '2005', [gc]);
    const parent = makeEvent('P', '2000', '2010', [child]);
    expect(isDescendantOf(gc, parent)).toBe(true);
  });

  it('returns false for unrelated events', () => {
    const a = makeEvent('A', '2000');
    const b = makeEvent('B', '2001');
    expect(isDescendantOf(a, b)).toBe(false);
  });

  it('returns false for parent-of-ancestor', () => {
    const child = makeEvent('C', '2001');
    const parent = makeEvent('P', '2000', '2010', [child]);
    expect(isDescendantOf(parent, child)).toBe(false);
  });
});

describe('eventToPath / pathToEvent', () => {
  const gc = makeEvent('GC', '2002');
  const child = makeEvent('C', '2001', '2005', [gc]);
  const parent = makeEvent('P', '2000', '2010', [child]);
  const other = makeEvent('Other', '1990');
  const events = [parent, other];

  it('returns path for root event', () => {
    expect(eventToPath(parent, events)).toEqual(['P']);
  });

  it('returns path for nested event', () => {
    expect(eventToPath(child, events)).toEqual(['P', 'C']);
  });

  it('returns path for deeply nested event', () => {
    expect(eventToPath(gc, events)).toEqual(['P', 'C', 'GC']);
  });

  it('returns null for event not in tree', () => {
    const foreign = makeEvent('X', '3000');
    expect(eventToPath(foreign, events)).toBeNull();
  });

  it('resolves path back to root event', () => {
    expect(pathToEvent(['P'], events)).toBe(parent);
  });

  it('resolves path back to nested event', () => {
    expect(pathToEvent(['P', 'C'], events)).toBe(child);
  });

  it('resolves path back to deeply nested event', () => {
    expect(pathToEvent(['P', 'C', 'GC'], events)).toBe(gc);
  });

  it('returns null for invalid path', () => {
    expect(pathToEvent(['X', 'Y'], events)).toBeNull();
  });

  it('returns null for empty path', () => {
    expect(pathToEvent([], events)).toBeNull();
  });

  it('round-trips eventToPath → pathToEvent', () => {
    const path = eventToPath(gc, events);
    expect(path).not.toBeNull();
    expect(pathToEvent(path!, events)).toBe(gc);
  });
});
