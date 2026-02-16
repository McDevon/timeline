# Feature 09: Manual Event Reordering

## Goal

Allow users to drag events vertically to change their display order on the timeline. The reordered positions persist across page loads.

## Interaction

### Drag detection

Dragging in the events area starts as a pan. After **8px of movement**, the direction is evaluated:

- **Primarily horizontal** (`|dx| >= |dy|`): confirmed pan, locked for this drag
- **Primarily vertical** (`|dy| > |dx|`) and cursor hit an event: pivot to **reorder mode** — viewport restored to pre-drag snapshot, cursor changes to `ns-resize`

### During reorder

- **Ghost**: the dragged event is drawn at the cursor Y at 70% alpha with hover-highlight styling, rendered on top of everything
- **Dim placeholder**: the dragged event's layout slot is drawn at 30% alpha
- **Live preview**: layout is recomputed with the event at its target sort position; other events reflow instantly
- **Nested clamping**: for child events, the ghost Y is clamped to the parent container bounds

### Commit / cancel

- **Mouse up**: commits the new order
- **Escape**: cancels the drag, restores the original order

### Constraints

- Nested events can be reordered within their parent but cannot leave it
- All existing interactions (click, shift-click, double-click, collapse, pan, zoom) are unaffected

## How It Works

The layout engine separates two concerns:

1. **Overlap detection** — an overlap graph (per-level adjacency map) computed from time ranges. Independent of sort order, heights, or collapse state.
2. **Vertical placement** — processes events in the desired order, using the overlap graph to find conflicting neighbors and placing each event at the first available Y.

Overriding the sort order changes vertical placement priority without affecting overlap detection.

### EventOrderMap

```typescript
type EventOrderMap = Map<string, string[]>;
```

Maps a parent path key to an ordered array of child event names. Keys are JSON-stringified path arrays:
- `"[]"` for root level
- `'["Roman Empire"]'` for children of that container

Only levels where the user has manually reordered are stored. Unordered levels fall back to the default `startYear` sort.

### Sort integration

`placeLevel()` checks for a custom order for the current level. If found, events are sorted by their position in the custom order array. Events not in the custom order appear after explicitly ordered ones, sorted by `startYear`.

## Persistence

Event orders are stored in `SerializedState.eventOrders` as `Record<string, string[]>` (the Map serialized via `Object.fromEntries`). Only non-empty maps are persisted.

## Implementation

### `src/timeline/layout.ts`

- `OverlapGraph` type and `computeOverlaps()` — per-level adjacency map from time ranges
- `EventOrderMap` type export
- `sortByCustomOrder()` helper
- `placeLevel` refactored into four phases: size, overlaps, sort, place
- `computeLayout` accepts optional `eventOrders` and passes through to `placeLevel`

### `src/timeline/input.ts`

- `'reordering'` drag mode with direction-based detection
- `onReorderMove`, `onReorderEnd`, `onReorderCancel` callbacks
- Escape key handler for cancel
- Viewport snapshot and restore on pivot

### `src/timeline/renderer.ts`

- `ReorderState` interface: `{ draggedEvent, ghostY }`
- Module-level `currentDraggedEvent` for nested dim rendering
- Ghost drawn after main layout loop at 70% alpha with Y offset

### `src/main.ts`

- `eventOrders` map, restored from `loadState`
- `findSiblingInfo()`, `findSiblingLayoutItems()`, `findParentLayoutItem()` helpers
- `computeDropIndex()` — row-group-based, skips same-Y items as a group
- Reorder callbacks: `onReorderMove` (rebuilds order from visual positions), `onReorderEnd`, `onReorderCancel`

### `src/state.ts`

- `eventOrders` added to `saveState`/`loadState`

## Edge Cases

| Case | Behavior |
|------|----------|
| Drag on empty space | Normal pan (no reorder item) |
| Drag on event, mostly horizontal | Normal pan (direction locked after 8px) |
| Drag child event | Reorder within parent; ghost Y clamped to parent bounds |
| Drag collapsed container | Reorders among siblings normally |
| New events in data not in saved order | Appear after explicitly ordered ones, sorted by startYear |
| Event renamed/removed from data | Stale name in order array silently skipped |
| Escape during drag | Cancel, restore original order |
