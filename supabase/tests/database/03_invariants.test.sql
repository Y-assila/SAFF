begin;
\ir _helpers.psql
select plan(22);

select tests.create_shop('inv-a') as shop_a \gset
select tests.create_shop('inv-b') as shop_b \gset
select tests.open_session(:'shop_a') as sess_a \gset
select tests.open_session(:'shop_b') as sess_b \gset

-- ── Sessions ────────────────────────────────────────────────────────────────
select throws_ok(format('select tests.open_session(%L, current_date - 1)', :'shop_a'),
  '23505', null, 'a shop cannot have two live (open/paused) sessions');
select throws_ok(format('select tests.open_session(%L, current_date)', :'shop_a'),
  '23505', null, 'one session per shop per date');
select throws_ok(format($$update public.queue_sessions set status = 'finished' where id = %L$$, :'sess_a'),
  '23514', null, 'a finished session must have closed_at');
select lives_ok(format($$update public.queue_sessions set status = 'paused' where id = %L$$, :'sess_a'),
  'open -> paused is allowed at table level');
select throws_ok(format('select tests.open_session(%L, current_date + 1)', :'shop_a'),
  '23505', null, 'a paused session still counts as live');
select lives_ok(format($$update public.queue_sessions set status = 'open' where id = %L$$, :'sess_a'),
  'paused -> open');

-- ── Tickets ─────────────────────────────────────────────────────────────────
select tests.add_ticket(:'sess_a', '+212611111111') as t1 \gset
select tests.add_ticket(:'sess_a', '+212622222222') as t2 \gset
select tests.add_ticket(:'sess_a', '+212633333333') as t3 \gset

select is((select array_agg(ticket_number order by ticket_number) from public.tickets where queue_session_id = :'sess_a'),
  array[1,2,3], 'ticket numbers are allocated 1, 2, 3 per session');

select throws_ok(format('select tests.add_ticket(%L, %L)', :'sess_a', '+212611111111'),
  '23505', null, 'the same phone cannot hold two active tickets at one shop');
select lives_ok(format('select tests.add_ticket(%L, %L)', :'sess_b', '+212611111111'),
  'the same phone may join a different shop');

select tests.set_status(:'t1', 'getting_ready');
select throws_ok(format($$select tests.set_status(%L, 'getting_ready')$$, :'t2'),
  '23505', null, 'only one ticket can be in the called slot');

select tests.set_status(:'t1', 'arrived');
select tests.set_status(:'t1', 'in_service');
select tests.set_status(:'t2', 'getting_ready');
select tests.set_status(:'t2', 'arrived');
select throws_ok(format($$select tests.set_status(%L, 'in_service')$$, :'t2'),
  '23505', null, 'only one ticket can be in service');

select tests.set_status(:'t1', 'completed');
select lives_ok(format('select tests.add_ticket(%L, %L)', :'sess_a', '+212611111111'),
  'after completion the same phone may rejoin');

select throws_ok(
  format($$insert into public.tickets (shop_id, queue_session_id, ticket_number, customer_name, customer_phone,
           whatsapp_consent, consent_at, consent_text_version) values (%L, %L, 2, 'X', '+212644444444', true, now(), 'v')$$,
         :'shop_a', :'sess_a'),
  '23505', null, 'ticket_number is unique within a session');

select throws_ok(
  format($$insert into public.tickets (shop_id, queue_session_id, ticket_number, customer_name, customer_phone,
           whatsapp_consent, consent_at, consent_text_version) values (%L, %L, 90, 'X', '+212655555555', true, now(), 'v')$$,
         :'shop_b', :'sess_a'),
  '23503', null, 'a ticket cannot point to another shop''s session (composite FK)');

select throws_ok(
  format($$insert into public.tickets (shop_id, queue_session_id, ticket_number, customer_name, customer_phone,
           whatsapp_consent, consent_at, consent_text_version) values (%L, %L, 91, 'X', '+212666666666', false, now(), 'v')$$,
         :'shop_a', :'sess_a'),
  '23514', null, 'WhatsApp consent must be true');

select throws_ok(
  format($$insert into public.tickets (shop_id, queue_session_id, ticket_number, customer_name, customer_phone,
           whatsapp_consent, consent_at, consent_text_version) values (%L, %L, 92, 'X', '0612345678', true, now(), 'v')$$,
         :'shop_a', :'sess_a'),
  '23514', null, 'phone numbers must be E.164');

select throws_ok(format('update public.tickets set customer_phone = null where id = %L', :'t3'),
  '23514', null, 'name/phone can only be removed by anonymisation');
select lives_ok(format('update public.tickets set customer_phone = null, customer_name = null, anonymized_at = now() where id = %L', :'t1'),
  'anonymisation removes name and phone');

-- ── Audit log, rate limits, helpers ────────────────────────────────────────
select app.log_event(:'shop_a', :'sess_a', :'t3', 'system', null, 'test_event', null, null, null);
select throws_ok('update public.queue_events set event_type = $$x$$', 'P0001', 'append_only', 'queue_events cannot be updated');
select throws_ok('delete from public.queue_events', 'P0001', 'append_only', 'queue_events cannot be deleted');

select is(
  (select array[public.check_rate_limit('test-key-0123456789', 60, 2), public.check_rate_limit('test-key-0123456789', 60, 2),
                public.check_rate_limit('test-key-0123456789', 60, 2)]),
  array[true, true, false], 'check_rate_limit allows p_max hits per window, then refuses');

select app.bump_session(:'sess_b') as v \gset
select is(
  (select payload - 'id' from realtime.messages where topic = 'qs:' || :'sess_b' order by inserted_at desc limit 1),
  jsonb_build_object('v', :'v'::bigint),
  'the realtime ping carries only the version number (no personal data)');

select * from finish();
rollback;
