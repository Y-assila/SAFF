begin;
\ir _helpers.psql
select plan(27);

-- Isolate from rows left by other local runs: push existing pending rows out of the window.
update public.notifications set next_attempt_at = now() + interval '1 day' where status = 'pending';

select tests.create_shop('wa-shop') as shop \gset
select tests.create_shop('wa-off') as shop_off \gset
update public.shop_settings set whatsapp_enabled = false where shop_id = :'shop_off';
select tests.open_session(:'shop') as sess \gset
select tests.open_session(:'shop_off') as sess_off \gset
select tests.add_ticket(:'sess', '+212655000001', 'Amine') as t1 \gset
select tests.add_ticket(:'sess', '+212655000002', 'Badr') as t2 \gset
select tests.add_ticket(:'sess_off', '+212655000003', 'Chama') as t3 \gset

create function tests.notify(p_ticket uuid, p_type public.notification_type, p_dedupe text default '',
  p_template text default 'queue_ticket_created') returns uuid language sql as $$
  insert into public.notifications (shop_id, ticket_id, notification_type, dedupe_key, recipient_phone, template_name, template_language)
  select shop_id, id, p_type, p_dedupe, customer_phone, p_template, locale from public.tickets where id = p_ticket
  returning id;
$$;

-- ── Inserting never fails because of WhatsApp ───────────────────────────────
select lives_ok(format($$select tests.notify(%L, 'ticket_created')$$, :'t1'),
  'an outbox insert succeeds even when the dispatcher is not configured');
select (select id from public.notifications where ticket_id = :'t1' and notification_type = 'ticket_created') as n_created \gset

select tests.notify(:'t2', 'turn_approaching', 'called', 'queue_turn_approaching') as n_turn_waiting \gset
select tests.notify(:'t3', 'ticket_created') as n_disabled \gset
select tests.notify(:'t2', 'link_resent', 'v1') as n_stale_link \gset
update public.tickets set token_version = 2 where id = :'t2';
select tests.notify(:'t1', 'queue_closed', '', 'queue_closed') as n_later \gset
update public.notifications set next_attempt_at = now() + interval '10 minutes' where id = :'n_later';

-- ── Claim + suppression ─────────────────────────────────────────────────────
create temp table claimed as select value as row from public.claim_notifications(20) value;

select is((select count(*)::int from claimed), 1, 'only the one sendable, due notification is claimed');
select is((select row ->> 'id' from claimed), :'n_created', 'it is the ticket_created message');
select is((select row ->> 'ticket_number' from claimed), '1', 'the claim carries what the template needs (ticket number)');
select is((select row ->> 'shop_name' from claimed), 'Shop wa-shop', '…and the shop name');
select ok((select status = 'sending' and attempts = 1 and locked_at is not null from public.notifications where id = :'n_created'),
  'a claimed row is marked sending with attempts = 1');
select is((select status::text || '/' || error_code from public.notifications where id = :'n_disabled'), 'suppressed/whatsapp_disabled',
  'shops with WhatsApp disabled: suppressed, never sent');
select is((select status::text || '/' || error_code from public.notifications where id = :'n_turn_waiting'), 'suppressed/no_longer_called',
  '"turn approaching" for a customer no longer called: suppressed');
select is((select status::text || '/' || error_code from public.notifications where id = :'n_stale_link'), 'suppressed/link_superseded',
  'a resent link superseded by a newer token version: suppressed');
select is((select status::text from public.notifications where id = :'n_later'), 'pending', 'rows not yet due are left alone');
select is((select count(*)::int from public.claim_notifications(20)), 0, 'nothing is claimed twice');

-- ── Settle: sent ────────────────────────────────────────────────────────────
select ok(public.mark_notification_sent(:'n_created', 'wamid.TEST1'), 'mark sent');
select ok((select status = 'sent' and provider_message_id = 'wamid.TEST1' and sent_at is not null and locked_at is null
           from public.notifications where id = :'n_created'), 'sent rows keep the provider message id');
select ok(not public.mark_notification_sent(:'n_created', 'wamid.OTHER'), 'only a sending row can be marked sent');

-- ── Settle: failures (approved Q-11) ────────────────────────────────────────
update public.notifications set next_attempt_at = now() where id = :'n_later';
select (select row ->> 'id' from public.claim_notifications(1) row) is not null as got \gset
select is(public.mark_notification_failed(:'n_later', 'http_503', 'Service unavailable for +212655000001', true), 'retry_scheduled',
  'a retryable error schedules a retry');
select ok((select status = 'pending' and next_attempt_at between now() + interval '55 seconds' and now() + interval '65 seconds'
           from public.notifications where id = :'n_later'), 'first retry after 1 minute');
select is((select error_message from public.notifications where id = :'n_later'), 'Service unavailable for [redacted]',
  'phone numbers are redacted from stored error messages');

update public.notifications set status = 'sending', attempts = 5, locked_at = now() where id = :'n_later';
select is(public.mark_notification_failed(:'n_later', 'http_503', '', true), 'failed', 'after 5 attempts a retryable error is final');

select tests.add_ticket(:'sess', '+212655000004', 'Driss') as t4 \gset
select tests.notify(:'t4', 'ticket_created') as n_perm \gset
select count(*) from public.claim_notifications(5);
select is(public.mark_notification_failed(:'n_perm', 'meta_131026', 'Message undeliverable', false), 'failed',
  'a permanent error fails immediately (no retry)');

-- ── Stuck rows (dispatcher died mid-send) ───────────────────────────────────
select tests.add_ticket(:'sess', '+212655000005', 'Ehsan') as t5 \gset
select tests.notify(:'t5', 'ticket_created') as n_stuck \gset
update public.notifications set status = 'sending', attempts = 1, locked_at = now() - interval '10 minutes' where id = :'n_stuck';
select is((select count(*)::int from public.claim_notifications(5) r where r ->> 'id' = :'n_stuck'), 1,
  'a row stuck in sending for over 5 minutes is released and claimed again');
select is((select attempts from public.notifications where id = :'n_stuck'), 2, '…counting a new attempt');

-- ── Delivery receipts: forward only ─────────────────────────────────────────
select ok(public.record_whatsapp_status('wamid.TEST1', 'delivered', now(), null), 'sent → delivered');
select ok(not public.record_whatsapp_status('wamid.TEST1', 'sent', now(), null), 'a late "sent" after delivered is ignored');
select ok(public.record_whatsapp_status('wamid.TEST1', 'read', now(), null), 'delivered → read');
select ok(not public.record_whatsapp_status('wamid.TEST1', 'failed', now(), 'meta_131026'), 'failed cannot override read');
select ok(not public.record_whatsapp_status('wamid.UNKNOWN', 'delivered', now(), null), 'unknown message ids are ignored');

-- ── Exposure ────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'public.claim_notifications(int)', 'execute')
          and not has_function_privilege('anon', 'public.record_whatsapp_status(text, text, timestamptz, text)', 'execute')
          and has_function_privilege('service_role', 'public.claim_notifications(int)', 'execute'),
  'outbox functions are service-role only');

select * from finish();
rollback;
