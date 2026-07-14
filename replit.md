# Lumina

Lumina is an AI-powered writing companion that helps authors draft, organize, and improve their work through smart suggestions, chapter management, and an ideas scratchpad.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from env)
- `pnpm --filter @workspace/lumina run dev` — run the Lumina frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifacts/lumina)
- API: Express 5 (artifacts/api-server)
- DB: PostgreSQL + Drizzle ORM (lib/db)
- Auth: express-session + bcryptjs (cookie-based sessions)
- AI: OpenAI gpt-4o-mini via Replit AI proxy
- Validation: Zod (manual z.object() schemas — no drizzle-zod)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — DB schema (users, documents, chapters, ideas)
- `artifacts/api-server/src/routes/lumina.ts` — all Lumina API routes
- `artifacts/api-server/src/storage.ts` — DB access layer
- `artifacts/api-server/src/googleDocs.ts` — Google Docs import/export
- `artifacts/lumina/src/` — React frontend (pages, components, hooks)
- `artifacts/lumina/src/index.css` — global styles (dark theme, Merriweather + Inter fonts)

## Architecture decisions

- Session-based auth (express-session + connect-pg-simple) rather than JWT — simpler for a web app, sessions stored in Postgres
- `bcryptjs` (pure JS) instead of native `bcrypt` — no native build step needed in Replit
- Manual `z.object()` schemas in lib/db instead of `drizzle-zod` — drizzle-zod@0.8.3 is incompatible with zod@3.25.x (private type changes broke type constraints). Works fine at runtime; this avoids the build-breaking TS error
- AI model: `gpt-4o-mini` via `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` (Replit AI proxy)
- Session augmentation in `src/types/session.d.ts` (augments express-session `SessionData`); tsconfig adds `"express-session"` to `types` array

## Product

- Sign in / register with username + password
- Create and manage multiple writing documents (fiction, non-fiction, etc.)
- Rich text editor with per-chapter organization
- AI writing suggestions and a writing coach
- Ideas scratchpad for capturing inspiration
- Google Docs import and export

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` — the api-server needs fresh lib declarations
- Do not use `drizzle-zod` for new schemas — use `z.object()` directly (see architecture decisions)
- Session secret falls back to a hardcoded dev string if `SESSION_SECRET` env var is not set — set it for production
- Google Docs routes require `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` env vars

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
