#!/usr/bin/env bash
# SAFF queue-engine concurrency tests (TD §6.1 "Concurrent scenario" table, RPC-SPEC §11).
# Uses independent psql clients against COMMITTED data on the LOCAL database, then cleans up.
# Usage: npm run db:test:concurrency   (requires `npm run db:start`)
set -uo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in *127.0.0.1*|*localhost*) ;; *) echo "Refusing to run against a non-local database"; exit 2;; esac

PSQL=(psql "$DB_URL" -X -q -A -t -v ON_ERROR_STOP=1)
RUN_ID="c$(date +%s)$RANDOM"
SLUG="conc-${RUN_ID}"
TMP="${KEEP_TMP:-$(mktemp -d)}"
FAILS=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAILS=$((FAILS + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected: $3, got: $2)"; fi; }
sql() { "${PSQL[@]}" -c "$1"; }

# A barber client: authenticated role with JWT claims, as PostgREST would set them.
# Full output (result JSON or ERROR line) is kept; SET produces no output.
as_barber() { "${PSQL[@]}" -c "set role authenticated; set request.jwt.claims = '{\"sub\":\"$BARBER\",\"role\":\"authenticated\"}';" -c "$1" 2>&1; }
as_service() { "${PSQL[@]}" -c "set role service_role;" -c "$1" 2>&1; }
join_sql() { echo "select public.join_queue('$SLUG', 'C', '$1', 'fr', true, 'v1', gen_random_uuid())"; }

cleanup() {
  sql "begin;
       alter table public.queue_events disable trigger queue_events_append_only;
       delete from public.queue_events where shop_id = '$SHOP';
       alter table public.queue_events enable trigger queue_events_append_only;
       delete from public.notifications where shop_id = '$SHOP';
       delete from public.tickets where shop_id = '$SHOP';
       delete from public.queue_sessions where shop_id = '$SHOP';
       delete from public.shops where id = '$SHOP';
       delete from auth.users where id = '$BARBER';
       commit;" >/dev/null
  [ -n "${KEEP_TMP:-}" ] || rm -rf "$TMP"
}

# ── Fixture (committed) ──────────────────────────────────────────────────────
SHOP=$(sql "insert into public.shops (name, slug) values ('Concurrency', '$SLUG') returning id")
BARBER=$(sql "insert into auth.users (id, instance_id, aud, role, email) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '$RUN_ID@test.local') returning id")
sql "insert into public.shop_members (shop_id, user_id) values ('$SHOP', '$BARBER'); update public.shop_settings set max_active_tickets = 500 where shop_id = '$SHOP';" >/dev/null
trap cleanup EXIT
SESS=$(as_barber "select public.start_queue('$SHOP') ->> 'session_id'")

echo "Concurrency tests (shop $SLUG)"

# 1. Many customers join at the same instant → contiguous, unique numbers.
for i in $(seq -w 1 30); do as_service "$(join_sql "+2126550000$i")" > "$TMP/join$i" & done; wait
check "30 simultaneous joins all succeed" "$(grep -l '"result": "created"' "$TMP"/join* | wc -l | tr -d ' ')" "30"
check "ticket numbers are exactly 1..30 (no gaps, no duplicates)" \
  "$(sql "select string_agg(ticket_number::text, ',' order by ticket_number) = (select string_agg(g::text, ',') from generate_series(1,30) g) from public.tickets where queue_session_id = '$SESS'")" "t"

# 2. Same phone submitted twice at once → one ticket.
for k in 1 2; do as_service "$(join_sql '+212655999999')" > "$TMP/dup$k" & done; wait
check "same phone twice at once: one created" "$(grep -l '"result": "created"' "$TMP"/dup* | wc -l | tr -d ' ')" "1"
check "same phone twice at once: one existing" "$(grep -l '"result": "existing"' "$TMP"/dup* | wc -l | tr -d ' ')" "1"

# 3. CALL NEXT on two devices: A holds the lock for 1 s, B arrives during it.
as_barber "begin; select public.call_next_customer('$SESS'); select pg_sleep(1); commit;" > "$TMP/callA" &
sleep 0.3; as_barber "select public.call_next_customer('$SESS')" > "$TMP/callB"; wait
check "double CALL NEXT: second device gets called_slot_occupied" "$(grep -c 'called_slot_occupied' "$TMP/callB")" "1"
check "double CALL NEXT: exactly one customer called" \
  "$(sql "select count(*) from public.tickets where queue_session_id = '$SESS' and status in ('getting_ready','on_the_way','arrived')")" "1"
CALLED=$(sql "select id from public.tickets where queue_session_id = '$SESS' and status = 'getting_ready'")

# 4. Skip and start service on the same ticket at the same time → one wins, the other refetches.
as_barber "begin; select public.skip_ticket('$SESS', '$CALLED', 'barber_override'); select pg_sleep(1); commit;" > "$TMP/skip" &
sleep 0.3; as_barber "select public.start_service('$SESS', '$CALLED', true)" > "$TMP/start"; wait
check "skip vs start: the loser gets invalid_transition" "$(grep -c 'invalid_transition' "$TMP/start")" "1"
check "skip vs start: the ticket is skipped, nobody in service" \
  "$(sql "select status from public.tickets where id = '$CALLED'")/$(sql "select count(*) from public.tickets where queue_session_id = '$SESS' and status = 'in_service'")" "skipped/0"

# 5. COMPLETE pressed twice concurrently → completed once, the other is an idempotent success.
as_barber "select public.call_next_customer('$SESS')" >/dev/null
NEXT=$(sql "select id from public.tickets where queue_session_id = '$SESS' and status = 'getting_ready'")
as_barber "select public.start_service('$SESS', '$NEXT', true)" >/dev/null
as_barber "begin; select public.complete_service('$SESS', '$NEXT'); select pg_sleep(1); commit;" > "$TMP/c1" &
sleep 0.3; as_barber "select public.complete_service('$SESS', '$NEXT')" > "$TMP/c2"; wait
check "double COMPLETE: second press returns already_completed" "$(grep -c 'already_completed' "$TMP/c2")" "1"
check "double COMPLETE: one service_completed event" \
  "$(sql "select count(*) from public.queue_events where ticket_id = '$NEXT' and event_type = 'service_completed'")" "1"

# 6. Customer cancels while the barber calls → serialized, consistent.
WAITING_FIRST=$(sql "select id from public.tickets where queue_session_id = '$SESS' and status = 'waiting' order by ticket_number limit 1")
sql "select 1" >/dev/null
"${PSQL[@]}" -c "set role service_role;" -c "begin; select public.customer_cancel_ticket('$WAITING_FIRST', 1); select pg_sleep(1); commit;" > "$TMP/cc" 2>&1 &
sleep 0.3; as_barber "select public.call_next_customer('$SESS')" > "$TMP/cn"; wait
check "cancel vs call: the cancelled customer is not called" "$(sql "select status from public.tickets where id = '$WAITING_FIRST'")" "cancelled"
check "cancel vs call: the next waiting customer was called instead" \
  "$(sql "select count(*) from public.tickets where queue_session_id = '$SESS' and status = 'getting_ready' and id <> '$WAITING_FIRST'")" "1"

# 7. Join during close → close holds the lock; the join then sees no live queue.
as_barber "select public.barber_cancel_ticket('$SESS', id) from public.tickets where queue_session_id = '$SESS' and status = 'getting_ready'" >/dev/null
as_barber "begin; select public.close_queue('$SESS'); select pg_sleep(1); commit;" > "$TMP/close" &
sleep 0.3; as_service "$(join_sql '+212655888888')" > "$TMP/late" 2>&1; wait
check "join during close: returns queue_closed" "$(grep -c 'queue_closed' "$TMP/late")" "1"
check "join during close: no active tickets remain" \
  "$(sql "select count(*) from public.tickets where queue_session_id = '$SESS' and status in ('waiting','getting_ready','on_the_way','arrived','in_service')")" "0"

echo
if [ "$FAILS" -eq 0 ]; then echo "All concurrency tests passed."; else echo "$FAILS concurrency test(s) FAILED."; exit 1; fi
