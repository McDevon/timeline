# Feature 12: Vertical Scrolling

## Goal

Allow vertical scrolling when event content extends below the visible canvas area, while preserving horizontal pan as the default when content fits.

## Scroll Behavior

| Condition | Vertical wheel/touchpad | Horizontal wheel/touchpad |
|-----------|------------------------|--------------------------|
| Content fits (no overflow) | Horizontal pan | Horizontal pan |
| Content overflows | Vertical scroll | Horizontal pan |
| Content overflows + Shift | Horizontal pan | Horizontal pan |
| Ctrl/Cmd held | Zoom | Zoom |

Diagonal trackpad gestures when scrollable: deltaX drives horizontal pan, deltaY drives vertical scroll (simultaneously).

## Technical Approach

### Scroll Offset

A `scrollY` pixel offset is stored separately from `Viewport` (which is horizontal/year-based). Applied as `ctx.translate(0, -scrollY)` around the events drawing section in the renderer.

### Rendering

Events are drawn in a translated context (`-scrollY`). After restoring, a 90% opacity overlay of the background color covers the axis header area, dimming events that have scrolled behind it. The axis, today line, selection, and cursor line are drawn in screen space (not scrolled).

### Hit Testing

Screen Y is converted to layout Y by adding `scrollY` before testing against layout item positions.

### Scroll Bounds

`maxScrollY = max(0, maxLayoutY - canvasHeight + 20)` where `maxLayoutY` is the bottom edge of the lowest layout item. Clamped after every relayout and window resize.

## Files

- `src/timeline/renderer.ts` — `render()` takes `scrollY`, draws events in scroll space, axis overlay + axis in screen space. Exports `computeMaxLayoutY()`.
- `src/timeline/hitTest.ts` — `hitTest()` takes `scrollY`, adjusts `py` before testing.
- `src/timeline/input.ts` — `setupInput()` takes scroll getters/setters. Wheel handler routes vertical delta to scroll vs pan. Mouse handlers convert screen Y to layout Y for hit tests and reorder.
- `src/main.ts` — Stores `scrollY`, computes max scroll, clamps on relayout/resize, passes to render and input.
