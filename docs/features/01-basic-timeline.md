# Feature 01: Basic Timeline Rendering

## Goal

Render a static, non-interactive horizontal timeline on a full-screen Canvas. This establishes the visual foundation that all future features build on.

## Requirements

1. The page fills the entire browser viewport with no scroll bars
2. A horizontal timeline axis is drawn across the canvas
3. Events from `public/events.json` are loaded and displayed
4. Each top-level event is rendered as a labeled horizontal bar
5. Nested events are rendered as smaller bars below their parent
6. The timeline range is determined by the data (min start to max end across all events)
7. Year labels appear along the axis at regular intervals

## Visual Layout

```
Year:  1469  1475  1480  1485  1490  1495  1500  1505  1510  1515  1520  1525  1530  1534
       |     |     |     |     |     |     |     |     |     |     |     |     |     |
Axis:  ─────────────────────────────────────────────────────────────────────────────────

       ├──────────── Renaissance Popes ──────────────────────────────────────────────┤
       ├─ Sixtus IV ─┤
              ├─ Innocent VIII ─┤
                     ├─ Alexander XI ──┤
                                  ├─┤ Pius III
                                  ├──── Julius II ────┤
                                        ├──── Leo X ────┤
                                               ├ Adrian VI ┤
                                                 ├──── Clement VII ──┤

       ├──────────── Niccolo Machiavelli ──────────────────┤
```

## Rendering Details

- **Canvas sizing**: Canvas fills the viewport. Resizes with the window.
- **Axis**: A horizontal line with year tick marks and labels.
- **Event bars**: Rounded rectangles with the event name as a text label.
- **Nesting**: Nested events are rendered on rows below their parent, indented slightly.
- **Colors**: Use a simple, readable color scheme. Parent groups and individual events should be visually distinguishable.
- **Text**: Event names are rendered inside or next to their bars. Truncated with ellipsis if too long to fit.

## Non-Goals (for this feature)

- No click interaction
- No collapsing/expanding of groups
- No animations

## Technical Approach

1. `src/types.ts` defines `TimelineEvent` type with ISO date string `start`/`end` fields
2. `src/data/time.ts` converts ISO date strings to decimal years for rendering math
3. `src/data/loader.ts` fetches and parses `public/events.json`
4. `src/timeline/viewport.ts` defines the visible year range (Viewport)
5. `src/timeline/renderer.ts` takes a Canvas context, events, and viewport, and draws the timeline
6. `src/main.ts` initializes the Canvas, loads data, sets up viewport and input, triggers rendering
7. Canvas is redrawn on window resize and viewport changes
