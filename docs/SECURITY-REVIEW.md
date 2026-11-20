# SAFF — Security review checklist

*v0.1 · 20 Nov 2026 · Scope: Milestones 0–6. Each control lists how it is verified ("CI" means it runs on every PR).*

## Verified controls

| Area | Control | Verified by |
|---|---|---|
| Tenant isolation | RLS on every table; members read only their shop; anon reads nothing | pgTAP 04 (as real roles), REST checks (M1) · CI |
| Least privilege | Exact function-exposure table (anon: 1 function; authenticated: 16; customer RPCs and jobs: service role only); every SECURITY DEFINER function pins `search_path` | pgTAP 08, 09, 11, 12 · CI |
| Phone privacy | Phone column not granted to barbers; reveal is audited, scoped to 24 h, limited to 30/h; never in Realtime, ticket view, audit metadata or logs; redacted from stored WhatsApp errors | pgTAP 04, 06, 07, 11; E2E · CI |
| State integrity | Transitions as data, plus trigger, plus actor checks; partial unique indexes; lock-first RPCs | pgTAP 02, 03, 05, 06; 14 concurrency checks · CI |
| Ticket links | HMAC-SHA256 tokens, constant-time verify, revocable (`token_version`), token in fragment, removed from the address bar, never in query strings; generic 404 for every failure, rate-limited | Unit (token), E2E api-security · CI |
| Bot / abuse | Turnstile (fails closed); per-IP/phone/shop limits keyed by HMAC; client IP from the trusted proxy hop (forged XFF/CF headers can't bypass) | E2E api-security · CI |
| Input validation | Edge validation plus database re-validation (names, E.164 mobile only, consent, lengths) | pgTAP 07, E2E · CI |
| Web | CSP (`'self'` plus Supabase and Turnstile only), `no-referrer`, HSTS, `nosniff`, frame-ancestors none, `noindex` + `no-store` on `/t`; no third-party scripts on the ticket page | `public/_headers`, E2E (ticket page scripts) |
| Auth | Public sign-up disabled; generic login error; safe post-login redirect; session detection from URL off | Unit, E2E, Auth API check (M1) |
| WhatsApp | Official Cloud API only; UTILITY templates only; dispatcher shared secret (constant-time); webhook HMAC signature; secrets in Vault/function secrets; failure never affects tickets | Unit, pgTAP 11, E2E whatsapp · CI |
| Test doubles | Turnstile and Meta URL overrides accepted only when `SAFF_ENVIRONMENT=local`; the dev gallery is not in production builds | Code review, build check (M0) |
| Data retention | Anonymisation after `pii_retention_days`; statistics kept | pgTAP 12 · CI |
| Dependencies | Production `npm audit`: 0 vulnerabilities (20 Nov 2026); Edge Functions import nothing at runtime (vendored, pinned) | `npm audit --omit=dev` |
| Secrets in repo | `.env*` ignored (only `.env.example` files with public or dev-only values); service key never in `VITE_*`; the bundle checked for service-role strings (M3) | `.gitignore`, build check |

## Before launch (open)

- [ ] **Proxy chain on hosted Supabase:** set `TRUSTED_PROXY_HOPS` / `TRUST_CF_CONNECTING_IP` so per-IP limits see real client IPs (test from two networks).
- [ ] **CORS on hosted functions:** confirm only the allow-listed origin is returned (the local gateway adds `*`).
- [ ] **Realtime public channels** allowed on the hosted project (B-5).
- [ ] **Real Turnstile keys** end to end on the production domain.
- [ ] **Production secrets** generated randomly and stored in a password manager; none reused from `.env.example`.
- [ ] **Legal:** consent text and 30-day retention approved (Law 09-08); CNDP declaration filed (TD issue 9; B-6).
- [ ] **Meta:** templates approved; webhook verified; token is a system-user permanent token with minimal permissions.
- [ ] **GitHub:** the `production` environment requires reviewers; branch protection on `master` requires CI.
- [ ] **External penetration test** or independent review of the Edge Functions and RLS (recommended before scaling past pilot shops).
- [ ] **Monitoring** calling `ops_health` with alerting (OPERATIONS.md).

## Accepted risks (documented)

- An accidental *Start service* can't be undone in the MVP (TD §1 note a; v1.1 candidate).
- Phone ownership isn't verified in the MVP (TD issue 6, approved). Mitigations: Turnstile, rate limits, per-shop cap, utility-only templates.
- Ticket tokens use one secret version (`v1`). Rotation needs a small code change (OPERATIONS.md).
