# Feature 13: Event Editing Menu

## Goal

Allow editing event properties and deleting events through a contextual menu that appears when an event is selected.

## Menu Behavior

The event menu appears at the bottom of the screen, to the right of the timeline menu. It is only visible when an event is selected (on canvas or from the events list). Selecting a different event updates the menu content. Deselecting hides it.

The menu follows the same collapsible pattern as other panels: title bar at bottom (`column-reverse`), animated open/close via `max-height` transition, chevron rotation.

## Menu Contents

1. **Name field** — text input, pre-filled with event name. Editing updates the event name in real-time (canvas, events list, persistence). Empty names are rejected.
2. **Info field** — textarea, pre-filled with event info. Editing updates and persists immediately.
3. **Delete button** — destructive action with confirmation dialog. Removes event from data, canvas, and events list.

## Persistence

All edits are persisted immediately to IndexedDB via `saveStoredEvents()`. Name changes also trigger `relayout()` + `requestRedraw()` to update the canvas rendering.

## Files

- `src/ui/eventMenu.ts` — `EventMenu` class with `show(event)` / `hide()` API
- `src/ui/eventList.ts` — `updateEventName()` and `removeEvent()` methods
- `src/main.ts` — creates EventMenu, wires callbacks, syncs with selection state
- `index.html` — `.event-menu*` CSS styles
