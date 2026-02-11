# Feature 02: Horizontal Scrolling

## Goal

Allow the user to pan the timeline horizontally to explore different time periods. Scrolling must be smooth — continuous, sub-pixel movement with no snapping to year boundaries.

## Requirements

1. Trackpad two-finger horizontal swipe scrolls the timeline
2. Mouse click-and-drag pans the timeline (grab and move)
3. Mouse scroll wheel pans horizontally (vertical wheel mapped to horizontal pan while there is no vertical scrolling)
4. Touch drag pans on mobile/tablet
5. Scrolling is perfectly smooth — no discrete jumps or snapping
6. Performance: multiple input events per frame are batched into a single redraw via `requestAnimationFrame`
7. Browser default scroll behavior is suppressed on the canvas

## Viewport Model

The visible portion of the timeline is defined by a `Viewport`:

```ts
interface Viewport {
  start: number;  // left edge, decimal year (float)
  end: number;    // right edge, decimal year (float)
}
```

- On initial load, the viewport spans the full range of the event data
- Scrolling shifts both `start` and `end` by the same delta, preserving the visible span
- Pixel deltas from input are converted to year deltas using: `yearDelta = pixelDelta * (viewport.end - viewport.start) / canvasWidth`

## Input Mapping

| Input | Action |
|-------|--------|
| Trackpad horizontal swipe | `wheel.deltaX` → horizontal pan |
| Mouse wheel (vertical) | `wheel.deltaY` → horizontal pan |
| Ctrl/Cmd + wheel / trackpad pinch | Zoom (see feature 05) — not pan |
| Mouse drag | `mousemove` delta → horizontal pan |
| Touch drag | `touchmove` delta → horizontal pan |

## Technical Approach

1. `src/timeline/viewport.ts` — Viewport type and helper (e.g., `panViewport`)
2. `src/timeline/input.ts` — attaches event listeners to canvas, converts pixel deltas to viewport mutations, schedules redraws
3. `src/timeline/renderer.ts` — accepts Viewport, uses it for all coordinate mapping. Culls off-screen events.
4. `src/main.ts` — creates viewport state, wires input → viewport → render

## Non-Goals (for this feature)

- Zoom is handled by feature 05
- No vertical scrolling
- No scroll boundaries / edge clamping (can scroll past data range freely)
- No inertia / momentum scrolling
