# SAFF — Operations runbook

*v0.1 · 20 Nov 2026*

## SAFF team console (`/admin`)

Shops and barber accounts are created in the console, not in the Supabase dashboard.

**Make someone a SAFF admin** (once per person; today: the founder only). They need a normal login first: create it in Supabase → Authentication → Users → *Add user* (auto-confirm), then run in the SQL editor:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'founder@example.com';
```

At their first visit to `/admin/login` they link an authenticator app (two-factor is required for every admin action).

**Remove an admin:** `delete from public.platform_admins where user_id = (select id from auth.users where email = '…');`

**Lost authenticator (phone lost or reset).** Another person with database access verifies the admin's identity, then removes the factor so it can be set up again at the next sign in:

```sql
delete from auth.mfa_factors where user_id = (select id from auth.users where email = '…');
```

**Audit log** (who did what, newest first; also on the console overview):

```sql
select l.created_at, a.email as admin, l.action, s.name as shop, t.email as target, l.details
from public.admin_audit_log l
left join auth.users a on a.id = l.actor_id
left join auth.users t on t.id = l.target_user_id
left join public.shops s on s.id = l.shop_id
order by l.created_at desc limit 50;
```

**Barber forgot their password:** console → shop → Team → *Reset password*. Give the new temporary password to the barber in person or by phone; they choose their own at the next sign in.

## Health check

Run as the service role (Supabase SQL editor, or `rpc('ops_health')` with the service key):

```sql
select public.ops_health();
```

It returns counts only (no personal data):

| Field | Healthy | If not |
|---|---|---|
| `outbox.pending_overdue` | 0 | Dispatcher not woken: check `outbox.dispatch_configured`, the `saff-whatsapp-sweeper` job, and the `whatsapp-dispatch` function logs |
| `outbox.sending_stuck` | 0 | The dispatcher crashed mid-send. Rows release automatically after 5 min; check the function logs |
| `outbox.failed_24h` | low | Look at `error_code` in `notifications` (e.g. `meta_131026` = undeliverable number, `meta_190` = expired token) |
| `outbox.dispatch_configured` | true | Run `admin_configure_whatsapp_dispatch` (DEPLOYMENT.md §1.5) |
| `queues.stale` | 0 | `saff-finish-stale-sessions` not running: check `jobs` |
| `retention.overdue_anonymisation` | 0 | `saff-anonymize` not running: check `jobs`. **Legal exposure**: fix the same day |
| `jobs.*.failures_24h` | 0 | `select * from cron.job_run_details order by start_time desc limit 20;` |

**Recommended:** call `ops_health` every 5–15 minutes from an uptime monitor (with the service key stored in the monitor, never in the frontend), and alert on any non-zero "healthy = 0" field.

## Scheduled jobs (pg_cron)

| Job | Schedule (UTC) | Does |
|---|---|---|
| `saff-whatsapp-sweeper` | every minute | Wakes the dispatcher for due retries, missed wake-ups, stuck rows |
| `saff-finish-stale-sessions` | hourly at :07 | Finishes queues still open after 04:00 shop time on the following day (Q-12) |
| `saff-anonymize` | daily 03:17 | Removes name and phone from finished tickets older than `pii_retention_days` (30) |
| `saff-prune-rate-limits` | hourly at :27 | Deletes rate-limit windows older than a day |

Run a job by hand: `select app.job_finish_stale_sessions();` (and likewise the others). All jobs are idempotent.

## Backups and restore

- Supabase takes **daily backups** on paid plans. Enable **Point-in-Time Recovery** for production, so you can restore to any second within the retention window.
- **Restore drill** (quarterly, on staging): restore a backup into a new project, deploy the current code to it, then run `select public.ops_health()` and one barber cycle.
- The database is the system of record. The frontend is rebuilt from git, and secrets are re-set from the password manager. **Keep secrets in a password manager**: they can't be read back from Supabase or GitHub.

## Incidents

| Symptom | First checks |
|---|---|
| Customers can't join | `join-queue` logs (look for `captcha_failed` spikes, meaning Turnstile keys or domain), rate limits (`rate_limited` spikes), queue status |
| Barber screen not updating live | Polling still refreshes every 20 s. Check Realtime status in the dashboard |
| No WhatsApp messages | `ops_health` outbox section, then `whatsapp-dispatch` logs, then Meta app dashboard (token expiry, quality rating) |
| Suspected data exposure | Rotate `TICKET_HMAC_SECRET_V1` (old links stop working; use the `v2` prefix to rotate gracefully), rotate the service key, then review `queue_events` (`phone_revealed`) |

## Secret rotation

- **Ticket links:** add `TICKET_HMAC_SECRET_V2` and switch signing to `v2` (code change: `token.ts`). Accept both during the overlap, then remove `v1`.
- **`DISPATCH_SECRET`:** set the new value as a function secret, then rerun `admin_configure_whatsapp_dispatch` with it.
- **WhatsApp token / app secret:** update the function secrets; there's no code change.
