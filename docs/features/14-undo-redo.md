# Feature 14: Undo / Redo

## Goal

Allow reversing and re-applying data-mutating actions with Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo).

## Architecture

Snapshot-based: each undo entry stores a deep clone of the full events tree plus serialized hidden/collapsed/order state. This automatically covers all mutation types without per-action inverse logic.

Stack model: `stack[0]` is the initial state after load. Each subsequent entry is the state after an action. An `index` pointer tracks the current position. Undo decrements the index and restores that entry; redo increments and restores.

## Captured State

- `events` — deep clone of the full event tree
- `hiddenPaths` — name paths for hidden events
- `collapsedPaths` — name paths for collapsed events
- `eventOrders` — deep clone of custom sort orders

Viewport, selection, scroll position, and animations are not captured.

## Undoable Actions

All data-mutating actions push to the undo stack:

- Adding events (new event button, import)
- Deleting events
- Editing event properties (name, info, dates, uncertainty ranges, type switch)
- Reparenting events
- Reordering events (drag)
- Toggling visibility (hide/show)
- Toggling collapse

## Coalescing

Per-keystroke callbacks (rename, date fields, info) are coalesced into logical undo steps. Multiple edits to the same field on the same event within 800ms of each other produce a single undo entry. A new undo entry starts when:
- The user pauses for 800ms
- The user switches to a different field or event
- A discrete action (delete, add, etc.) occurs

## Keyboard Shortcuts

- **Cmd/Ctrl+Z** — undo
- **Cmd/Ctrl+Shift+Z** or **Ctrl+Y** — redo

When focus is inside a text input or select, Cmd+Z defers to the browser's native text undo. App-level undo only fires when no form element is focused. Undo is also suppressed during an active reorder drag.

## Restoration

On undo/redo, all mutable state is replaced wholesale. The events array, hidden/collapsed sets, and event orders are rebuilt from the snapshot. The layout is recomputed, the event list panel is rebuilt, and the selected event (if any) is re-found by name path in the new tree. In-progress animations are cancelled.

## Limits

The undo stack stores up to 50 entries. Older entries are discarded when the limit is reached. Destructive operations (delete all, reload defaults) reset the stack.
