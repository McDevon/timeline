import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UndoManager, UndoableState, captureSnapshot, resolvePathSet } from './undo';
import { TimelineEvent } from './types';

function makeEvent(name: string, start: string, end?: string, nested?: TimelineEvent[]): TimelineEvent {
  const e: TimelineEvent = { name, start };
  if (end) e.end = end;
  if (nested) e.nested = nested;
  return e;
}

function makeSnapshot(label: string): UndoableState {
  return {
    events: [makeEvent(label, '2000')],
    hiddenPaths: [],
    collapsedPaths: [],
    collapseAllSavedPaths: null,
    eventOrders: new Map(),
  };
}

describe('UndoManager', () => {
  let um: UndoManager;

  beforeEach(() => {
    vi.useFakeTimers();
    um = new UndoManager();
    um.init(makeSnapshot('init'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with canUndo false and canRedo false', () => {
    expect(um.canUndo()).toBe(false);
    expect(um.canRedo()).toBe(false);
  });

  it('push enables undo', () => {
    um.push(makeSnapshot('A'));
    expect(um.canUndo()).toBe(true);
    expect(um.canRedo()).toBe(false);
  });

  it('undo returns previous snapshot', () => {
    um.push(makeSnapshot('A'));
    um.push(makeSnapshot('B'));
    const result = um.undo()!;
    expect(result.events[0].name).toBe('A');
  });

  it('redo returns next snapshot', () => {
    um.push(makeSnapshot('A'));
    um.push(makeSnapshot('B'));
    um.undo();
    const result = um.redo()!;
    expect(result.events[0].name).toBe('B');
  });

  it('undo at bottom returns null', () => {
    expect(um.undo()).toBeNull();
  });

  it('redo at top returns null', () => {
    um.push(makeSnapshot('A'));
    expect(um.redo()).toBeNull();
  });

  it('push after undo discards redo history', () => {
    um.push(makeSnapshot('A'));
    um.push(makeSnapshot('B'));
    um.push(makeSnapshot('C'));
    um.undo(); // at B
    um.undo(); // at A
    um.push(makeSnapshot('D'));
    expect(um.canRedo()).toBe(false);
    expect(um.redo()).toBeNull();
  });

  it('caps stack at 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      um.push(makeSnapshot(`s${i}`));
    }
    // Should be able to undo 49 times (50 entries, index at 49)
    let count = 0;
    while (um.undo() !== null) count++;
    expect(count).toBe(49);
  });

  it('canUndo/canRedo track correctly through push/undo/redo', () => {
    um.push(makeSnapshot('A'));
    um.push(makeSnapshot('B'));

    expect(um.canUndo()).toBe(true);
    expect(um.canRedo()).toBe(false);

    um.undo();
    expect(um.canUndo()).toBe(true);
    expect(um.canRedo()).toBe(true);

    um.undo();
    expect(um.canUndo()).toBe(false);
    expect(um.canRedo()).toBe(true);

    um.redo();
    expect(um.canUndo()).toBe(true);
    expect(um.canRedo()).toBe(true);
  });

  describe('coalescing', () => {
    it('same tag within timer produces one undo entry', () => {
      um.pushCoalesced('tag', makeSnapshot('A'));
      um.pushCoalesced('tag', makeSnapshot('B'));
      vi.advanceTimersByTime(800);

      // Only one undo step back to init
      const result = um.undo()!;
      expect(result.events[0].name).toBe('init');
      expect(um.undo()).toBeNull();
    });

    it('different tags produce two entries', () => {
      um.pushCoalesced('tag1', makeSnapshot('A'));
      um.pushCoalesced('tag2', makeSnapshot('B'));
      vi.advanceTimersByTime(800);

      const b = um.undo()!;
      expect(b.events[0].name).toBe('A');
      const a = um.undo()!;
      expect(a.events[0].name).toBe('init');
    });

    it('timer expiry commits and starts new entry', () => {
      um.pushCoalesced('tag', makeSnapshot('A'));
      vi.advanceTimersByTime(800);
      um.pushCoalesced('tag', makeSnapshot('B'));
      vi.advanceTimersByTime(800);

      // Two undo steps
      const b = um.undo()!;
      expect(b.events[0].name).toBe('A');
      const a = um.undo()!;
      expect(a.events[0].name).toBe('init');
    });

    it('push() commits pending coalesced first', () => {
      um.pushCoalesced('tag', makeSnapshot('A'));
      um.push(makeSnapshot('B'));

      // Two undo steps: B → A → init
      const fromB = um.undo()!;
      expect(fromB.events[0].name).toBe('A');
      const fromA = um.undo()!;
      expect(fromA.events[0].name).toBe('init');
    });

    it('canUndo is true with pending coalesced snapshot', () => {
      um.pushCoalesced('tag', makeSnapshot('A'));
      expect(um.canUndo()).toBe(true);
    });

    it('canRedo is false with pending coalesced snapshot', () => {
      um.push(makeSnapshot('A'));
      um.push(makeSnapshot('B'));
      um.undo();
      // Now canRedo would be true, but pushCoalesced makes it false
      um.pushCoalesced('tag', makeSnapshot('C'));
      expect(um.canRedo()).toBe(false);
    });
  });
});

describe('captureSnapshot', () => {
  it('deep-clones events', () => {
    const events = [makeEvent('A', '2000')];
    const snap = captureSnapshot(events, new Set(), new Set(), new Map(), null);
    events[0].name = 'mutated';
    expect(snap.events[0].name).toBe('A');
  });

  it('converts hidden events to paths', () => {
    const child = makeEvent('Child', '1900');
    const parent = makeEvent('Parent', '1800', '2000', [child]);
    const events = [parent];
    const hidden = new Set([child]);
    const snap = captureSnapshot(events, hidden, new Set(), new Map(), null);
    expect(snap.hiddenPaths).toEqual([['Parent', 'Child']]);
  });

  it('converts collapsed events to paths', () => {
    const child = makeEvent('Child', '1900');
    const parent = makeEvent('Parent', '1800', '2000', [child]);
    const events = [parent];
    const collapsed = new Set([parent]);
    const snap = captureSnapshot(events, new Set(), collapsed, new Map(), null);
    expect(snap.collapsedPaths).toEqual([['Parent']]);
  });

  it('deep-clones event orders', () => {
    const orders = new Map([['key', ['A', 'B']]]);
    const snap = captureSnapshot([makeEvent('A', '2000')], new Set(), new Set(), orders, null);
    orders.get('key')!.push('C');
    expect(snap.eventOrders.get('key')).toEqual(['A', 'B']);
  });

  it('stores collapseAllSavedPaths as null when not in collapse-all mode', () => {
    const events = [makeEvent('A', '2000')];
    const snap = captureSnapshot(events, new Set(), new Set(), new Map(), null);
    expect(snap.collapseAllSavedPaths).toBeNull();
  });

  it('converts collapseAllSaved events to paths', () => {
    const child = makeEvent('Child', '1900');
    const parent = makeEvent('Parent', '1800', '2000', [child]);
    const events = [parent];
    const collapseAllSaved = new Set([parent]);
    const snap = captureSnapshot(events, new Set(), new Set([parent]), new Map(), collapseAllSaved);
    expect(snap.collapseAllSavedPaths).toEqual([['Parent']]);
  });

  it('round-trips collapseAllSaved through snapshot and resolve', () => {
    const a = makeEvent('A', '2000', '2010');
    const b = makeEvent('B', '2005', '2015');
    const events = [a, b];
    const collapseAllSaved = new Set([a, b]);
    const snap = captureSnapshot(events, new Set(), new Set([a, b]), new Map(), collapseAllSaved);

    // Simulate undo: resolve paths against fresh (cloned) events
    const restored = resolvePathSet(snap.collapseAllSavedPaths!, snap.events);
    expect(restored.size).toBe(2);
    expect(snap.events.filter(e => restored.has(e)).map(e => e.name).sort()).toEqual(['A', 'B']);
  });
});

describe('resolvePathSet', () => {
  const child = makeEvent('Child', '1900');
  const parent = makeEvent('Parent', '1800', '2000', [child]);
  const events = [parent];

  it('resolves valid paths to event references', () => {
    const set = resolvePathSet([['Parent'], ['Parent', 'Child']], events);
    expect(set.has(parent)).toBe(true);
    expect(set.has(child)).toBe(true);
    expect(set.size).toBe(2);
  });

  it('skips unresolvable paths', () => {
    const set = resolvePathSet([['Parent'], ['NoSuch']], events);
    expect(set.size).toBe(1);
    expect(set.has(parent)).toBe(true);
  });

  it('returns empty set for empty paths', () => {
    const set = resolvePathSet([], events);
    expect(set.size).toBe(0);
  });
});
