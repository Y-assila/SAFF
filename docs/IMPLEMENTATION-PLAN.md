# SAFF — Implementation Plan

*Status: Milestones 0–6 ✅ in code (M6 delivered for review). Launch now depends on outside parties: hosting accounts, domain, Meta, legal · 20 Nov 2026*

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

Added in M3: `@supabase/supabase-js`, TanStack Query, Playwright. Added in M4: libphonenumber-js (browser + vendored for Edge Functions) and Cloudflare Turnstile. Zod was not needed: the Edge Functions use small hand-written validators, so they import nothing at runtime.

## 2. Milestones

Each milestone is reviewed before the next one starts.

| # | Milestone | Scope | Exit criteria |
|---|---|---|---|
| **0** | **Foundation** ✅ | Vite/React/TS, Tailwind tokens, fonts, i18n + RTL, app shell, UI primitives, exact logo, landing page, placeholder routes, Cloudflare headers | Build, typecheck, lint and tests all green. **Done; awaiting review.** |
| **1** | **Local backend + schema** ✅ | Supabase CLI project; migrations for TD §4.1–4.5 (types, tenant tables, sessions, tickets, transitions, outbox, events, rate limits); privileges + RLS (TD §5); seed script for **local only** | `supabase db reset` works; pgTAP tests pass for RLS isolation and all invariants (§5). **Done: 8 migrations, 74 pgTAP tests; see §12.** |
| **2** | **Queue engine RPCs** ✅ | `join_queue`, `start_queue`, `pause/resume`, `close_queue` (→ `expired`), `reopen_queue`, `call_next_customer`, `mark_arrived`, `start_service(p_skip_arrival)`, `complete_service`, `skip_ticket(reason)`, `cancel_ticket`, `reveal_phone`, `reissue_ticket_link`, `public_get_shop`; `bump_session` ping | pgTAP state-machine + concurrency tests (parallel joins, double CALL NEXT, etc., TD §6.1 table). **Done: 181 pgTAP assertions + 14 concurrency checks; see §13.** |
| **3** | **Barber app** ✅ | Supabase Auth sign-in (public sign-up disabled), shop membership, dashboard with *In service* / *Called* slots, waiting list (names only), settings (owner); Realtime ping + 20 s polling fallback | Vitest + Playwright E2E against local Supabase. **Done: see §14.** |
| **4** | **Customer flow** ✅ | Edge Functions `join-queue` (Turnstile, rate limits, E.164 normalisation, consent), `ticket-get`, `ticket-action`; HMAC tokens; shop page, join form, ticket page, on-the-way / cancel | E2E: join → track → call → serve; token tamper/guess tests return generic 404. **Done: see §15.** |
| **5** | **WhatsApp** ✅ (pipeline; live sending awaits Meta) | Outbox dispatcher, templates (FR/AR), webhook signature verification, delivery statuses, retries, suppression | Failed sends never affect tickets; idempotency verified. **Done: see §16.** |
| **6** | **Hardening + launch** ✅ (code; launch steps are external) | Retention/anonymisation job, nightly stale-session job, monitoring, backups, staging→prod, legal (CNDP), QR generation & print | Security review checklist complete; staging soak test |

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
| CI | GitHub Actions (`.github/workflows/ci.yml`) ✅ | Frontend job: `typecheck`, `lint`, `test`, `build`. Database job: fresh local Supabase, pgTAP, concurrency suite. E2E is added in M3/M4. |

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
| ~~B-2~~ | **Resolved:** the missing TD §8 was written as [`RPC-SPEC.md`](RPC-SPEC.md) and **approved** (all §9 defaults accepted). | — | — |
| ~~B-3~~ | **Resolved (TD approved):** the MVP ships without phone verification. Mitigations are Turnstile, rate limits, the per-shop cap and utility-only templates. `shop_settings.require_phone_verification` exists and defaults to `false`; inbound-WhatsApp verification is the next step after the MVP. | — | — |
| ~~B-4~~ | **Resolved:** TD v1 is approved as written, including the 14 PRD changes (status `expired`, extra transitions, `shop_settings`, HMAC tokens, `reveal_phone`, 30-day anonymisation, ticket-number ordering, and the rest). The TD state machine (§4.4) is authoritative. | — | — |
| ~~B-5~~ | **Resolved locally (M1):** an anonymous supabase-js client receives the public `qs:<session>` broadcast from `realtime.send(..., private => false)`. The payload is `{v, id}` (`id` is Realtime's message id), and the ping arrives only after commit. **Re-check once on the hosted staging project**, whose Realtime settings may restrict public channels. | — | — |
| B-6 | **Legal: Law 09-08 / CNDP.** | The consent text and the 30-day retention it promises. | **M4 ships a DRAFT consent text** (`draft-2026-11`, in AR/FR/EN, `src/features/customer/consent.ts`). **Must be approved by a Moroccan lawyer before launch.** Bump the version when the wording changes. |
| B-7 | **Meta business verification (WhatsApp).** | On 22 Nov 2026 the staging test WABA (`1592839862530624`) was found **restricted, permanently, until the business is verified**. Every send fails with error `131031` ("Business Account locked"), test messages included. Tickets are unaffected: sends fail, retry and stop, as designed. | Register the business (company or auto-entrepreneur), choose the domain (D-04) and publish a site showing the business name, then complete Meta business verification. Until then, WhatsApp can only be tested with the offline Meta double (local and CI E2E). |

## 10. Unresolved technical / product decisions

| ID | Decision | Current state | Needed by |
|---|---|---|---|
| D-01 | Approve TD v1 in full (see B-4) | **Approved 19 Nov 2026** | — |
| D-16 | Approve RPC-SPEC (TD §8) | **Approved 19 Nov 2026** | — |
| D-02 | **Permanent QR URL format** | **Decided 19 Nov 2026: `/s/<slug>`.** Slugs are immutable, enforced by a database trigger (migration `20261119230100`, pgTAP 10). | — |
| D-03 | Phone verification in MVP (B-3) | **No** (flag off; TD issue 6) | — |
| D-04 | Production domain | **Not decided (20 Nov 2026).** Configurable via `VITE_PUBLIC_APP_URL`; QR posters are watermarked and printing is disabled until it is a public https origin. | Before printing QR codes |
| D-05 | Default UI language. TD defaults shops to `fr`; the app falls back to `fr` when neither the stored choice nor the browser language matches. | `fr` | M3 |
| D-06 | Ticket page language | **Decided: the ticket's language** (the one the customer joined with); the customer can still switch. | — |
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
- Bundle (M4, after route-level code splitting): entry 333 kB (104 kB gzip). supabase-js (227 kB) loads only on the shop, ticket and barber pages. The ticket page's own chunk is 4 kB. The shop page chunk (126 kB) includes libphonenumber's minimal metadata.
- The CSP is strict (`'self'` only). It will be extended deliberately when Supabase and Turnstile are integrated.

## 12. Milestone 1 deliverables (local backend and schema)

```
supabase/config.toml                       local stack; public sign-up disabled; storage/studio/mail off
supabase/migrations/
  20261119200100_types.sql                 app schema, enums, updated_at helper           (TD §4.1)
  20261119200200_tenants.sql               shops, shop_settings (+auto row), profiles (+auto row on
                                           auth signup), shop_members, app.is_shop_member  (TD §4.2)
  20261119200300_queue_sessions.sql        sessions, one live session per shop             (TD §4.3)
  20261119200400_tickets.sql               tickets, composite FKs, partial unique indexes  (TD §4.3)
  20261119200500_ticket_state_machine.sql  ticket_transitions (20 rows) + triggers         (TD §4.4)
  20261119200600_outbox_events_rate_limits.sql  notifications, append-only queue_events,
                                           rate_limits + check_rate_limit                  (TD §4.5)
  20261119200700_privileges_and_rls.sql    default deny, column grants, policies           (TD §5)
  20261119200800_engine_helpers.sql        app.bump_session (Realtime ping), app.log_event (TD §4.5)
supabase/seed.sql                          LOCAL ONLY: one demo shop, no customers
supabase/tests/database/                   pgTAP: 01 schema · 02 state machine · 03 invariants · 04 RLS
```

**Additions beyond the TD SQL.** Each is marked `[Derived]` in the SQL and comes from TD rules or the ERD:
- `app.touch_updated_at` keeps `updated_at` current on shops, settings and profiles.
- `app.is_valid_timezone` check on `shops.timezone`, because a bad zone would break shop-local dates.
- A settings row is created automatically with each shop, and a profile row with each auth user (both 1:1 relations in the ERD).
- New tickets must start in `waiting`. This is enforced by an insert trigger, because the state machine has no other entry point.
- `queue_events` also blocks `TRUNCATE`, since row triggers don't see truncation.
- `check_rate_limit` validates its arguments.
- EXECUTE on `app.*` functions is revoked from PUBLIC. PostgreSQL grants it by default and the TD SQL didn't remove it.

**Verified:**
- `supabase db reset` applies cleanly.
- **74 pgTAP tests pass.** All 72 status changes are tried, and exactly the 20 approved ones are accepted. Every partial unique index and composite FK is tested, as are append-only events and the rate limiter. The Realtime payload carries only the version.
- RLS is tested as real `authenticated`/`anon`/`service_role` roles: isolation between shops, phone columns refused, no direct writes, owner-only settings, and anon denied everything.
- Checked again through the live HTTP APIs: sign-up returns `signup_disabled`; an admin-created user gets a profile; anon REST reads and RPC calls are denied; a signed-in user without a shop sees `[]`.
- Realtime: an anonymous client receives the ping on a public channel, and only after commit. This is TD §4.5's Phase 1 test, run manually here. It becomes an automated test in M3, once supabase-js is a project dependency.

**Not in M1 (by plan):** queue RPCs (M2), Edge Functions (M4), pg_cron jobs (M6). CI was added after M2.

## 13. Milestone 2 deliverables (queue engine)

```
supabase/migrations/
  20261119210100_engine_core.sql              app.lock_member_session, get_session_ticket,
                                              assert_transition (enforces TD `actors`), apply_status
                                              (timestamps, never overwritten), enqueue_notification,
                                              shop_today, finish_session            (RPC-SPEC §1, §3.4)
  20261119210200_queue_lifecycle_rpcs.sql     start/pause/resume/close/reopen_queue (RPC-SPEC §3)
  20261119210300_barber_ticket_rpcs.sql       call_next_customer, mark_on_the_way, mark_arrived,
                                              start_service, complete_service, skip_ticket,
                                              barber_cancel_ticket, reveal_phone, reissue_ticket_link (§4)
  20261119210400_customer_and_read_rpcs.sql   join_queue, customer_confirm_on_the_way,
                                              customer_cancel_ticket, customer_get_ticket,
                                              app.estimate_wait, public_get_shop, get_queue_stats (§5, §6)
supabase/tests/database/05–08                 lifecycle · barber actions · customer/read · exposure
supabase/tests/concurrency/run.sh             independent psql clients racing (npm run db:test:concurrency)
```

**Verified:**
- **181 pgTAP assertions** across 8 files:
  - lifecycle, including stale sessions (Q-1) and reopen (Q-2);
  - FIFO calling, the called and in-service slots, `p_skip_arrival` audited;
  - skip reasons and the grace period (Q-3, Q-4); phone reveal audited, with the 24 h scope and 30/h limit (Q-5);
  - re-issued links revoke the old token;
  - join validation, idempotency, duplicate phone (Q-10) and the active-ticket cap;
  - the customer view contains no phone number; the wait-estimate arithmetic;
  - public shop info (Q-7);
  - the exact function-exposure table, read from the catalogue.
- **14 concurrency checks** with real parallel clients, matching TD §6.1:
  - 30 simultaneous joins get tickets 1..30 with no gaps;
  - the same phone submitted twice at once gives one ticket;
  - double CALL NEXT gives `called_slot_occupied`;
  - skip vs start: the loser gets `invalid_transition`;
  - double COMPLETE gives `already_completed`;
  - cancel vs call: the next customer is called;
  - join during close gives `queue_closed`.
- **Through PostgREST with real JWTs:** barbers run the queue; `join_queue` is denied to anon and barbers and allowed only for the service role.

**Deviations from the TD reference code (documented in RPC-SPEC §5.1):**
- the idempotent replay check runs before the paused check;
- `join_queue` returns `token_version` for link signing;
- the duplicate-phone response is just `{result:'existing'}`.

## 14. Milestone 3 deliverables (barber app)

```
src/lib/env.ts, supabase.ts, database.types.ts   public config (https-only except localhost), lazy client with
                                                 detectSessionInUrl=false (ticket tokens live in the URL fragment),
                                                 generated DB types (npm run db:types)
src/features/auth/                               AuthProvider (Supabase Auth), RequireAuth guard, safeReturnPath
src/features/shops/useMemberships.ts             the user's shops via RLS
src/features/queue/                              typed API (explicit column lists, never select *), RPC error → i18n,
                                                 hooks with Realtime ping + 20 s polling + refetch on (re)subscribe,
                                                 LiveQueue, ticket cards, confirm/skip/phone/menu dialogs
src/pages/barber/                                sign in, shop chooser, dashboard, settings
src/components/layout/BarberShell.tsx            authenticated shell
vite.config.ts → cspConnectSrc                   writes the Supabase https/wss origin into dist/_headers at build time
e2e/                                             Playwright: fixtures (service-role onboarding, local only), barber specs
supabase/migrations/20261119220100_…             FIX: service role can create shops (timezone CHECK privilege)
.github/workflows/ci.yml                         + Playwright E2E step; actions bumped to v5
```

**Behaviour:**
- **Routes:** `/barber/login` → `/barber` (one shop opens directly; several → chooser) → `/barber/:shopId` dashboard → `/barber/:shopId/settings`.
- **Dashboard states:** no queue (open it) · closed today (reopen) · live.
- **Live view:**
  - **Header:** status, waiting count, wait estimate, pause/resume, close (confirmed).
  - **CALL NEXT:** shows the next number; disabled while someone is called.
  - **In service slot:** Complete.
  - **Called slot:** time since called and grace countdown; Arrived → Start; Start without arrival (confirmed); On the way; Skip (reason required, no-show hidden for waiting customers); more actions.
  - **Waiting list:** numbers and names only, with a per-ticket menu: phone (audited reveal), new link, skip, cancel (confirmed).
- Every database refusal shows a translated message and triggers a refetch. Phone numbers never appear unless revealed.
- **Settings:** owners edit within the database's CHECK ranges; barbers see the values read-only.
- Fully translated in AR/FR/EN with RTL. Customer names are direction-isolated with `<bdi>`.

**Verified:**
- 56 unit/component tests; 185 pgTAP assertions; 14 concurrency checks.
- **12 Playwright E2E tests** (6 scenarios × desktop + Pixel 7), all against the real local stack:
  - wrong-password message; redirect to sign in;
  - a full cycle with **live updates and no reloads** (customers joining from outside appear via Realtime);
  - phone reveal; close then reopen;
  - a database refusal (grace period) shown translated;
  - settings: owner edits, barber read-only;
  - the dashboard in Arabic RTL.
- Visual check of EN/AR on desktop and phone. This found and fixed: the muddy disabled lime button, Arabic names misaligned in LTR lists, and label spacing.

**Defects found by E2E and fixed:**
1. **The service role could not create shops** (M1 privilege bug: the timezone CHECK calls an `app` function whose PUBLIC execute had been revoked). Fixed in migration `20261119220100`, with pgTAP regression test 09.
2. A customer joining between the first fetch and the Realtime subscription only appeared at the next poll. Now the hook refetches when the channel subscribes.
3. The settings form remounted after saving, which lost its "saved" confirmation. It's now keyed by shop.

**Time zones:** both Node's and PostgreSQL's tz data (2026e) put `Africa/Casablanca` at UTC+0 on 19 Nov 2026 and UTC+1 on 1 Jul 2026. The app never assumes a fixed offset (TD issue 8).

## 15. Milestone 4 deliverables (customer flow)

```
supabase/functions/
  _shared/token.ts          HMAC ticket tokens v1 (WebCrypto; constant-time verify; unit-tested in Node)
  _shared/http.ts           origin allow-list, no-store/no-referrer JSON, hardened client IP (rightmost XFF hop)
  _shared/db.ts             fetch-based PostgREST client (service role, server only)
  _shared/ratelimit.ts      HMAC(pepper)-keyed limits (approved Q-9 values)
  _shared/turnstile.ts      siteverify, fail-closed; URL override allowed only when SAFF_ENVIRONMENT=local
  _shared/phone.ts          E.164, region MA, mobile only (approved Q-8)
  _shared/ticketAuth.ts     token → ticket; generic 404, failures rate-limited per IP
  _vendor/libphonenumber.js GENERATED bundle (npm run edge:vendor): no runtime package downloads
  join-queue/, ticket-get/, ticket-action/   (verify_jwt = false; each function authenticates itself)
  .env.example              LOCAL-only settings (Cloudflare test secret, dev-only secrets)
supabase/migrations/20261119230100_shop_slug_immutable.sql   D-02
src/features/customer/      API client, token storage (fragment → device; stripped from URL), Turnstile loader/widget, consent version
src/pages/customer/         ShopPage (/s/:slug), JoinForm, TicketPage (/t)
src/app/routes.tsx          route-level code splitting; barber auth scoped to barber routes
e2e/customer.spec.ts, e2e/api-security.spec.ts, e2e/turnstile*.ts   hermetic Turnstile (test double container + widget stand-in)
```

**Flow:**
1. QR → `/s/<slug>` (public shop info, about N waiting).
2. Join form: name; mobile number; explicit, unchecked consent naming the shop; Turnstile.
3. `join-queue` runs, in order: origin check → per-IP limit → Turnstile → mobile normalisation → per-phone and per-shop limits → `join_queue` → signed token.
4. The token is stored on the device, and a **full page load** goes to `/t` (the ticket page starts without the Turnstile script; the token is never in the address bar).
5. `/t` shows: number, people ahead, estimate, the number now being served, a called banner with grace countdown, *I'm on my way*, and cancel (with confirmation).
6. Updates: Realtime ping + 20 s polling + refetch on subscribe. Opens in the ticket's language (D-06).
7. Duplicate phone: "you already have a ticket", plus whether the link was re-sent by WhatsApp. No id, number or name is returned.

**Verified:**
- 72 unit/component tests (token round-trip, tampering, revocation, weak secrets; join form; ticket page; token storage).
- 188 pgTAP assertions; 14 concurrency checks.
- **30 Playwright tests** (desktop + Pixel 7) against the real stack, including:
  - join from the QR page → private ticket, with no token in the URL and no third-party scripts on `/t`;
  - live update when the barber calls → *on my way*;
  - cancel; duplicate phone; landline refused; consent required; closed and unknown shops; Arabic → RTL ticket;
  - **API security:** missing origin 403; forged captcha 403; landline 400; tampered, forged and revoked tokens give an identical 404; only on_the_way/cancel allowed;
  - **rate limit:** the 11th join is refused **even with forged X-Forwarded-For / CF-Connecting-IP**.

**Defects found and fixed in M4:**
1. **Rate-limit bypass:** the client IP came from the first `X-Forwarded-For` entry and from any client-sent `CF-Connecting-IP`, both forgeable. Now the rightmost hop is used (`TRUSTED_PROXY_HOPS`), and CF-Connecting-IP only with `TRUST_CF_CONNECTING_IP=true`. A regression test covers it.
2. In Arabic, the ticket number was left-aligned. Now only the digits are isolated LTR.
3. The grace countdown could show more than the grace period when the device clock lags. Now clamped.

**Must be verified on hosted staging (cannot be checked locally):**
- **Proxy chain:** set `TRUSTED_PROXY_HOPS` / `TRUST_CF_CONNECTING_IP` so the per-IP limit sees real client IPs.
- **CORS:** the local gateway adds `Access-Control-Allow-Origin: *` to function responses. Confirm hosted functions return only the allow-listed origin. Protection doesn't depend on this header: join enforces Origin and Turnstile server-side, and the ticket endpoints need the HMAC token.
- **Turnstile** with real (non-test) keys, end to end. Tests here use Cloudflare's documented test keys through an offline double, because this environment can't reach Cloudflare.
- **Production secrets:** `TICKET_HMAC_SECRET_V1` and `RATE_LIMIT_PEPPER` must be long random values set with `supabase secrets set`. Never reuse the local ones.

## 16. Milestone 5 deliverables (WhatsApp notifications)

```
supabase/migrations/20261120100100_whatsapp_outbox.sql
    claim_notifications      claims due rows (FOR UPDATE SKIP LOCKED); applies suppression rules
    mark_notification_sent / mark_notification_failed   settle; Q-11 backoff 1/5/15/60 min, max 5 attempts;
                             phone numbers redacted from stored errors
    record_whatsapp_status   delivery receipts, forward-only (sent → delivered → read; failed)
    app.kick_whatsapp_dispatch + AFTER INSERT trigger   pg_net wake-up after commit; errors swallowed
    app.whatsapp_sweep + pg_cron (every minute)         due retries, missed wake-ups, stuck 'sending'
    admin_configure_whatsapp_dispatch                   stores dispatch URL + secret in Supabase Vault
supabase/functions/whatsapp-dispatch/   internal; DISPATCH_SECRET; sends UTILITY templates via the Cloud API
supabase/functions/whatsapp-webhook/    Meta handshake + X-Hub-Signature-256 verified receipts
supabase/functions/_shared/whatsappMessages.ts, crypto.ts   pure, unit-tested (payloads, error classes, signatures)
docs/WHATSAPP-TEMPLATES.md              template texts FR/AR/EN for Meta approval (Q-13)
e2e/whatsapp-mock/, e2e/whatsapp.ts, e2e/whatsapp.spec.ts   Meta Cloud API test double + pipeline E2E
```

**Suppression rules** (a suppressed row is settled and never sent):
- WhatsApp disabled for the shop;
- ticket anonymised or no phone;
- "turn approaching" for a customer no longer called;
- re-sent link superseded by a newer token version.

**Invariant held:** a WhatsApp outage, a misconfigured dispatcher or a pg_net error can never roll back or block a ticket change. All of these are tested.

**Verified:**
- 79 unit tests (7 new);
- **215 pgTAP assertions** (27 new: claim, suppression, backoff, redaction, stuck-row recovery, forward-only receipts, service-role-only exposure, insert succeeds without configuration);
- 14 concurrency checks;
- **37 Playwright tests**, 3 consecutive green runs (7 new, against the real pipeline: outbox → pg_net → dispatch → Meta double → webhook):
  - the template carries the right parameters, and its link opens the ticket;
  - CALL NEXT sends "turn approaching";
  - a temporary error schedules a retry with the ticket untouched;
  - a permanent error fails without retry;
  - nothing is sent when WhatsApp is disabled;
  - the dispatcher rejects missing or wrong secrets;
  - webhook handshake; unsigned or wrong-signature receipts get 401; delivered → read, and a late "sent" is ignored.
- Confirmed in `net._http_response` that pg_net woke the dispatcher (6 calls, all HTTP 200).

**To go live (needs Meta onboarding, TD issue 14):**
1. Meta Business verification; register the SAFF sender number (it can't stay active in the normal WhatsApp app).
2. Submit the three templates in `docs/WHATSAPP-TEMPLATES.md` (fr/ar/en, UTILITY) and wait for approval.
3. `supabase secrets set`: `WHATSAPP_TOKEN` (system-user permanent token), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `DISPATCH_SECRET` (long random), `APP_BASE_URL` (production origin). Never set `WHATSAPP_API_BASE` or `SAFF_ENVIRONMENT=local` in production.
4. As the service role, call `admin_configure_whatsapp_dispatch('https://<project>.supabase.co/functions/v1/whatsapp-dispatch', '<DISPATCH_SECRET>')`.
5. In Meta's app dashboard, register the webhook `https://<project>.supabase.co/functions/v1/whatsapp-webhook` with the verify token, and subscribe to `messages`.
6. On staging, with a Meta test number: send all three templates in all three languages, and check receipts arrive.

## 17. Milestone 6 deliverables (hardening and launch readiness)

```
supabase/migrations/20261120200100_scheduled_jobs.sql
    app.job_finish_stale_sessions   hourly :07  queues still open after 04:00 shop time on the next day (Q-12)
    app.job_anonymize               daily 03:17 name/phone removed after pii_retention_days; stats kept
    app.job_prune_rate_limits       hourly :27
    public.ops_health()             service role: outbox, queues, retention, job runs (counts only)
src/features/shops/qr.ts, src/pages/barber/ShopQrPage.tsx   /barber/:shopId/qr printable poster (A5),
                                    QR encodes /s/<slug>; watermark + printing disabled until VITE_PUBLIC_APP_URL
                                    is a public https origin (D-04); poster call to action in AR/FR/EN
.github/workflows/deploy.yml        manual staging/production deploy: checks → tests → migrations (dry run, then
                                    db push --remote) → Edge Functions → build → Cloudflare Pages
docs/DEPLOYMENT.md, docs/OPERATIONS.md, docs/SECURITY-REVIEW.md
```
New dependency (approved 20 Nov 2026): `qrcode-generator` 2.0.4 (MIT, zero dependencies), barber area only.

**Verified:**
- 82 unit tests;
- **234 pgTAP assertions** (19 new: stale-session closing incl. auto_closed service, idempotence, audit; anonymisation scope, statistics kept, notification phones removed; pruning; schedule; ops_health exposure);
- 14 concurrency checks;
- Playwright: QR poster test on desktop and mobile (encodes `/s/<slug>`, watermark, printing disabled);
- `npm audit --omit=dev`: 0 vulnerabilities.

**Found while writing the deploy workflow:** in Supabase CLI 3.x, `db push` targets the *local* database unless `--remote` is given, and `functions deploy` has no `--project-ref`. A naive workflow would have reported success without touching production. The workflow uses the verified flags and prints a dry run first.

**What remains is outside the code** (see DEPLOYMENT.md §3 and SECURITY-REVIEW.md "Before launch"): Supabase and Cloudflare accounts, the production domain, Meta onboarding and template approval, legal approval of the consent text and the CNDP filing, native-speaker copy review, and a staging soak test.
