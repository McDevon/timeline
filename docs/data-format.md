# Event Data Format

## Overview

Timeline events are stored as a JSON array of event objects. Events can be nested to represent groupings (e.g., a historical period containing individual figures or sub-events).

## Schema

### Event Object

| Field    | Type            | Required | Description |
|----------|-----------------|----------|-------------|
| `name`   | `string`        | Yes      | Display name of the event or period |
| `start`  | `string`        | Yes      | ISO date string. See Date Format below. |
| `end`    | `string`        | No       | ISO date string. Omit for point-in-time events. |
| `startApprox` | `[string, string]` | No | Uncertainty range for start date. See Uncertain Dates below. |
| `endApprox` | `[string, string]` | No | Uncertainty range for end date. See Uncertain Dates below. |
| `info`   | `string`        | No       | Additional descriptive text |
| `nested` | `Event[]`       | No       | Child events contained within this event |

### Date Format

Dates are ISO date strings with variable precision:

| Format | Example | Meaning |
|--------|---------|---------|
| Year only | `"1471"` | The year 1471 |
| Year-month | `"1471-08"` | August 1471 |
| Full date | `"1471-08-09"` | 9 August 1471 |
| BCE year | `"-3000"` | 3000 BCE |
| BCE full | `"-3000-06-15"` | 15 June 3000 BCE |

**Internal representation**: Dates are converted to decimal years for rendering math. `"1471-07-01"` becomes approximately `1471.5`. This conversion is handled by `src/data/time.ts` and is transparent to the data format.

### Uncertainty Ranges

Events can specify uncertainty ranges for their start and/or end dates using the `startApprox` and `endApprox` fields. Each is a two-element array `[earliest, latest]` of ISO date strings.

| Field | Type | Required | Description |
|---|---|---|---|
| `startApprox` | `[string, string]` | No | Uncertainty range for start: `[earliest possible, latest possible]` |
| `endApprox` | `[string, string]` | No | Uncertainty range for end: `[earliest possible, latest possible]` |

The `start` field remains the "best guess" nominal date, and should fall within the `startApprox` range. Same for `end` and `endApprox`.

**Visual rendering**: Uncertain edges are shown as gradient fades from transparent to solid. The solid portion of the bar represents the certain date range. The faded edges represent the uncertainty window.

**Point events with uncertainty**: A point event with `startApprox` is rendered as a gradient bar (not a circle) spanning the uncertainty range, with a diamond marker at the nominal date.

**Examples**:

```json
{"start": "-490-09", "startApprox": ["-490-08", "-490-10"], "name": "Battle of Marathon"}
{"start": "-753", "startApprox": ["-800", "-700"], "end": "476-09-04", "name": "Roman Empire"}
{"start": "1346", "startApprox": ["1345", "1347"], "end": "1353", "endApprox": ["1351", "1355"], "name": "The Black Death"}
```

### Ongoing Events

Setting `"end": "ongoing"` marks an event as continuing to the present day with no known end. The timeline resolves this dynamically: the solid bar extends to today's date, followed by a gradient fade into the future to visually convey that the event is expected to continue.

The fade width is 5% of the event's duration, clamped to a minimum of 5 years and a maximum of 50 years.

The tooltip shows "present" as the end date.

```json
{"start": "1917-12-06", "end": "ongoing", "name": "Finland"}
```

### Point Events

Omitting the `end` field creates a point-in-time event. Point events are rendered as small circles instead of bars. They participate in the same layout as ranged events but cannot have children (`nested` is ignored on point events).

### Nesting Rules

- Events can be nested to arbitrary depth
- Nested events do not need to fit within their parent's time range (the data may represent logical grouping, not strict temporal containment)
- Nested events can overlap with each other
- An event with `nested` children acts as a collapsible group in the UI
- Point events (no `end`) cannot contain nested children

## Example

```json
[
  {
    "start": "1471",
    "end": "1534",
    "name": "Renaissance Popes",
    "nested": [
      {
        "start": "1471-08-09",
        "end": "1484-08-12",
        "name": "Sixtus IV",
        "info": "Francesco della Rovere"
      },
      {
        "start": "1503-11-01",
        "end": "1513-02-21",
        "name": "Julius II",
        "info": "Giuliano della Rovere"
      }
    ]
  },
  {
    "start": "1469-05-03",
    "end": "1527-06-21",
    "name": "Niccolo Machiavelli"
  },
  {
    "start": "1517-10-31",
    "name": "95 Theses",
    "info": "Martin Luther posts his 95 Theses"
  }
]
```

## Data Source

Currently: static file at `public/events.json`, fetched via HTTP.

Future: database API returning the same JSON structure. The data loading module (`src/data/`) is designed to make this swap transparent to the rest of the application.
