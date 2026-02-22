# Feature 08: State Persistence

## Goal

Persist the timeline's view state to `localStorage` so that the page restores its position, selection, hidden events, and collapsed events across browser visits.

## What's Persisted

- **Viewport** (start/end decimal years)
- **Selection** (start, end, anchor) or null
- **Hidden events** (from event list panel toggles)
- **Collapsed events** (from ctrl/cmd+click collapse)
- **Event orders** (from drag-and-drop reordering, see Feature 09)

## Event Identification

Events lack stable IDs, so they're identified by **name paths** — arrays of event names from the tree root to the target. For example, `["Holy Roman Empire", "Otto I"]` identifies a nested event.

This approach is resilient to:
- Reordering events in the JSON data
- Adding new events (existing paths still resolve)

When paths fail to resolve (e.g., event renamed or removed), they're silently ignored and the state is partially restored.

## Schema

```typescript
interface SerializedState {
  version: 1;
  viewport: { start: number; end: number };
  selection: { start: number; end: number; anchor: number } | null;
  hiddenEventPaths: string[][];
  collapsedEventPaths: string[][];
  eventOrders?: Record<string, string[]>;
}
```

The `version` field allows future schema evolution.

## Implementation

### New file: `src/state.ts`

- `eventToPath()` — walks the event tree to build a name path from root to target
- `pathToEvent()` — resolves a name path back to an event reference
- `saveState(slug, ...)` — serializes state to `localStorage` key `timeline-state` (or `timeline-state-{slug}` for path-based timelines — see Feature 15)
- `loadState(slug, ...)` — deserializes and resolves paths; returns null on missing/invalid data

### `src/main.ts` integration

**On startup** (after loading events, before first layout):
- Call `loadState()` to restore hidden/collapsed sets, viewport, and selection
- Pass initial `hiddenEvents` to `EventListPanel` constructor for correct row state

**Debounced save**:
- `scheduleSave()` debounces localStorage writes by 500ms
- Called inside `requestRedraw()`, which all state changes flow through
- Prevents excessive writes during continuous interactions (drag, zoom)

### `src/ui/eventList.ts`

Constructor accepts optional `hiddenEvents: Set<TimelineEvent>` to initialize row visibility state correctly on page load.

## Edge Cases

| Case | Behavior |
|------|----------|
| No saved state | Fall back to `computeFullRange()` viewport, no selection |
| Version mismatch | Return null, start fresh |
| Event data changed | Unresolvable paths silently ignored |
| localStorage full | `saveState` catches and ignores the error |
| localStorage unavailable | `saveState`/`loadState` catch and handle gracefully |
