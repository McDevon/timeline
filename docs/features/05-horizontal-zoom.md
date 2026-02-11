# Feature 05: Horizontal Zoom

## Goal

Allow the user to zoom in and out on the timeline horizontally, anchored at the cursor position. This enables exploring both millennia-spanning periods and short-lived events.

## Requirements

1. Ctrl/Cmd + scroll wheel zooms in/out
2. Trackpad pinch-to-zoom works (fires as ctrlKey wheel events)
3. Zoom is anchored at the cursor — the year under the pointer stays fixed on screen
4. Plain scroll wheel continues to pan (unchanged)
5. Zoom limits: min visible span ~0.1 years, max ~10,000 years
6. Zoom is smooth and proportional to wheel delta

## Input Mapping

| Input | Action |
|-------|--------|
| Ctrl/Cmd + wheel | Zoom anchored at cursor |
| Trackpad pinch | Zoom anchored at cursor (same mechanism) |
| Plain wheel | Pan horizontally (unchanged) |
| Click + drag | Pan (unchanged) |

## Zoom Anchor Math

The year under the cursor stays at the same pixel position after zoom:

```
anchorYear = xToYear(cursorX, viewport, canvasWidth)
factor = 1 + deltaY * 0.001
newStart = anchorYear - (anchorYear - viewport.start) * factor
newEnd   = anchorYear + (viewport.end - anchorYear) * factor
```

## Technical Approach

1. `src/timeline/viewport.ts` — add `zoomViewport()`, `xToYear()`, and zoom span limits
2. `src/timeline/input.ts` — branch `onWheel` on `ctrlKey || metaKey`
