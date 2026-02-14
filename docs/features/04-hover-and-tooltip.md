# Feature 04: Hover Effect and Tooltip

## Goal

Make timeline events interactive. Hovering highlights the event and shows a tooltip with full details. Moving away from the event hides the tooltip.

## Requirements

1. Hovering over an event bar highlights it (brighter fill/border)
2. Cursor changes to pointer when over an event, grab otherwise
3. Hovering an event shows a tooltip with the event's name, dates, and info
4. Moving the cursor away from an event hides the tooltip
5. Tooltip fades in on appear, fades out on dismiss (CSS transitions)
6. Click-and-drag pans without triggering selection (drag vs click distinction)
7. Clicking an event selects it (highlight); clicking empty canvas deselects

## Hit Testing

A `hitTest` function takes mouse coordinates and the layout tree, returns the deepest LayoutItem under the cursor. For containers, children are checked first so clicking a child returns the child, not the parent container.

## Tooltip

An HTML `div` with `pointer-events: none`, positioned over the canvas. Styled with CSS. Content:
- Event name (bold)
- Date range and duration (for range events) or single date (for point events)
- Info text (if present)

Positioned near the hover point, clamped to stay within viewport edges.

## Technical Approach

1. `src/timeline/hitTest.ts` — hit test against layout tree using pixel coordinates
2. `src/ui/tooltip.ts` — creates and manages the tooltip DOM element
3. `src/timeline/renderer.ts` — accepts optional hovered item, draws with highlight colors
4. `src/timeline/input.ts` — tracks hover on mousemove, shows/hides tooltip, detects clicks vs drags
5. `src/main.ts` — caches layout, wires hover state
6. `index.html` — tooltip CSS with fade transitions
