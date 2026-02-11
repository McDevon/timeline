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

- No pan or zoom
- No click interaction
- No collapsing/expanding of groups
- No animations
- No responsive scaling for very different time ranges (this assumes a narrow date range for now)

## Technical Approach

1. `src/types.ts` defines `TimelineEvent` type matching the data schema
2. `src/data/loader.ts` fetches and parses `public/events.json`
3. `src/timeline/renderer.ts` takes a Canvas context and an array of events, and draws the timeline
4. `src/main.ts` initializes the Canvas, loads data, and triggers rendering
5. Canvas is redrawn on window resize
