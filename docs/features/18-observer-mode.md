# 18. Observer Mode (Edit Mode Toggle)

## Overview

Timelines support two modes: **edit mode** (default) and **observer mode** (read-only). Observer mode allows full navigation and viewing but prevents adding, deleting, or modifying events.

## Toggle

- **View menu**: "Enable editing" checkbox in the Timeline > View flyout
- Persisted per-timeline in localStorage
- Can be set as default in `timelines.json` via `"editMode": false`

## What observer mode disables

- **+ button**: hidden
- **Delete/Backspace**: keyboard shortcuts blocked
- **Sketch mode**: drag interactions blocked; checkbox disabled in View flyout
- **File drag-and-drop**: blocked with toast "Enable editing to add events"
- **Event menu**: all fields become read-only labels; color section hidden; parent flyout disabled; delete button hidden
- **Context menu**: "Edit" renamed to "View"; "Move to..." and "Delete event" rows hidden
- **Timeline menu**: Import, Import into event, Load file, Delete all, Reload defaults buttons hidden

## What still works in observer mode

- Pan, zoom, scroll navigation
- Show/hide events (eye toggles in event list)
- Collapse/expand container events
- Reorder events (drag in event list)
- Export events
- Theme switching and view toggles (today line, weekend bands)
- Selection highlighting
- Event list panel interactions (hover, select, context menu for view/export)
