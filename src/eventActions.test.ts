import { describe, it, expect } from 'vitest';
import {
  toSnakeCase,
  countEvents,
  removeEvent,
  findParent,
  collectDescendants,
  isDescendantOf,
  getSiblings,
  uniqueSiblingName,
  deduplicateSiblingNames,
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

describe('getSiblings', () => {
  it('returns top-level array for root event', () => {
    const a = makeEvent('A', '2000');
    const b = makeEvent('B', '2001');
    const all = [a, b];
    expect(getSiblings(a, all)).toBe(all);
  });

  it('returns parent nested array for nested event', () => {
    const child = makeEvent('C', '2001');
    const parent = makeEvent('P', '2000', '2010', [child]);
    expect(getSiblings(child, [parent])).toBe(parent.nested);
  });

  it('returns nested array for deeply nested event', () => {
    const gc = makeEvent('GC', '2002');
    const child = makeEvent('C', '2001', '2005', [gc]);
    const parent = makeEvent('P', '2000', '2010', [child]);
    expect(getSiblings(gc, [parent])).toBe(child.nested);
  });
});

describe('uniqueSiblingName', () => {
  it('returns name unchanged when no collision', () => {
    const siblings = [makeEvent('A', '2000'), makeEvent('B', '2001')];
    expect(uniqueSiblingName('C', siblings)).toBe('C');
  });

  it('appends (2) on first collision', () => {
    const siblings = [makeEvent('A', '2000'), makeEvent('B', '2001')];
    expect(uniqueSiblingName('A', siblings)).toBe('A (2)');
  });

  it('increments counter when (2) is also taken', () => {
    const siblings = [
      makeEvent('A', '2000'),
      makeEvent('A (2)', '2001'),
    ];
    expect(uniqueSiblingName('A', siblings)).toBe('A (3)');
  });

  it('skips gaps in counter', () => {
    const siblings = [
      makeEvent('A', '2000'),
      makeEvent('A (2)', '2001'),
      makeEvent('A (4)', '2002'),
    ];
    expect(uniqueSiblingName('A', siblings)).toBe('A (3)');
  });

  it('excludes a specific event from the check', () => {
    const a = makeEvent('A', '2000');
    const b = makeEvent('B', '2001');
    const siblings = [a, b];
    // Renaming 'a' to 'A' should be fine since we exclude 'a' itself
    expect(uniqueSiblingName('A', siblings, a)).toBe('A');
  });

  it('excludes event but still detects other collisions', () => {
    const a = makeEvent('A', '2000');
    const b = makeEvent('B', '2001');
    const siblings = [a, b];
    // Renaming 'a' to 'B' collides with 'b'
    expect(uniqueSiblingName('B', siblings, a)).toBe('B (2)');
  });

  it('handles empty siblings list', () => {
    expect(uniqueSiblingName('A', [])).toBe('A');
  });
});

describe('deduplicateSiblingNames', () => {
  it('does nothing when no duplicates', () => {
    const list = [makeEvent('A', '2000'), makeEvent('B', '2001')];
    deduplicateSiblingNames(list);
    expect(list.map(e => e.name)).toEqual(['A', 'B']);
  });

  it('suffixes duplicate sibling names', () => {
    const list = [
      makeEvent('A', '2000'),
      makeEvent('A', '2001'),
    ];
    deduplicateSiblingNames(list);
    expect(list[0].name).toBe('A');
    expect(list[1].name).toBe('A (2)');
  });

  it('handles three-way duplicates', () => {
    const list = [
      makeEvent('A', '2000'),
      makeEvent('A', '2001'),
      makeEvent('A', '2002'),
    ];
    deduplicateSiblingNames(list);
    expect(list.map(e => e.name)).toEqual(['A', 'A (2)', 'A (3)']);
  });

  it('fixes duplicates in nested events', () => {
    const list = [
      makeEvent('P', '2000', '2010', [
        makeEvent('C', '2001'),
        makeEvent('C', '2002'),
      ]),
    ];
    deduplicateSiblingNames(list);
    expect(list[0].nested![0].name).toBe('C');
    expect(list[0].nested![1].name).toBe('C (2)');
  });

  it('allows same name in different parents', () => {
    const list = [
      makeEvent('P1', '2000', '2010', [makeEvent('Child', '2001')]),
      makeEvent('P2', '2000', '2010', [makeEvent('Child', '2001')]),
    ];
    deduplicateSiblingNames(list);
    // Same name under different parents is fine
    expect(list[0].nested![0].name).toBe('Child');
    expect(list[1].nested![0].name).toBe('Child');
  });
});
