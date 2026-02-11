# Feature 03: Nested Event Layout with Row Packing

## Goal

Visually communicate parent-child relationships by rendering children *inside* their parent as a container box. Pack non-overlapping children onto the same row to minimize vertical space usage.

## Requirements

1. Parent events with children render as tall container boxes
2. The parent label appears at the top of the container
3. Children render as bars inside the container
4. Non-overlapping children are packed onto the same row (greedy algorithm)
5. Children that extend beyond the parent's time range still appear nested — they overflow horizontally
6. Top-level events without children render as simple bars (unchanged)
7. Layout works recursively for arbitrary nesting depth

## Visual Layout

```
┌──────────── Renaissance Popes ──────────────────────────────────────────┐
│ ├Sixtus IV┤├Innocent VIII┤├Alexander VI┤├┤├Julius II┤├Leo X┤├┤├Clement┤ │
└─────────────────────────────────────────────────────────────────────────┘

├──────────── Niccolo Machiavelli ────────────────────────┤
```

All 8 popes are sequential (non-overlapping), so the algorithm packs them onto a single row.

## Row Packing Algorithm

Greedy interval scheduling, sorted by start time:

1. For each child, try to place it on the first existing row where it doesn't overlap the last placed event
2. If no row fits, create a new row

## Two-Pass Rendering

**Pass 1 — Layout** (`src/timeline/layout.ts`): Walk the event tree, compute row assignments and Y positions. Produces a layout structure independent of Canvas.

**Pass 2 — Draw** (`src/timeline/renderer.ts`): Render from the layout structure. Parent containers drawn first (background), children drawn on top.

## Container Sizing

```
containerHeight = headerHeight + padding + (numRows * childBarHeight) + ((numRows - 1) * rowGap) + padding
```

## Non-Goals

- No collapsing/expanding (future feature)
- No special handling for deeply nested data (will work, but visual polish for 3+ levels is deferred)
