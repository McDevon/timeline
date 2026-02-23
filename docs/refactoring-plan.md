# Refactoring Plan

Addresses structural issues identified in codebase audits. The snapshot-based undo system is kept as-is — it's a good tradeoff for the current scale.

## Completed phases

These phases from the original plan are done and no longer tracked here:

- **Extract delete logic** — `deleteEvent()` extracted in main.ts (single call site for context menu, event menu, and keyboard handler)
- **Group setupInput parameters** — `setupInput()` now takes a typed config object
- **Group state variables** — State grouped into `view`, `sel`, `ui` objects in main.ts
- **Extract modules from main.ts** — `eventActions.ts`, `animation.ts`, `timeline/reorder.ts` extracted
- **Move CSS out of index.html** — Split into `styles/base.css`, `panels.css`, `dialogs.css`, `controls.css`
- **Add tests for pure functions** — 156 tests across 6 test files (time, validate, layout, viewport, snap, eventActions)
- **Enforce unique sibling event names** — `uniqueSiblingName`, `getSiblings`, `deduplicateSiblingNames` in eventActions.ts. Enforced at new event creation, import, import-into-event, load-from-file, move (2 places), rename (blur validation via `onCommitRename`). 15 new tests (171 total).
- **Consolidate state into a single object** — All state in main.ts flattened into `const state = { ... }`. `PersistableState` interface in state.ts. `commit()` helper replaces repeated post-mutation ceremony (relayout/redraw/save/undo). `commitEdit()` for event property edits. ~15 mutation sites simplified.
- **Move all colors into the theme system** — Added `--tl-selected-bg`, `--tl-selected-hover-bg`, `--tl-nested-indent-rgb` to all 6 themes. Replaced 3 hardcoded CSS colors in panels.css and 1 in eventList.ts. Replaced `CanvasColors` type alias with explicit interface and empty-string placeholder defaults in renderer.ts (overwritten by `applyTheme()` at startup).

## Phase 1: Enforce unique sibling event names

**Problem:** Event names are used as identity keys throughout the system:

- `eventToPath()` / `pathToEvent()` in state.ts build name-based paths to serialize event references (hidden/collapsed sets, undo snapshots)
- `eventOrders` maps use name arrays to store custom sort order per parent
- Import deduplication checks `events.some(e => e.name === ie.name)` but only at the top level

If two siblings share the same name, `pathToEvent()` always resolves to the first match. This silently breaks state persistence (wrong event gets hidden/collapsed on reload) and reorder (wrong event gets repositioned). The current data happens to avoid this, but nothing prevents it.

**Fix:** Enforce uniqueness among siblings at every mutation point. "Siblings" means events in the same `nested` array (or all top-level events). Events with different parents may share names.

1. **Validation gate** — Add `hasDuplicateSiblingNames(events)` to `eventActions.ts`. Walks the tree and returns the first duplicate found (or null). Used defensively, not as the primary enforcement.

2. **Auto-suffix on creation** — When creating a new event (`main.ts` new-event handler), if the default name "New event" already exists among siblings, append a counter: "New event (2)", "New event (3)", etc.

3. **Auto-suffix on import** — When importing events (`importEventsFromFile`), if an imported event's name collides with an existing sibling, append a suffix. This replaces the current top-level-only skip behavior with proper sibling-scoped deduplication.

4. **Rename validation** — In the `onRename` handler, reject the name if another sibling already has it. Show an infoLog message and revert the input.

5. **Move validation** — When moving an event to a new parent (context menu or event menu), if the name collides with a sibling at the destination, auto-suffix it.

6. **Validator enhancement** — Add sibling uniqueness check to `validateEvents()` so imported JSON files with duplicate sibling names get suffixed upfront.

**Files:** `src/eventActions.ts` (new helpers), `src/data/validate.ts` (optional: warn on import), `src/main.ts` (enforce at mutation points)

## Phase 2: Consolidate state into a single object

**Problem:** Application state is scattered across multiple loose variables and objects in main.ts:

- `events` array + `hiddenEvents` Set + `collapsedEvents` Set + `eventOrders` Map (data state)
- `view` object with viewport + scrollY (view state)
- `sel` object with selection, selectedItem, hoveredItem, snapState (selection state)
- `ui` object with cursorX, showTodayLine (UI state)
- `reorderState`, `reorderOriginalOrders`, `reorderLastIndex`, `reorderRefPositions` (drag state)
- `dblClickPrevViewport`, `dblClickItem`, `preClickSelection`, `preClickSelectedItem`, `preClickSnapOverrides` (interaction state)
- `layout` (derived from data state)

Every state mutation requires manually calling the right combination of `relayout()`, `requestRedraw()`, `scheduleSave()`, `saveStoredEvents()`, and `undoManager.push()`. Missing any of these causes subtle bugs (stale layout, unsaved changes, broken undo).

**Fix:** Consolidate into a single `AppState` type and provide a `commit()` function that handles the ceremony:

```typescript
interface AppState {
  // Data (persisted to IndexedDB + localStorage)
  events: TimelineEvent[];
  hiddenEvents: Set<TimelineEvent>;
  collapsedEvents: Set<TimelineEvent>;
  eventOrders: Map<string, string[]>;

  // View (persisted to localStorage)
  viewport: Viewport;
  scrollY: number;
  selection: TimelineSelection | null;
  showTodayLine: boolean;

  // Transient (not persisted)
  selectedItem: LayoutItem | null;
  hoveredItem: LayoutItem | null;
  snapState: SnapState;
  cursorX: number;
  reorder: ReorderState | null;
  reorderOriginalOrders: Map<string, string[]> | null;
  reorderRefPositions: { center: number; bottom: number }[] | null;
  reorderLastIndex: number;
  dblClickPrevViewport: Viewport | null;
  dblClickItem: LayoutItem | null;

  // Derived (recomputed, not stored)
  layout: LayoutItem[];
}
```

A `commit()` function replaces the manual ceremony:

```typescript
interface CommitOptions {
  relayout?: boolean;       // default false
  save?: boolean;           // default true (scheduleSave)
  saveEvents?: boolean;     // default false (saveStoredEvents)
  undo?: boolean;           // default false
  undoCoalesce?: string;    // if set, uses pushCoalesced with this tag
  // Animation is set directly on anim, not through commit
}

function commit(opts: CommitOptions = {}) {
  if (opts.relayout) relayout();
  requestRedraw();
  if (opts.saveEvents) saveStoredEvents(slug, state.events);
  if (opts.save !== false) scheduleSave();
  if (opts.undo) undoManager.push(snapshot());
  else if (opts.undoCoalesce) undoManager.pushCoalesced(opts.undoCoalesce, snapshot());
}
```

This doesn't add abstraction layers or a reducer pattern — it just moves the state fields into one object and makes the post-mutation bookkeeping explicit and impossible to forget.

**Migration:** Mechanical — replace `view.viewport` with `state.viewport`, `sel.selectedItem` with `state.selectedItem`, etc. The grouped objects (`view`, `sel`, `ui`) are already halfway there; this finishes the job by flattening them into one namespace.

**Files:** `src/main.ts`, `src/state.ts` (update `saveState`/`loadState` signatures)

## Phase 3: Move all colors into the theme system

**Problem:** Three hardcoded color values in CSS bypass the theme system:

1. `panels.css:142` — `rgba(200, 154, 44, 0.15)` for selected event list row background
2. `panels.css:146` — `rgba(200, 154, 44, 0.25)` for selected event list row hover
3. `panels.css:523` — `rgba(128,128,128,0.3)` for theme swatch border

Additionally, `renderer.ts:31-60` initializes `colors` with hardcoded Midnight values. These are immediately overwritten by `applyTheme()` at startup, so they're dead defaults — but they duplicate theme data and could cause a flash of wrong colors if `applyTheme` is ever delayed.

**Fix:**

1. **Add CSS variables** for the missing colors. Add to each theme's `ui` record:
   - `--tl-selected-bg` — selected row background (currently gold-tinted for dark themes, blue-tinted for light)
   - `--tl-selected-hover-bg` — selected row hover (slightly brighter)
   - `--tl-swatch-border` — theme swatch border (neutral, works on any bg)

2. **Update CSS** to use the variables:
   ```css
   .event-list-row.selected { background: var(--tl-selected-bg) !important; }
   .event-list-row.selected:hover { background: var(--tl-selected-hover-bg) !important; }
   .theme-swatch { border: 1px solid var(--tl-swatch-border); }
   ```

3. **Update base.css** defaults to include the new variables (matching Midnight as baseline).

4. **Clean up renderer.ts defaults** — Remove the inline color initialization. Instead, export a `defaultColors()` function from themes.ts that returns the Midnight canvas colors, and use that as the initializer.

**Files:** `src/themes.ts` (add variables to all 6 themes), `src/styles/base.css` (add variable defaults), `src/styles/panels.css` (replace hardcoded values), `src/timeline/renderer.ts` (clean up default initialization)

## Phase 4: Extract remaining logic from main.ts

**Problem:** After phases 1-3, main.ts still contains several distinct responsibilities mixed together:

- File I/O operations: `importEventsFromFile`, `loadEventsFromFile`, `importIntoNewEvent` (~215 lines of nearly identical FileReader boilerplate)
- Reorder orchestration: `onReorderMove`, `onReorderEnd`, `onReorderCancel` (~140 lines of complex reorder state management)
- Double-click zoom: canvas dblclick handler + `onDblClickEvent` from event list (~50 lines, duplicated zoom-toggle logic)
- New event creation (~70 lines)
- Layout animation helpers: `capturePositions`, `computeOffsets`, `onCollapseToggle`, `onToggleEvent` (~120 lines)

**Fix:** Extract into focused modules:

1. **`src/fileOps.ts`** — File import/export/load operations.

   Extract the shared FileReader pattern into a helper:
   ```typescript
   function readJsonFile(file: File): Promise<unknown>
   ```
   Then each operation (`importEvents`, `loadEvents`, `importIntoNewEvent`, `exportEvents`, `exportEvent`) becomes a clean function that takes the app state + callbacks it needs. This eliminates ~100 lines of duplicated FileReader boilerplate.

2. **`src/reorderManager.ts`** — Reorder drag orchestration.

   Encapsulate `reorderState`, `reorderOriginalOrders`, `reorderRefPositions`, `reorderLastIndex` and the three handlers (`onMove`, `onEnd`, `onCancel`) into a class or module. main.ts just creates it and passes the callbacks to setupInput.

3. **`src/layoutTransition.ts`** — Layout animation helpers.

   Extract `capturePositions()`, `computeOffsets()`, and the fade-in/fade-out transition setup into a module. These are used by collapse toggle, visibility toggle, import, and reorder — all follow the same pattern: capture old positions → mutate → relayout → compute offsets → set transition. A helper like `withLayoutTransition(fn)` could wrap this pattern.

After these extractions, main.ts should be ~600-700 lines: initialization, state setup, UI wiring, and the `commit()` / `draw()` / `requestRedraw()` core. This is a reasonable size for the application entry point that owns the state and wires components together.

**Files:** New `src/fileOps.ts`, `src/reorderManager.ts`, `src/layoutTransition.ts`; `src/main.ts` shrinks significantly.

## Phase 5: Explicit drag state machine in input.ts

**Problem:** `dragMode`, `scrollLock`, `didDrag`, `dragDecided`, and `reorderItem` interact in non-obvious ways. The transitions between states are implicit.

**Fix:** Replace the separate variables with a discriminated union:

```typescript
type DragState =
  | { mode: 'none' }
  | { mode: 'undecided'; startX: number; startY: number; accDx: number; accDy: number; item: LayoutItem | null }
  | { mode: 'axis-selecting'; anchorYear: number; didDrag: boolean }
  | { mode: 'panning'; startViewport: Viewport }
  | { mode: 'scrolling'; startScrollY: number }
  | { mode: 'reordering'; item: LayoutItem; startViewport: Viewport }
  | { mode: 'zooming'; anchorYear: number; anchorX: number };
```

Each state carries only the data relevant to it. Transitions happen by assigning a new state object. The `undecided` state replaces the current direction-locking logic — it accumulates movement until the 8px threshold is exceeded, then transitions to the appropriate mode.

**Files:** `src/timeline/input.ts`

## Phase 6: Add tests for untested pure functions

**Problem:** Several critical pure functions lack test coverage:

- `state.ts` — `eventToPath` / `pathToEvent` / `saveState` / `loadState` handle persistence. Bugs here silently lose user data.
- `undo.ts` — `UndoManager` handles undo/redo stack. Coalescing logic and boundary conditions are subtle.
- `hitTest.ts` — All click/hover interactions depend on this. Point vs range detection, scroll offset, nesting priority.
- `reorder.ts` — `computeDropIndex` and sibling detection. Wrong index = wrong final order.

**Fix:** Add test files:

- `src/state.test.ts` — Round-trip `eventToPath`→`pathToEvent`, nested paths, missing paths, duplicate names (after Phase 1 ensures uniqueness)
- `src/undo.test.ts` — Push/undo/redo boundaries, stack size limit, coalescing (same tag, different tag, timer expiry)
- `src/timeline/hitTest.test.ts` — Point hit (circle), range hit (rect), nested child priority, scroll offset, miss
- `src/timeline/reorder.test.ts` — Drop index at boundaries, sibling detection in nested trees

**Files:** New test files alongside source files

## Execution order

Phases are ordered by dependency and risk:

1. **Phase 1** (unique names) — Prerequisite for reliable state persistence. Low risk, localized changes. Must be done before Phase 2 since the state consolidation relies on name-based paths working correctly.
2. **Phase 2** (state consolidation) — Largest structural change. Benefits from Phase 1 ensuring name paths are reliable. Eliminates the scattered mutation ceremony that causes bugs.
3. **Phase 3** (theme colors) — Independent of phases 1-2, small and safe. Grouped here because it's quick and cleans up a visible inconsistency.
4. **Phase 4** (extract from main.ts) — Benefits from Phase 2's `commit()` function being in place. The extracted modules can use `commit()` instead of reimplementing the ceremony.
5. **Phase 5** (drag state machine) — Localized to input.ts, no external interface change. Can be done independently but benefits from Phase 4 reducing main.ts coupling.
6. **Phase 6** (tests) — Benefits from all prior phases making code more testable and names reliable.
