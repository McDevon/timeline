# Feature 07: Collapsible Events

## Goal

Allow users to collapse container events (those with nested children) into compact thin bars, hiding their children while keeping the container itself visible. This helps manage visual density when exploring the timeline.

## Interaction

- **Ctrl/Cmd+click** on a container event collapses it
- **Ctrl/Cmd+click** again on the same container expands it
- Ctrl/Cmd+click on a non-container event has no special effect (normal click behavior)

## Visual Changes

### Collapsed state
- Container height reduced to 20px (vs normal height based on children)
- Small font (11px) instead of normal container font (13px)
- Label vertically centered in the thin bar
- No children drawn
- Same gradient-aware background as normal containers

### Expanded state (default)
- Normal container rendering with header + children area

## Animation

Reuses the existing `LayoutTransition` system from feature 06:
- **Collapsing**: children fade out, surrounding items slide up to fill space
- **Expanding**: children fade in, surrounding items slide down to make room
- Duration: 200ms with ease-in-out

## Layout Changes

### `src/timeline/layout.ts`

- New constant: `collapsedBarHeight: 20`
- New field on `LayoutItem`: `isCollapsed: boolean`
- `computeLayout()` accepts optional `collapsedEvents: Set<TimelineEvent>`
- When a container is in the collapsed set: height = `collapsedBarHeight`, no child recursion, `isCollapsed: true`

### `src/timeline/renderer.ts`

`drawContainer()` checks `item.isCollapsed` and draws the compact version (small font, centered label, no children).

### `src/timeline/input.ts`

New `onCollapseToggle` callback parameter. In the panning mouseUp handler, ctrl/cmd+click on a container calls the callback instead of normal selection.

### `src/main.ts`

- `collapsedEvents: Set<TimelineEvent>` tracks collapsed state
- `onCollapseToggle()` handler manages the set, captures animation data, calls `relayout()`
- Clears hovered/selected if they reference a now-hidden child

## Edge Cases

| Case | Behavior |
|------|----------|
| Collapse with selected child | Clear `selectedItem` (year-based `selection` unchanged) |
| Collapse with hovered child | Clear `hoveredItem`, hide tooltip |
| Ctrl+click on non-container | Normal click behavior |
| Double-click on collapsed container | Zooms to its time range (works naturally) |
| Hit test on collapsed container | Returns the container itself (no children in layout) |
| Snap targets after collapse | Auto-update: layout ref changes invalidates snap cache |
| Nested collapse | Collapsed container inside another container works — reduced height propagates up |
