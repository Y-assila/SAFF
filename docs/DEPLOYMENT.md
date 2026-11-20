# SAFF — Deployment

*v0.1 · 20 Nov 2026 · Workflow: `.github/workflows/deploy.yml` (manual: Actions → Deploy → choose staging or production)*

Production is **Cloudflare Pages** (frontend) plus **Supabase** (database, Auth, Realtime, Edge Functions). GitHub Pages is not used: SAFF needs response headers and SPA rewrites (TD issue 10).

## 1. One-time setup (per environment: staging first, then production)

**Supabase**
1. Create a project in an EU region, close to Morocco.
2. **Auth:** disable public sign-ups (barber accounts are created by the platform admin).
3. **Realtime:** check that public broadcast channels are allowed (open blocker B-5: re-check on hosted).
4. **Edge Function secrets** (`supabase secrets set --project-ref <ref> KEY=value`). Use long random values (`openssl rand -base64 48`) and never reuse local ones:

| Secret | Value |
|---|---|
| `TICKET_HMAC_SECRET_V1` | random, ≥ 32 bytes |
| `RATE_LIMIT_PEPPER` | random, ≥ 32 bytes |
| `DISPATCH_SECRET` | random, ≥ 32 bytes (also stored in Vault, step 6) |
| `APP_ORIGINS` | the site origin(s), e.g. `https://saff.ma` |
| `APP_BASE_URL` | the site origin used in WhatsApp links |
| `TURNSTILE_SECRET` | from Cloudflare Turnstile (real keys) |
| `TRUSTED_PROXY_HOPS` / `TRUST_CF_CONNECTING_IP` | after verifying the platform's proxy chain (see SECURITY-REVIEW) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | from Meta, once onboarded |
| `WHATSAPP_GRAPH_VERSION` | the Graph API version in use |

   **Never set** `SAFF_ENVIRONMENT=local`, `TURNSTILE_VERIFY_URL` or `WHATSAPP_API_BASE` outside local development.
5. After the first deploy, run once as the service role (SQL editor):
   `select public.admin_configure_whatsapp_dispatch('https://<ref>.supabase.co/functions/v1/whatsapp-dispatch', '<DISPATCH_SECRET>');`
6. **Backups:** enable daily backups, plus Point-in-Time Recovery for production (plan-dependent; see OPERATIONS.md).

**Cloudflare**
1. Create a Pages project (direct upload). Add the custom domain once decided (D-04).
2. Turnstile: create a widget for the domain, which gives a site key (public) and a secret (step 4 above).
3. Create an API token with *Cloudflare Pages: Edit*.

**GitHub** → Settings → Environments → `staging` and `production` (protect **production** with required reviewers):

| Kind | Name |
|---|---|
| Secret | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN` |
| Variable | `SUPABASE_PROJECT_REF`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`, `VITE_SUPABASE_URL` (https), `VITE_SUPABASE_ANON_KEY` (public), `VITE_TURNSTILE_SITE_KEY`, `VITE_PUBLIC_APP_URL` (the final https domain; leave empty until decided, which keeps QR posters watermarked) |

## 2. Deploying

Actions → **Deploy** → *Run workflow* → environment. The workflow:
1. checks every required setting is present (it fails with a clear message otherwise);
2. runs typecheck, lint and unit tests;
3. links the Supabase project, prints pending migrations (dry run), then applies them with `db push --remote`. Migrations are forward-only and reviewed in PRs.
4. deploys all Edge Functions, each authenticating itself (`verify_jwt = false` in `config.toml`);
5. builds the SPA with the environment's public variables. The CSP `connect-src` gets the Supabase origin automatically.
6. publishes `dist/` to Cloudflare Pages, including `_headers` (CSP, no-referrer, HSTS, noindex on `/t`) and `_redirects`.

Order matters: database first, then functions, then frontend. Old frontends keep working, because migrations only add.

## 3. First production launch checklist

- [ ] Staging soak: full barber day simulated (open → joins → calls → close), Realtime live, WhatsApp test number receiving all 3 templates in 3 languages.
- [ ] `VITE_PUBLIC_APP_URL` set to the final domain, and the QR poster shows no watermark.
- [ ] Consent text approved by a lawyer (B-6), its version bumped in `src/features/customer/consent.ts`.
- [ ] Meta templates approved; webhook registered and verified.
- [ ] Everything in SECURITY-REVIEW.md "Before launch" ticked.
- [ ] `select public.ops_health()` clean (OPERATIONS.md).
