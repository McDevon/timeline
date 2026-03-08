# Feature 16: Sketch Mode

## Goal

Allow users to move and resize events directly on the canvas by dragging, providing quick visual positioning without opening the event menu.

## Configuration

Sketch mode is a toggle, off by default. Per-timeline default can be set in `timelines.json`:

```json
{
  "my-timeline": {
    "data": "/events.json",
    "sketchMode": true
  }
}
```

The toggle state persists in `localStorage` via the existing state persistence system.

## Interaction

### Toggle

A "Sketch mode" checkbox in the timeline menu (after "Show today indicator"). When off, all behavior is identical to before this feature.

**Keyboard shortcut**: Press `S` to toggle sketch mode. The shortcut is disabled until sketch mode has been enabled at least once from the menu, preventing users from accidentally discovering and activating the feature. If sketch mode is on at startup (via config or saved state), the shortcut is enabled immediately.

### Drag detection

Reuses the existing 8px undecided threshold:

- **Primarily vertical** (`|dy| > |dx|`) and cursor hit an event: **reorder** (unchanged)
- **Primarily horizontal** (`|dx| >= |dy|`) and cursor hit an event:
  - Sketch mode **on**: **sketch-moving** or **sketch-resizing** (based on edge detection)
  - Sketch mode **off**: **panning** (unchanged)
- Cursor on empty space: **panning** (unchanged)

### Edge detection

On mousedown, if sketch mode is on and cursor hits an event, the edge is detected:

- Within 6px of left edge → `start` (resize candidate)
- Within 6px of right edge → `end` (resize candidate)
- Elsewhere on event body → `body` (move candidate)
- Point events → always `body` (cannot resize)
- Ongoing events → end edge returns `body` (cannot resize the ongoing end)

### Moving events

Dragging the body of an event horizontally moves it:

- Start and end dates shift by the same delta
- Container events: all children shift by the same delta
- Snapping applies to whichever edge (start or end) is nearer to a snap target; both edges shift by the snap correction
- Ctrl/Cmd bypasses snapping (existing modifier)

### Resizing events

Dragging from an event edge resizes it:

- Only the dragged edge moves; the opposite edge stays fixed
- **Alt/Option modifier**: both edges move symmetrically around the center
- Snapping applies to the dragged edge
- The range is clamped so start never exceeds end (minimum zero duration)

### Visual feedback

- Cursor changes: `ew-resize` when hovering near edges, `grab`/`grabbing` on body
- During drag, the event renders at its new position (layout recomputed live)

### Sketch layout mode

During a sketch drag, a separate layout mode is used:

- **Dragged event**: pinned rigidly at its original row (never moves vertically during drag)
- **Other events**: stay at their pre-drag Y positions via "sketch hints" passed to the layout engine. If an event's saved position now conflicts with the pinned event (due to new time overlap), it flows to the next available gap below.
- **Returning**: when the dragged event moves away, previously displaced events snap back to their saved positions
- **On release**: the normal layout runs (no hints), and events smoothly animate to their final positions via the layout transition system

This prevents the dragged event from jumping rows and keeps other events stable unless they physically must move.

### Commit / cancel

- **Mouse up**: commits the new dates, creates an undo snapshot. Events animate to their natural layout positions.
- **Escape**: cancels the drag, restores all original dates (including children). Events animate back.

## How It Works

### Date precision preservation

A `shiftIsoDate(iso, deltaYears)` utility shifts dates while preserving the precision of the original ISO string (year-only, year-month, or full date).

### Layout priority and sketch hints

During sketch drag, the layout engine receives:

- `priorityEvent` — the dragged event, processed first in packing
- `pinnedY` — the absolute Y where the dragged event must stay
- `sketchHints` — a map of all events to their pre-drag absolute Y positions

The pinned event is placed unconditionally at its fixed row. Other events try their hinted Y first; if it conflicts with an already-placed item, they fall back to normal gap-filling placement (`findMinYPacked`). Events are processed from top to bottom (by hinted Y) so higher events get priority to keep their positions.

### Snap target exclusion

The dragged event's edges are excluded from snap targets during the drag to prevent self-snapping.

### Cancel mechanism

On drag start, a `Map<TimelineEvent, { start, end }>` captures the original dates of the dragged event and all its descendants. On cancel (Escape), dates are restored from this map — preserving object references so that Sets (`hiddenEvents`, `collapsedEvents`) and Maps (`eventOrders`) remain valid.

## Implementation

### `src/data/time.ts`

- `shiftIsoDate(iso, deltaYears)` — precision-preserving date shift

### `src/timeline-config.ts`

- `sketchMode?: boolean` added to `TimelineConfig` and `TimelineEntry`

### `src/state.ts`

- `sketchMode` added to `PersistableState` and `SerializedState`

### `src/ui/timelineMenu.ts`

- `onToggleSketchMode` callback added
- Checkbox menu item
- `setSketchMode(enabled)` method for syncing checkbox from keyboard shortcut

### `src/timeline/layout.ts`

- `priorityEvent` parameter on `computeLayout()` and `placeLevel()`
- `pinnedY` / `pinnedRelativeY` — unconditional Y for the priority event
- `sketchHints` — preferred Y positions for all events; tried first, falling back to normal packing on conflict
- `findYWithHint()` — checks if a hinted Y fits, falls back to `findMinYPacked`

### `src/timeline/snap.ts`

- `excludeEvent` parameter on `collectSnapTargets()`

### `src/timeline/input.ts`

- `detectEdge()` helper
- `'sketch-moving'` and `'sketch-resizing'` drag modes
- Sketch-aware cursor management
- `getSketchMode`, `onSketchMove`, `onSketchEnd`, `onSketchCancel` callbacks

### `src/main.ts`

- `sketchModeUnlocked` — gates the `S` keyboard shortcut until first menu activation
- `sketchSavedPositions` — captures all events' Y positions at drag start for sketch hints
- `onSketchMove` — mutates dates, shifts children for container moves, relayouts with pinned Y and sketch hints
- `onSketchEnd` — clears hints, relayouts normally, animates transition, commits with undo
- `onSketchCancel` — restores dates from map, relayouts normally, animates transition

## Edge Cases

| Case | Behavior |
|------|----------|
| Drag on empty space | Normal pan (no event hit) |
| Drag on event, mostly horizontal, sketch off | Normal pan |
| Move a container | All children shift by same delta |
| Resize a container | Children stay at absolute dates; overflow renders normally |
| Move/resize point event | Move only (no edges to resize) |
| Resize ongoing event | Start edge only; end edge is not draggable |
| Alt+resize | Symmetric resize from both ends |
| Ctrl/Cmd during sketch drag | Bypasses snapping |
| Escape during drag | Cancel, restore all original dates |
| Dragged event overlaps neighbors | Neighbors stay unless forced to move; displaced events flow below |
| Neighbors return after conflict resolves | They snap back to their saved positions |
| Move collapsed container | Children still shift (they exist in data) |
| S key before first menu enable | Shortcut is ignored |
