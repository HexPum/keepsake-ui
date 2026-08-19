# Keepsake

This document provides context about the Keepsake project for the different agents.

## What this is

Keepsake is a **UI fork** of [Karakeep](https://github.com/karakeep-app/karakeep)
(previously Hoarder), a self-hostable "read-it-later" bookmark manager. Same
bookmarking engine underneath — crawling, archiving, AI tagging and
summarisation, search, sync, the API, the mobile and browser clients — that's
all Karakeep's, unchanged. This fork does not add engine features. It replaces
the layer you look at: a denser list, a reading-focused detail view, a runtime
theme system, and a consistent visual language across the dashboard and
settings.

**Design mission, treat as fixed unless the user says otherwise:** no
thumbnails or image previews anywhere. Saved items are represented entirely by
their AI-generated title and AI summary, so the list reads like a briefing,
not a gallery.

## Design system — source of truth, read before touching any dashboard UI

- **`design/README.md`** — the full token spec: colour (default + alternate
  theme tones), typography scale, spacing, radius, and the elevation rule
  ("no shadows — surfaces separate by border and background-step only, keep
  it that way"). This is the design intent; treat its token tables as
  authoritative over any stray inline value elsewhere.
- **`apps/web/lib/dense/theme.ts`** — those tokens made real as
  runtime-switchable presets (accent / surface tone / reading emphasis). The
  file's own header comment states its values are transcribed from
  `design/README.md`, nothing invented. Keep that contract: a token change
  starts in `design/README.md`, then gets mirrored here — never the reverse.
- **`apps/web/app/dashboard/dense-theme.css`** — the CSS custom-property
  defaults / classes those presets override.
- **`design/presets/`** and the Figma export in `design/figma_keepsake_final/`
  — reference mockups for screens not yet built (mobile UI, search/filter).
  Check there before inventing a new layout from scratch.

## Project overview (upstream Karakeep — unchanged by this fork)

Karakeep is a monorepo managed with Turborepo. Tech stack:

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Hono, tRPC
- **Database:** Drizzle ORM
- **Tooling:** Oxfmt, oxlint, Vitest, pnpm

### Applications (`apps/`)

- **`web`:** The main web application (Next.js) — this is where Keepsake's UI
  work happens. shadcn components live in `apps/web/components/ui`.
- **`browser-extension`:** Saves content to Karakeep from the browser.
- **`cli`:** Command-line interface for the service.
- **`landing`:** Landing page.
- **`mobile`:** Mobile app (Expo).
- **`mcp`:** Model Context Protocol server for talking to Karakeep.
- **`workers`:** Background processing.

### Packages (`packages/`)

- **`api`:** Hono + tRPC API.
- **`db`:** Schema and migrations (Drizzle ORM).
- **`e2e_tests`:** End-to-end tests.
- **`open-api`:** OpenAPI specs.
- **`sdk`:** SDK for the API.
- **`shared`** / **`shared-react`** / **`shared-server`:** Code shared across
  packages, by layer.
- **`trpc`:** tRPC router and procedures — most business logic lives here.

### Docs

- `docs/docs/03-configuration.md` — configuration options.

## Common commands

- `pnpm typecheck` / `pnpm lint` / `pnpm lint:fix` / `pnpm format` /
  `pnpm format:fix` / `pnpm test`
- `pnpm db:generate --name description_of_schema_change` — after a schema
  change
- `pnpm web` / `pnpm workers` — start a service (foreground, doesn't return)
