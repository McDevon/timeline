import { TimelineEvent } from './types';
import { eventToPath, pathToEvent } from './state';

export interface UndoableState {
  events: TimelineEvent[];
  hiddenPaths: string[][];
  collapsedPaths: string[][];
  eventOrders: Map<string, string[]>;
}

const MAX_STACK_SIZE = 50;
const COALESCE_DELAY_MS = 800;

export class UndoManager {
  private stack: UndoableState[] = [];
  private index = -1;

  private coalesceTimer = 0;
  private coalesceTag: string | null = null;
  private pendingSnapshot: UndoableState | null = null;

  /** Set the initial state (index 0). Called once at startup. */
  init(snapshot: UndoableState): void {
    this.stack = [snapshot];
    this.index = 0;
    this.clearCoalesce();
  }

  /** Push a discrete snapshot, discarding any redo history. */
  push(snapshot: UndoableState): void {
    this.commitCoalesce();
    this.pushInternal(snapshot);
  }

  /**
   * Push a coalesced snapshot. Multiple calls with the same tag within
   * COALESCE_DELAY_MS replace the pending snapshot instead of pushing
   * new entries. The pending snapshot is committed when:
   * - The coalesce timer fires
   * - A different tag arrives
   * - A discrete push() call arrives
   * - undo()/redo() is called
   */
  pushCoalesced(tag: string, snapshot: UndoableState): void {
    if (this.coalesceTag !== tag) {
      this.commitCoalesce();
      this.coalesceTag = tag;
    }

    this.pendingSnapshot = snapshot;

    clearTimeout(this.coalesceTimer);
    this.coalesceTimer = window.setTimeout(() => {
      this.commitCoalesce();
    }, COALESCE_DELAY_MS);
  }

  undo(): UndoableState | null {
    this.commitCoalesce();
    if (this.index <= 0) return null;
    this.index--;
    return this.stack[this.index];
  }

  redo(): UndoableState | null {
    this.commitCoalesce();
    if (this.index >= this.stack.length - 1) return null;
    this.index++;
    return this.stack[this.index];
  }

  canUndo(): boolean {
    return this.index > 0 || this.pendingSnapshot !== null;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1 && this.pendingSnapshot === null;
  }

  private pushInternal(snapshot: UndoableState): void {
    this.stack.length = this.index + 1;
    this.stack.push(snapshot);
    this.index++;
    if (this.stack.length > MAX_STACK_SIZE) {
      this.stack.shift();
      this.index--;
    }
  }

  private commitCoalesce(): void {
    clearTimeout(this.coalesceTimer);
    if (this.pendingSnapshot !== null) {
      this.pushInternal(this.pendingSnapshot);
      this.pendingSnapshot = null;
    }
    this.coalesceTag = null;
  }

  private clearCoalesce(): void {
    clearTimeout(this.coalesceTimer);
    this.pendingSnapshot = null;
    this.coalesceTag = null;
  }
}

// --- Stable event identity for coalesce tags ---

let nextEventId = 0;
const eventIds = new WeakMap<TimelineEvent, number>();

export function getEventId(event: TimelineEvent): number {
  let id = eventIds.get(event);
  if (id === undefined) {
    id = nextEventId++;
    eventIds.set(event, id);
  }
  return id;
}

// --- Snapshot capture ---

export function captureSnapshot(
  events: TimelineEvent[],
  hiddenEvents: Set<TimelineEvent>,
  collapsedEvents: Set<TimelineEvent>,
  eventOrders: Map<string, string[]>,
): UndoableState {
  const hiddenPaths: string[][] = [];
  for (const e of hiddenEvents) {
    const path = eventToPath(e, events);
    if (path) hiddenPaths.push(path);
  }

  const collapsedPaths: string[][] = [];
  for (const e of collapsedEvents) {
    const path = eventToPath(e, events);
    if (path) collapsedPaths.push(path);
  }

  const clonedOrders = new Map<string, string[]>();
  for (const [k, v] of eventOrders) {
    clonedOrders.set(k, [...v]);
  }

  return {
    events: structuredClone(events),
    hiddenPaths,
    collapsedPaths,
    eventOrders: clonedOrders,
  };
}

/** Resolve a snapshot's hidden/collapsed paths against an events tree. */
export function resolvePathSet(
  paths: string[][],
  events: TimelineEvent[],
): Set<TimelineEvent> {
  const set = new Set<TimelineEvent>();
  for (const path of paths) {
    const event = pathToEvent(path, events);
    if (event) set.add(event);
  }
  return set;
}
