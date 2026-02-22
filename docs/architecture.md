# Architecture

## Overview

Timeline is a single-page web application that renders an interactive horizontal timeline on an HTML Canvas. The surrounding UI (controls, panels) uses standard HTML/CSS. There is no framework — all DOM manipulation is direct.

## Tech Stack Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| No framework | Vanilla TypeScript | The core is Canvas rendering, which no framework helps with. The HTML UI layer is thin. Avoids dependency churn. |
| Canvas for timeline | HTML5 Canvas API | Needed for smooth pan/zoom across potentially thousands of events spanning millennia. DOM-based rendering would not scale. |
| HTML for UI controls | Standard DOM | Accessibility, text handling, and form elements work best as real DOM nodes. |
| Zero runtime deps | Hand-written code | Minimizes attack surface, avoids dependency hell, ensures full understanding of the codebase. |
| pnpm | Strict dependency isolation | Prevents phantom dependencies. Exact version pinning for reproducibility. |
| Vite | Dev server + bundler | Fast HMR, native TypeScript support, minimal configuration. Dev dependency only. |

## Module Structure

### `src/data/`
Responsible for loading and parsing event data. Fetches from a static JSON file in `public/`, determined by the timeline config (see `src/timeline-config.ts`). IndexedDB serves as the primary store after first load — all functions accept a slug parameter for per-timeline isolation.

### `src/timeline/`
The Canvas rendering engine. Handles drawing the timeline axis, events, nested groups, and all visual representation. This module should be self-contained and receive prepared data — it should not know where the data comes from.

### `src/ui/`
HTML/CSS components for controls, information panels, and other non-Canvas UI. Communicates with the timeline engine through a defined interface. Includes the tooltip (`tooltip.ts`) and event list panel (`eventList.ts`) for toggling event visibility.

### `src/types.ts`
Shared TypeScript type definitions used across all modules.

### `src/timeline-config.ts`
URL routing for multiple timelines. Reads `location.pathname`, looks up the slug in `public/timelines.json`, and returns a config with data URL, default theme, and storage slug. Each path gets isolated IndexedDB and localStorage.

### `src/main.ts`
Application entry point. Wires together data loading, the timeline engine, and UI controls. Owns the viewport, layout, animation state, and event visibility. Layout is recomputed dynamically when events are toggled visible/hidden, with animated transitions (Y interpolation and alpha fading) handled in the rAF draw loop.

## Key Principles

1. **Separation of concerns**: Data loading, rendering, and UI are independent modules.
2. **Documentation first**: Specs are written before code. Docs in `docs/` are the source of truth for feature intent and decisions.
3. **Minimal dependencies**: Every dependency must justify its existence.
4. **Progressive complexity**: Start simple, add features incrementally. Each feature is self-contained and documented.
