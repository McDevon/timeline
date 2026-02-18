import { TimelineEvent, TimelineSelection } from './types';
import { Viewport } from './timeline/viewport';

type EventPath = string[];

interface SerializedState {
  version: 1;
  viewport: { start: number; end: number };
  selection: { start: number; end: number; anchor: number } | null;
  hiddenEventPaths: EventPath[];
  collapsedEventPaths: EventPath[];
  eventOrders?: Record<string, string[]>;
  showTodayLine?: boolean;
}

const STORAGE_KEY = 'timeline-state';

/** Walk the event tree to build a name path from root to target. */
export function eventToPath(target: TimelineEvent, events: TimelineEvent[]): EventPath | null {
  function walk(list: TimelineEvent[], path: string[]): EventPath | null {
    for (const e of list) {
      if (e === target) return [...path, e.name];
      if (e.nested) {
        const found = walk(e.nested, [...path, e.name]);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(events, []);
}

/** Resolve a name path back to an event reference. Returns null if any step fails. */
export function pathToEvent(path: EventPath, events: TimelineEvent[]): TimelineEvent | null {
  let current = events;
  for (let i = 0; i < path.length; i++) {
    const found = current.find(e => e.name === path[i]);
    if (!found) return null;
    if (i === path.length - 1) return found;
    current = found.nested ?? [];
  }
  return null;
}

export function saveState(
  viewport: Viewport,
  selection: TimelineSelection | null,
  hiddenEvents: Set<TimelineEvent>,
  collapsedEvents: Set<TimelineEvent>,
  allEvents: TimelineEvent[],
  eventOrders?: Map<string, string[]>,
  showTodayLine?: boolean,
): void {
  const hiddenEventPaths: EventPath[] = [];
  for (const e of hiddenEvents) {
    const path = eventToPath(e, allEvents);
    if (path) hiddenEventPaths.push(path);
  }

  const collapsedEventPaths: EventPath[] = [];
  for (const e of collapsedEvents) {
    const path = eventToPath(e, allEvents);
    if (path) collapsedEventPaths.push(path);
  }

  const serializedOrders: Record<string, string[]> | undefined =
    eventOrders && eventOrders.size > 0
      ? Object.fromEntries(eventOrders)
      : undefined;

  const state: SerializedState = {
    version: 1,
    viewport: { start: viewport.start, end: viewport.end },
    selection,
    hiddenEventPaths,
    collapsedEventPaths,
    eventOrders: serializedOrders,
    showTodayLine,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function loadState(
  allEvents: TimelineEvent[],
): {
  viewport: Viewport;
  selection: TimelineSelection | null;
  hiddenEvents: Set<TimelineEvent>;
  collapsedEvents: Set<TimelineEvent>;
  eventOrders: Map<string, string[]>;
  showTodayLine: boolean;
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const state: SerializedState = JSON.parse(raw);
    if (state.version !== 1) return null;

    const hiddenEvents = new Set<TimelineEvent>();
    for (const path of state.hiddenEventPaths) {
      const event = pathToEvent(path, allEvents);
      if (event) hiddenEvents.add(event);
    }

    const collapsedEvents = new Set<TimelineEvent>();
    for (const path of state.collapsedEventPaths) {
      const event = pathToEvent(path, allEvents);
      if (event) collapsedEvents.add(event);
    }

    const eventOrders = new Map<string, string[]>();
    if (state.eventOrders) {
      for (const [key, order] of Object.entries(state.eventOrders)) {
        eventOrders.set(key, order);
      }
    }

    return {
      viewport: { start: state.viewport.start, end: state.viewport.end },
      selection: state.selection,
      hiddenEvents,
      collapsedEvents,
      eventOrders,
      showTodayLine: state.showTodayLine ?? true,
    };
  } catch {
    return null;
  }
}
