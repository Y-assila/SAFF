# SAFF

**Your turn. On your time.** · **دورك، في الوقت المناسب لك.**

SAFF is a digital queue management platform for barbershops. Customers scan a shop's permanent QR code, join the queue with their name and phone number, receive a digital ticket and track their turn remotely. Barbers manage the queue from a dedicated dashboard.

> Status: **Milestone 0 (Foundation)**. Frontend shell, design system, i18n (AR/FR/EN with RTL) and landing page. No backend yet. See [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · i18next · React Router. Planned: Supabase (PostgreSQL, Auth, Realtime, Edge Functions), WhatsApp Business Cloud API, Cloudflare Pages.

## Getting started

Requires Node.js 22+.

```bash
npm install
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

## Project layout

```
docs/                         implementation plan, decisions, blockers
SAFF_Exact_Logo_Brand_Kit_v1.2/  approved brand kit (source of truth, do not edit)
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
