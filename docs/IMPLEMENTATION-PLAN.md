# SAFF — Implementation Plan

*Status: Foundation (Milestone 0) delivered for review · 19 Nov 2026*

## 0. Sources of truth

| Document | Location | Status |
|---|---|---|
| Technical Design v1 (Foundation) | `BarberQueue — Technical Design v1 (Foundation).docx` | **Approved by the product owner on 19 Nov 2026**, including all 14 recommendations. Read in full. **Ends at §7.** It refers to §8 (remaining RPCs) and Phases 0–5, which are not in the file. |
| PRD v1.0 | **Not in the repository** | The technical design cites it (§3.2, §5.4, §6.1–6.6, §7, §8, §11.5, §13, §18), but the file isn't here. |
| Brand kit v1.2 | `SAFF_Exact_Logo_Brand_Kit_v1.2/` | Read in full: guidelines, tokens, logos, previews, showcase. |

Where this plan says "TD §x", it means the technical design. Nothing below adds product behaviour beyond those documents. Open questions are listed in §10 and are not settled here.

## 1. Architecture overview

```
Customer phone ──► React SPA (Cloudflare Pages) ──► Edge Functions (Deno)
                                                     join-queue · ticket-get · ticket-action · whatsapp-webhook
                                                          │ service_role
                                                          ▼
Barber (Supabase Auth) ──► supabase-js ──► PostgreSQL (Supabase)
                                            ├─ queue engine: SECURITY DEFINER RPCs, lock-first (TD §6)
                                            ├─ tables with RLS: members read-only, anon nothing (TD §5)
                                            ├─ notifications = transactional outbox (TD §4.5)
                                            │    └─ pg_net + pg_cron ─► whatsapp-dispatch ─► WhatsApp Cloud API
                                            └─ realtime.send({v}) ping ─► clients refetch (TD §2, issue 4)
```

The six core decisions come from TD §0:
1. Every queue change takes one lock (`queue_sessions` row `FOR UPDATE`), and ticket numbers are allocated while that lock is held.
2. The state machine lives in the database: a `ticket_transitions` table, a trigger, and partial unique indexes.
3. Clients never write tables. Barbers write through RPCs. Customers write only through Edge Functions.
4. WhatsApp goes through a transactional outbox, so a failed message never rolls back a ticket.
5. Realtime carries only a version ping, never personal data.
6. Ticket tokens are stateless HMAC tokens, passed in the URL fragment (`/t#<token>`).

### Frontend (delivered in Milestone 0)

| Concern | Decision |
|---|---|
| Build | Vite 8, React 19, TypeScript 7 (strict, `tsc -b` with separate app/node/test projects) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`). **The default palette is removed** (`--color-*: initial`), so only brand tokens exist as utilities: `midnight`, `surface`, `signal`, `soft`, `muted`, `line`, `graphite` (+ provisional `danger`). |
| Fonts | Self-hosted through `@fontsource` (Plus Jakarta Sans variable, IBM Plex Sans Arabic 400–700). There are no requests to third-party font services, which keeps ticket pages free of external calls (TD §7). |
| i18n | `i18next` + `react-i18next` (TD §2.3 approves "an i18n library"). Locales are `ar` (RTL), `fr`, `en`. FR and AR are type-checked against EN, so a missing key fails `tsc`. |
| Direction | `lang` and `dir` are set on `<html>` on every language change. Layout uses logical utilities only (`ms-*`, `pe-*`, `start-*`, `text-start`). Nothing is reversed by hand. Directional icons use `rtl:-scale-x-100`. Language options carry their own `lang`/`dir`. Inputs default to `dir="auto"`, and phone fields take `dir="ltr"`. `:lang(ar)` switches the font at any level. |
| Routing | `react-router` v8 (data router). **This is an addition to the listed stack**: SPA deep links (`/t`, `/barber`, shop pages) require a router. Please confirm. |
| Hosting | Cloudflare Pages: `public/_redirects` (SPA fallback) and `public/_headers` (CSP, `Referrer-Policy: no-referrer`, HSTS, `noindex` + `no-store` on `/t`). |
| Tests | Vitest + Testing Library + jsdom (TD §2.3). Playwright and pgTAP arrive with later milestones. |
| Lint | oxlint (the current Vite template default). |

Not added yet, deferred to the milestone that needs them (all are already approved in TD §2.3): TanStack Query, Zod, libphonenumber-js, `@supabase/supabase-js`, Turnstile.

## 2. Milestones

Each milestone is reviewed before the next one starts.

| # | Milestone | Scope | Exit criteria |
|---|---|---|---|
| **0** | **Foundation** ✅ | Vite/React/TS, Tailwind tokens, fonts, i18n + RTL, app shell, UI primitives, exact logo, landing page, placeholder routes, Cloudflare headers | Build, typecheck, lint and tests all green. **Done; awaiting review.** |
| 1 | Local backend + schema | Supabase CLI project; migrations for TD §4.1–4.5 (types, tenant tables, sessions, tickets, transitions, outbox, events, rate limits); privileges + RLS (TD §5); seed script for **local only** | `supabase db reset` works; pgTAP tests pass for RLS isolation and all invariants (§5) |
| 2 | Queue engine RPCs | `join_queue`, `start_queue`, `pause/resume`, `close_queue` (→ `expired`), `reopen_queue`, `call_next_customer`, `mark_arrived`, `start_service(p_skip_arrival)`, `complete_service`, `skip_ticket(reason)`, `cancel_ticket`, `reveal_phone`, `reissue_ticket_link`, `public_get_shop`; `bump_session` ping | pgTAP state-machine + concurrency tests (parallel joins, double CALL NEXT, etc., TD §6.1 table) |
| 3 | Barber app | Supabase Auth sign-in (public sign-up disabled), shop membership, dashboard with *In service* / *Called* slots, waiting list (names only), settings (owner); Realtime ping + 20 s polling fallback | Vitest + Playwright E2E against local Supabase |
| 4 | Customer flow | Edge Functions `join-queue` (Turnstile, rate limits, E.164 normalisation, consent), `ticket-get`, `ticket-action`; HMAC tokens; shop page, join form, ticket page, on-the-way / cancel | E2E: join → track → call → serve; token tamper/guess tests return generic 404 |
| 5 | WhatsApp | Outbox dispatcher, templates (FR/AR), webhook signature verification, delivery statuses, retries, suppression | Failed sends never affect tickets; idempotency verified |
| 6 | Hardening + launch | Retention/anonymisation job, nightly stale-session job, monitoring, backups, staging→prod, legal (CNDP), QR generation & print | Security review checklist complete; staging soak test |

> **The WhatsApp Business onboarding (TD issue 14) should start now, in parallel.** It is the longest lead-time item.

## 3. Dependencies

| Dependency | Needed by | Owner | Lead time |
|---|---|---|---|
| PRD v1.0 file in repo | M1 | Product | — |
| Missing TD §8+ (remaining RPC specs, phase plan) | M2 | Architect | — |
| Answers to §10 decisions | M1 (D-01, D-03, D-04, D-05), M4 (D-02, D-06) | Product / Security | — |
| Supabase projects (staging, prod) + CLI access | M1 | Ops | hours |
| Cloudflare account, Pages project, domain, Turnstile keys | M4 (Turnstile), M6 (domain) | Ops | days (domain) |
| Meta Business verification, WhatsApp number, FR/AR template approval | M5 | Business | **days–weeks** |
| Moroccan legal review (Law 09-08, CNDP declaration) | M6 | Legal | weeks |
| Native FR/AR copy review | M3–M6 | Content | days |

## 4. Database implementation sequence (Milestone 1–2)

Each step is a separate migration, with pgTAP tests written in the same PR.

1. `app` schema, extensions (`pgcrypto`, `citext` if the slug uses it, `pg_net`, `pg_cron`), enums (TD §4.1).
2. `shops`, `shop_settings`, `profiles`, `shop_members`, `app.is_shop_member` (TD §4.2).
3. `queue_sessions` with the one-live-session partial unique index (TD §4.3).
4. `tickets` with composite FKs, the uniqueness constraints and the partial unique indexes (TD §4.3).
5. `ticket_transitions` seed + `enforce_ticket_transition` trigger (TD §4.4).
6. `notifications` (outbox), `queue_events` (append-only), `rate_limits` + `check_rate_limit` (TD §4.5).
7. Revoke defaults, column grants, RLS policies (TD §5). **This lands before any RPC**, so the database is closed by default from the start.
8. Engine helpers: `app.bump_session`, `app.log_event`.
9. RPCs in dependency order: `start_queue` → `join_queue` → `call_next_customer` → `mark_arrived` → `start_service` → `complete_service` → `skip_ticket` → `cancel_ticket` → `pause/resume` → `close_queue` → `reopen_queue` → `reveal_phone` → `reissue_ticket_link` → `public_get_shop`.
10. Jobs: nightly stale-session finish, PII anonymisation after `pii_retention_days`, outbox sweeper.

Production migrations are applied only through CI from reviewed PRs, never by hand.

## 5. Security implementation sequence

1. **M0 (done):** CSP and security headers; `no-referrer`; `noindex`/`no-store` on `/t`; no third-party requests; no secrets in the frontend (`.env*` ignored; only `VITE_` public values will ever reach the bundle); the dev gallery is excluded from production builds.
2. **M1:** RLS enabled on every table; `revoke all` from `anon`/`authenticated`; column-level grants (no `customer_phone` for barbers); the `app` schema is not exposed; public sign-up disabled. pgTAP checks that a member of shop A cannot read shop B, and that anon can read nothing.
3. **M2:** every RPC is `SECURITY DEFINER` with `search_path = ''`, derives `shop_id` from rows (never from the client) and checks membership. Customer RPCs are granted to `service_role` only.
4. **M4:** Edge Functions validate with Zod, check Turnstile, rate limit (hashed IP / phone / shop), and verify HMAC tokens in constant time with a generic 404. Tokens travel in the `Authorization` header, never in query strings. `Cache-Control: no-store`. Secrets live only in Edge Function secrets.
5. **M5:** verify the WhatsApp webhook signature (`X-Hub-Signature-256`); utility templates only; at most one message per ticket event (dedupe keys); official Cloud API only.
6. **M6:** retention/anonymisation, audit review, dependency audit, a pen-test checklist, secret rotation procedure (token `v1`/`v2` prefix).

## 6. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Unit / component | Vitest + Testing Library | UI primitives, i18n parity, RTL switching, validation schemas, token helpers |
| Brand integrity | Vitest | Served logo files are byte-identical to the brand kit (sha256), already in place |
| Database | pgTAP (Supabase CLI) | Every transition (allowed + rejected), invariants, RLS per role, column privileges, idempotency, concurrency (parallel sessions via `dblink` or scripted clients) |
| Edge Functions | Deno test | Validation, rate limits, token verification, error mapping (generic 404) |
| E2E | Playwright | Customer join/track, barber cycle, AR/FR/EN, mobile viewport, Realtime + polling fallback |
| Accessibility | Testing Library roles + axe in Playwright | Landmarks, labels, focus, contrast |
| CI | GitHub Actions | `typecheck`, `lint`, `test`, `build`, then pgTAP against an ephemeral local Supabase, then E2E |

## 7. Deployment plan

- **Environments:** local (Supabase CLI), staging, production. Each has its own Supabase project, WhatsApp test/prod number and Turnstile keys (TD §2.3).
- **Frontend:** Cloudflare Pages connected to GitHub. Preview deploys per PR; `main` deploys to staging; tagged releases go to production. Build command `npm run build`, output `dist/`.
- **Backend:** `supabase db push` and `supabase functions deploy` from CI with environment-scoped secrets. Migrations are forward-only.
- **Headers:** `public/_headers`. Extend the CSP `connect-src` with the Supabase URL/WSS and add Turnstile in M3/M4.
- **Not GitHub Pages:** it cannot set response headers or SPA rewrites (TD issue 10).

## 8. Milestone 0 deliverables

```
docs/IMPLEMENTATION-PLAN.md       this document
public/brand/*                    exact brand-kit files (byte-identical, tested)
public/_headers, public/_redirects Cloudflare Pages config
src/styles/index.css              Tailwind v4 theme = brand tokens
src/i18n/                         config, detection, typed locales (en/fr/ar), document dir/lang
src/components/ui/                Button, Input, Card, Badge, Dialog, Spinner, Loading/Empty/Error states, icons
src/components/brand/             Logo (exact files), Tagline (localised text)
src/components/layout/            AppShell, SiteHeader (responsive nav + mobile menu), SiteFooter, LanguageSwitcher
src/pages/                        Landing, Placeholder (shop/ticket/barber), NotFound, RouteError, DesignSystem (dev only)
src/app/routes.tsx                route map
```

Routes: `/`, `/s/:slug` (provisional), `/t`, `/barber/login`, `/barber`, `/dev/ui` (dev only), and a 404 for everything else. Feature routes show an honest "coming soon" state. They call no backend and contain no fake data.

## 9. Blockers to resolve before database implementation (Milestone 1)

| # | Blocker | Impact | Suggested resolution |
|---|---|---|---|
| B-1 | **PRD v1.0 is missing from the repo.** | Ticket states, consent wording, retention and estimate rules can't be checked against the original. Risk of building on paraphrase. | Add the PRD (Markdown or docx) under `docs/`. |
| B-2 | **TD is truncated after §7.** §8 ("remaining RPCs follow the same pattern") and the Phase plan are referenced but missing. | No specs for `start_queue`, `pause/resume`, `close_queue`, `reopen_queue`, `mark_arrived`, `start_service`, `skip_ticket`, `cancel_ticket`, `reveal_phone`, `reissue_ticket_link`, `public_get_shop`, or for the Edge Function contracts. | Supply §8+. Otherwise I can draft their specs from TD §1/§6 for approval *before* writing SQL. |
| ~~B-3~~ | **Resolved (TD approved):** the MVP ships without phone verification. Mitigations are Turnstile, rate limits, the per-shop cap and utility-only templates. `shop_settings.require_phone_verification` exists and defaults to `false`; inbound-WhatsApp verification is the next step after the MVP. | — | — |
| ~~B-4~~ | **Resolved:** TD v1 is approved as written, including the 14 PRD changes (status `expired`, extra transitions, `shop_settings`, HMAC tokens, `reveal_phone`, 30-day anonymisation, ticket-number ordering, and the rest). The TD state machine (§4.4) is authoritative. | — | — |
| B-5 | **Realtime public vs private channels** (TD §5: "we verify this in Phase 0"). | Decides whether customers can subscribe anonymously or need private channels with a `realtime.messages` policy. | Verify on the actual Supabase project once it exists (M1, step 0). |
| B-6 | **Legal: Law 09-08 / CNDP declaration** (TD issue 9). | Retention period and consent text version are stored in the schema. | Legal confirmation of retention days and consent text before M4. Doesn't block M1. |

## 10. Unresolved technical / product decisions

| ID | Decision | Current state | Needed by |
|---|---|---|---|
| D-01 | Approve TD v1 in full (see B-4) | **Approved 19 Nov 2026** | — |
| D-02 | **Permanent QR URL format.** Once QR codes are printed, the URL can never change. Proposed: `https://<domain>/s/<slug>`. Slugs must then be immutable too. | `/s/:slug` used provisionally | Before any QR is printed (M4) |
| D-03 | Phone verification in MVP (B-3) | **No** (flag off; TD issue 6) | — |
| D-04 | Production domain | Unknown | M4 (token links), M6 |
| D-05 | Default UI language. TD defaults shops to `fr`; the app falls back to `fr` when neither the stored choice nor the browser language matches. | `fr` | M3 |
| D-06 | Should the customer's ticket page follow the ticket `locale` or the browser? | Not specified | M4 |
| D-07 | **Brand: localised lockups.** The kit's primary SVG embeds the English tagline, and there is no Arabic lockup (صفّ) or wordmark-only file, although the showcase image shows them. The AR/FR UI currently uses the English lockup in the hero, the symbol in compact places, and the localised tagline as live text. | Workaround in place | Before launch |
| D-08 | **Brand: French tagline.** The kit gives only EN and AR. I used "Votre tour. À votre rythme." as a **draft**. | Needs approval | Before launch |
| D-09 | **Brand: error colour.** The kit defines no functional colour for errors. A provisional `--color-danger: #FF6B6B` is used only for validation and errors, always with an icon and text. | Needs approval | M3 |
| D-10 | **Brand: token naming.** The user brief lists 6 colours. The kit's tokens also include Graphite `#777B84` (used inside the logo), which is kept as a supporting token. | Kept | — |
| D-11 | **Brand kit location.** The brief says `brand/logos/`; the kit is at `SAFF_Exact_Logo_Brand_Kit_v1.2/logos/`. Left in place untouched; app copies live in `public/brand/` and are hash-checked. | Kept | — |
| D-12 | `react-router` added for routing (not in the listed stack). | Needs approval | — |
| D-13 | Arabic numerals. Latin digits (`ar-MA-u-nu-latn`) are used in Arabic, as is common in Morocco. | Assumed | M3 |
| D-14 | Accidental *Start service* cannot be undone in the MVP (TD §1 note a). | Accept or schedule `revert_last_action` for v1.1 | M2 |
| D-15 | The product name in the TD is "BarberQueue"; the brand is SAFF. All code uses SAFF. | Assumed | — |

## 11. Known limitations of Milestone 0

- FR and AR copy is machine-quality and needs native review before launch.
- The main JS bundle is ~397 kB (~126 kB gzip): React 19 + router + i18next. Route-level code splitting comes with M3/M4, once real feature pages exist.
- The CSP is strict (`'self'` only). It will be extended deliberately when Supabase and Turnstile are integrated.
