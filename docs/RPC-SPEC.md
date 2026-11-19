# SAFF: Queue Engine & API Specification (Technical Design §8)

*Draft v0.1 · 19 Nov 2026 · Status: **awaiting approval** · Completes the approved Technical Design v1 (TD), which refers to a §8 it does not contain.*

## How to read this document

Every rule is tagged with where it comes from:

- **[TD §x]**: stated in the approved Technical Design. Not open for change here.
- **[Derived]**: follows necessarily from TD rules, for example the transition table or the indexes. An explanation is given each time.
- **[Proposal]**: the TD is silent, so this is a recommendation. These are listed in **§9 Open questions**. Nothing tagged Proposal is implemented until you approve it.

Contents: §1 conventions · §2 function exposure · §3 queue lifecycle RPCs · §4 ticket RPCs (barber) · §5 customer RPCs · §6 read RPCs · §7 Edge Functions · §8 background jobs · §9 open questions · §10 delivery phases · §11 test matrix

---

## 1. Conventions (apply to every function)

### 1.1 Function shape
- Language `plpgsql`, `security definer`, `set search_path = ''`, every object schema-qualified. **[TD §4, §5]**
- Return type `jsonb` with a `result` field. Idempotent repeats return a distinct success `result` and do not raise. **[TD §6.1, `already_completed`]**
- Errors use `raise exception '<code>' using errcode = 'P0001'`, with optional `detail`. Codes are stable, snake_case, and never contain PII. **[TD §6.3]**

### 1.2 The lock protocol (all mutating functions) [TD §6.1]
1. **Lock first:** `select … from public.queue_sessions where id = … for update`.
2. **Re-read** the ticket after the lock. Nothing read before the lock is trusted.
3. **Validate** the actor, membership, the transition table and the business rules.
4. **Apply** the change, write `app.log_event(...)`, and insert outbox rows.
5. **Bump** the session with `app.bump_session(session_id)`, which sends the Realtime ping, then commit.

Only the session row is ever locked, so deadlocks are impossible. Ticket-addressed functions first read `queue_session_id` without a lock, then lock the session, then re-read the ticket and check that it still belongs to that session. **[TD §6.1]**

### 1.3 Authorization
- **Barber functions** check `app.is_shop_member(<shop_id from the locked row>)`. They never take a `shop_id` argument. The authorization error is `not_authorized`. It is also returned when the session or ticket does not exist, so the function never reveals whether an id exists in another shop. **[TD §5, §6.3]**
- **Customer functions** are granted to `service_role` only. They are reached through Edge Functions, after token verification. **[TD §2.1, §5.4]**
- **Owner-only** actions check `app.is_shop_member(shop, array['owner'])`. **[TD §5.3]**

### 1.4 Actors in the audit log
`actor_type` ∈ `barber | customer | system`. `actor_user_id = auth.uid()` for barbers and `null` otherwise. `queue_events.metadata` never contains names or phone numbers. **[TD §4.5]**

### 1.5 Active statuses
`ACTIVE = {waiting, getting_ready, on_the_way, arrived, in_service}` · `CALLED = {getting_ready, on_the_way, arrived}` · `TERMINAL = {completed, skipped, cancelled, expired}` **[TD §4.3, §4.4]**

### 1.6 Timestamps
Each status change sets its matching `*_at` column: `called_at`, `on_the_way_at`, `arrived_at`, `service_started_at`, `completed_at`, `skipped_at`, `cancelled_at`, `expired_at`. Earlier timestamps are never overwritten. **[TD §4.3]**

### 1.7 Outbox rule
A notification row is inserted only when `shop_settings.whatsapp_enabled` is true. Inserts use `on conflict do nothing` on `(ticket_id, notification_type, dedupe_key)`. **[TD §4.5, §6.3]**

### 1.8 Global error catalogue

| Code | Meaning | Source |
|---|---|---|
| `not_authorized` | Not a member, or the session/ticket is not found | TD |
| `shop_not_found` | Unknown or inactive slug | TD |
| `queue_closed` | The shop has no live session | TD |
| `queue_paused` | The session is paused (joins only) | TD |
| `queue_finished` | Action on a finished session | TD |
| `queue_full` | `max_active_tickets` reached | TD |
| `consent_required`, `invalid_name`, `invalid_phone` | Join validation | TD |
| `called_slot_occupied` | Someone is already in CALLED | TD |
| `no_waiting_customers` | CALL NEXT with an empty queue | TD |
| `ticket_not_found` | The ticket is not in this session | TD |
| `invalid_transition` | Rejected by the rules or the trigger (`detail` = from→to) | TD |
| `service_in_progress` | Someone is already `in_service` | Derived (index `tickets_one_in_service`) |
| `grace_not_elapsed` | Skip of a called ticket before the grace period ends, without `barber_override` | Derived (TD issue 11) |
| `invalid_skip_reason` | Reason not allowed for the ticket's state | Derived (TD issue 11) |
| `queue_already_started` | `start_queue` while a live session exists for today | Derived |
| `queue_closed_today` | `start_queue` after today's session finished (use `reopen_queue`) | Derived (UNIQUE `shop_id, queue_date`) |
| `reopen_not_allowed` | `reopen_queue` for a past date or a session that isn't finished | TD issue 8 |
| `rate_limited` | Too many requests (Edge Functions) | TD §7 |

---

## 2. Function exposure [TD §5.4, completed]

| Function | Granted to | Caller |
|---|---|---|
| `start_queue`, `pause_queue`, `resume_queue`, `close_queue`, `reopen_queue` | `authenticated` | Barber app |
| `call_next_customer`, `mark_on_the_way`, `mark_arrived`, `start_service`, `complete_service`, `skip_ticket`, `barber_cancel_ticket` | `authenticated` | Barber app |
| `reveal_phone`, `reissue_ticket_link` | `authenticated` | Barber app |
| `get_queue_stats` | `authenticated` | Barber app |
| `join_queue` | `service_role` | Edge `join-queue` |
| `customer_get_ticket`, `customer_confirm_on_the_way`, `customer_cancel_ticket` | `service_role` | Edge `ticket-get`, `ticket-action` |
| `check_rate_limit` | `service_role` | Edge Functions |
| `public_get_shop` | `anon`, `authenticated` | Shop page |
| `app.*` helpers (`is_shop_member`, `bump_session`, `log_event`, `finish_session`, `estimate_wait`) | not exposed (except `is_shop_member` to `authenticated`, for policies) | internal |
| Job functions (`app.job_*`) | `postgres` only (pg_cron) | scheduler |
| Admin scripts (`admin_create_shop`, `admin_add_member`) | `service_role` only, run from SQL/CLI | platform admin |

Barbers **read** tickets, sessions, events and notifications through RLS selects, using column grants that exclude phone numbers. **[TD §5.2]** No additional read RPCs are needed for the dashboard.

---

## 3. Queue lifecycle RPCs (barber)

Session states: `open ⇄ paused`, `open|paused → finished`, `finished → open` (reopen, same date only). **[TD §4.1, issue 8]**

### 3.1 `start_queue(p_shop_id uuid) → jsonb`
The only barber function that takes a shop id, because no session exists yet to derive it from. Membership is checked against that id.

1. Check `app.is_shop_member(p_shop_id)`, otherwise raise `not_authorized`.
2. Serialize starts for the shop with `select … from public.shops where id = p_shop_id for update`. There is no session row to lock yet. **[Derived: the shop row is the only stable lock target before a session exists. Starts are rare, so contention is nil.]**
3. Compute `v_today = (now() at time zone shop.timezone)::date`. **[TD issue 8]**
4. If a live (open/paused) session exists:
   - for `queue_date = v_today`: return `{result:'already_started', session_id}`. This is an idempotent success.
   - for an earlier date (stale): call `app.finish_session(stale_id, 'system')` (§3.4), then continue. **[TD issue 8: "start_queue auto-finishes stale sessions"]**
5. If a finished session exists for `v_today`: raise `queue_closed_today` (hint: reopen). **[Derived: UNIQUE(shop_id, queue_date)]**
6. Insert the session (`status 'open'`, `started_by = auth.uid()`), log `queue_started`, bump, and return `{result:'started', session_id}`.

### 3.2 `pause_queue(p_session_id uuid)` / `resume_queue(p_session_id uuid)`
- Lock the session and check membership. Pause requires `open → paused`; resume requires `paused → open`. Repeating the same action returns `{result:'already_paused'}` or `{result:'already_open'}`. A finished session raises `queue_finished`.
- Log `queue_paused` / `queue_resumed`, then bump.
- **Effect of pause [TD §6.3, §6.2]:** `join_queue` raises `queue_paused`, and the estimated wait shows as *unavailable*. Barber operations (call, start, complete, skip) **keep working**, because TD's `call_next_customer` rejects only `finished` sessions. Pause means "no new customers", not "freeze".

### 3.3 `close_queue(p_session_id uuid) → jsonb`
1. Lock the session and check membership. If it is already finished, return `{result:'already_closed'}`.
2. If a ticket is `in_service`, raise `service_in_progress`. **[Derived: the transition table has no `in_service → expired` row, so the barber completes the service first.]**
3. `app.finish_session(p_session_id, 'barber')`.
4. Return `{result:'closed', expired_count}`.

### 3.4 `app.finish_session(p_session_id uuid, p_actor text)` (internal)
Used by `close_queue`, `start_queue` (stale session) and the nightly job. The caller already holds the lock.
- Every ticket in `ACTIVE \ {in_service}` changes to `expired` with `expired_at = now()`, and one `ticket_expired` event is logged per ticket. **[TD issue 1]**
- **Stale sessions only (system actor):** a ticket left `in_service` changes to `completed` with `status_reason = 'auto_closed'`. **[Proposal Q-1: the transition table forbids `in_service → expired`, and a forgotten "complete" must not block the next day. `completed` is the only legal exit. These rows are excluded from service-time averages.]**
- One `queue_closed` notification per expired ticket (dedupe key `''`). **[TD §4.1, enum `queue_closed`]**
- Session: `status = 'finished'`, `closed_at = now()`, `closed_by = auth.uid()` (null for system). Log `queue_closed`, then bump.

### 3.5 `reopen_queue(p_session_id uuid) → jsonb` [TD issue 8]
1. Lock the session and check membership.
2. Require `status = 'finished'` and `queue_date = shop-local today`, otherwise raise `reopen_not_allowed`.
3. Require that no other live session exists for the shop, otherwise raise `queue_already_started`. The partial unique index is the backstop.
4. Set `status 'open'`, `closed_at = null`, `closed_by = null`. Log `queue_reopened` with metadata `{closed_at_was}`, then bump.
5. **Expired tickets stay expired**, because terminal states have no exit **[TD §4.4]**. Ticket numbering continues from `last_ticket_number`. Customers rejoin through the QR code.
   **[Proposal Q-2: should reopening also notify the customers who were just expired? The TD has no notification type for this, so the default is no.]**

---

## 4. Ticket RPCs (barber)

Every function takes `(p_session_id uuid, p_ticket_id uuid, …)`, locks the session, checks membership, re-reads the ticket, and raises `ticket_not_found` if the ticket is not in that session. Legal moves come from TD §4.4. The trigger is the backstop.

### 4.1 `call_next_customer(p_session_id)` [TD §6.3, reference implementation]
The lowest-numbered `waiting` ticket changes to `getting_ready`, `called_at` is set, and one `turn_approaching` notification is queued (dedupe key `'called'`). It raises `called_slot_occupied`, `no_waiting_customers` or `queue_finished`. It never touches the customer in service.

### 4.2 `mark_on_the_way(p_session_id, p_ticket_id)`
`getting_ready → on_the_way` (actor barber, allowed by TD §4.4). Sets `on_the_way_at`. If the ticket is already `on_the_way`, returns `{result:'already_on_the_way'}`. **[Derived from the TD transition row; idempotency follows the TD pattern.]**

### 4.3 `mark_arrived(p_session_id, p_ticket_id)`
`getting_ready | on_the_way → arrived` (barber only). Sets `arrived_at`. If already arrived, returns `{result:'already_arrived'}`. **[TD issue 2, §4.4]**

### 4.4 `start_service(p_session_id, p_ticket_id, p_skip_arrival boolean default false)` [TD issue 2, §6.2]
- If anyone is `in_service`, raise `service_in_progress`.
- `arrived → in_service`. With `p_skip_arrival = true`, `getting_ready | on_the_way → in_service` is also allowed. Any other source status raises `invalid_transition`.
- Sets `service_started_at`. Logs `service_started` with metadata `{skip_arrival: true|false}`. **[TD: "recorded in the audit event"]**
- A `waiting` ticket can never start service directly. Not even with the flag, because that would bypass FIFO. **[TD §4.4: no `waiting → in_service` row]**
- If the ticket is already `in_service`, returns `{result:'already_in_service'}`.

### 4.5 `complete_service(p_session_id, p_ticket_id)` [TD §6.3, reference implementation]
`in_service → completed`. Repeating it returns `{result:'already_completed'}`. Nothing else is touched.

### 4.6 `skip_ticket(p_session_id, p_ticket_id, p_reason public.skip_reason, p_note text default null)` [TD issue 11]
Allowed from `waiting` and from `CALLED` (TD §4.4). Skipping from `in_service` is not allowed.

| Ticket status | Allowed reasons | Extra rule |
|---|---|---|
| `getting_ready`, `on_the_way`, `arrived` | `no_show_after_grace` | requires `now() ≥ called_at + grace_period_minutes`, otherwise raise `grace_not_elapsed` |
| same | `unreachable`, `invalid_phone` | also subject to the grace rule **[Proposal Q-3]** |
| same | `barber_override` | allowed at any time; this is the audited override **[TD]** |
| `waiting` | `unreachable`, `invalid_phone`, `barber_override` | `no_show_after_grace` raises `invalid_skip_reason` (a waiting customer was never called, so no grace period exists) **[Derived]** |

- Sets `status = 'skipped'`, `skipped_at`, and `status_reason = p_reason`. Logs `ticket_skipped` with `reason = p_reason`. `p_note` is limited to 200 characters and stored in event metadata **only if it contains no phone pattern** **[Proposal Q-4: or drop free-text notes entirely, which is simpler and safer]**.
- If the ticket is already skipped, returns `{result:'already_skipped'}`.
- A skipped ticket can never re-enter the queue. **[TD §4.4]**

### 4.7 `barber_cancel_ticket(p_session_id, p_ticket_id)`
`waiting | CALLED → cancelled` (actor barber). Sets `cancelled_at` and `status_reason = 'barber'`. If already cancelled, returns `{result:'already_cancelled'}`. **[TD §4.4]**
Use case: the customer tells the barber in person that they are leaving. Skip remains the tool for no-shows.

### 4.8 `reveal_phone(p_ticket_id uuid) → jsonb` [TD issue 9]
- No session lock (this is a read). Resolve the ticket, check membership of `ticket.shop_id`, and raise `not_authorized` if the check fails.
- If the ticket is anonymised, return `{result:'unavailable'}`.
- Logs `phone_revealed` (actor barber) **before** returning, so every disclosure is audited. Returns `{result:'ok', phone}`.
- **[Proposal Q-5]** Limit to active tickets plus tickets that ended in the last 24 h, and to 30 reveals per barber per hour.

### 4.9 `reissue_ticket_link(p_session_id, p_ticket_id)` [TD §7]
- The ticket must be in `ACTIVE`, otherwise raise `invalid_transition`.
- `token_version = token_version + 1`, which revokes the old link. Logs `link_reissued`.
- Queues a `link_resent` notification with `dedupe_key = 'v' || token_version`, which makes it unique per reissue. The dispatcher derives the token from the **current** `token_version` at send time.
- Bump. The customer's open page receives a 404 on its next refetch.

### 4.10 Owner settings
Owners update `shop_settings` through the RLS policy and column grant **[TD §5.2, §5.3]**. No RPC is needed. Barbers can read the settings but not edit them.

---

## 5. Customer RPCs (`service_role` only, called after token verification)

The Edge Function passes `p_ticket_id` and `p_token_version`, both taken from the verified token. Every function returns `not_found` when the ticket is missing, has a different `token_version`, or its session is neither live nor finished within the last 24 h. **[TD §7]** The Edge Function maps `not_found` to a generic HTTP 404.

### 5.1 `join_queue(...)` [TD §6.3, reference implementation, unchanged]
Shop by slug, lock the live session, idempotency on `client_request_id`, duplicate active phone, cap, allocate the number, insert the ticket, log `ticket_joined`, notify `ticket_created`, bump.

### 5.2 `customer_confirm_on_the_way(p_ticket_id, p_token_version)`
`getting_ready → on_the_way` (actor customer). If already `on_the_way`, returns `{result:'already_on_the_way'}`. Any other status raises `invalid_transition`. **[TD §4.4, §7: customers may only perform on_the_way and cancel]**

### 5.3 `customer_cancel_ticket(p_ticket_id, p_token_version)`
`waiting | CALLED → cancelled` (actor customer). Sets `status_reason = 'customer'`. If already cancelled, returns `{result:'already_cancelled'}`. **[TD §4.4]**

### 5.4 `customer_get_ticket(p_ticket_id, p_token_version) → jsonb` (read only, no lock)
Returns exactly what TD §7 allows the customer to see. Nothing else is returned:

```json
{
  "ticket_number": 14,
  "customer_name": "Yassine",
  "status": "waiting",
  "people_ahead": 3,
  "estimate": { "available": true, "minutes": 45 },
  "now_serving_number": 11,
  "shop": { "name": "…", "address": "…", "logo_url": "…", "timezone": "Africa/Casablanca" },
  "queue_status": "open",
  "session_id": "uuid (Realtime channel qs:<id>)",
  "version": 1287,
  "locale": "fr",
  "called_at": null,
  "grace_period_minutes": 10
}
```
- `people_ahead`: the count of `ACTIVE` tickets in the same session with a lower `ticket_number`. **[TD §6.2]**
- `now_serving_number`: the `ticket_number` of the `in_service` ticket, or `null`. **[TD §7: number only]**
- `estimate`: see §6.3. `available = false` when the queue is paused or there is no basis. **[TD §6.2]**
- The phone number is **never** returned, not even to its owner. **[Derived from minimisation: the customer already knows it]**
- `called_at` and `grace_period_minutes` let the page show a "please arrive within X min" countdown. **[Proposal Q-6]**

---

## 6. Read RPCs

### 6.1 `public_get_shop(p_slug text) → jsonb` (anon) [TD §2.1]
```json
{ "name": "…", "logo_url": "…", "address": "…", "status": "open|paused|closed",
  "waiting_count": 7, "session_id": "uuid|null", "version": 1287, "default_locale": "fr" }
```
- Unknown or inactive slug returns `{result:'not_found'}`. A missing shop is not an error, so callers can't probe slugs through error codes.
- `status = 'closed'` when there is no live session.
- `waiting_count` counts tickets in `{waiting} ∪ CALLED`. **[Proposal Q-7: the TD says "approximate". The proposal is the exact count, labelled "about N people waiting". The alternative is buckets (0, 1–3, 4–10, 10+).]**
- Read-only, `stable`, no PII. The Edge Function or the CDN may cache it for 5 s.

### 6.2 `get_queue_stats(p_session_id) → jsonb` (barber)
Today's counts per status, the average service minutes, and the current estimate for the next joiner. Used by the dashboard header. Membership is checked. **[Proposal: convenience only, derivable from RLS selects]**

### 6.3 `app.estimate_wait(p_session_id, p_people_ahead int) → jsonb` [TD §6.2]
- `avg`: the mean of `completed_at − service_started_at` over the shop's last 30 completed services within 30 days, excluding values under 3 or over 120 minutes and tickets with `status_reason = 'auto_closed'`. If no data, fall back to `default_service_minutes`.
- Estimate = (waiting and called tickets ahead × avg) + max(0, avg − elapsed time of the current service). Rounded **to 5 minutes**. Always displayed as approximate.
- Returns `{available:false}` if the session is paused or not live.

---

## 7. Edge Functions (Deno)

Shared rules [TD §2.2, §7]:
- Thin layer: Zod validation, then a rate limit, then the RPC, then error mapping. No business logic.
- Responses: `Content-Type: application/json`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. CORS is limited to the app origin(s).
- Secrets live in Edge Function secrets only: `TICKET_HMAC_SECRET_V1`, `TURNSTILE_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `RATE_LIMIT_PEPPER`, `DISPATCH_SECRET`.
- Rate-limit keys are `HMAC(RATE_LIMIT_PEPPER, kind || value)`, never raw IPs or phone numbers. **[TD §4.5]**
- Logs never contain tokens, phone numbers or names.

### 7.1 Error envelope and HTTP mapping
`{ "error": "<code>" }`. Mapping: validation → 400 · `consent_required` → 400 · `rate_limited` → 429 (with `Retry-After`) · `shop_not_found`/`not_found` → 404 · `queue_closed`/`queue_paused`/`queue_full` → 409 · `invalid_transition` → 409 · Turnstile failure → 403 · anything else → 500 `{error:'internal'}`, logged without PII.

### 7.2 `POST /join-queue`
Request:
```json
{ "shop_slug": "salon-x", "name": "Yassine", "phone": "0612345678", "locale": "ar",
  "consent": true, "consent_text_version": "2026-11-v1",
  "client_request_id": "uuid", "turnstile_token": "…" }
```
1. Zod: name trimmed to 1–60 characters, locale in `ar|fr|en`, consent `true`, `client_request_id` a UUID.
2. Turnstile siteverify (secret, token, remote IP). On failure, return 403 `captcha_failed`. **[TD issue 6]**
3. Phone: libphonenumber-js, default region `MA`, must be a valid **mobile** number, normalised to E.164, otherwise return 400 `invalid_phone`. **[TD §2.3; "mobile only" is Proposal Q-8, because WhatsApp requires a mobile number]**
4. Rate limits **[Proposal Q-9 values]**: per IP 10 joins / 10 min · per phone 3 / 10 min · per shop 120 / 10 min.
5. `join_queue(...)`.
6. Response:
   - `created` → 201 `{ result:'created', ticket_number, token }`. The SPA navigates to `/t#<token>`.
   - `existing` → 200 `{ result:'existing' }`. **No token, no name, no number.** The UI says "You already have a ticket at this shop, we've re-sent the link by WhatsApp." **[TD §7; dropping `ticket_number` as well is Proposal Q-10]**

   If WhatsApp is disabled for the shop, the `existing` message says to ask the barber. **[Proposal]**

### 7.3 `GET /ticket-get`
- `Authorization: Bearer <token>`. Verify the token (§7.5), then rate limit failures per IP to 30 / 10 min. **[Proposal Q-9]**
- `customer_get_ticket(ticket_id, version)`, returning 200 with the view from §5.4, or 404 `{error:'not_found'}`.

### 7.4 `POST /ticket-action`
- Same auth. Body `{ "action": "on_the_way" | "cancel" }`. Calls `customer_confirm_on_the_way` or `customer_cancel_ticket`. Returns 200 `{result}`. An illegal move returns 409 `invalid_transition`, and the UI then refetches.

### 7.5 Token format and verification [TD §7]
`v1.<b64url(ticket_id 16 bytes)>.<b64url(HMAC-SHA256(secret_v1, 'ticket|' || ticket_id || '|' || token_version))>`
- Verify: parse the token and choose the secret by prefix. With the service role, read that ticket's current `token_version`, recompute the expected MAC, and compare in constant time. Any failure (bad format, unknown ticket, MAC mismatch, old version) returns the same 404.
- Rotation: add `v2` with a new secret, accept both, and issue `v2` only.

### 7.6 `whatsapp-dispatch` (internal)
- Invoked by (a) a `pg_net` HTTP call from an `after insert` trigger on `notifications`, and (b) the pg_cron sweeper every minute. **[TD §2]** Auth: `Authorization: Bearer <DISPATCH_SECRET>`, compared in constant time.
- Claims due rows: `update … set status='sending', locked_at=now(), attempts=attempts+1 where id in (select id … where status='pending' and next_attempt_at<=now() order by next_attempt_at limit 20 for update skip locked) returning *`.
- **Suppression** (set to `suppressed`, nothing sent): WhatsApp disabled for the shop · ticket anonymised · `turn_approaching` for a ticket no longer in `CALLED` · `link_resent` whose `token_version` has since changed.
- Sends with the Cloud API template call (`template_name`, `template_language`, parameters: shop name, ticket number, link built from the current token). On success: `sent`, `provider_message_id`, `sent_at`.
- **Retries [Proposal Q-11]:** retryable errors (5xx, 429, network) back off 1, 5, 15 and 60 minutes, at most 5 attempts, then `failed`. Permanent errors (invalid number, template rejected) are marked `failed` immediately with `error_code`. Rows stuck in `sending` for more than 5 minutes are reset to `pending`.
- A failure never touches tickets. **[TD §0.4]**

### 7.7 `whatsapp-webhook` (public, signed) [TD §2.1]
- `GET`: Meta verification. If `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`, echo `hub.challenge`.
- `POST`: verify `X-Hub-Signature-256` = HMAC-SHA256(app secret, raw body) in constant time, otherwise return 401.
- Status callbacks update the notification by `provider_message_id`, and status only moves forward (`sent → delivered → read`, any → `failed`). Unknown ids are ignored. Always return 200 quickly so Meta doesn't retry storms.
- Inbound customer messages are **ignored in the MVP** (phone verification is off). Their content is never logged. **[TD issue 6]**

---

## 8. Background jobs (pg_cron)

| Job | Schedule | Behaviour | Source |
|---|---|---|---|
| `app.job_finish_stale_sessions()` | hourly | For each live session whose `queue_date` < the shop-local today and the local time is after 04:00: lock it, then `app.finish_session(id, 'system')` | TD issue 8 ("nightly job"); hourly to handle per-shop time zones, 04:00 cut-off is **Proposal Q-12** |
| `app.job_anonymize()` | daily 03:00 UTC | Tickets in a terminal state with `created_at < now() − pii_retention_days` and `anonymized_at is null`: set `customer_name = null`, `customer_phone = null`, `anonymized_at = now()`. Also null `notifications.recipient_phone` for those tickets. Batched 1000 rows at a time | TD issue 9 |
| `outbox sweeper` | every minute | `net.http_post` to `whatsapp-dispatch` if pending rows are due, and reset `sending` rows older than 5 min | TD §2 |
| `app.job_prune_rate_limits()` | hourly | Delete `rate_limits` windows older than 24 h | Derived |

Jobs are idempotent and lock sessions with the same protocol (§1.2). Trigger note: anonymisation updates only name and phone, so the transition trigger passes because the status is unchanged.

---

## 9. Open questions (need your decision; defaults are used if you approve this document as is)

| # | Question | Default proposed |
|---|---|---|
| Q-1 | When a forgotten queue is auto-finished, what happens to a ticket still `in_service`? | `completed` with reason `auto_closed`, excluded from averages |
| Q-2 | Notify expired customers when a queue is reopened? | No |
| Q-3 | Do `unreachable` and `invalid_phone` skips also wait for the grace period? | Yes (only `barber_override` bypasses it) |
| Q-4 | Free-text note on skips? | **No notes in the MVP** (safest; reason codes are enough) |
| Q-5 | `reveal_phone` scope and limit | Active tickets + 24 h after the end; 30 reveals per barber per hour |
| Q-6 | Show the customer an arrival countdown after being called? | Yes |
| Q-7 | Public waiting count | Exact number, shown as "about N" |
| Q-8 | Accept only mobile numbers? | Yes (WhatsApp needs a mobile) |
| Q-9 | Rate-limit values | IP 10/10 min, phone 3/10 min, shop 120/10 min, ticket lookup failures 30/10 min |
| Q-10 | Hide the ticket number in the "existing ticket" response? | Yes |
| Q-11 | WhatsApp retry policy | 1/5/15/60 min, max 5 attempts |
| Q-12 | Daily cut-off for stale queues | 04:00 shop-local time |
| Q-13 | Template texts (FR/AR) for `ticket_created`, `turn_approaching`, `queue_closed`, `link_resent` | To be written for Meta approval in Milestone 5 |
| Q-14 | `queue_update` notification type exists in the TD enum but no event uses it | Reserve it; not sent in the MVP |

---

## 10. Delivery phases (replaces the missing TD phase plan)

These map to the milestones in `IMPLEMENTATION-PLAN.md`:

| TD phase (referenced) | Milestone | Content |
|---|---|---|
| Phase 0 | M0 ✅ + M1 step 0 | Foundation; verify Realtime public channels on the real project (B-5) |
| Phase 1 | M1 | Schema, RLS, helpers; test that "the ping never arrives before the data is visible" **[TD §4.5]** |
| Phase 2 | M2 | All RPCs in this document + pgTAP |
| Phase 3 | M3 | Barber dashboard |
| Phase 4 | M4 | Edge Functions + customer flow |
| Phase 5 | M5 | WhatsApp dispatch and webhook **[TD issue 14]** |
| — | M6 | Jobs, hardening, launch |

---

## 11. Test matrix (pgTAP unless noted)

- **Transitions:** each of the 20 allowed rows succeeds for its actor. Every other pair of the 9×9 statuses is rejected by the trigger. Terminal states have no exit.
- **Invariants:** one live session per shop · one `in_service` · one CALLED · one active ticket per phone per shop · no cross-shop references.
- **Concurrency** (two connections): simultaneous joins get N and N+1 · double CALL NEXT → `called_slot_occupied` · skip vs start → one `invalid_transition` · join during close → `queue_closed` · double complete → `already_completed`.
- **Authorization:** a member of shop A gets `not_authorized` on every RPC for shop B · anon cannot select any table · barbers cannot select `customer_phone` · customer RPCs are not executable by `authenticated`.
- **Business rules:** grace period and reasons for skip · `start_service` with and without `p_skip_arrival` · `close_queue` blocked by `in_service` · `reopen_queue` same day only · `queue_full` · idempotent `client_request_id`.
- **Outbox:** a notification is inserted only when WhatsApp is enabled · dedupe keys prevent doubles · a failed dispatch leaves tickets unchanged (Deno test).
- **Privacy:** no PII in `queue_events.metadata` · `realtime.send` payload is only `{v}` · anonymisation leaves statistics intact.
- **Tokens** (Deno): tampered, wrong version, expired session and garbage tokens all return an identical 404 · constant-time comparison.
