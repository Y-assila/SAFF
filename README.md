# SAFF

**Your turn. On your time.** · **دورك، في الوقت المناسب لك.**

SAFF is a digital queue management platform for barbershops. Customers scan a shop's permanent QR code, join the queue with their name and phone number, receive a digital ticket and track their turn remotely. Barbers manage the queue from a dedicated dashboard.

> Status: **Milestone 3**. The barber app (sign in, live queue dashboard, settings) runs on the local Supabase backend: schema, RLS and the queue engine. Next is the customer join and ticket flow (Milestone 4). See [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · i18next · React Router. Planned: Supabase (PostgreSQL, Auth, Realtime, Edge Functions), WhatsApp Business Cloud API, Cloudflare Pages.

## Getting started

Requires Node.js 22+.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run db:start
```

```bash
npm run dev
```

Open http://localhost:5173. In development, the component gallery is at `/dev/ui`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | TypeScript project build (app, node, tests) |
| `npm run lint` | oxlint |
| `npm test` | Vitest (unit, component, i18n, brand-asset integrity) |
| `npm run preview` | Serve the production build |
| `npm run db:start` / `db:stop` | Start/stop the local Supabase stack (needs Docker) |
| `npm run db:reset` | Re-create the local database from migrations + local seed |
| `npm run db:test` | Run the pgTAP database tests |
| `npm run db:test:concurrency` | Race real parallel clients against the queue engine (local DB only) |
| `npm run test:e2e` | Playwright E2E against the local stack (needs `db:start` and `.env.local`) |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the local schema |

## Local database

Requires Docker. `npm run db:start` prints the local API URL and keys. These are Supabase's standard local development values, not secrets. Public sign-up is disabled, so create a barber account with the Auth admin API using the local service key:

```bash
curl -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SERVICE_ROLE_KEY" -H "authorization: Bearer $SERVICE_ROLE_KEY" -H 'content-type: application/json' -d '{"email":"barber@test.local","password":"<password>","email_confirm":true}'
```

Then add the membership in SQL (`insert into public.shop_members (shop_id, user_id, role) ...`).

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and `claude/**` branches and on every pull request:

| Job | Steps |
|---|---|
| Frontend | `npm ci` → typecheck → lint → unit tests → production build |
| Backend + E2E | `npm ci` → start local Supabase in Docker (applies every migration from scratch) → pgTAP tests → concurrency tests → Playwright E2E |

## Project layout

```
.github/workflows/ci.yml      CI pipeline
docs/                         implementation plan, decisions, blockers
SAFF_Exact_Logo_Brand_Kit_v1.2/  approved brand kit (source of truth, do not edit)
supabase/migrations/          database schema (applied in order)
supabase/tests/database/      pgTAP tests
public/brand/                 exact copies of the logo files served by the app
public/_headers, _redirects   Cloudflare Pages security headers and SPA fallback
src/styles/index.css          brand tokens (Tailwind theme)
src/i18n/                     locales and RTL/LTR handling
src/components/ui/            reusable UI primitives
src/components/layout/        app shell, navigation, language switcher
src/pages/                    routes
```

## Brand rules

Use only the supplied logo files. Never redraw, recolour, stretch or mirror them. A test fails if `public/brand/*` diverges from the brand kit. Colours are limited to the brand tokens; the default Tailwind palette is disabled.
