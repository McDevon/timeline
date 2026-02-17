# Feature 10: Event Management

## Goal

Provide full event data management: importing new events, exporting, deleting, and resetting to defaults. IndexedDB serves as the single source of truth for all event data. The static JSON file is only read once to seed the database on first load.

## Data Architecture

### IndexedDB as Primary Store

Database `timeline-data` with two object stores:

- **`events`** — all event data (both original and imported)
- **`meta`** — initialization flag to distinguish "first load" from "user deleted everything"

### Startup Flow

1. Check `meta` store for `initialized` flag
2. If **not initialized** (first visit): load events from static JSON file, save to IndexedDB, set initialized flag
3. If **initialized**: load events directly from IndexedDB (static file is never fetched)

### What Persists Where

| Data | Storage |
|------|---------|
| All event data | IndexedDB (`timeline-data`) |
| Hidden/collapsed/reorder state | localStorage (`timeline-state`) |

## Timeline Menu

A collapsible panel positioned bottom-left, to the right of the Events panel. Starts collapsed. Contains four action buttons:

| Button | Style | Action |
|--------|-------|--------|
| Import events | Normal | Opens system file picker for `.json` files |
| Export events | Normal | Downloads all events as `timeline-events.json` |
| Delete all events | Destructive | Confirmation dialog → clears all data |
| Reload default events | Destructive | Confirmation dialog → resets to static file |

### Import Events

Opens a file picker (accepts `.json`). Same validation and deduplication as drag-and-drop import. New events are added to the existing set.

### Export Events

Serializes all current events to JSON and triggers a browser download as `timeline-events.json`.

### Delete All Events

Shows a confirmation dialog. On confirm:
- Clears the events array and all associated state (hidden, collapsed, reorder)
- Clears IndexedDB events (keeps initialized flag so the static file is not re-read)
- Clears localStorage state
- Timeline becomes empty

### Reload Default Events

Shows a confirmation dialog. On confirm:
- Clears IndexedDB completely (including initialized flag)
- Clears localStorage state
- Reloads the page — triggers the "first load" path, re-reading the static JSON file

## Drag-and-Drop Import

1. Drag a `.json` file over the browser window — a full-screen overlay appears: "Drop JSON file to import events"
2. Drop the file — events are validated, deduplicated, and added to the timeline
3. Info log messages appear at the bottom of the screen confirming the result

## Validation

Imported files (via drag-and-drop or file picker) must be valid JSON containing either:
- An array of event objects
- A single event object (wrapped in an array automatically)

Each event must have `name` (non-empty string) and `start` (valid date string). Optional fields (`end`, `info`, `startApprox`, `endApprox`, `nested`) are type-checked. Nested events are validated recursively.

## Deduplication

Events whose `name` matches an existing root-level event are skipped. Each skipped event triggers an info log message: "Skipped duplicate event: NAME".

## Info Log

A general-purpose toast notification system used for user feedback:

- Messages appear at the bottom center of the screen with a fade-in
- Multiple messages stack upward
- Each message fades out after ~4 seconds
- Used for: import success/failure, duplicate skips, validation errors

## Confirmation Dialog

A reusable modal dialog for destructive actions:

- Full-screen semi-transparent backdrop
- Centered dialog box with message text
- Cancel (neutral) and Confirm (destructive/red) buttons
- Closes on Cancel, backdrop click, or Escape key

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

### `src/data/store.ts`

IndexedDB wrapper with functions:
- `isStoreInitialized()` / `setStoreInitialized()` — check/set the initialization flag
- `loadStoredEvents()` / `saveStoredEvents(events)` — read/write all event data
- `clearStoredEvents()` — removes events but keeps initialized flag (for Delete All)
- `clearStore()` — removes everything including initialized flag (for Reload Defaults)

### `src/data/validate.ts`

`validateEvents(data)` — runtime validation of unknown JSON against the `TimelineEvent` schema. Returns `{ events }` or `{ error }`.

### `src/ui/timelineMenu.ts`

`TimelineMenu` class with `TimelineMenuCallbacks` interface. Collapsible panel with four action buttons.

### `src/ui/confirmDialog.ts`

`showConfirmDialog(message, onConfirm)` — creates and shows a modal confirmation dialog.

### `src/ui/infoLog.ts`

`InfoLog` class with `show(message)` method. Creates a fixed-position container, appends message elements with CSS fade transitions.

### `src/ui/eventList.ts`

- `addEvents()` — creates new rows in sorted position with click/hover handlers
- `clear()` — removes all rows and resets internal state

### `src/main.ts`

- Startup: checks IndexedDB initialization flag, loads from IDB or seeds from static JSON
- `importEventsFromFile(file)`: shared logic for drag-and-drop and file picker import
- Menu action handlers wired to TimelineMenu callbacks
- Drop handler: `dragenter`/`dragleave`/`dragover`/`drop` on `document.body`

### `index.html`

CSS for `.info-log`, `.info-log-message`, `.drop-overlay`, `.timeline-menu`, `.confirm-backdrop`, `.confirm-dialog`.
