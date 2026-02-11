# Feature 04: Hover Effect and Click Tooltip

## Goal

Make timeline events interactive. Hovering highlights the event, clicking shows a tooltip with full details. Clicking empty canvas dismisses the tooltip with a fade-out.

## Requirements

1. Hovering over an event bar highlights it (brighter fill/border)
2. Cursor changes to pointer when over an event, grab otherwise
3. Clicking an event shows a tooltip with the event's full name and info
4. Clicking empty canvas dismisses the tooltip
5. Tooltip fades in on appear, fades out on dismiss (CSS transitions)
6. Click-and-drag pans without triggering a tooltip (drag vs click distinction)

## Hit Testing

A `hitTest` function takes mouse coordinates and the layout tree, returns the deepest LayoutItem under the cursor. For containers, children are checked first so clicking a child pope returns the pope, not the parent "Renaissance Popes" container.

## Tooltip

An HTML `div` positioned absolutely over the canvas. Styled with CSS. Content:
- Event name (bold)
- Info text (if present)

Positioned near the click point, clamped to stay within viewport edges.

## Technical Approach

1. `src/timeline/hitTest.ts` — hit test against layout tree using pixel coordinates
2. `src/ui/tooltip.ts` — creates and manages the tooltip DOM element
3. `src/timeline/renderer.ts` — accepts optional hovered item, draws with highlight colors
4. `src/timeline/input.ts` — tracks hover on mousemove, detects clicks vs drags
5. `src/main.ts` — caches layout, wires hover state and tooltip
6. `index.html` — tooltip CSS with fade transitions
