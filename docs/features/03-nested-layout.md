# Feature 03: Nested Event Layout

## Goal

Visually communicate parent-child relationships by rendering children *inside* their parent as a container box. Each event is placed as high as possible without overlapping any time-overlapping event, minimizing vertical space usage at every nesting level.

## Requirements

1. Parent events with children render as tall container boxes
2. The parent label appears at the top of the container
3. Children render as bars inside the container
4. Each event is placed at the highest Y that doesn't collide with any time-overlapping event
5. Vertical packing applies at all levels: top-level events and children within containers
6. Children that extend beyond the parent's time range still appear nested — they overflow horizontally
7. Top-level events without children render as simple bars (unchanged)
8. Layout works recursively for arbitrary nesting depth
9. Events of different heights (containers vs leaves) pack tightly — no wasted vertical space

## Visual Layout

```
├──── Machiavelli ─────────┤  ┌─────────── Presidents ──────────────────┐
                              │ ├Washington┤├Adams┤├Jefferson┤├...      │
┌──────── Renaissance Popes ──────────────┐└─────────────────────────────┘
│ ├Sixtus IV┤├Innocent VIII┤├...┤├Clement┤│
└─────────────────────────────────────────┘
```

Machiavelli (1469–1527) and Presidents (1789–2029) don't overlap in time, so they sit at the same Y. Renaissance Popes (1471–1534) overlap with Machiavelli, so they're placed directly below Machiavelli with no wasted space.

## Placement Algorithm

Sweep-and-prune, sorted by start time (`src/timeline/layout.ts`):

1. Sort events by start year
2. Maintain an **active set** of previously placed events whose time range overlaps the current event, sorted by Y position
3. For each event:
   - **Prune**: remove events from the active set whose end year ≤ current start year
   - **Find minimum Y**: scan the Y-sorted active set for the first gap large enough for the event's height (plus spacing)
   - **Place** the event and insert it into the active set

This applies recursively at every nesting level.

## Two-Phase Layout

**Phase 1 — Size and place** (`placeLevel`): Recursively compute heights and relative Y positions. Containers compute their height from the total height of their placed children. Positions are relative to each level's origin (Y = 0).

**Phase 2 — Absolutize** (`toLayoutItems`): Walk the placed structure top-down, converting relative Y positions to absolute canvas coordinates.

## Rendering

**Draw** (`src/timeline/renderer.ts`): Render from the layout structure. Parent containers drawn first (background), children drawn on top.

## Container Sizing

```
containerHeight = headerHeight + padding + childrenTotalHeight + padding
```

Where `childrenTotalHeight` is the extent of the placed children (max bottom edge), computed by the same placement algorithm applied recursively.

## Non-Goals

- No collapsing/expanding (future feature)
