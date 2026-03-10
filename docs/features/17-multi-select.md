# 17 — Multi-Select & Bulk Editing

## Overview

Select multiple events at once via box selection (alt+drag), then bulk-edit shared properties.

## Box Selection

- **Alt+drag** in the events area draws a dashed selection rectangle
- Always **adds** captured events to the existing selection (never removes)
- Works on empty space or starting on an event
- If a container and its descendants both intersect, only descendants are selected (prefer leaves)
- Result of 1 event → single-select; 0 new events → keeps existing selection
- Multiple alt+drags can be used to build up a selection incrementally

## Alt+Click Toggle

- **Alt+click** on an event toggles it in/out of the current selection
- If the event is already selected, it is removed; otherwise it is added
- Works with both single-select and multi-select states

## Multi-Select State

- `selectedEvents: Set<TimelineEvent>` — empty means no multi-select
- `boxSelectRect` — in-progress rectangle visual (null when not dragging)
- Mutually exclusive with single-select (`selectedItem`)

## Bulk Edit Menu

When multiple events are selected, the event menu shows:
- Title: "N events selected"
- Name and info fields hidden (not bulk-editable)
- Type selector: active button if all same type, else none highlighted
- Date fields: common value if unanimous, else blank
- Approx ranges: common value if unanimous, else cleared
- Color: common color or "Mixed"
- Parent: common parent or "Mixed"
- Export/Delete buttons with count labels

All field changes apply to every selected event. Single undo snapshot per bulk operation.

## Interactions

| Action | Result |
|--------|--------|
| Single click (no alt) | Clears multi-select, enters single-select |
| Alt+click on event | Toggles that event in/out of selection |
| Alt+drag | Adds captured events to selection |
| Escape during box drag | Cancel drag, clear rectangle |
| Escape with multi-select | Clear multi-select |
| Delete/Backspace | Confirmation dialog, then bulk delete |
| Undo/redo | Clears multi-select (event refs become stale) |
| Type change to Point | Skips events that have children |

## Implementation

- `hitTest.ts`: `hitTestBox()` — circle-rect and rect-rect intersection
- `renderer.ts`: multi-select highlight via module-level `currentSelectedEvents`; dashed box overlay
- `input.ts`: `box-selecting` drag mode triggered by alt+mousedown on empty space
- `eventList.ts`: `selectEvents()` highlights multiple rows
- `dateInput.ts` / `approxInput.ts`: `clear()` blanks fields without triggering callbacks
- `eventMenu.ts`: `showMulti()` and multi-mode bulk callbacks
- `main.ts`: state wiring, bulk callback implementations, keyboard handlers
