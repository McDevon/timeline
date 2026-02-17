# Feature 13: Event Editing Menu

## Goal

Allow editing event properties, dates, and deleting events through a contextual menu that appears when an event is selected.

## Menu Behavior

The event menu appears at the bottom of the screen, to the right of the timeline menu. It is only visible when an event is selected (on canvas or from the events list). Selecting a different event updates the menu content. Deselecting hides it.

The menu follows the same collapsible pattern as other panels: title bar at bottom (`column-reverse`), animated open/close via `max-height` transition, chevron rotation. Body scrolls when content is tall.

## Menu Contents

1. **Name field** — text input, pre-filled with event name. Editing updates in real-time. Empty names rejected.
2. **Info field** — textarea for event description. Persists immediately.
3. **Type selector** — three pill buttons: Point, Range, Ongoing. Switching changes event structure. Point blocked if event has children.
4. **Start section** — date input (year + era + optional month + optional day) with optional approximate toggle.
5. **End section** — same as start; hidden for Point, shows "ongoing" label for Ongoing.
6. **Delete button** — destructive action with confirmation dialog.

## Date Input Component

Reusable `DateInput` class with two rows:
- Row 1: year (number input) + era (CE/BCE dropdown)
- Row 2: month dropdown (optional) + day dropdown (optional, shown when month set)

Supports variable precision: year-only, year-month, or full date. BCE dates shown as positive year with BCE era toggle.

## Approximate Dates

`ApproxInput` wraps a checkbox and two `DateInput` components (earliest/latest). Maps to `startApprox`/`endApprox` tuple fields. Default ±1 year from nominal when enabled.

## Persistence

All edits persist immediately to IndexedDB via `saveStoredEvents()`. Date and type changes trigger `relayout()` + `requestRedraw()`.

## Files

- `src/ui/dateInput.ts` — reusable `DateInput` component
- `src/ui/approxInput.ts` — `ApproxInput` (checkbox + two DateInputs)
- `src/ui/eventMenu.ts` — `EventMenu` class with type selector, date sections
- `src/ui/eventList.ts` — `updateEventName()` and `removeEvent()` methods
- `src/main.ts` — creates EventMenu, wires all callbacks
- `index.html` — `.event-menu*`, `.date-input*`, `.approx-*` CSS styles
