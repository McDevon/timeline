# Event Data Format

## Overview

Timeline events are stored as a JSON array of event objects. Events can be nested to represent groupings (e.g., a historical period containing individual figures or sub-events).

## Schema

### Event Object

| Field    | Type            | Required | Description |
|----------|-----------------|----------|-------------|
| `name`   | `string`        | Yes      | Display name of the event or period |
| `start`  | `number`        | Yes      | Start year (integer). Negative values represent BCE years. |
| `end`    | `number`        | Yes      | End year (integer). Can equal `start` for point events. |
| `info`   | `string`        | No       | Additional descriptive text |
| `nested` | `Event[]`       | No       | Child events contained within this event |

### Year Representation

- Years are integers
- Positive values = CE (e.g., `1492`)
- Negative values = BCE (e.g., `-3000` = 3000 BCE)
- Zero = 1 BCE (there is no year 0 in historical convention, but we use 0 as a valid value representing 1 BCE for simplicity)

### Nesting Rules

- Events can be nested to arbitrary depth
- Nested events do not need to fit within their parent's time range (the data may represent logical grouping, not strict temporal containment)
- Nested events can overlap with each other
- An event with `nested` children acts as a collapsible group in the UI

## Example

```json
[
  {
    "start": 1471,
    "end": 1534,
    "name": "Renaissance Popes",
    "nested": [
      {
        "start": 1471,
        "end": 1484,
        "name": "Sixtus IV",
        "info": "Francesco della Rovere"
      },
      {
        "start": 1503,
        "end": 1513,
        "name": "Julius II",
        "info": "Giuliano della Rovere"
      }
    ]
  },
  {
    "start": 1469,
    "end": 1527,
    "name": "Niccolo Machiavelli"
  }
]
```

## Data Source

Currently: static file at `public/events.json`, fetched via HTTP.

Future: database API returning the same JSON structure. The data loading module (`src/data/`) is designed to make this swap transparent to the rest of the application.
