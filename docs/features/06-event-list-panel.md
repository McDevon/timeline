# Feature 06: Event List Panel

## Goal

Provide a collapsible UI panel that lists all top-level events and lets the user toggle their visibility on the timeline. Hiding an event removes it from layout and rendering; showing it restores it with smooth animation.

## Requirements

1. Bottom-left panel listing all top-level events sorted by start date
2. Each row shows the event name and date range
3. Clicking a row toggles the event visible/hidden on the timeline
4. Panel is collapsible (header chevron) so it stays out of the way
5. Hiding/showing an event triggers animated relayout:
   - Hiding: event fades out, remaining events slide to new positions
   - Showing: event fades in at target position, others slide to accommodate
6. Hidden events' snap targets are removed from the snap system
7. Hiding a selected or hovered event clears that state

## Panel Layout

```
+------------------------+
| EVENTS              v  |  <- header (click to collapse)
+------------------------+
| [x] Roman Empire       |
|     27 BCE - 476       |
| [x] Byzantine Empire   |
|     330 - 1453         |
| [ ] Holy Roman Empire  |  <- hidden (dimmed)
|     800 - 1806         |
+------------------------+
```

- Width: 260px, max-height: 50vh (scrollable)
- Dark theme matching existing UI (`#16213e` bg, `#533483` border)
- Collapsed state hides the body via CSS `max-height` transition

## Animation

- Duration: 200ms with ease-in-out
- Y offsets: items that change position slide from old Y to new Y via `ctx.translate()`
- Fade out: hidden item drawn from old layout at decreasing alpha
- Fade in: shown item drawn at increasing alpha
- All animations run simultaneously

## Technical Approach

### New file: `src/ui/eventList.ts`

`EventListPanel` class — creates DOM, appends to body. Constructor takes the events array and an `onToggle(event, visible)` callback. Reuses `formatDate()` from `src/data/time.ts`.

### `src/timeline/renderer.ts`

New `LayoutTransition` interface passed optionally to `render()`. During a transition, the render loop applies `ctx.translate()` for Y offsets and `ctx.globalAlpha` for fades before drawing each layout item.

### `src/main.ts`

- `hiddenEvents: Set<TimelineEvent>` tracks hidden events
- `relayout()` filters hidden events and calls `computeLayout()`
- `onToggleEvent()` computes animation data (old positions, offsets, fade sets) and starts the transition
- `draw()` computes eased progress and passes the `LayoutTransition` to the renderer
- Clears `hoveredItem`, `selectedItem`, and `dblClickItem` when their event is hidden

### Automatic cache invalidation

`input.ts` snap caches auto-invalidate when the `layout` reference changes, so hidden events' edges are automatically excluded from snapping after relayout.

## Edge Cases

| Case | Behavior |
|------|----------|
| Hide selected event | Clear `selectedItem`; year-based `selection` unchanged |
| Hide hovered event | Clear `hoveredItem`, hide tooltip |
| Hide event with selected child | Clear `selectedItem` |
| All events hidden | Timeline shows axis, controls, no events |
| Viewport | Unchanged when toggling visibility |
