# 15 — Multiple Timelines (SPA Routing)

## Overview

Different datasets can be served under clean URL paths (e.g., `/crises`, `/star-trek`). Each path loads a specific JSON data file with an optional default theme. All storage is isolated per path so edits on one timeline don't affect another.

## URL Resolution

On startup, the app reads `location.pathname` and looks up the slug in `public/timelines.json`:

```json
{
  "environmental-crises": {
    "data": "/global_crises.json",
    "theme": "fire-and-ash",
    "title": "Global Crises"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `data` | Yes | Path to the JSON data file in `public/` |
| `theme` | No | Default theme ID (used on first visit only; user can change it) |
| `title` | No | Browser tab title |
| `compact` | No | If `true`, all collapsible events start collapsed on first visit |

The root path `/` is implicit — it loads `/events.json` with the default Midnight theme.

Unknown slugs fall back to the root timeline and show an alert dialog informing the user.

## Storage Isolation

Each timeline slug gets its own namespaced storage:

| Storage | Root key | Slug key (e.g., `crises`) |
|---------|----------|---------------------------|
| IndexedDB | `timeline-data` | `timeline-data-crises` |
| localStorage (state) | `timeline-state` | `timeline-state-crises` |
| localStorage (theme) | `timeline-theme` | `timeline-theme-crises` |

This means edits, hidden/collapsed state, reorder state, and theme choices are fully independent per timeline.

## SPA Fallback

Since all paths serve the same `index.html` with the same JS bundle, the web server must route unmatched paths to `index.html`:

- **Dev server**: Vite's `appType: 'spa'` handles this automatically
- **Apache (production)**: `public/.htaccess` with `RewriteRule` directs non-file paths to `index.html`
- **Nginx**: Would use `try_files $uri /index.html`

## Adding a New Timeline

1. Place the JSON data file in `public/`
2. Add an entry to `public/timelines.json` with the slug, data path, and optional theme/title
3. Deploy — the new path is immediately accessible

## Implementation

### `src/timeline-config.ts`

`resolveTimeline()` — reads `location.pathname`, fetches `/timelines.json`, returns a `TimelineConfig` with `slug`, `dataUrl`, `fallbackUrl`, `defaultTheme`, `title`, and `unknownSlug` (set when the path wasn't found in config).

### `src/data/store.ts`

All functions (`isStoreInitialized`, `loadStoredEvents`, `saveStoredEvents`, `clearStoredEvents`, `clearStore`) accept a `slug` parameter. The IndexedDB database name is derived from the slug.

### `src/state.ts`

`saveState` and `loadState` accept a `slug` parameter. The localStorage key is namespaced by slug.

### `src/themes.ts`

`applyTheme` and `loadSavedTheme` accept a `slug` parameter. `loadSavedTheme` also accepts an optional `defaultThemeId` for per-timeline theme defaults.

### `src/main.ts`

Calls `resolveTimeline()` at the top of `main()`. Threads the slug through all storage, state, and theme calls. Sets `document.title` from config. Shows an alert dialog for unknown slugs.
