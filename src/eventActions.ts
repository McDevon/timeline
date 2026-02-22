import { TimelineEvent } from './types';

export function toSnakeCase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function countEvents(event: TimelineEvent): number {
  let n = 1;
  if (event.nested) for (const child of event.nested) n += countEvents(child);
  return n;
}

export function removeEvent(arr: TimelineEvent[], target: TimelineEvent): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === target) {
      arr.splice(i, 1);
      return true;
    }
    if (arr[i].nested && removeEvent(arr[i].nested!, target)) {
      return true;
    }
  }
  return false;
}

export function findParent(list: TimelineEvent[], target: TimelineEvent): TimelineEvent | null {
  for (const e of list) {
    if (e.nested?.includes(target)) return e;
    if (e.nested) {
      const found = findParent(e.nested, target);
      if (found) return found;
    }
  }
  return null;
}

export function collectDescendants(event: TimelineEvent): Set<TimelineEvent> {
  const result = new Set<TimelineEvent>();
  function walk(list: TimelineEvent[]) {
    for (const e of list) {
      result.add(e);
      if (e.nested) walk(e.nested);
    }
  }
  if (event.nested) walk(event.nested);
  return result;
}

/** Check if an event is a descendant of (or equal to) an ancestor event. */
export function isDescendantOf(event: TimelineEvent, ancestor: TimelineEvent): boolean {
  if (event === ancestor) return true;
  if (!ancestor.nested) return false;
  for (const child of ancestor.nested) {
    if (event === child) return true;
    if (child.nested && isDescendantOf(event, child)) return true;
  }
  return false;
}

/** Get the sibling array containing this event (the parent's nested array, or top-level). */
export function getSiblings(event: TimelineEvent, allEvents: TimelineEvent[]): TimelineEvent[] {
  const parent = findParent(allEvents, event);
  return parent?.nested ?? allEvents;
}

/** Return baseName if unique among siblings, otherwise append " (2)", " (3)", etc.
 *  `exclude` is the event being renamed (skip it in the uniqueness check). */
export function uniqueSiblingName(baseName: string, siblings: TimelineEvent[], exclude?: TimelineEvent): string {
  const siblingNames = new Set(
    siblings.filter(e => e !== exclude).map(e => e.name),
  );
  if (!siblingNames.has(baseName)) return baseName;
  let counter = 2;
  while (siblingNames.has(`${baseName} (${counter})`)) counter++;
  return `${baseName} (${counter})`;
}

/** Recursively ensure no two siblings share a name. Mutates in place. */
export function deduplicateSiblingNames(list: TimelineEvent[]): void {
  const seen = new Set<string>();
  for (const e of list) {
    if (seen.has(e.name)) {
      e.name = uniqueSiblingName(e.name, list, e);
    }
    seen.add(e.name);
    if (e.nested) deduplicateSiblingNames(e.nested);
  }
}
