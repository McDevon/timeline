# Feature 10: Drag-and-Drop Event Import

## Goal

Allow users to drag JSON files onto the timeline to dynamically add events. Imported events persist across page reloads via IndexedDB and integrate with all existing features (visibility, collapse, reorder, selection, zoom).

## Interaction

1. Drag a `.json` file over the browser window — a full-screen overlay appears: "Drop JSON file to import events"
2. Drop the file — events are validated, deduplicated, and added to the timeline
3. Info log messages appear at the bottom of the screen confirming the result

### Info Log

A general-purpose toast notification system used for user feedback:

- Messages appear at the bottom center of the screen with a fade-in
- Multiple messages stack upward
- Each message fades out after ~4 seconds
- Used for: import success, duplicate skips, validation errors

### Validation

Dropped files must be valid JSON containing either:
- An array of event objects
- A single event object (wrapped in an array automatically)

Each event must have `name` (non-empty string) and `start` (valid date string). Optional fields (`end`, `info`, `startApprox`, `endApprox`, `nested`) are type-checked. Nested events are validated recursively.

### Deduplication

Events whose `name` matches an existing root-level event are skipped. Each skipped event triggers an info log message: "Skipped duplicate event: NAME".

## Persistence

Imported events are stored in IndexedDB (database: `timeline-imports`, object store: `events`). On startup, stored imports are merged with the base events before state restoration.

The IndexedDB store is designed as a replaceable layer — a future backend can replace it without changing the rest of the architecture.

### What persists where

| Data | Storage |
|------|---------|
| Imported event data | IndexedDB |
| Hidden/collapsed/reorder state for imported events | localStorage (via existing `saveState`) |

## Feature Interactions

| Feature | Behavior with imported events |
|---------|------------------------------|
| Event list panel | New rows added in sorted position |
| Hide/show | Toggle works normally |
| Collapse | Container events can be collapsed |
| Reorder | Can be dragged like any other event |
| Double-click zoom | Works on imported range events |
| Tooltips | Shown on hover |
| Selection | Snap targets include imported events |

## Implementation

### `src/ui/infoLog.ts`

`InfoLog` class with `show(message)` method. Creates a fixed-position container, appends message elements with CSS fade transitions.

### `src/data/store.ts`

`loadImportedEvents()` and `saveImportedEvents(events)` — IndexedDB wrapper with graceful error handling. Returns `[]` if DB is unavailable.

### `src/data/validate.ts`

`validateEvents(data)` — runtime validation of unknown JSON against the `TimelineEvent` schema. Returns `{ events }` or `{ error }`.

### `src/ui/eventList.ts`

`addEvents()` method on `EventListPanel` — creates new rows in sorted position with click/hover handlers. Refactored row creation into shared `createRow()` method.

### `src/main.ts`

- Startup: loads imported events from IndexedDB and merges with base events before state restoration
- Drop handler: `dragenter`/`dragleave`/`dragover`/`drop` on `document.body` with overlay toggle, file reading, validation, deduplication, layout recomputation with fade-in animation, event list update, IndexedDB persistence

### `index.html`

CSS for `.info-log`, `.info-log-message`, and `.drop-overlay`.
