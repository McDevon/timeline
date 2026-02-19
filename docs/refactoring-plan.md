# Refactoring Plan

Addresses structural issues identified in a codebase audit. The snapshot-based undo system is kept as-is — it's a good tradeoff for the current scale.

## Phase 1: Extract delete logic

**Problem:** The same 10-line delete-event sequence appears in three places — context menu `onDelete`, event menu `onDelete`, and the keyboard Delete handler in main.ts.

**Fix:** Extract a `deleteEvent(event)` function in main.ts and call it from all three sites.

**Files:** `src/main.ts`

## Phase 2: Group setupInput parameters into a config object

**Problem:** `setupInput()` takes 21 positional parameters. Adding a new one means counting positions and updating every call site.

**Fix:** Replace the parameter list with a single typed config object:

```typescript
interface InputConfig {
  canvas: HTMLCanvasElement;
  getViewport: () => Viewport;
  setViewport: (v: Viewport) => void;
  getLayout: () => LayoutItem[];
  // ... etc
}

export function setupInput(config: InputConfig): InputHandlers { ... }
```

Keep the same closure-based internals — this phase only changes the calling convention.

**Files:** `src/timeline/input.ts`, `src/main.ts`

## Phase 3: Group state variables in main.ts

**Problem:** 30+ `let` bindings scattered throughout main.ts's closure (`viewport`, `scrollY`, `selection`, `hoveredItem`, `selectedItem`, `showTodayLine`, `animFrom`, `animTo`, `cursorX`, etc.). Hard to see what the full application state looks like.

**Fix:** Group related state into plain objects:

```typescript
const viewState = {
  viewport: { start: ..., end: ... },
  scrollY: 0,
  animFrom: null as Viewport | null,
  animTo: null as Viewport | null,
  animStartTime: 0,
};

const selectionState = {
  selection: null as TimelineSelection | null,
  selectedItem: null as LayoutItem | null,
  hoveredItem: null as LayoutItem | null,
  snapState: { ... },
};

const uiState = {
  cursorX: -1,
  showTodayLine: true,
};
```

This is a grouping-only refactor — no new abstractions, no classes. Direct property access replaces the `let` bindings.

**Files:** `src/main.ts`

## Phase 4: Explicit drag state machine in input.ts

**Problem:** `dragMode`, `scrollLock`, `didDrag`, `dragDecided`, and `reorderItem` interact in non-obvious ways. The transitions between states are implicit.

**Fix:** Replace the separate variables with a discriminated union:

```typescript
type DragState =
  | { mode: 'none' }
  | { mode: 'axis-selecting'; anchorYear: number; didDrag: boolean }
  | { mode: 'panning'; startViewport: Viewport; decided: boolean; reorderCandidate: LayoutItem | null }
  | { mode: 'reordering'; item: LayoutItem; startViewport: Viewport };
```

Each state carries only the data relevant to it. Transitions happen by assigning a new state object. The scroll lock mechanism stays separate (it's orthogonal to drag state).

**Files:** `src/timeline/input.ts`

## Phase 5: Extract modules from main.ts

**Problem:** main.ts (1,424 lines) handles event CRUD, animation, persistence orchestration, UI panel lifecycle, reorder logic, and input wiring.

**Fix:** Extract cohesive groups of functions into modules:

1. **`src/eventActions.ts`** — Event CRUD operations (add, remove, move parent, reorder). Takes the events array and callbacks as parameters. Includes `deleteEvent`, `removeEvent`, `moveEvent`, `createEvent`.

2. **`src/animation.ts`** — Zoom and scroll animation state machine. Owns `animFrom`/`animTo`/`animStartTime` and the easing logic. Exposes `animateZoom()`, `animatescroll()`, `tick()`.

3. Move reorder logic (currently ~150 lines: `onReorderMove`, `computeDropIndex`, `findSiblingInfo`, `findSiblingLayoutItems`) into **`src/timeline/reorder.ts`**.

main.ts becomes the coordinator: it creates the modules, wires them together, and runs the draw loop.

**Files:** `src/main.ts` (shrinks), new `src/eventActions.ts`, `src/animation.ts`, `src/timeline/reorder.ts`

## Phase 6: Move CSS out of index.html

**Problem:** 931 lines of CSS inlined in index.html. Vite handles CSS imports natively with hot reloading and source maps.

**Fix:** Extract into CSS files per component group:

- `src/styles/base.css` — Reset, canvas, CSS variables
- `src/styles/panels.css` — Event list panel, event menu, timeline menu
- `src/styles/dialogs.css` — Confirm dialog, help dialog, context menu
- `src/styles/controls.css` — Zoom buttons, info button, new event button, date inputs, tooltips

Import them in main.ts:

```typescript
import './styles/base.css';
import './styles/panels.css';
import './styles/dialogs.css';
import './styles/controls.css';
```

index.html becomes a minimal shell.

**Files:** `index.html` (shrinks), new `src/styles/*.css`, `src/main.ts` (add imports)

## Phase 7: Add tests for pure functions

**Problem:** No test coverage. Pure functions like layout computation, date math, and snap logic are easy to test and prone to subtle regressions.

**Fix:** Add Vitest (already using Vite, so Vitest is zero-config). Write tests for:

- `dateToDecimalYear()` and `formatDate()` — edge cases with BCE, partial dates, year boundaries
- `computeLayout()` — nested events, overlapping ranges, point events
- `chooseTickInterval()` — various zoom levels
- `collectSnapTargets()` and `findSnapYear()` — snap behavior
- `validateEvents()` — invalid data handling
- `eventToPath()` / `pathToEvent()` — round-trip serialization

**Files:** New `src/**/*.test.ts` files, `package.json` (add vitest dev dependency and test script)

## Execution order

The phases are ordered by independence and risk:

1. **Phase 1** — Trivial extract, no structural change
2. **Phase 2** — Mechanical refactor of one function signature
3. **Phase 3** — Grouping only, find-and-replace within one file
4. **Phase 4** — Localized to input.ts, no external interface change
5. **Phase 5** — Largest change, benefits from phases 2-3 being done first
6. **Phase 6** — Independent of code changes, can be done anytime
7. **Phase 7** — Benefits from all prior phases making code more testable
