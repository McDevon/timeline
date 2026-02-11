# Timeline Project

Personal learning tool: a full-screen, scrollable/zoomable horizontal timeline spanning all of written human history.

## Tech Stack

- **TypeScript** (strict mode), no framework (vanilla)
- **Canvas** for timeline rendering, HTML/CSS for UI controls
- **Vite** for dev server and bundling
- **pnpm** with exact version pinning

## Development Workflow

1. **Documentation first**: write/update specs in `docs/` before implementing
2. Features are documented in `docs/features/` with numbered prefixes
3. Architecture decisions go in `docs/architecture.md`
4. When a feature changes, update its documentation accordingly

## Project Structure

- `docs/` — specifications and decisions (source of truth for feature intent)
- `public/` — static assets including event data JSON
- `src/types.ts` — shared TypeScript types
- `src/data/` — data loading and parsing
- `src/timeline/` — Canvas rendering engine
- `src/ui/` — HTML/CSS UI components

## Commands

- `pnpm dev` — start dev server
- `pnpm build` — type-check and build for production
- `pnpm preview` — preview production build

## Conventions

- Zero runtime dependencies. All code is hand-written.
- Minimize dev dependencies. Question every new package.
- Pin exact versions (configured in `.npmrc`).
- Keep the Canvas rendering engine decoupled from data loading and UI.
