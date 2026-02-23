import { describe, it, expect } from 'vitest';
import { eventToPath, pathToEvent } from './state';
import { TimelineEvent } from './types';

function makeEvent(name: string, start: string, end?: string, nested?: TimelineEvent[]): TimelineEvent {
  const e: TimelineEvent = { name, start };
  if (end) e.end = end;
  if (nested) e.nested = nested;
  return e;
}

const child = makeEvent('Child', '1900', '1950');
const parent = makeEvent('Parent', '1800', '2000', [child]);
const grandchild = makeEvent('Grandchild', '1920', '1930');
const mid = makeEvent('Mid', '1900', '1960', [grandchild]);
const root = makeEvent('Root', '1800', '2000', [mid]);
const solo = makeEvent('Solo', '1500');

const events: TimelineEvent[] = [parent, root, solo];

describe('eventToPath', () => {
  it('finds a root event', () => {
    expect(eventToPath(solo, events)).toEqual(['Solo']);
  });

  it('finds a nested event', () => {
    expect(eventToPath(child, events)).toEqual(['Parent', 'Child']);
  });

  it('finds a deeply nested event', () => {
    expect(eventToPath(grandchild, events)).toEqual(['Root', 'Mid', 'Grandchild']);
  });

  it('returns null for event not in tree', () => {
    const orphan = makeEvent('Orphan', '1000');
    expect(eventToPath(orphan, events)).toBeNull();
  });

  it('returns null for empty events array', () => {
    expect(eventToPath(solo, [])).toBeNull();
  });
});

describe('pathToEvent', () => {
  it('resolves a root path', () => {
    expect(pathToEvent(['Solo'], events)).toBe(solo);
  });

  it('resolves a nested path', () => {
    expect(pathToEvent(['Parent', 'Child'], events)).toBe(child);
  });

  it('resolves a deeply nested path', () => {
    expect(pathToEvent(['Root', 'Mid', 'Grandchild'], events)).toBe(grandchild);
  });

  it('returns null for non-existent root name', () => {
    expect(pathToEvent(['NoSuch'], events)).toBeNull();
  });

  it('returns null for non-existent nested name', () => {
    expect(pathToEvent(['Parent', 'NoSuch'], events)).toBeNull();
  });

  it('returns null for empty path', () => {
    expect(pathToEvent([], events)).toBeNull();
  });

  it('returns null when path is deeper than tree', () => {
    expect(pathToEvent(['Solo', 'Extra'], events)).toBeNull();
  });
});

describe('eventToPath / pathToEvent round-trip', () => {
  it('round-trips a root event', () => {
    const path = eventToPath(solo, events)!;
    expect(pathToEvent(path, events)).toBe(solo);
  });

  it('round-trips a nested event', () => {
    const path = eventToPath(child, events)!;
    expect(pathToEvent(path, events)).toBe(child);
  });

  it('round-trips a deeply nested event', () => {
    const path = eventToPath(grandchild, events)!;
    expect(pathToEvent(path, events)).toBe(grandchild);
  });

  it('distinguishes same name at different depths', () => {
    const nestedX = makeEvent('X', '1900');
    const containerA = makeEvent('A', '1800', '2000', [nestedX]);
    const rootX = makeEvent('X', '1700');
    const tree = [containerA, rootX];

    const rootPath = eventToPath(rootX, tree)!;
    const nestedPath = eventToPath(nestedX, tree)!;

    expect(rootPath).toEqual(['X']);
    expect(nestedPath).toEqual(['A', 'X']);
    expect(pathToEvent(rootPath, tree)).toBe(rootX);
    expect(pathToEvent(nestedPath, tree)).toBe(nestedX);
  });
});
