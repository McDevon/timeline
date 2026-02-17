# Feature 06: Event List Panel

## Goal

Provide a collapsible UI panel that lists all events in a recursive tree view. Each event has a visibility checkbox to toggle it on/off the timeline. Parent events with children can be expanded to reveal nested events, each independently toggleable.

## Requirements

1. Bottom-left panel listing all events sorted by start date
2. Each row shows: expand arrow (if has children), event name + date range, visibility checkbox
3. Clicking the checkbox toggles the event visible/hidden on the timeline
4. Clicking the expand arrow reveals/hides children in the list (with animation)
5. Nested events are indented and have subtle background differentiation per depth
6. Panel is collapsible (header chevron) so it stays out of the way
7. Hiding/showing an event triggers animated relayout on canvas
8. Hidden events' snap targets are removed from the snap system
9. Hovering a row highlights the corresponding event on the canvas (bidirectional)

## Panel Layout

```
+----------------------------+
| EVENTS                  v  |  <- header (click to collapse)
+----------------------------+
| > Roman Empire      27–476 [x] |
| v Ancient World           [x] |  <- expanded
|   > Egyptian Period       [x] |  <- child, indented
|   > Greek Period          [ ] |  <- hidden child
| > Byzantine Empire        [x] |
+----------------------------+
```

- Width: 300px, max-height: 50vh (scrollable)
- Themed via CSS custom properties
- Collapsed state hides the body via CSS `max-height` transition

## Row Structure

```
[▶ arrow] [name + dates] [✓ checkbox]
```

- **Arrow**: Only for events with `nested` children. Rotates 90° when expanded. Leaf events get an invisible placeholder for alignment.
- **Info**: Event name (truncated with ellipsis) and date range.
- **Checkbox**: Toggles canvas visibility. Dimmed when hidden.

## Tree Expand/Collapse Animation

Uses max-height CSS transition:
- **Expanding**: Set `max-height` to `scrollHeight`, then `none` on `transitionend` (so nested expansions auto-flow)
- **Collapsing**: Set `max-height` from `scrollHeight` to `0` (force reflow between)
- Duration: 200ms ease

## Canvas Animation

- Duration: 200ms with ease-in-out
- Y offsets: items that change position slide from old Y to new Y
- Fade out: hidden item drawn from old layout at decreasing alpha
- Fade in: shown item drawn at increasing alpha

## Technical Approach

### `src/ui/eventList.ts`

`EventListPanel` class with recursive `createItem()` method. Each item is a wrapper div containing the row and (if applicable) a children container. Key data structures:
- `rowMap: Map<TimelineEvent, HTMLDivElement>` for highlight sync
- `childrenMap: Map<TimelineEvent, HTMLDivElement>` for expand/collapse
- `expandedEvents: Set<TimelineEvent>` for list expansion state (separate from canvas collapse)

### `src/timeline/layout.ts`

`computeLayout()` and `placeLevel()` accept optional `hiddenEvents` parameter. Hidden events are filtered at each recursive level, enabling individual child hiding.

### `src/main.ts`

- `hiddenEvents: Set<TimelineEvent>` tracks hidden events at any depth
- `relayout()` passes all events + `hiddenEvents` to `computeLayout()`
- `findLayoutItem()` recursively searches the layout tree
- `setHoveredItem()` sends exact event to list panel for highlighting
- `onToggleEvent()` uses recursive position capture for smooth animations

### State persistence

Hidden events are serialized as name paths in `src/state.ts` (works at any nesting depth).

## Edge Cases

| Case | Behavior |
|------|----------|
| Hide selected event | Clear `selectedItem`; year-based `selection` unchanged |
| Hide hovered event | Clear `hoveredItem`, hide tooltip |
| Hide event with selected child | Clear `selectedItem` |
| All events hidden | Timeline shows axis, controls, no events |
| All children of a container hidden | Container still renders (empty) |
| Hide parent with hidden children | Both in `hiddenEvents`; showing parent keeps children hidden |
| Hover nested event on canvas | Highlights row in list (if parent expanded) |
| Viewport | Unchanged when toggling visibility |
