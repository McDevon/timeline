# 11 — Color Themes

## Overview

Five color themes for both the Canvas rendering and HTML/CSS UI, selectable from the Timeline menu.

## Themes

| Theme | Background | Accent | Character |
|-------|-----------|--------|-----------|
| **Midnight** (default) | `#1a1a2e` | `#533483` | Dark navy/purple |
| **Parchment** | `#f5f0e8` | `#8b6914` | Warm light, sepia/cream |
| **Slate** | `#1e2228` | `#5b9bd5` | Neutral cool gray |
| **Forest** | `#1a2418` | `#c8a84e` | Dark green/earth tones |
| **High Contrast** | `#000000` | `#ffcc00` | Black + vivid accents |

## Architecture

### CSS Custom Properties

All UI colors in `index.html` use `var(--tl-*)` CSS custom properties. A `:root` block provides Midnight defaults so the page renders correctly before JS loads.

Theme application sets all `--tl-*` properties on `document.documentElement.style`.

### Canvas Colors

Canvas colors in `renderer.ts` are stored in a mutable `colors` object with an exported `setCanvasColors()` setter. Called by `applyTheme()` when switching themes.

### Theme Definitions

All themes live in `src/themes.ts`:
- `Theme` interface with `canvas` (renderer colors), `ui` (CSS variable values), `swatches` (preview colors), `name`, and `id`
- `applyTheme(theme, redraw)` — sets CSS vars, canvas colors, persists to localStorage, triggers redraw
- `loadSavedTheme()` — reads localStorage, returns saved theme or Midnight

### Persistence

Theme ID stored in `localStorage` under key `timeline-theme`.

## Theme Picker

A "Color theme >" item in the Timeline menu. On hover, a flyout panel appears with theme rows.

Each row shows 5 color swatches and the theme name. The active theme is highlighted. Clicking applies immediately.

The flyout is appended to `document.body` (not inside the menu which has `overflow: hidden`). It positions to the right of the menu, falling back to the left if it would overflow the viewport. A 150ms grace period allows crossing the gap between the menu item and the flyout.
